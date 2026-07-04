import mongoose from 'mongoose';
import Booking from '../../models/Booking.js';
import Event from '../../models/Event.js';
import Seat from '../../models/Seat.js';
import SeatMap from '../../models/SeatMap.js';
import { cloudinary } from '../../config/cloudinary.js';
import { io } from '../../sockets/index.js';
import { APIError } from '../../utils/apiError.js';
import { eventRoom } from '../booking/seat-lock.service.js';
import {
  createSeatMapAndSeats,
  deleteSeatMapForEvent,
  normalizeSeatMapConfig
} from './seatmap.service.js';

const EVENT_STATUSES = Object.freeze(['draft', 'published', 'cancelled']);
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
export const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_COVER_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const editableFields = Object.freeze(['title', 'description', 'venue', 'coverImageUrl', 'status']);

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const requireObjectId = (value, code = 'EVENT_INVALID_ID') => {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    throw new APIError(400, code, 'Invalid resource identifier');
  }

  return new mongoose.Types.ObjectId(value);
};

const normalizeString = (value, field, { min = 1, max = 500, required = true } = {}) => {
  if (value === undefined || value === null) {
    if (!required) {
      return undefined;
    }

    throw new APIError(400, 'EVENT_INVALID_INPUT', `${field} is required`);
  }

  if (typeof value !== 'string') {
    throw new APIError(400, 'EVENT_INVALID_INPUT', `${field} must be a string`);
  }

  const normalized = value.trim().replace(/\s+/g, ' ');

  if (normalized.length < min || normalized.length > max) {
    throw new APIError(400, 'EVENT_INVALID_INPUT', `${field} must be ${min}-${max} characters`);
  }

  return normalized;
};

const normalizeLongText = (value, field) => {
  if (typeof value !== 'string') {
    throw new APIError(400, 'EVENT_INVALID_INPUT', `${field} must be a string`);
  }

  const normalized = value.trim();

  if (normalized.length < 1 || normalized.length > 5000) {
    throw new APIError(400, 'EVENT_INVALID_INPUT', `${field} must be 1-5000 characters`);
  }

  return normalized;
};

const normalizeVenue = (venue) => {
  if (!isPlainObject(venue)) {
    throw new APIError(400, 'EVENT_INVALID_VENUE', 'venue is required');
  }

  return {
    name: normalizeString(venue.name, 'venue.name', { max: 180 }),
    city: normalizeString(venue.city, 'venue.city', { max: 120 }),
    address: normalizeString(venue.address, 'venue.address', { max: 500 })
  };
};

const normalizeEventDate = (value, { requireFuture = true } = {}) => {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new APIError(400, 'EVENT_INVALID_DATE', 'date must be a valid ISO date');
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new APIError(400, 'EVENT_INVALID_DATE', 'date must be a valid ISO date');
  }

  if (requireFuture && date <= new Date()) {
    throw new APIError(400, 'EVENT_INVALID_DATE', 'date must be in the future');
  }

  return date;
};

const normalizeCoverImageUrl = (value, { required = true } = {}) => {
  const normalized = normalizeString(value, 'coverImageUrl', {
    max: 2048,
    required
  });

  if (normalized === undefined) {
    return undefined;
  }

  let parsed;

  try {
    parsed = new URL(normalized);
  } catch (_err) {
    throw new APIError(400, 'EVENT_INVALID_COVER_IMAGE', 'coverImageUrl must be a valid URL');
  }

  if (
    parsed.protocol !== 'https:' ||
    (parsed.hostname !== 'cloudinary.com' && !parsed.hostname.endsWith('.cloudinary.com'))
  ) {
    throw new APIError(
      400,
      'EVENT_INVALID_COVER_IMAGE',
      'coverImageUrl must be an HTTPS Cloudinary URL'
    );
  }

  return parsed.toString();
};

const normalizeStatus = (status) => {
  if (typeof status !== 'string' || !EVENT_STATUSES.includes(status)) {
    throw new APIError(400, 'EVENT_INVALID_STATUS', 'Invalid event status');
  }

  return status;
};

const normalizePrice = (value) => {
  const price = Number(value);

  if (!Number.isFinite(price) || price < 0) {
    throw new APIError(400, 'EVENT_INVALID_TIER', 'Ticket tier price must be a non-negative number');
  }

  return price;
};

const normalizeTicketTiers = (ticketTiers) => {
  if (!Array.isArray(ticketTiers) || ticketTiers.length === 0) {
    throw new APIError(400, 'EVENT_INVALID_TIER', 'ticketTiers must be a non-empty array');
  }

  if (ticketTiers.length > 20) {
    throw new APIError(400, 'EVENT_INVALID_TIER', 'ticketTiers cannot exceed 20 tiers');
  }

  return ticketTiers.map((tier) => {
    if (!isPlainObject(tier)) {
      throw new APIError(400, 'EVENT_INVALID_TIER', 'Each ticket tier must be an object');
    }

    return {
      config: tier,
      document: {
        name: normalizeString(tier.name, 'ticketTiers.name', { max: 120 }),
        price: normalizePrice(tier.price),
        totalSeats: 0,
        availableSeats: 0
      }
    };
  });
};

const assertOrganizer = (user) => {
  if (!user || user.role !== 'organizer') {
    throw new APIError(403, 'EVENT_FORBIDDEN', 'Only organizers can create events');
  }
};

const assertCanManageEvent = (event, user) => {
  if (!user) {
    throw new APIError(401, 'AUTH_UNAUTHENTICATED', 'Authentication required');
  }

  if (user.role === 'admin') {
    return;
  }

  if (user.role === 'organizer' && event.organizerId.toString() === user.id) {
    return;
  }

  throw new APIError(403, 'EVENT_FORBIDDEN', 'Forbidden');
};

const assertEventIsEditable = (event) => {
  if (event.date <= new Date()) {
    throw new APIError(400, 'EVENT_NOT_EDITABLE', 'Event can only be edited before its date');
  }
};

const eventToObject = (event) => {
  if (!event) {
    return null;
  }

  return typeof event.toObject === 'function' ? event.toObject() : event;
};

const buildEventSeatSummary = (event, counters = {}) => {
  const totalSeats = (event.ticketTiers || []).reduce(
    (sum, tier) => sum + Number(tier.totalSeats || 0),
    0
  );

  return {
    totalSeats,
    availableSeats: counters.availableSeats || 0,
    filledSeats: counters.bookedSeats || 0
  };
};

const emitSeatsReleased = (eventId, seatIds) => {
  const normalizedEventId = eventId.toString();
  const room = eventRoom(normalizedEventId);

  seatIds.forEach((seatId) => {
    io?.to(room).emit('seat_updated', {
      eventId: normalizedEventId,
      seatId: seatId.toString(),
      status: 'available'
    });
  });
};

const uploadEventCoverBuffer = (file) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'eventiq/event-covers',
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

    stream.end(file.buffer);
  });

const encodeCursor = (event) =>
  Buffer.from(
    JSON.stringify({
      date: event.date.toISOString(),
      id: event._id.toString()
    })
  ).toString('base64url');

const decodeCursor = (cursor) => {
  if (cursor === undefined) {
    return null;
  }

  if (typeof cursor !== 'string' || cursor.length > 500) {
    throw new APIError(400, 'EVENT_INVALID_CURSOR', 'Invalid cursor');
  }

  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));

    if (
      !decoded ||
      typeof decoded.date !== 'string' ||
      typeof decoded.id !== 'string' ||
      !mongoose.isValidObjectId(decoded.id)
    ) {
      throw new Error('Invalid cursor payload');
    }

    const date = new Date(decoded.date);

    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid cursor date');
    }

    return {
      date,
      id: new mongoose.Types.ObjectId(decoded.id)
    };
  } catch (err) {
    throw new APIError(400, 'EVENT_INVALID_CURSOR', 'Invalid cursor', { cause: err });
  }
};

const normalizeLimit = (value) => {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new APIError(400, 'EVENT_INVALID_LIMIT', 'limit must be a number');
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new APIError(400, 'EVENT_INVALID_LIMIT', `limit must be between 1 and ${MAX_LIMIT}`);
  }

  return limit;
};

const normalizeOptionalQueryString = (value, field) => {
  if (value === undefined) {
    return undefined;
  }

  return normalizeString(value, field, { max: 120 });
};

const normalizeDateRange = ({ dateFrom, dateTo }) => {
  const range = {};

  if (dateFrom !== undefined) {
    range.$gte = normalizeEventDate(dateFrom, { requireFuture: false });
  }

  if (dateTo !== undefined) {
    range.$lte = normalizeEventDate(dateTo, { requireFuture: false });
  }

  if (range.$gte && range.$lte && range.$gte > range.$lte) {
    throw new APIError(400, 'EVENT_INVALID_DATE_RANGE', 'dateFrom must be before dateTo');
  }

  return Object.keys(range).length > 0 ? range : null;
};

const buildListFilter = ({ city, category, dateFrom, dateTo, cursor }) => {
  const conditions = [{ status: 'published' }];
  const normalizedCity = normalizeOptionalQueryString(city, 'city');
  const normalizedCategory = normalizeOptionalQueryString(category, 'category');
  const range = normalizeDateRange({ dateFrom, dateTo });
  const decodedCursor = decodeCursor(cursor);

  if (normalizedCity) {
    conditions.push({ 'venue.city': normalizedCity });
  }

  if (normalizedCategory) {
    conditions.push({ category: normalizedCategory });
  }

  if (range) {
    conditions.push({ date: range });
  }

  if (decodedCursor) {
    conditions.push({
      $or: [
        { date: { $gt: decodedCursor.date } },
        { date: decodedCursor.date, _id: { $gt: decodedCursor.id } }
      ]
    });
  }

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
};

const applyAvailableSeatCounts = async (eventObject) => {
  const [counts, seatMap] = await Promise.all([
    Seat.aggregate([
      {
        $match: {
          eventId: eventObject._id,
          status: 'available'
        }
      },
      {
        $group: {
          _id: '$tierId',
          availableSeats: { $sum: 1 }
        }
      }
    ]),
    eventObject.seatMapId
      ? SeatMap.findById(eventObject.seatMapId).select('rows columns blockedSeats').lean()
      : null
  ]);

  const countsByTierId = new Map(counts.map((count) => [count._id.toString(), count.availableSeats]));

  return {
    ...eventObject,
    seatMap: seatMap
      ? {
          rows: seatMap.rows,
          columns: seatMap.columns,
          blockedSeats: seatMap.blockedSeats || []
        }
      : null,
    ticketTiers: eventObject.ticketTiers.map((tier) => ({
      ...tier,
      availableSeats: countsByTierId.get(tier._id.toString()) || 0
    }))
  };
};

const buildCreateInput = (payload, organizerId) => {
  if (!isPlainObject(payload)) {
    throw new APIError(400, 'EVENT_INVALID_INPUT', 'Request body must be an object');
  }

  const tiers = normalizeTicketTiers(payload.ticketTiers);

  return {
    event: {
      organizerId,
      title: normalizeString(payload.title, 'title', { max: 180 }),
      description: normalizeLongText(payload.description, 'description'),
      venue: normalizeVenue(payload.venue),
      date: normalizeEventDate(payload.date),
      category: normalizeString(payload.category, 'category', { max: 80 }),
      coverImageUrl: normalizeCoverImageUrl(payload.coverImageUrl),
      ticketTiers: tiers.map((tier) => tier.document)
    },
    tierConfigs: tiers.map((tier) => tier.config),
    seatMap: normalizeSeatMapConfig(payload)
  };
};

const createEventWithoutTransaction = async ({ eventInput, tierConfigs }) => {
  let event;

  try {
    event = new Event(eventInput.event);
    const tierIds = event.ticketTiers.map((tier) => tier._id);
    const result = await createSeatMapAndSeats({
      eventId: event._id,
      ...eventInput.seatMap,
      tierConfigs,
      tierIds
    });

    event.seatMapId = result.seatMap._id;
    event.ticketTiers.forEach((tier) => {
      const totalSeats = result.tierSeatCounts.get(tier._id.toString()) || 0;
      tier.totalSeats = totalSeats;
      tier.availableSeats = totalSeats;
    });

    await event.save();
    return event;
  } catch (err) {
    if (event?._id) {
      await Promise.all([
        Event.deleteOne({ _id: event._id }),
        deleteSeatMapForEvent(event._id)
      ]);
    }

    throw err;
  }
};

const createEventWithTransaction = async ({ eventInput, tierConfigs }) => {
  const session = await mongoose.startSession();

  try {
    let createdEvent;

    await session.withTransaction(async () => {
      const event = new Event(eventInput.event);
      const tierIds = event.ticketTiers.map((tier) => tier._id);
      const result = await createSeatMapAndSeats({
        eventId: event._id,
        ...eventInput.seatMap,
        tierConfigs,
        tierIds,
        session
      });

      event.seatMapId = result.seatMap._id;
      event.ticketTiers.forEach((tier) => {
        const totalSeats = result.tierSeatCounts.get(tier._id.toString()) || 0;
        tier.totalSeats = totalSeats;
        tier.availableSeats = totalSeats;
      });

      await event.save({ session });
      createdEvent = event;
    });

    return createdEvent;
  } finally {
    await session.endSession();
  }
};

const isTransactionUnsupportedError = (err) =>
  /Transaction numbers are only allowed|replica set member|Transaction not supported/i.test(
    err?.message || ''
  );

export const createEvent = async ({ user, payload }) => {
  assertOrganizer(user);

  const organizerId = requireObjectId(user.id, 'EVENT_INVALID_ORGANIZER');
  const eventInput = buildCreateInput(payload, organizerId);
  const createOptions = { eventInput, tierConfigs: eventInput.tierConfigs };

  try {
    const event = await createEventWithTransaction(createOptions);
    return eventToObject(event);
  } catch (err) {
    if (!isTransactionUnsupportedError(err)) {
      throw err;
    }

    const event = await createEventWithoutTransaction(createOptions);
    return eventToObject(event);
  }
};

const validateCoverUpload = (file) => {
  if (!file) {
    throw new APIError(400, 'EVENT_COVER_IMAGE_REQUIRED', 'A cover image file is required');
  }

  if (!ALLOWED_COVER_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new APIError(
      400,
      'EVENT_INVALID_COVER_IMAGE',
      'Cover image must be a JPEG, PNG, or WebP image'
    );
  }

  if (!Number.isFinite(file.size) || file.size < 1 || file.size > MAX_COVER_IMAGE_BYTES) {
    throw new APIError(
      400,
      'EVENT_INVALID_COVER_IMAGE',
      'Cover image must be 5MB or smaller'
    );
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw new APIError(400, 'EVENT_INVALID_COVER_IMAGE', 'Uploaded file is empty');
  }
};

export const uploadCoverImage = async ({ file }) => {
  validateCoverUpload(file);

  try {
    const coverImageUrl = await uploadEventCoverBuffer(file);
    return { coverImageUrl };
  } catch (err) {
    throw new APIError(503, 'EVENT_COVER_UPLOAD_FAILED', 'Unable to upload cover image', {
      cause: err
    });
  }
};

export const listEvents = async (query = {}) => {
  if (!isPlainObject(query)) {
    throw new APIError(400, 'EVENT_INVALID_QUERY', 'Invalid query');
  }

  const limit = normalizeLimit(query.limit);

  // Page-based pagination
  if (query.page !== undefined) {
    const page = Math.max(1, Number(query.page) || 1);
    const skip = (page - 1) * limit;
    const filter = buildListFilter({ ...query, cursor: undefined });

    const [events, total] = await Promise.all([
      Event.find(filter)
        .sort({ date: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Event.countDocuments(filter)
    ]);

    return {
      events,
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    };
  }

  // Cursor-based pagination (original behavior)
  const filter = buildListFilter(query);
  const events = await Event.find(filter)
    .sort({ date: 1, _id: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = events.length > limit;
  const pageEvents = hasMore ? events.slice(0, limit) : events;

  return {
    events: pageEvents,
    nextCursor: hasMore ? encodeCursor(pageEvents[pageEvents.length - 1]) : null
  };
};

export const listOrganizerEvents = async ({ user }) => {
  if (!user?.id || user.role !== 'organizer') {
    throw new APIError(403, 'EVENT_FORBIDDEN', 'Only organizers can access this view');
  }

  const organizerId = requireObjectId(user.id, 'EVENT_INVALID_ORGANIZER');
  const events = await Event.find({ organizerId }).sort({ date: -1, _id: -1 }).lean();

  if (events.length === 0) {
    return {
      events: [],
      stats: {
        totalEvents: 0,
        totalAttendees: 0,
        totalRevenue: 0
      }
    };
  }

  const eventIds = events.map((event) => event._id);
  const [bookingStats, seatStats] = await Promise.all([
    Booking.aggregate([
      {
        $match: {
          eventId: { $in: eventIds }
        }
      },
      {
        $group: {
          _id: '$eventId',
          totalBookings: { $sum: 1 },
          totalAttendees: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', 'confirmed'] }, '$quantity', 0]
            }
          },
          totalRevenue: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', 'confirmed'] }, '$totalAmount', 0]
            }
          }
        }
      }
    ]),
    Seat.aggregate([
      {
        $match: {
          eventId: { $in: eventIds }
        }
      },
      {
        $group: {
          _id: {
            eventId: '$eventId',
            status: '$status'
          },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const bookingStatsByEventId = new Map(
    bookingStats.map((entry) => [entry._id.toString(), entry])
  );
  const seatStatsByEventId = new Map();

  seatStats.forEach((entry) => {
    const eventId = entry._id.eventId.toString();
    const current = seatStatsByEventId.get(eventId) || {
      availableSeats: 0,
      bookedSeats: 0
    };

    if (entry._id.status === 'available') {
      current.availableSeats = entry.count;
    }

    if (entry._id.status === 'booked') {
      current.bookedSeats = entry.count;
    }

    seatStatsByEventId.set(eventId, current);
  });

  const organizerEvents = events.map((event) => {
    const eventId = event._id.toString();
    const bookingCounter = bookingStatsByEventId.get(eventId) || {
      totalBookings: 0,
      totalAttendees: 0,
      totalRevenue: 0
    };
    const seatCounter = seatStatsByEventId.get(eventId) || {
      availableSeats: 0,
      bookedSeats: 0
    };
    const seatSummary = buildEventSeatSummary(event, seatCounter);

    return {
      id: eventId,
      title: event.title,
      date: event.date,
      city: event.venue?.city || null,
      coverImageUrl: event.coverImageUrl || null,
      status: event.status,
      totalBookings: bookingCounter.totalBookings,
      totalAttendees: bookingCounter.totalAttendees,
      totalRevenue: bookingCounter.totalRevenue,
      seatsFilled: seatSummary.filledSeats,
      totalSeats: seatSummary.totalSeats,
      availableSeats: seatSummary.availableSeats
    };
  });

  return {
    events: organizerEvents,
    stats: {
      totalEvents: organizerEvents.length,
      totalAttendees: organizerEvents.reduce((sum, event) => sum + event.totalAttendees, 0),
      totalRevenue: organizerEvents.reduce((sum, event) => sum + event.totalRevenue, 0)
    }
  };
};

export const getEventById = async (eventId) => {
  const _id = requireObjectId(eventId);
  const event = await Event.findOne({
    _id,
    status: { $ne: 'draft' }
  }).lean();

  if (!event) {
    throw new APIError(404, 'EVENT_NOT_FOUND', 'Event not found');
  }

  return applyAvailableSeatCounts(event);
};

const buildUpdate = (payload) => {
  if (!isPlainObject(payload)) {
    throw new APIError(400, 'EVENT_INVALID_INPUT', 'Request body must be an object');
  }

  const unexpectedField = Object.keys(payload).find((field) => !editableFields.includes(field));

  if (unexpectedField) {
    throw new APIError(400, 'EVENT_INVALID_UPDATE', `${unexpectedField} cannot be updated`);
  }

  const update = {};

  if (payload.title !== undefined) {
    update.title = normalizeString(payload.title, 'title', { max: 180 });
  }

  if (payload.description !== undefined) {
    update.description = normalizeLongText(payload.description, 'description');
  }

  if (payload.venue !== undefined) {
    update.venue = normalizeVenue(payload.venue);
  }

  if (payload.coverImageUrl !== undefined) {
    update.coverImageUrl = normalizeCoverImageUrl(payload.coverImageUrl);
  }

  if (payload.status !== undefined) {
    update.status = normalizeStatus(payload.status);
  }

  if (Object.keys(update).length === 0) {
    throw new APIError(400, 'EVENT_INVALID_UPDATE', 'No editable fields provided');
  }

  return update;
};

export const updateEvent = async ({ eventId, user, payload }) => {
  const _id = requireObjectId(eventId);
  const event = await Event.findById(_id);

  if (!event) {
    throw new APIError(404, 'EVENT_NOT_FOUND', 'Event not found');
  }

  assertCanManageEvent(event, user);
  assertEventIsEditable(event);

  const update = buildUpdate(payload);
  event.set(update);
  await event.save();

  if (update.status === 'cancelled') {
    await releaseCancelledEventInventory(event._id);
  }

  return eventToObject(event);
};

export const deleteEvent = async ({ eventId, user }) => {
  if (!user || user.role !== 'admin') {
    throw new APIError(403, 'EVENT_FORBIDDEN', 'Only admins can delete events');
  }

  const _id = requireObjectId(eventId);
  const event = await Event.findById(_id);

  if (!event) {
    throw new APIError(404, 'EVENT_NOT_FOUND', 'Event not found');
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await deleteSeatMapForEvent(event._id, { session });
      await Event.deleteOne({ _id: event._id }).session(session);
    });
  } catch (err) {
    if (!isTransactionUnsupportedError(err)) {
      throw err;
    }

    await deleteSeatMapForEvent(event._id);
    await Event.deleteOne({ _id: event._id });
  } finally {
    await session.endSession();
  }

  return { deleted: true };
};

const refreshTicketTierAvailability = async (eventId) => {
  const [event, counts] = await Promise.all([
    Event.findById(eventId),
    Seat.aggregate([
      {
        $match: {
          eventId,
          status: 'available'
        }
      },
      {
        $group: {
          _id: '$tierId',
          availableSeats: { $sum: 1 }
        }
      }
    ])
  ]);

  if (!event) {
    return;
  }

  const availableCountsByTierId = new Map(
    counts.map((entry) => [entry._id.toString(), entry.availableSeats])
  );

  event.ticketTiers.forEach((tier) => {
    tier.availableSeats = availableCountsByTierId.get(tier._id.toString()) || 0;
  });

  await event.save();
};

const releaseCancelledEventInventory = async (eventId) => {
  const confirmedBookings = await Booking.find({
    eventId,
    paymentStatus: 'confirmed'
  })
    .select('_id seats')
    .lean();

  if (confirmedBookings.length === 0) {
    await refreshTicketTierAvailability(eventId);
    return 0;
  }

  const bookingIds = confirmedBookings.map((booking) => booking._id);
  const releasedSeatIds = confirmedBookings.flatMap((booking) => booking.seats || []);

  await Promise.all([
    Booking.updateMany(
      {
        _id: { $in: bookingIds }
      },
      {
        $set: { paymentStatus: 'refund_pending' }
      }
    ),
    Seat.updateMany(
      {
        bookingId: { $in: bookingIds }
      },
      {
        $set: {
          status: 'available',
          lockedBy: null,
          lockExpiry: null,
          bookedBy: null,
          bookingId: null
        }
      }
    )
  ]);

  await refreshTicketTierAvailability(eventId);
  emitSeatsReleased(eventId, releasedSeatIds);

  return bookingIds.length;
};

export const cancelEvent = async ({ eventId, user }) => {
  const _id = requireObjectId(eventId);
  const event = await Event.findById(_id);

  if (!event) {
    throw new APIError(404, 'EVENT_NOT_FOUND', 'Event not found');
  }

  assertCanManageEvent(event, user);

  event.status = 'cancelled';
  await event.save();

  const affectedBookings = await releaseCancelledEventInventory(event._id);

  return {
    event: eventToObject(event),
    affectedBookings
  };
};

export const listEventBookings = async ({ eventId, user }) => {
  const _id = requireObjectId(eventId);
  const event = await Event.findById(_id);

  if (!event) {
    throw new APIError(404, 'EVENT_NOT_FOUND', 'Event not found');
  }

  assertCanManageEvent(event, user);

  const bookings = await Booking.find({ eventId: event._id })
    .sort({ createdAt: -1 })
    .populate('userId', 'name email')
    .populate('seats', 'seatNumber')
    .lean();

  return bookings.map((booking) => ({
    id: booking._id.toString(),
    attendee: {
      id: booking.userId?._id?.toString?.() || null,
      name: booking.userId?.name || null,
      email: booking.userId?.email || null
    },
    seatNumbers: Array.isArray(booking.seats)
      ? booking.seats.map((seat) => seat.seatNumber).filter(Boolean)
      : [],
    paymentStatus: booking.paymentStatus,
    quantity: booking.quantity,
    totalAmount: booking.totalAmount,
    createdAt: booking.createdAt
  }));
};

export const eventsService = {
  cancelEvent,
  createEvent,
  deleteEvent,
  getEventById,
  listEventBookings,
  listEvents,
  listOrganizerEvents,
  uploadCoverImage,
  updateEvent
};
