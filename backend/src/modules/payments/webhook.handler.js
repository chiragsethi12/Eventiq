import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Booking from '../../models/Booking.js';
import Event from '../../models/Event.js';
import Seat from '../../models/Seat.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';
import { io } from '../../sockets/index.js';
import { eventRoom, seatLockKey, userLocksKey } from '../booking/seat-lock.service.js';
import { generateTicket } from '../tickets/qr.service.js';

const WEBHOOK_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

const assertPipelineSuccess = (result) => {
  for (const [err] of result) {
    if (err) {
      throw err;
    }
  }
};

const getReceivedSignature = (headerValue) => {
  if (typeof headerValue === 'string') {
    return headerValue;
  }

  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }

  return '';
};

const signaturesMatch = (expectedSig, receivedSig) => {
  const expectedBuffer = Buffer.from(expectedSig, 'utf8');
  const receivedBuffer = Buffer.from(receivedSig, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const formatPythonJsonNumber = (value, key) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return JSON.stringify(value);
  }

  if (key === 'amount' && Number.isInteger(value)) {
    return `${value.toFixed(1)}`;
  }

  return JSON.stringify(value);
};

const toPythonStyleSortedJson = (value, key = null) => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => toPythonStyleSortedJson(entry)).join(', ')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((entryKey) => `${JSON.stringify(entryKey)}: ${toPythonStyleSortedJson(value[entryKey], entryKey)}`)
      .join(', ')}}`;
  }

  return formatPythonJsonNumber(value, key);
};

const parseWebhookPayload = (bodyBuffer) => {
  const payload = JSON.parse(bodyBuffer.toString());
  const event = payload?.status;
  const orderId = payload?.reference;
  const paymentId = payload?.payment_id;

  if (
    typeof event !== 'string' ||
    typeof orderId !== 'string' ||
    orderId.length === 0 ||
    typeof paymentId !== 'string' ||
    paymentId.length === 0
  ) {
    throw new Error('Invalid webhook payload');
  }

  return { payload, event, orderId, paymentId };
};

const findBookingForWebhook = async ({ orderId, paymentId }) => {
  const filters = [];

  if (typeof paymentId === 'string' && paymentId.length > 0) {
    filters.push({ razorpayOrderId: paymentId });
  }

  if (typeof orderId === 'string' && mongoose.isValidObjectId(orderId)) {
    filters.push({ _id: orderId });
  }

  if (filters.length === 0) {
    return null;
  }

  return Booking.findOne({ $or: filters });
};

const cleanupSeatLocks = async (booking) => {
  const eventId = booking.eventId.toString();
  const userId = booking.userId.toString();
  const userLockSetKey = userLocksKey(eventId, userId);
  const pipeline = redis.multi();

  for (const seatId of booking.seats) {
    const normalizedSeatId = seatId.toString();
    pipeline.del(seatLockKey(eventId, normalizedSeatId));
    pipeline.srem(userLockSetKey, normalizedSeatId);
  }

  const result = await pipeline.exec();
  assertPipelineSuccess(result);
};

const emitSeatUpdates = (booking, status) => {
  const eventId = booking.eventId.toString();
  const room = eventRoom(eventId);

  for (const seatId of booking.seats) {
    io?.to(room).emit('seat_updated', {
      eventId,
      seatId: seatId.toString(),
      status
    });
  }
};

const reconcileTierAvailability = async (booking) => {
  const [event, bookedSeatCount] = await Promise.all([
    Event.findOne(
      { _id: booking.eventId, 'ticketTiers._id': booking.tierId },
      { 'ticketTiers.$': 1 }
    ).lean(),
    Seat.countDocuments({
      eventId: booking.eventId,
      tierId: booking.tierId,
      status: 'booked'
    })
  ]);

  const tier = event?.ticketTiers?.[0];

  if (!tier) {
    logger.warn(
      { module: 'payments', bookingId: booking._id.toString(), tierId: booking.tierId.toString() },
      'Unable to reconcile availability for missing ticket tier'
    );
    return;
  }

  const availableSeats = Math.max(0, tier.totalSeats - bookedSeatCount);

  await Event.updateOne(
    { _id: booking.eventId, 'ticketTiers._id': booking.tierId },
    { $set: { 'ticketTiers.$.availableSeats': availableSeats } }
  );
};

const handlePaymentCaptured = async ({ orderId, paymentId, payload }) => {
  const booking = await findBookingForWebhook({ orderId, paymentId });

  if (!booking) {
    logger.warn(
      { module: 'payments', orderId, paymentId },
      'Captured payment received for unknown booking'
    );
    return { status: 200, body: { message: 'Booking not found' } };
  }

  const wasAlreadyConfirmed = booking.paymentStatus === 'confirmed';
  booking.razorpayPaymentId = paymentId;

  if (!wasAlreadyConfirmed) {
    booking.paymentStatus = 'confirmed';
  }

  await booking.save();

  await Seat.updateMany(
    { _id: { $in: booking.seats } },
    {
      $set: {
        status: 'booked',
        lockedBy: null,
        lockExpiry: null,
        bookedBy: booking.userId,
        bookingId: booking._id
      }
    }
  );

  await cleanupSeatLocks(booking);

  if (!wasAlreadyConfirmed) {
    await Event.updateOne(
      { _id: booking.eventId, 'ticketTiers._id': booking.tierId },
      { $inc: { 'ticketTiers.$.availableSeats': -booking.quantity } }
    );
  }

  await reconcileTierAvailability(booking);
  emitSeatUpdates(booking, 'booked');

  const ticket = await generateTicket(booking);

  if (ticket.$locals?.wasCreated === true) {
    io?.to(`user:${booking.userId.toString()}`).emit('booking_confirmed', {
      bookingId: booking._id.toString(),
      ticketId: ticket._id.toString()
    });
  }

  return { status: 200, body: { message: 'Processed' } };
};

const handlePaymentFailed = async ({ orderId, paymentId }) => {
  const booking = await findBookingForWebhook({ orderId, paymentId });

  if (!booking) {
    logger.warn(
      { module: 'payments', orderId, paymentId },
      'Failed payment received for unknown booking'
    );
    return { status: 200, body: { message: 'Booking not found' } };
  }

  if (booking.paymentStatus === 'confirmed') {
    logger.warn(
      { module: 'payments', orderId, bookingId: booking._id.toString() },
      'Ignored payment.failed webhook for already confirmed booking'
    );
    return { status: 200, body: { message: 'Already confirmed' } };
  }

  if (booking.paymentStatus !== 'failed') {
    booking.paymentStatus = 'failed';
    await booking.save();

    await Seat.updateMany(
      { _id: { $in: booking.seats } },
      {
        $set: {
          status: 'available',
          lockedBy: null,
          lockExpiry: null,
          bookedBy: null,
          bookingId: null
        }
      }
    );

    await cleanupSeatLocks(booking);
    emitSeatUpdates(booking, 'available');
  }

  return { status: 200, body: { message: 'Processed' } };
};

export const webhookHandler = async (req, res, next) => {
  let idempotencyKey = null;

  try {
    // STEP 1 — Parse body
    let parsed;

    try {
      parsed = parseWebhookPayload(req.body);
    } catch (err) {
      logger.warn({ err, module: 'payments' }, 'Rejected malformed webhook payload');
      return res.status(400).json({ code: 'INVALID_PAYLOAD' });
    }

    const { payload, event, orderId, paymentId } = parsed;

    // STEP 2 — Signature verification
    const webhookSecret = process.env.ACQUIREMOCK_WEBHOOK_SECRET?.trim();

    if (!webhookSecret) {
      throw new Error('ACQUIREMOCK_WEBHOOK_SECRET is required');
    }

    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(toPythonStyleSortedJson(payload))
      .digest('hex');
    const receivedSig = getReceivedSignature(req.headers['x-signature']);

    if (!signaturesMatch(expectedSig, receivedSig)) {
      logger.warn(
        {
          module: 'payments',
          ip: req.ip || req.socket?.remoteAddress || null,
          headers: req.headers
        },
        'Rejected webhook with invalid AcquireMock signature'
      );

      return res.status(400).json({ code: 'INVALID_SIGNATURE' });
    }

    // STEP 3 — Idempotency check
    idempotencyKey = `idempotency:webhook:${orderId}`;
    const exists = await redis.get(idempotencyKey);

    if (exists) {
      return res.status(200).json({ message: 'Already processed' });
    }

    await redis.set(idempotencyKey, 'processed', 'EX', WEBHOOK_IDEMPOTENCY_TTL_SECONDS);

    // STEP 4a / 4b — Handle payment events
    if (event === 'paid') {
      const result = await handlePaymentCaptured({ orderId, paymentId, payload });
      return res.status(result.status).json(result.body);
    }

    if (event === 'failed') {
      const result = await handlePaymentFailed({ orderId, paymentId, payload });
      return res.status(result.status).json(result.body);
    }

    logger.info(
      { module: 'payments', event, orderId, paymentId },
      'Ignored unsupported AcquireMock webhook event'
    );
    return res.status(200).json({ message: 'Ignored' });
  } catch (err) {
    if (idempotencyKey) {
      try {
        await redis.del(idempotencyKey);
      } catch (cleanupErr) {
        logger.error({ err: cleanupErr, module: 'payments', idempotencyKey }, 'Failed to roll back webhook idempotency key');
      }
    }

    return next(err);
  }
};

export const razorpayWebhookHandler = webhookHandler;
