import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    name: z.string({ required_error: 'name is required' }).min(1, 'name is required').max(120)
  })
  .strip();
