import { randomUUID } from 'node:crypto';
import { redis } from '../config/redis.js';
import { APIError } from '../utils/apiError.js';

const validateRateLimiterConfig = ({ keyPrefix, max, windowSeconds, getKey }) => {
  if (typeof keyPrefix !== 'string' || keyPrefix.trim().length === 0) {
    throw new Error('createRateLimiter requires a non-empty keyPrefix');
  }

  if (!Number.isInteger(max) || max <= 0) {
    throw new Error('createRateLimiter max must be a positive integer');
  }

  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error('createRateLimiter windowSeconds must be a positive integer');
  }

  if (getKey !== undefined && typeof getKey !== 'function') {
    throw new Error('createRateLimiter getKey must be a function');
  }
};

const normalizeKeySegment = (value) =>
  String(value || 'unknown')
    .replace(/[^a-zA-Z0-9:._-]/g, '_')
    .slice(0, 128);

const assertPipelineSuccess = (result) => {
  for (const [err] of result) {
    if (err) {
      throw err;
    }
  }
};

export const createRateLimiter = ({ keyPrefix, max, windowSeconds, getKey }) => {
  validateRateLimiterConfig({ keyPrefix, max, windowSeconds, getKey });

  return async (req, res, next) => {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const derivedKey = getKey?.(req);
    const keyValue = derivedKey !== undefined ? derivedKey : req.ip || req.socket?.remoteAddress;
    const key = `${keyPrefix}:${normalizeKeySegment(keyValue)}`;
    const member = `${now}:${randomUUID()}`;

    try {
      const result = await redis
        .multi()
        .zremrangebyscore(key, 0, windowStart)
        .zadd(key, now, member)
        .zcount(key, windowStart, now)
        .expire(key, windowSeconds)
        .exec();

      assertPipelineSuccess(result);

      const requestCount = Number(result[2][1]);

      if (requestCount > max) {
        res.set('Retry-After', String(windowSeconds));
        next(new APIError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests'));
        return;
      }

      next();
    } catch (err) {
      next(
        new APIError(503, 'RATE_LIMIT_UNAVAILABLE', 'Unable to verify rate limit', {
          cause: err
        })
      );
    }
  };
};

export const rateLimiter = (_req, _res, next) => {
  next();
};
