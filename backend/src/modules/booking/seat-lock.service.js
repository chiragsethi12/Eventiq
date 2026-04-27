import mongoose from 'mongoose';
import { redis } from '../../config/redis.js';
import Seat from '../../models/Seat.js';
import { APIError } from '../../utils/apiError.js';
import { logger } from '../../utils/logger.js';

export const SEAT_LOCK_TTL_SECONDS = 120;
export const SEAT_LOCK_TTL_MS = SEAT_LOCK_TTL_SECONDS * 1000;
export const MAX_SEATS_PER_USER_PER_EVENT = 8;
export const EXPIRED_LOCK_SWEEP_INTERVAL_MS = 30 * 1000;
export const EXPIRED_LOCK_SWEEP_BATCH_SIZE = 500;

const objectIdPattern = /^[a-fA-F0-9]{24}$/;
const objectIdErrorCodes = Object.freeze({
  eventId: 'SEAT_INVALID_EVENT_ID',
  seatId: 'SEAT_INVALID_SEAT_ID',
  userId: 'SEAT_INVALID_USER_ID'
});

const LOCK_RESERVE_SCRIPT = `
local lockKey = KEYS[1]
local userSetKey = KEYS[2]
local eventLockPrefix = ARGV[1]
local userId = ARGV[2]
local seatId = ARGV[3]
local ttlSeconds = tonumber(ARGV[4])
local maxSeats = tonumber(ARGV[5])

local activeCount = 0
local members = redis.call('smembers', userSetKey)

for _, member in ipairs(members) do
  local owner = redis.call('get', eventLockPrefix .. member)

  if owner == userId then
    activeCount = activeCount + 1
  else
    redis.call('srem', userSetKey, member)
  end
end

if activeCount >= maxSeats then
  return 'MAX_SEATS_REACHED'
end

local result = redis.call('set', lockKey, userId, 'NX', 'EX', ttlSeconds)

if not result then
  return 'SEAT_ALREADY_LOCKED'
end

redis.call('sadd', userSetKey, seatId)
redis.call('expire', userSetKey, ttlSeconds * 2)

return 'OK'
`;

const RELEASE_LOCK_SCRIPT = `
local lockKey = KEYS[1]
local userSetKey = KEYS[2]
local userId = ARGV[1]
local seatId = ARGV[2]

local owner = redis.call('get', lockKey)

if owner == userId then
  redis.call('del', lockKey)
  redis.call('srem', userSetKey, seatId)
  return 1
end

if not owner then
  redis.call('srem', userSetKey, seatId)
end

return 0
`;

export const eventRoom = (eventId) => `event:${eventId}`;
export const seatLockKey = (eventId, seatId) => `seat:lock:${eventId}:${seatId}`;
export const eventSeatLockPrefix = (eventId) => `seat:lock:${eventId}:`;
export const userLocksKey = (eventId, userId) => `user:locks:${eventId}:${userId}`;

export const normalizeObjectId = (value, fieldName) => {
  const code = objectIdErrorCodes[fieldName] || 'SEAT_INVALID_OBJECT_ID';

  if (typeof value !== 'string') {
    throw new APIError(400, code, `Invalid ${fieldName}`);
  }

  const trimmed = value.trim();

  if (!objectIdPattern.test(trimmed)) {
    throw new APIError(400, code, `Invalid ${fieldName}`);
  }

  return new mongoose.Types.ObjectId(trimmed).toString();
};

const serializeDate = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

export const serializeSeatState = (seat) => ({
  seatId: seat._id.toString(),
  seatNumber: seat.seatNumber,
  tierId: seat.tierId?.toString?.() || null,
  status: seat.status,
  lockedBy: seat.lockedBy ? seat.lockedBy.toString() : null,
  lockExpiry: serializeDate(seat.lockExpiry)
});

export const assertSeatLockIndexesSafe = async () => {
  let indexes;

  try {
    indexes = await Seat.collection.indexes();
  } catch (err) {
    if (err?.code === 26 || err?.codeName === 'NamespaceNotFound') {
      return;
    }

    throw err;
  }

  const unsafeTtlIndex = indexes.find(
    (index) =>
      index.expireAfterSeconds !== undefined &&
      Object.hasOwn(index.key || {}, 'lockExpiry')
  );

  if (unsafeTtlIndex) {
    throw new Error(
      `Unsafe Seat TTL index "${unsafeTtlIndex.name}" on lockExpiry would delete seat documents. ` +
        'Drop it before starting Eventiq.'
    );
  }
};

const throwServiceUnavailable = (code, message, cause) => {
  throw new APIError(503, code, message, { cause });
};

const reserveSeatLockInRedis = async ({ eventId, seatId, userId }) => {
  try {
    const result = await redis.eval(
      LOCK_RESERVE_SCRIPT,
      2,
      seatLockKey(eventId, seatId),
      userLocksKey(eventId, userId),
      eventSeatLockPrefix(eventId),
      userId,
      seatId,
      String(SEAT_LOCK_TTL_SECONDS),
      String(MAX_SEATS_PER_USER_PER_EVENT)
    );

    if (result === 'OK') {
      return { ok: true };
    }

    if (result === 'MAX_SEATS_REACHED' || result === 'SEAT_ALREADY_LOCKED') {
      return { ok: false, reason: result };
    }

    logger.error({ module: 'seatLock', result }, 'Unexpected Redis lock script result');
    throw new Error('Unexpected Redis lock script result');
  } catch (err) {
    throwServiceUnavailable('SEAT_LOCK_REDIS_UNAVAILABLE', 'Unable to reserve seat lock', err);
  }
};

export const releaseRedisSeatLock = async ({ eventId, seatId, userId }) => {
  try {
    const released = await redis.eval(
      RELEASE_LOCK_SCRIPT,
      2,
      seatLockKey(eventId, seatId),
      userLocksKey(eventId, userId),
      userId,
      seatId
    );

    return Number(released) === 1;
  } catch (err) {
    throwServiceUnavailable('SEAT_LOCK_REDIS_UNAVAILABLE', 'Unable to release seat lock', err);
  }
};

export const getSeatStateForEvent = async (eventId) => {
  const normalizedEventId = normalizeObjectId(eventId, 'eventId');

  try {
    const seats = await Seat.find({ eventId: normalizedEventId })
      .select('_id seatNumber tierId status lockedBy lockExpiry')
      .sort({ seatNumber: 1 })
      .lean();

    return {
      eventId: normalizedEventId,
      seats: seats.map(serializeSeatState)
    };
  } catch (err) {
    throwServiceUnavailable('SEAT_STATE_UNAVAILABLE', 'Unable to load seat state', err);
  }
};

export const lockSeatForUser = async ({ eventId, seatId, userId }) => {
  const normalizedEventId = normalizeObjectId(eventId, 'eventId');
  const normalizedSeatId = normalizeObjectId(seatId, 'seatId');
  const normalizedUserId = normalizeObjectId(userId, 'userId');

  const redisReservation = await reserveSeatLockInRedis({
    eventId: normalizedEventId,
    seatId: normalizedSeatId,
    userId: normalizedUserId
  });

  if (!redisReservation.ok) {
    return {
      ok: false,
      eventId: normalizedEventId,
      seatId: normalizedSeatId,
      reason: redisReservation.reason
    };
  }

  const lockExpiry = new Date(Date.now() + SEAT_LOCK_TTL_MS);

  try {
    const seat = await Seat.findOneAndUpdate(
      {
        _id: normalizedSeatId,
        eventId: normalizedEventId,
        status: 'available'
      },
      {
        $set: {
          status: 'locked',
          lockedBy: normalizedUserId,
          lockExpiry
        }
      },
      {
        new: true,
        runValidators: true
      }
    )
      .select('_id eventId status lockedBy lockExpiry')
      .lean();

    if (!seat) {
      try {
        await releaseRedisSeatLock({
          eventId: normalizedEventId,
          seatId: normalizedSeatId,
          userId: normalizedUserId
        });
      } catch (releaseErr) {
        logger.error(
          {
            err: releaseErr,
            module: 'seatLock',
            eventId: normalizedEventId,
            seatId: normalizedSeatId,
            userId: normalizedUserId
          },
          'Failed to release Redis lock after MongoDB lock rejection'
        );
      }

      return {
        ok: false,
        eventId: normalizedEventId,
        seatId: normalizedSeatId,
        reason: 'SEAT_NOT_AVAILABLE'
      };
    }

    return {
      ok: true,
      eventId: normalizedEventId,
      seatId: normalizedSeatId,
      lockedBy: normalizedUserId,
      lockExpiry: serializeDate(seat.lockExpiry)
    };
  } catch (err) {
    try {
      await releaseRedisSeatLock({
        eventId: normalizedEventId,
        seatId: normalizedSeatId,
        userId: normalizedUserId
      });
    } catch (releaseErr) {
      logger.error(
        {
          err: releaseErr,
          module: 'seatLock',
          eventId: normalizedEventId,
          seatId: normalizedSeatId,
          userId: normalizedUserId
        },
        'Failed to release Redis lock after MongoDB lock error'
      );
    }

    throwServiceUnavailable('SEAT_LOCK_MONGO_UNAVAILABLE', 'Unable to confirm seat lock', err);
  }
};

export const releaseSeatForUser = async ({ eventId, seatId, userId }) => {
  const normalizedEventId = normalizeObjectId(eventId, 'eventId');
  const normalizedSeatId = normalizeObjectId(seatId, 'seatId');
  const normalizedUserId = normalizeObjectId(userId, 'userId');

  const releasedRedisLock = await releaseRedisSeatLock({
    eventId: normalizedEventId,
    seatId: normalizedSeatId,
    userId: normalizedUserId
  });

  if (!releasedRedisLock) {
    return {
      ok: false,
      eventId: normalizedEventId,
      seatId: normalizedSeatId,
      reason: 'LOCK_NOT_OWNED'
    };
  }

  try {
    const seat = await Seat.findOneAndUpdate(
      {
        _id: normalizedSeatId,
        eventId: normalizedEventId,
        status: 'locked',
        lockedBy: normalizedUserId
      },
      {
        $set: {
          status: 'available',
          lockedBy: null,
          lockExpiry: null
        }
      },
      {
        new: true,
        runValidators: true
      }
    )
      .select('_id eventId status')
      .lean();

    if (!seat) {
      return {
        ok: false,
        eventId: normalizedEventId,
        seatId: normalizedSeatId,
        reason: 'SEAT_NOT_LOCKED_BY_USER'
      };
    }

    return {
      ok: true,
      eventId: normalizedEventId,
      seatId: normalizedSeatId
    };
  } catch (err) {
    throwServiceUnavailable('SEAT_RELEASE_MONGO_UNAVAILABLE', 'Unable to release seat lock', err);
  }
};

const releaseExpiredSeat = async (io, seat) => {
  const eventId = seat.eventId.toString();
  const seatId = seat._id.toString();
  const lockedBy = seat.lockedBy ? seat.lockedBy.toString() : null;

  const releasedSeat = await Seat.findOneAndUpdate(
    {
      _id: seat._id,
      eventId: seat.eventId,
      status: 'locked',
      lockExpiry: seat.lockExpiry
    },
    {
      $set: {
        status: 'available',
        lockedBy: null,
        lockExpiry: null
      }
    },
    {
      new: true,
      runValidators: true
    }
  )
    .select('_id eventId status')
    .lean();

  if (!releasedSeat) {
    return false;
  }

  if (lockedBy) {
    try {
      await releaseRedisSeatLock({ eventId, seatId, userId: lockedBy });
    } catch (err) {
      logger.error(
        { err, module: 'seatLock', eventId, seatId, userId: lockedBy },
        'Failed to clean Redis lock for expired seat'
      );
    }
  }

  io?.to(eventRoom(eventId)).emit('seat_updated', {
    eventId,
    seatId,
    status: 'available'
  });

  return true;
};

export const releaseExpiredSeatLocks = async (io, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();
  const query = {
    status: 'locked',
    lockExpiry: { $lt: now }
  };

  if (options.eventId) {
    query.eventId = normalizeObjectId(options.eventId, 'eventId');
  }

  const limit = Number.isInteger(options.limit) && options.limit > 0
    ? options.limit
    : EXPIRED_LOCK_SWEEP_BATCH_SIZE;

  try {
    const expiredSeats = await Seat.find(query)
      .select('_id eventId lockedBy lockExpiry')
      .limit(limit)
      .lean();

    let releasedCount = 0;

    for (const seat of expiredSeats) {
      if (await releaseExpiredSeat(io, seat)) {
        releasedCount += 1;
      }
    }

    return releasedCount;
  } catch (err) {
    throwServiceUnavailable('SEAT_EXPIRY_SWEEP_FAILED', 'Unable to release expired seat locks', err);
  }
};

export const seatLockService = {
  assertSeatLockIndexesSafe,
  eventRoom,
  getSeatStateForEvent,
  lockSeatForUser,
  releaseExpiredSeatLocks,
  releaseRedisSeatLock,
  releaseSeatForUser,
  seatLockKey,
  userLocksKey
};
