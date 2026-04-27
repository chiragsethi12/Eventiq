import crypto from 'node:crypto';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { cloudinary } from '../../config/cloudinary.js';
import Booking from '../../models/Booking.js';
import Seat from '../../models/Seat.js';
import Ticket from '../../models/Ticket.js';
import { APIError } from '../../utils/apiError.js';

const duplicateKeyCode = 11000;

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const requireQrSecret = () => {
  const secret = process.env.QR_HMAC_SECRET?.trim();

  if (!secret) {
    throw new Error('QR_HMAC_SECRET is required');
  }

  return secret;
};

const requireObjectId = (value, code, message) => {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    throw new APIError(400, code, message);
  }

  return new mongoose.Types.ObjectId(value);
};

const buildOrderedSeatNumbers = (bookingSeatIds, seats) => {
  const seatNumberById = new Map(seats.map((seat) => [seat._id.toString(), seat.seatNumber]));
  const seatNumbers = bookingSeatIds.map((seatId) => seatNumberById.get(seatId.toString()));

  if (seatNumbers.some((seatNumber) => typeof seatNumber !== 'string' || seatNumber.length === 0)) {
    throw new APIError(500, 'TICKET_SEAT_LOOKUP_FAILED', 'Unable to determine seat numbers');
  }

  return seatNumbers;
};

const buildQrPayload = (booking) => {
  const hmac = crypto
    .createHmac('sha256', requireQrSecret())
    .update(`${booking._id}${booking.userId}${booking.eventId}`)
    .digest('hex');

  return `${booking._id}:${booking.userId}:${booking.eventId}:${hmac}`;
};

const uploadQrImage = (bookingId, qrImageBuffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'eventiq/tickets',
        public_id: `ticket_${bookingId}`,
        overwrite: true,
        resource_type: 'image'
      },
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        if (!result?.secure_url) {
          reject(new Error('Cloudinary upload did not return secure_url'));
          return;
        }

        resolve(result.secure_url);
      }
    );

    stream.end(qrImageBuffer);
  });

const markWasCreated = (ticket, created) => {
  if (ticket && typeof ticket === 'object') {
    ticket.$locals = ticket.$locals || {};
    ticket.$locals.wasCreated = created;
  }

  return ticket;
};

const serializeTicket = (ticket) => ({
  id: ticket._id.toString(),
  bookingId: ticket.bookingId?._id?.toString?.() || ticket.bookingId.toString(),
  userId: ticket.userId?._id?.toString?.() || ticket.userId.toString(),
  event: ticket.eventId
    ? {
        id: ticket.eventId._id?.toString?.() || ticket.eventId.toString(),
        title: ticket.eventId.title || null,
        date: ticket.eventId.date || null,
        venue: ticket.eventId.venue || null
      }
    : null,
  attendeeName: ticket.userId?.name || null,
  seats: Array.isArray(ticket.seats) ? ticket.seats : [],
  status: ticket.bookingId?.paymentStatus || 'pending',
  ticketReference: ticket._id.toString(),
  qrPayload: ticket.qrPayload,
  qrImageUrl: ticket.qrImageUrl,
  isUsed: ticket.isUsed,
  usedAt: ticket.usedAt || null,
  createdAt: ticket.createdAt
});

const assertCanAccessTicket = (ticket, user) => {
  if (!user?.id) {
    throw new APIError(401, 'AUTH_UNAUTHENTICATED', 'Authentication required');
  }

  if (user.role === 'admin') {
    return;
  }

  const ticketUserId = ticket.userId?._id?.toString?.() || ticket.userId.toString();

  if (user.role === 'attendee' && ticketUserId === user.id) {
    return;
  }

  const organizerId = ticket.eventId?.organizerId?.toString?.();

  if (user.role === 'organizer' && organizerId === user.id) {
    return;
  }

  throw new APIError(403, 'TICKET_FORBIDDEN', 'Forbidden');
};

const normalizeQrPayload = (payload) => {
  if (!isPlainObject(payload) || typeof payload.qrPayload !== 'string') {
    throw new APIError(400, 'INVALID_TICKET', 'Invalid ticket');
  }

  const normalizedPayload = payload.qrPayload
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
  const parts = normalizedPayload.split(':');

  if (parts.length !== 4) {
    throw new APIError(400, 'INVALID_TICKET', 'Invalid ticket');
  }

  const [bookingId, userId, eventId, receivedHmac] = parts.map((part) => part.trim());

  if (
    !mongoose.isValidObjectId(bookingId) ||
    !mongoose.isValidObjectId(userId) ||
    !mongoose.isValidObjectId(eventId) ||
    !/^[a-f0-9]{64}$/i.test(receivedHmac)
  ) {
    throw new APIError(400, 'INVALID_TICKET', 'Invalid ticket');
  }

  return {
    bookingId,
    userId,
    eventId,
    receivedHmac: receivedHmac.toLowerCase()
  };
};

const hmacsMatch = ({ bookingId, userId, eventId, receivedHmac }) => {
  const expectedHmac = crypto
    .createHmac('sha256', requireQrSecret())
    .update(`${bookingId}${userId}${eventId}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expectedHmac, 'utf8');
  const receivedBuffer = Buffer.from(receivedHmac, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

export const generateTicket = async (booking) => {
  if (!booking?._id || !booking.userId || !booking.eventId) {
    throw new APIError(500, 'TICKET_BOOKING_INVALID', 'Unable to generate ticket for booking');
  }

  const existingTicket = await Ticket.findOne({ bookingId: booking._id });

  if (existingTicket) {
    if (!booking.ticketId || booking.ticketId.toString() !== existingTicket._id.toString()) {
      await Booking.updateOne(
        { _id: booking._id, ticketId: { $ne: existingTicket._id } },
        { $set: { ticketId: existingTicket._id } }
      );
    }

    return markWasCreated(existingTicket, false);
  }

  const seats = await Seat.find({ _id: { $in: booking.seats } })
    .select('_id seatNumber')
    .lean();
  const seatNumbers = buildOrderedSeatNumbers(booking.seats || [], seats);
  const qrPayload = buildQrPayload(booking);

  let qrImageBuffer;

  try {
    qrImageBuffer = await QRCode.toBuffer(qrPayload, {
      type: 'png',
      width: 400
    });
  } catch (err) {
    throw new APIError(503, 'TICKET_QR_GENERATION_FAILED', 'Unable to generate QR code', {
      cause: err
    });
  }

  let qrImageUrl;

  try {
    qrImageUrl = await uploadQrImage(booking._id.toString(), qrImageBuffer);
  } catch (err) {
    throw new APIError(503, 'TICKET_UPLOAD_FAILED', 'Unable to upload ticket QR code', {
      cause: err
    });
  }

  try {
    const ticket = await Ticket.create({
      bookingId: booking._id,
      userId: booking.userId,
      eventId: booking.eventId,
      seats: seatNumbers,
      qrPayload,
      qrImageUrl,
      isUsed: false
    });

    await Booking.updateOne(
      { _id: booking._id, ticketId: { $ne: ticket._id } },
      { $set: { ticketId: ticket._id } }
    );

    return markWasCreated(ticket, true);
  } catch (err) {
    if (err?.code === duplicateKeyCode) {
      const ticket = await Ticket.findOne({ bookingId: booking._id });

      if (ticket) {
        await Booking.updateOne(
          { _id: booking._id, ticketId: { $ne: ticket._id } },
          { $set: { ticketId: ticket._id } }
        );

        return markWasCreated(ticket, false);
      }
    }

    throw new APIError(503, 'TICKET_GENERATION_FAILED', 'Unable to generate ticket', {
      cause: err
    });
  }
};

export const getTicketByBookingId = async ({ bookingId, user }) => {
  const normalizedBookingId = requireObjectId(
    bookingId,
    'TICKET_INVALID_BOOKING_ID',
    'Invalid booking id'
  );
  const ticket = await Ticket.findOne({ bookingId: normalizedBookingId })
    .populate('bookingId', 'paymentStatus')
    .populate('userId', 'name')
    .populate('eventId', 'title date venue organizerId');

  if (!ticket) {
    throw new APIError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  }

  assertCanAccessTicket(ticket, user);

  return serializeTicket(ticket);
};

export const validateTicket = async ({ payload, user }) => {
  if (!user?.id) {
    throw new APIError(401, 'AUTH_UNAUTHENTICATED', 'Authentication required');
  }

  if (!['organizer', 'admin'].includes(user.role)) {
    throw new APIError(403, 'AUTH_FORBIDDEN', 'Forbidden');
  }

  const parsedPayload = normalizeQrPayload(payload);

  if (!hmacsMatch(parsedPayload)) {
    throw new APIError(400, 'INVALID_TICKET', 'Invalid ticket');
  }

  const ticket = await Ticket.findOne({ bookingId: parsedPayload.bookingId })
    .populate('eventId', 'title organizerId');

  if (!ticket) {
    throw new APIError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  }

  if (
    ticket.userId.toString() !== parsedPayload.userId ||
    ticket.eventId?._id?.toString?.() !== parsedPayload.eventId
  ) {
    throw new APIError(400, 'INVALID_TICKET', 'Invalid ticket');
  }

  if (user.role === 'organizer' && ticket.eventId?.organizerId?.toString?.() !== user.id) {
    throw new APIError(403, 'TICKET_FORBIDDEN', 'Forbidden');
  }

  if (ticket.isUsed) {
    throw new APIError(400, 'TICKET_ALREADY_USED', 'Ticket already used');
  }

  const booking = await Booking.findById(parsedPayload.bookingId).populate('userId', 'name');

  if (!booking) {
    throw new APIError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  }

  if (booking.paymentStatus !== 'confirmed') {
    throw new APIError(400, 'BOOKING_NOT_CONFIRMED', 'Booking is not confirmed');
  }

  ticket.isUsed = true;
  ticket.usedAt = new Date();
  await ticket.save();

  return {
    valid: true,
    attendeeName: booking.userId?.name || null,
    seatNumbers: Array.isArray(ticket.seats) ? ticket.seats : [],
    eventTitle: ticket.eventId?.title || null
  };
};

export const qrService = {
  generateTicket,
  getTicketByBookingId,
  validateTicket
};
