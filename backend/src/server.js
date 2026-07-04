import 'dotenv/config';
import { createServer } from 'node:http';
import app from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { closeSockets, initializeSockets } from './sockets/index.js';
import { assertAuthConfig, seedAdminUser } from './modules/auth/auth.service.js';
import { assertSeatLockIndexesSafe } from './modules/booking/seat-lock.service.js';

const port = process.env.PORT || 5000;
const httpServer = createServer(app);

const closeHttpServer = () =>
  new Promise((resolve, reject) => {
    httpServer.close((err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });

let isShuttingDown = false;

const shutdown = async (signalOrReason, err) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  if (err) {
    logger.error({ err, module: 'server' }, 'Fatal server error');
  }

  logger.info({ module: 'server', signal: signalOrReason }, 'Shutting down server');

  const forceExit = setTimeout(() => {
    logger.error({ module: 'server' }, 'Shutdown timed out');
    process.exit(1);
  }, 10000);

  try {
    await closeSockets();
    await closeHttpServer();
    await disconnectRedis();
    await disconnectDb();
    clearTimeout(forceExit);
    process.exit(err ? 1 : 0);
  } catch (shutdownErr) {
    clearTimeout(forceExit);
    logger.error({ err: shutdownErr, module: 'server' }, 'Shutdown failed');
    process.exit(1);
  }
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  void shutdown('unhandledRejection', err);
});

process.on('uncaughtException', (err) => {
  void shutdown('uncaughtException', err);
});

const startServer = async () => {
  const jwtAccessSecret = process.env.JWT_ACCESS_SECRET?.trim();

  if (!jwtAccessSecret || jwtAccessSecret.length < 32) {
    logger.error(
      { module: 'server' },
      `FATAL: JWT_ACCESS_SECRET must be at least 32 characters (got ${jwtAccessSecret?.length || 0}). Refusing to start.`
    );
    process.exit(1);
  }

  assertAuthConfig();
  await connectDb();
  await assertSeatLockIndexesSafe();
  await connectRedis();
  await seedAdminUser();
  initializeSockets(httpServer);

  httpServer.listen(port, () => {
    logger.info({ module: 'server', port }, 'HTTP server listening');
  });
};

startServer().catch((err) => {
  logger.error({ err, module: 'server' }, 'Server startup failed');
  process.exit(1);
});
