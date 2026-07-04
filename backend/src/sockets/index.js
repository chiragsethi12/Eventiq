import { Server } from 'socket.io';
import { verifyAccessToken } from '../modules/auth/auth.service.js';
import {
  EXPIRED_LOCK_SWEEP_INTERVAL_MS,
  releaseExpiredSeatLocks
} from '../modules/booking/seat-lock.service.js';
import { logger } from '../utils/logger.js';
import { registerSeatHandlers } from './seat.handler.js';

const defaultClientUrl = 'http://localhost:5173';

export let io = null;

let expiredLockSweepInterval = null;
let expiredLockSweepRunning = false;

const getClientOrigin = () => {
  const configuredClientUrl = process.env.CLIENT_URL?.trim();

  if (!configuredClientUrl && process.env.NODE_ENV === 'production') {
    throw new Error('CLIENT_URL is required in production for Socket.io CORS');
  }

  const rawClientUrl = configuredClientUrl || defaultClientUrl;
  let parsed;

  try {
    parsed = new URL(rawClientUrl);
  } catch (err) {
    throw new Error('CLIENT_URL must be a valid URL', { cause: err });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('CLIENT_URL must use http or https');
  }

  return parsed.origin;
};

const createOriginGuard = (allowedOrigin) => (req, callback) => {
  const origin = req.headers.origin;

  if (!origin || origin === allowedOrigin) {
    callback(null, true);
    return;
  }

  logger.warn({ module: 'sockets', origin }, 'Rejected Socket.io origin');
  callback(null, false);
};

const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth?.token;

  try {
    const decoded = verifyAccessToken(token);

    socket.userId = decoded.userId;
    socket.userRole = decoded.role;
    next();
  } catch (err) {
    logger.warn({ err, module: 'sockets', socketId: socket.id }, 'Rejected unauthenticated socket');

    const authError = new Error('Unauthorized');
    authError.data = { code: 'AUTH_INVALID_TOKEN' };
    next(authError);
  }
};

export const startExpiredLockSweeper = (socketServer = io) => {
  if (expiredLockSweepInterval) {
    return expiredLockSweepInterval;
  }

  expiredLockSweepInterval = setInterval(() => {
    if (expiredLockSweepRunning) {
      return;
    }

    expiredLockSweepRunning = true;

    releaseExpiredSeatLocks(socketServer)
      .then((releasedCount) => {
        if (releasedCount > 0) {
          logger.info({ module: 'seatLock', releasedCount }, 'Released expired seat locks');
        }
      })
      .catch((err) => {
        logger.error({ err, module: 'seatLock' }, 'Expired seat lock sweep failed');
      })
      .finally(() => {
        expiredLockSweepRunning = false;
      });
  }, EXPIRED_LOCK_SWEEP_INTERVAL_MS);

  expiredLockSweepInterval.unref?.();

  return expiredLockSweepInterval;
};

export const stopExpiredLockSweeper = () => {
  if (!expiredLockSweepInterval) {
    return;
  }

  clearInterval(expiredLockSweepInterval);
  expiredLockSweepInterval = null;
  expiredLockSweepRunning = false;
};

export const initializeSockets = (httpServer) => {
  const clientOrigin = getClientOrigin();

  io = new Server(httpServer, {
    cors: {
      origin: clientOrigin,
      methods: ['GET', 'POST']
    },
    allowRequest: createOriginGuard(clientOrigin)
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    logger.info(
      {
        module: 'sockets',
        socketId: socket.id,
        userId: socket.userId,
        userRole: socket.userRole
      },
      'Socket connected'
    );

    registerSeatHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      logger.info(
        {
          module: 'sockets',
          socketId: socket.id,
          userId: socket.userId,
          reason
        },
        'Socket disconnected'
      );
    });
  });

  startExpiredLockSweeper(io);

  return io;
};

export const closeSockets = () =>
  new Promise((resolve) => {
    stopExpiredLockSweeper();

    if (!io) {
      resolve();
      return;
    }

    io.close(() => {
      io = null;
      resolve();
    });
  });
