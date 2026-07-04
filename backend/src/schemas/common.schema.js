import { z } from 'zod';

export const objectIdSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, 'Must be a valid ObjectId');

export const paginationQuerySchema = z
  .object({
    page: z
      .string()
      .optional()
      .transform((val) => {
        if (val === undefined || val === '') return 1;
        const num = Number(val);
        if (!Number.isInteger(num) || num < 1) return 1;
        return num;
      }),
    limit: z
      .string()
      .optional()
      .transform((val) => {
        if (val === undefined || val === '') return 20;
        const num = Number(val);
        if (!Number.isInteger(num) || num < 1) return 20;
        if (num > 100) return 100;
        return num;
      })
  })
  .strip();
