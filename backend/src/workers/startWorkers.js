import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/queue.js';
import { processEmailJob } from './emailWorker.js';
import { processReminderJob } from './reminderWorker.js';
import { processRefundJob } from './refundWorker.js';
import { logger } from '../utils/logger.js';

let emailWorker = null;
let reminderWorker = null;
let refundWorker = null;

const attachEventHandlers = (worker, queueName) => {
  worker.on('completed', (job, result) => {
    logger.info(
      { module: 'worker', queue: queueName, jobId: job.id, result },
      `Job completed in ${queueName}`
    );
  });

  worker.on('failed', (job, err) => {
    const retriesLeft = (job?.opts?.attempts || 0) - (job?.attemptsMade || 0);

    if (retriesLeft <= 0) {
      // Dead letter — all retries exhausted
      console.error(
        `[DEAD LETTER] ${queueName} job ${job?.id} failed permanently after ${job?.attemptsMade} attempts:`,
        err.message
      );
      logger.error(
        {
          module: 'worker',
          queue: queueName,
          jobId: job?.id,
          attempts: job?.attemptsMade,
          err
        },
        `[DEAD LETTER] Job failed permanently in ${queueName}`
      );
    } else {
      logger.warn(
        {
          module: 'worker',
          queue: queueName,
          jobId: job?.id,
          attempt: job?.attemptsMade,
          retriesLeft,
          err
        },
        `Job failed in ${queueName} — will retry`
      );
    }
  });

  worker.on('error', (err) => {
    logger.error(
      { err, module: 'worker', queue: queueName },
      `Worker error in ${queueName}`
    );
  });
};

export const startWorkers = async () => {
  if (process.env.REDIS_MOCK === 'true' || process.env.NODE_ENV === 'test') {
    logger.info({ module: 'worker' }, 'Redis mock enabled — skipping starting workers in this process');
    return;
  }

  const connection = await createRedisConnection();

  emailWorker = new Worker('email-queue', processEmailJob, {
    connection,
    concurrency: 5
  });
  attachEventHandlers(emailWorker, 'email-queue');

  reminderWorker = new Worker('reminder-queue', processReminderJob, {
    connection: await createRedisConnection(),
    concurrency: 3
  });
  attachEventHandlers(reminderWorker, 'reminder-queue');

  refundWorker = new Worker('refund-queue', processRefundJob, {
    connection: await createRedisConnection(),
    concurrency: 2
  });
  attachEventHandlers(refundWorker, 'refund-queue');

  logger.info({ module: 'worker' }, 'All BullMQ workers started');
};

export const closeWorkers = async () => {
  const workers = [emailWorker, reminderWorker, refundWorker].filter(Boolean);

  await Promise.all(workers.map((w) => w.close()));

  emailWorker = null;
  reminderWorker = null;
  refundWorker = null;

  logger.info({ module: 'worker' }, 'All BullMQ workers closed');
};
