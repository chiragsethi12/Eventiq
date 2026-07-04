import { z } from 'zod';

export const validateTicketSchema = z
  .object({
    qrPayload: z.string({ required_error: 'qrPayload is required' }).min(1, 'qrPayload is required')
  })
  .strip();
