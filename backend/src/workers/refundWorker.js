import { logger } from '../utils/logger.js';

/**
 * Refund worker processor function — Phase 5 stub.
 * Job payload: { bookingId, reason }
 */
export const processRefundJob = async (job) => {
  const { bookingId, reason } = job.data;

  logger.info(
    { module: 'refundWorker', jobId: job.id, bookingId, reason },
    'Refund job received (stub — processing not yet implemented)'
  );

  // Phase 5 will implement:
  // 1. Reverse payment via Razorpay/AcquireMock refund API
  // 2. Update booking.paymentStatus to 'refunded'
  // 3. Release seats back to available
  // 4. Send refund confirmation email
  // 5. Reconcile tier availability

  return { stub: true, bookingId };
};
