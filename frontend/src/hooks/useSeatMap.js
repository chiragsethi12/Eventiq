import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../components/ToastProvider';
import { useSocket } from './useSocket';

const CLIENT_LOCK_TTL_MS = 2 * 60 * 1000;
const SEAT_REFRESH_THROTTLE_MS = 1000;

const lockFailureMessages = {
  AUTH_INVALID_TOKEN: 'Your session expired. Sign in again to keep locking seats.',
  MAX_SEATS_REACHED: 'You have already locked the maximum number of seats for this event.',
  SEAT_ALREADY_LOCKED: 'That seat was reserved by someone else a moment ago.',
  SEAT_LOCK_UNAVAILABLE: 'Seat locking is temporarily unavailable.',
  SEAT_NOT_AVAILABLE: 'That seat is no longer available.'
};

const releaseFailureMessages = {
  LOCK_NOT_OWNED: 'That seat is no longer reserved under your session.',
  SEAT_RELEASE_UNAVAILABLE: 'We could not release that seat just now.'
};

const formatSeatError = (reason, fallback) => lockFailureMessages[reason] || releaseFailureMessages[reason] || fallback;

const sortSeatsByNumber = (left, right) =>
  left.seatNumber.localeCompare(right.seatNumber, undefined, {
    numeric: true
  });

const normalizeSeatStatus = (seat, currentUserId) => {
  if (seat.status === 'locked' && seat.lockedBy && seat.lockedBy === currentUserId) {
    return 'mine';
  }

  return seat.status;
};

const normalizeSeat = (seat, currentUserId) => ({
  seatId: seat.seatId,
  seatNumber: seat.seatNumber,
  tierId: seat.tierId || null,
  status: normalizeSeatStatus(seat, currentUserId),
  lockedBy: seat.lockedBy || null,
  lockExpiry: seat.lockExpiry || null
});

const buildSeatMap = (seatStates, currentUserId) =>
  new Map(
    seatStates.map((seat) => {
      const normalizedSeat = normalizeSeat(seat, currentUserId);
      return [normalizedSeat.seatId, normalizedSeat];
    })
  );

const applySeatUpdate = ({ currentSeats, update, currentUserId }) => {
  const currentSeat = currentSeats.get(update.seatId);

  if (!currentSeat) {
    return currentSeats;
  }

  const nextSeat = {
    ...currentSeat,
    status: normalizeSeatStatus(
      {
        ...currentSeat,
        ...update,
        seatId: currentSeat.seatId
      },
      currentUserId
    ),
    lockedBy: update.status === 'available' || update.status === 'booked'
      ? null
      : update.lockedBy !== undefined
        ? update.lockedBy
        : currentSeat.lockedBy,
    lockExpiry: update.status === 'available' || update.status === 'booked'
      ? null
      : update.lockExpiry !== undefined
        ? update.lockExpiry
        : currentSeat.lockExpiry
  };

  if (
    currentSeat.status === nextSeat.status &&
    currentSeat.lockedBy === nextSeat.lockedBy &&
    currentSeat.lockExpiry === nextSeat.lockExpiry
  ) {
    return currentSeats;
  }

  const nextSeats = new Map(currentSeats);
  nextSeats.set(update.seatId, nextSeat);
  return nextSeats;
};

export function useSeatMap({ eventId, currentUserId }) {
  const toast = useToast();
  const { socket, connected, emit } = useSocket(eventId);
  const [seatMap, setSeatMap] = useState(() => new Map());
  const [error, setError] = useState(null);
  const seatMapRef = useRef(seatMap);
  const rollbackSeatsRef = useRef(new Map());
  const lastRefreshRequestRef = useRef(0);

  useEffect(() => {
    seatMapRef.current = seatMap;
  }, [seatMap]);

  useEffect(() => {
    startTransition(() => {
      setSeatMap((currentSeats) => {
        let hasChanges = false;
        const nextSeats = new Map();

        currentSeats.forEach((seat, seatId) => {
          const nextStatus =
            seat.lockedBy && seat.lockedBy === currentUserId
              ? 'mine'
              : seat.status === 'mine'
                ? 'locked'
                : seat.status;

          if (nextStatus !== seat.status) {
            hasChanges = true;
            nextSeats.set(seatId, {
              ...seat,
              status: nextStatus
            });
            return;
          }

          nextSeats.set(seatId, seat);
        });

        return hasChanges ? nextSeats : currentSeats;
      });
    });
  }, [currentUserId]);

  const refreshSeatState = useCallback(() => {
    if (!eventId) {
      return false;
    }

    const now = Date.now();

    if (now - lastRefreshRequestRef.current < SEAT_REFRESH_THROTTLE_MS) {
      return false;
    }

    const didEmit = emit('get_seat_state', { eventId });

    if (didEmit) {
      lastRefreshRequestRef.current = now;
    }

    return didEmit;
  }, [emit, eventId]);

  useEffect(() => {
    if (!socket || !eventId) {
      rollbackSeatsRef.current.clear();
      startTransition(() => {
        setSeatMap(new Map());
        setError(null);
      });
      return undefined;
    }

    const handleSeatState = (payload = {}) => {
      if (payload.eventId !== eventId) {
        return;
      }

      rollbackSeatsRef.current.clear();

      startTransition(() => {
        setSeatMap(buildSeatMap(payload.seats || [], currentUserId));
        setError(null);
      });
    };

    const handleSeatUpdated = (payload = {}) => {
      if (!payload.seatId) {
        return;
      }

      rollbackSeatsRef.current.delete(payload.seatId);

      startTransition(() => {
        setSeatMap((currentSeats) =>
          applySeatUpdate({
            currentSeats,
            update: payload,
            currentUserId
          })
        );
        setError(null);
      });
    };

    const handleLockFailed = (payload = {}) => {
      const seatId = payload.seatId;
      const rollbackSeat = seatId ? rollbackSeatsRef.current.get(seatId) : null;

      if (seatId) {
        rollbackSeatsRef.current.delete(seatId);
      }

      if (rollbackSeat) {
        startTransition(() => {
          setSeatMap((currentSeats) => {
            const nextSeats = new Map(currentSeats);
            nextSeats.set(seatId, rollbackSeat);
            return nextSeats;
          });
        });
      }

      const message = formatSeatError(
        payload.reason,
        'We could not reserve that seat. Please try a different one.'
      );

      setError(message);
      toast.error(message);
      refreshSeatState();
    };

    const handleReleaseFailed = (payload = {}) => {
      const message = formatSeatError(
        payload.reason,
        'We could not release that seat. Please refresh and try again.'
      );

      setError(message);
      toast.error(message, {
        title: 'Seat release issue'
      });
      refreshSeatState();
    };

    const handleSeatStateFailed = (payload = {}) => {
      const message = formatSeatError(
        payload.reason,
        'Live seat state is unavailable right now.'
      );

      setError(message);
    };

    const handleConnectError = () => {
      setError('Unable to connect the live seat feed right now.');
    };

    socket.on('seat_state', handleSeatState);
    socket.on('seat_updated', handleSeatUpdated);
    socket.on('lock_failed', handleLockFailed);
    socket.on('release_failed', handleReleaseFailed);
    socket.on('seat_state_failed', handleSeatStateFailed);
    socket.on('connect_error', handleConnectError);

    if (socket.connected) {
      refreshSeatState();
    }

    return () => {
      socket.off('seat_state', handleSeatState);
      socket.off('seat_updated', handleSeatUpdated);
      socket.off('lock_failed', handleLockFailed);
      socket.off('release_failed', handleReleaseFailed);
      socket.off('seat_state_failed', handleSeatStateFailed);
      socket.off('connect_error', handleConnectError);
    };
  }, [currentUserId, eventId, refreshSeatState, socket, toast]);

  const lockSeat = useCallback(
    (seatId) => {
      if (!seatId || !eventId) {
        return false;
      }

      const currentSeat = seatMapRef.current.get(seatId);

      if (!currentSeat || currentSeat.status !== 'available') {
        return false;
      }

      rollbackSeatsRef.current.set(seatId, currentSeat);

      const optimisticSeat = {
        ...currentSeat,
        status: 'mine',
        lockedBy: currentUserId || null,
        lockExpiry: new Date(Date.now() + CLIENT_LOCK_TTL_MS).toISOString()
      };

      startTransition(() => {
        setSeatMap((currentSeats) => {
          const latestSeat = currentSeats.get(seatId);

          if (!latestSeat || latestSeat.status !== 'available') {
            return currentSeats;
          }

          const nextSeats = new Map(currentSeats);
          nextSeats.set(seatId, optimisticSeat);
          return nextSeats;
        });
      });

      const didEmit = emit('lock_seat', {
        eventId,
        seatId
      });

      if (!didEmit) {
        rollbackSeatsRef.current.delete(seatId);
        startTransition(() => {
          setSeatMap((currentSeats) => {
            const nextSeats = new Map(currentSeats);
            nextSeats.set(seatId, currentSeat);
            return nextSeats;
          });
        });
        toast.error('Live seat updates are not connected yet.');
        return false;
      }

      setError(null);
      return true;
    },
    [currentUserId, emit, eventId, toast]
  );

  const releaseSeat = useCallback(
    (seatId) => {
      if (!seatId || !eventId) {
        return false;
      }

      const currentSeat = seatMapRef.current.get(seatId);

      if (!currentSeat || currentSeat.status !== 'mine') {
        return false;
      }

      const didEmit = emit('release_seat', {
        eventId,
        seatId
      });

      if (!didEmit) {
        toast.error('Live seat updates are not connected yet.');
        return false;
      }

      setError(null);
      return true;
    },
    [emit, eventId, toast]
  );

  const myLockedSeats = useMemo(
    () =>
      [...seatMap.values()]
        .filter((seat) => seat.status === 'mine')
        .sort(sortSeatsByNumber),
    [seatMap]
  );

  return {
    seats: seatMap,
    lockSeat,
    releaseSeat,
    myLockedSeats,
    refreshSeatState,
    connected,
    error
  };
}
