import { z } from 'zod';

export const registerSchema = z
  .object({
    name: z.string({ required_error: 'name is required' }).min(1, 'name is required'),
    email: z.string({ required_error: 'email is required' }).email('Invalid email'),
    password: z.string({ required_error: 'password is required' }).min(8, 'Password must be at least 8 characters')
  })
  .strip();

export const loginSchema = z
  .object({
    email: z.string({ required_error: 'email is required' }).min(1, 'email is required'),
    password: z.string({ required_error: 'password is required' }).min(1, 'password is required')
  })
  .strip();

export const refreshSchema = z.object({}).strip();

export const logoutSchema = z.object({}).strip();
