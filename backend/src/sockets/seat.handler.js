import { APIError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import {
  eventRoom,
  getSeatStateForEvent,
  lockSeatForUser,
  normalizeObjectId,
  releaseSeatForUser
} from '../modules/booking/seat-lock.service.js';

const getReasonFromError = (err, fallback) => {
  if (err instanceof APIError && err.statusCode < 500) {
    return err.code;
  }

  return fallback;
};

const logSocketError = (err, socket, message, extra = {}) => {
  const level = err instanceof APIError && err.statusCode < 500 ? 'warn' : 'error';

  logger[level](
    {
      err,
      module: 'sockets',
      socketId: socket.id,
      userId: socket.userId,
      ...extra
    },
    message
  );
};

const emitSeatState = async (socket, eventId) => {
  const state = await getSeatStateForEvent(eventId);

  socket.emit('seat_state', {
    eventId: state.eventId,
    seats: state.seats
  });
};

const registerRoomHandlers = (socket) => {
  socket.on('join_event', async (payload = {}) => {
    try {
      const eventId = normalizeObjectId(payload?.eventId, 'eventId');

      await socket.join(eventRoom(eventId));
      await emitSeatState(socket, eventId);
    } catch (err) {
      logSocketError(err, socket, 'Failed to join event room', {
        eventId: payload?.eventId
      });

      socket.emit('seat_state_failed', {
        eventId: payload?.eventId || null,
        reason: getReasonFromError(err, 'SEAT_STATE_UNAVAILABLE')
      });
    }
  });

  socket.on('get_seat_state', async (payload = {}) => {
    try {
      await emitSeatState(socket, payload?.eventId);
    } catch (err) {
      logSocketError(err, socket, 'Failed to load seat state', {
        eventId: payload?.eventId
      });

      socket.emit('seat_state_failed', {
        eventId: payload?.eventId || null,
        reason: getReasonFromError(err, 'SEAT_STATE_UNAVAILABLE')
      });
    }
  });
};

const registerLockHandlers = (io, socket) => {
  socket.on('lock_seat', async (payload = {}) => {
    try {
      const result = await lockSeatForUser({
        eventId: payload?.eventId,
        seatId: payload?.seatId,
        userId: socket.userId
      });

      if (!result.ok) {
        socket.emit('lock_failed', {
          seatId: result.seatId || payload?.seatId || null,
          reason: result.reason
        });
        return;
      }

      io.to(eventRoom(result.eventId)).emit('seat_updated', {
        eventId: result.eventId,
        seatId: result.seatId,
        status: 'locked',
        lockedBy: result.lockedBy,
        lockExpiry: result.lockExpiry
      });
    } catch (err) {
      logSocketError(err, socket, 'Failed to lock seat', {
        eventId: payload?.eventId,
        seatId: payload?.seatId
      });

      socket.emit('lock_failed', {
        seatId: payload?.seatId || null,
        reason: getReasonFromError(err, 'SEAT_LOCK_UNAVAILABLE')
      });
    }
  });

  socket.on('release_seat', async (payload = {}) => {
    try {
      const result = await releaseSeatForUser({
        eventId: payload?.eventId,
        seatId: payload?.seatId,
        userId: socket.userId
      });

      if (!result.ok) {
        socket.emit('release_failed', {
          seatId: result.seatId || payload?.seatId || null,
          reason: result.reason
        });
        return;
      }

      io.to(eventRoom(result.eventId)).emit('seat_updated', {
        eventId: result.eventId,
        seatId: result.seatId,
        status: 'available'
      });
    } catch (err) {
      logSocketError(err, socket, 'Failed to release seat', {
        eventId: payload?.eventId,
        seatId: payload?.seatId
      });

      socket.emit('release_failed', {
        seatId: payload?.seatId || null,
        reason: getReasonFromError(err, 'SEAT_RELEASE_UNAVAILABLE')
      });
    }
  });
};

export const registerSeatHandlers = (io, socket) => {
  registerRoomHandlers(socket);
  registerLockHandlers(io, socket);

  return socket;
};
