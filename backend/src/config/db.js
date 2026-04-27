import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
let connectionPromise;

mongoose.set('strictQuery', true);

mongoose.connection.on('connected', () => {
  logger.info({
    module: 'database',
    host: mongoose.connection.host,
    name: mongoose.connection.name
  }, 'MongoDB connected');
});

mongoose.connection.on('disconnected', () => {
  logger.warn({ module: 'database' }, 'MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info({ module: 'database' }, 'MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error({ err, module: 'database' }, 'MongoDB connection error');
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const connectDb = async ({ retries = 5, retryDelayMs = 1000 } = {}) => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  if (!mongoUri) {
    throw new Error('MONGODB_URI is required to start the server');
  }

  connectionPromise = (async () => {
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        await mongoose.connect(mongoUri, {
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000
        });

        return mongoose.connection;
      } catch (err) {
        lastError = err;
        logger.error({
          err,
          module: 'database',
          attempt,
          retries
        }, 'MongoDB connection attempt failed');

        if (attempt < retries) {
          await wait(retryDelayMs * attempt);
        }
      }
    }

    connectionPromise = undefined;
    throw lastError;
  })();

  return connectionPromise;
};

export const disconnectDb = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};
