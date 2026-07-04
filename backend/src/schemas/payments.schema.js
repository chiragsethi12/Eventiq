import { z } from 'zod';
import { objectIdSchema } from './common.schema.js';

export const createOrderSchema = z
  .object({
    eventId: objectIdSchema,
    tierId: objectIdSchema,
    seatIds: z
      .array(objectIdSchema, { required_error: 'seatIds is required' })
      .min(1, 'seatIds must be a non-empty array')
  })
  .strip();
