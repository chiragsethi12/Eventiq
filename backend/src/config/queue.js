import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

const useRedisMock = process.env.NODE_ENV === 'test' || process.env.REDIS_MOCK === 'true';

/**
 * BullMQ requires its own ioredis connections (it calls .duplicate() internally).
 * This factory produces fresh instances from the same REDIS_URL so queues and
 * workers each get a dedicated socket without fighting the app-level singleton.
 */
export const createRedisConnection = async () => {
  if (useRedisMock) {
    const RedisMock = (await import('ioredis-mock')).default;
    return new RedisMock();
  }

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error('REDIS_URL is required for BullMQ');
  }

  return new Redis(redisUrl, {
    maxRetriesPerRequest: null, // BullMQ requirement
    enableReadyCheck: false     // BullMQ requirement
  });
};

const queueConnection = useRedisMock
  ? await createRedisConnection()
  : await createRedisConnection();

export const emailQueue = new Queue('email-queue', {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 }
  }
});

export const reminderQueue = new Queue('reminder-queue', {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 }
  }
});

export const refundQueue = new Queue('refund-queue', {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 }
  }
});

export const closeQueues = async () => {
  try {
    await Promise.all([
      emailQueue.close(),
      reminderQueue.close(),
      refundQueue.close()
    ]);

    if (queueConnection && typeof queueConnection.quit === 'function') {
      await queueConnection.quit();
    }

    logger.info({ module: 'queue' }, 'All queues closed');
  } catch (err) {
    logger.error({ err, module: 'queue' }, 'Error closing queues');
  }
};
