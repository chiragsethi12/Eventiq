import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './common.schema.js';

export const initiateBookingSchema = z
  .object({
    eventId: objectIdSchema,
    tierId: objectIdSchema,
    seatIds: z
      .array(objectIdSchema, { required_error: 'seatIds is required' })
      .min(1, 'seatIds must be a non-empty array')
  })
  .strip();

export const listBookingsQuerySchema = paginationQuerySchema
  .extend({
    status: z
      .enum(['pending', 'confirmed', 'failed', 'refund_pending'])
      .optional()
  })
  .strip();
