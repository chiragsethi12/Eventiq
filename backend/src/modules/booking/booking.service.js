import mongoose from 'mongoose';
import { redis } from '../../config/redis.js';
import Booking from '../../models/Booking.js';
import Event from '../../models/Event.js';
import Seat from '../../models/Seat.js';
import { createAcquireMockInvoice } from '../payments/payments.service.js';
import { APIError } from '../../utils/apiError.js';
import { MAX_SEATS_PER_USER_PER_EVENT, seatLockKey } from './seat-lock.service.js';

const BOOKING_PAYMENT_STATUSES = Object.freeze(['pending', 'confirmed', 'failed', 'refund_pending']);
const BOOKING_INITIATION_LOCK_TTL_SECONDS = 15;

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const requireObjectId = (value, code, message) => {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    throw new APIError(400, code, message);
  }

  return new mongoose.Types.ObjectId(value);
};

const normalizeSeatIds = (seatIds) => {
  if (!Array.isArray(seatIds) || seatIds.length === 0) {
    throw new APIError(400, 'BOOKING_INVALID_SEATS', 'seatIds must be a non-empty array');
  }

  if (seatIds.length > MAX_SEATS_PER_USER_PER_EVENT) {
    throw new APIError(
      400,
      'BOOKING_TOO_MANY_SEATS',
      `Cannot book more than ${MAX_SEATS_PER_USER_PER_EVENT} seats at once`
    );
  }

  const normalizedSeatIds = seatIds.map((seatId) =>
    requireObjectId(seatId, 'BOOKING_INVALID_SEAT_ID', 'Invalid seatId').toString()
  );

  const uniqueSeatIds = [...new Set(normalizedSeatIds)];

  if (uniqueSeatIds.length !== normalizedSeatIds.length) {
    throw new APIError(400, 'BOOKING_DUPLICATE_SEATS', 'seatIds must not contain duplicates');
  }

  return uniqueSeatIds.sort();
};

const normalizeInitiatePayload = (payload) => {
  if (!isPlainObject(payload)) {
    throw new APIError(400, 'BOOKING_INVALID_INPUT', 'Request body must be an object');
  }

  return {
    eventId: requireObjectId(payload.eventId, 'BOOKING_INVALID_EVENT_ID', 'Invalid eventId'),
    tierId: requireObjectId(payload.tierId, 'BOOKING_INVALID_TIER_ID', 'Invalid tierId'),
    seatIds: normalizeSeatIds(payload.seatIds)
  };
};

const normalizeOptionalStatus = (status) => {
  if (status === undefined) {
    return undefined;
  }

  if (typeof status !== 'string' || !BOOKING_PAYMENT_STATUSES.includes(status)) {
    throw new APIError(400, 'BOOKING_INVALID_STATUS', 'Invalid booking status');
  }

  return status;
};

const assertPipelineSuccess = (result) => {
  for (const [err] of result) {
    if (err) {
      throw err;
    }
  }
};

const toSortedSeatIds = (seats) =>
  seats.map((seatId) => seatId.toString()).sort();

const sameSeatSet = (left, right) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((seatId, index) => seatId === right[index]);
};

const bookingInitiationLockKey = ({ userId, eventId, seatIds }) =>
  `booking:initiate:${userId.toString()}:${eventId.toString()}:${seatIds.join(',')}`;

const serializeBooking = (booking) => ({
  id: booking._id.toString(),
  event: booking.eventId
    ? {
        id: booking.eventId._id?.toString?.() || booking.eventId.toString(),
        title: booking.eventId.title || null,
        date: booking.eventId.date || null,
        venue: booking.eventId.venue || null,
        coverImageUrl: booking.eventId.coverImageUrl || null,
        status: booking.eventId.status || null
      }
    : null,
  seats: Array.isArray(booking.seats)
    ? booking.seats.map((seat) => ({
        id: seat._id?.toString?.() || seat.toString(),
        seatNumber: seat.seatNumber || null
      }))
    : [],
  tierId: booking.tierId?.toString?.() || null,
  quantity: booking.quantity,
  totalAmount: booking.totalAmount,
  paymentStatus: booking.paymentStatus,
  ticketId: booking.ticketId?.toString?.() || null,
  ticketReference: booking.ticketId?.toString?.() || booking._id.toString(),
  razorpayOrderId: booking.razorpayOrderId,
  razorpayPaymentId: booking.razorpayPaymentId || null,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt
});

const assertBookableEvent = (event) => {
  if (!event) {
    throw new APIError(404, 'EVENT_NOT_FOUND', 'Event not found');
  }

  if (event.status !== 'published') {
    throw new APIError(400, 'EVENT_NOT_BOOKABLE', 'Event is not available for booking');
  }

  if (event.date <= new Date()) {
    throw new APIError(400, 'EVENT_NOT_BOOKABLE', 'Event is no longer available for booking');
  }
};

const getTierForEvent = (event, tierId) => {
  const tier = event.ticketTiers.find((entry) => entry._id.toString() === tierId.toString());

  if (!tier) {
    throw new APIError(400, 'BOOKING_INVALID_TIER_ID', 'Invalid tierId');
  }

  return tier;
};

const assertSeatsMatchEventAndTier = async ({ eventId, tierId, seatIds, userId }) => {
  const seats = await Seat.find({
    _id: { $in: seatIds },
    eventId,
    tierId,
    status: 'locked',
    lockedBy: userId
  })
    .select('_id seatNumber')
    .lean();

  if (seats.length !== seatIds.length) {
    throw new APIError(400, 'SEAT_NOT_LOCKED_BY_USER', 'Selected seats are not locked by this user');
  }

  return seats;
};

const assertSeatsLockedByUserInRedis = async ({ eventId, seatIds, userId }) => {
  try {
    const pipeline = redis.multi();

    for (const seatId of seatIds) {
      pipeline.get(seatLockKey(eventId.toString(), seatId));
    }

    const result = await pipeline.exec();
    assertPipelineSuccess(result);

    const lockOwners = result.map(([, value]) => value);

    if (lockOwners.some((owner) => owner !== userId.toString())) {
      throw new APIError(400, 'SEAT_NOT_LOCKED_BY_USER', 'Selected seats are not locked by this user');
    }
  } catch (err) {
    if (err instanceof APIError) {
      throw err;
    }

    throw new APIError(503, 'BOOKING_LOCK_CHECK_UNAVAILABLE', 'Unable to verify seat locks', {
      cause: err
    });
  }
};

const findExistingPendingBooking = async ({ userId, eventId, seatIds }) => {
  const candidates = await Booking.find({
    userId,
    eventId,
    paymentStatus: 'pending',
    quantity: seatIds.length,
    seats: { $all: seatIds }
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  return (
    candidates.find((booking) => sameSeatSet(toSortedSeatIds(booking.seats || []), seatIds)) || null
  );
};

const buildAcquireMockInvoiceUrl = (paymentId) => {
  const baseUrl = process.env.ACQUIREMOCK_URL?.trim();

  if (!baseUrl) {
    throw new Error('ACQUIREMOCK_URL is required');
  }

  return `${baseUrl.replace(/\/+$/, '')}/checkout/${paymentId}`;
};

const acquireBookingInitiationLock = async ({ userId, eventId, seatIds }) => {
  const lockKey = bookingInitiationLockKey({ userId, eventId, seatIds });

  try {
    const result = await redis.set(lockKey, '1', 'NX', 'EX', BOOKING_INITIATION_LOCK_TTL_SECONDS);

    if (result !== 'OK') {
      throw new APIError(
        409,
        'BOOKING_INITIATION_IN_PROGRESS',
        'A booking request for these seats is already in progress'
      );
    }

    return lockKey;
  } catch (err) {
    if (err instanceof APIError) {
      throw err;
    }

    throw new APIError(503, 'BOOKING_LOCK_CHECK_UNAVAILABLE', 'Unable to verify seat locks', {
      cause: err
    });
  }
};

const releaseBookingInitiationLock = async (lockKey) => {
  if (!lockKey) {
    return;
  }

  try {
    await redis.del(lockKey);
  } catch (_err) {
    // Best-effort cleanup for a short-lived lock.
  }
};

export const initiateBooking = async ({ user, payload }) => {
  if (!user?.id) {
    throw new APIError(401, 'AUTH_UNAUTHENTICATED', 'Authentication required');
  }

  const { eventId, tierId, seatIds } = normalizeInitiatePayload(payload);
  const userId = new mongoose.Types.ObjectId(user.id);

  await assertSeatsLockedByUserInRedis({
    eventId,
    seatIds,
    userId
  });

  const initiationLockKey = await acquireBookingInitiationLock({
    userId,
    eventId,
    seatIds
  });

  try {
    const existingBooking = await findExistingPendingBooking({
      userId,
      eventId,
      seatIds
    });

    if (existingBooking) {
      return {
        bookingId: existingBooking._id.toString(),
        orderId: existingBooking.razorpayOrderId,
        amount: existingBooking.totalAmount,
        currency: 'INR',
        invoiceUrl: buildAcquireMockInvoiceUrl(existingBooking.razorpayOrderId)
      };
    }

    const event = await Event.findById(eventId)
      .select('status date ticketTiers')
      .lean();

    assertBookableEvent(event);

    const tier = getTierForEvent(event, tierId);

    await assertSeatsMatchEventAndTier({
      eventId,
      tierId,
      seatIds,
      userId
    });

    const totalAmount = Number(tier.price) * seatIds.length;
    let booking;

    try {
      booking = await Booking.create({
        userId,
        eventId,
        seats: seatIds.map((seatId) => new mongoose.Types.ObjectId(seatId)),
        tierId,
        quantity: seatIds.length,
        totalAmount,
        paymentStatus: 'pending',
        // Portfolio scope: keep the legacy field and store AcquireMock's payment_id here.
        razorpayOrderId: new mongoose.Types.ObjectId().toString()
      });
    } catch (err) {
      throw new APIError(503, 'BOOKING_PERSIST_FAILED', 'Unable to save booking', { cause: err });
    }

    let invoice;

    try {
      invoice = await createAcquireMockInvoice({
        amount: totalAmount,
        bookingId: booking._id.toString()
      });
    } catch (err) {
      await Booking.deleteOne({ _id: booking._id });
      throw err;
    }

    try {
      booking.razorpayOrderId = invoice.paymentId;
      await booking.save();
    } catch (err) {
      throw new APIError(503, 'BOOKING_PERSIST_FAILED', 'Unable to save booking', { cause: err });
    }

    return {
      bookingId: booking._id.toString(),
      orderId: booking.razorpayOrderId,
      amount: booking.totalAmount,
      currency: 'INR',
      invoiceUrl: invoice.invoiceUrl
    };
  } finally {
    await releaseBookingInitiationLock(initiationLockKey);
  }
};

export const listMyBookings = async ({ user, status }) => {
  if (!user?.id) {
    throw new APIError(401, 'AUTH_UNAUTHENTICATED', 'Authentication required');
  }

  const normalizedStatus = normalizeOptionalStatus(status);
  const query = {
    userId: new mongoose.Types.ObjectId(user.id)
  };

  if (normalizedStatus) {
    query.paymentStatus = normalizedStatus;
  }

  const bookings = await Booking.find(query)
    .sort({ createdAt: -1 })
    .populate('eventId', 'title date venue coverImageUrl status')
    .populate('seats', 'seatNumber')
    .lean();

  return bookings.map(serializeBooking);
};

export const getBookingById = async ({ bookingId, user }) => {
  if (!user?.id) {
    throw new APIError(401, 'AUTH_UNAUTHENTICATED', 'Authentication required');
  }

  const _id = requireObjectId(bookingId, 'BOOKING_INVALID_ID', 'Invalid booking id');
  const booking = await Booking.findById(_id)
    .populate('eventId', 'title date venue coverImageUrl status')
    .populate('seats', 'seatNumber')
    .lean();

  if (!booking) {
    throw new APIError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  }

  const isOwner = booking.userId.toString() === user.id;
  const isAdmin = user.role === 'admin';

  if (!isOwner && !isAdmin) {
    throw new APIError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  }

  return serializeBooking(booking);
};

export const bookingService = {
  getBookingById,
  initiateBooking,
  listMyBookings
};
