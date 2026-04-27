import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

const useRedisMock = process.env.NODE_ENV === 'test' || process.env.REDIS_MOCK === 'true';
const RedisClient = useRedisMock ? (await import('ioredis-mock')).default : Redis;
const redisUrl = process.env.REDIS_URL;

if (!useRedisMock && !redisUrl) {
  throw new Error('REDIS_URL is required to start the server');
}

export const redis = useRedisMock
  ? new RedisClient()
  : new RedisClient(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times) {
        return Math.min(times * 200, 2000);
      },
      reconnectOnError(err) {
        const message = err?.message || '';
        return message.includes('READONLY');
      }
    });

redis.on('connect', () => {
  logger.info({ module: 'redis' }, 'Redis socket connected');
});

redis.on('ready', () => {
  logger.info({ module: 'redis' }, 'Redis ready');
});

redis.on('reconnecting', (delay) => {
  logger.warn({ module: 'redis', delay }, 'Redis reconnecting');
});

redis.on('end', () => {
  logger.warn({ module: 'redis' }, 'Redis connection closed');
});

redis.on('error', (err) => {
  logger.error({ err, module: 'redis' }, 'Redis connection error');
});

export const connectRedis = async () => {
  if (useRedisMock) {
    return redis;
  }

  if (redis.status === 'ready') {
    return redis;
  }

  if (redis.status === 'wait' || redis.status === 'end') {
    await redis.connect();
  }

  if (redis.status !== 'ready') {
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        redis.off('ready', onReady);
        redis.off('error', onError);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      redis.once('ready', onReady);
      redis.once('error', onError);
    });
  }

  return redis;
};

export const disconnectRedis = async () => {
  if (useRedisMock) {
    await redis.disconnect?.();
    return;
  }

  if (redis.status !== 'end') {
    await redis.quit();
  }
};
