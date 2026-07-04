import { z } from 'zod';
import { paginationQuerySchema } from './common.schema.js';

export const updateRoleSchema = z
  .object({
    role: z.enum(['attendee', 'organizer', 'admin'], {
      required_error: 'role is required'
    })
  })
  .strip();

export const listUsersQuerySchema = paginationQuerySchema.strip();
