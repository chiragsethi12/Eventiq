import { z } from 'zod';
import { paginationQuerySchema } from './common.schema.js';

const venueSchema = z
  .object({
    name: z.string({ required_error: 'venue.name is required' }).min(1).max(180),
    city: z.string({ required_error: 'venue.city is required' }).min(1).max(120),
    address: z.string({ required_error: 'venue.address is required' }).min(1).max(500)
  })
  .strip();

const ticketTierSchema = z
  .object({
    name: z.string({ required_error: 'ticketTiers.name is required' }).min(1).max(120),
    price: z.number({ required_error: 'ticketTiers.price is required' }).min(0),
    seatCount: z.number().int().min(0).optional()
  })
  .strip();

const seatMapSchema = z
  .object({
    rows: z.number().int().min(1),
    columns: z.number().int().min(1),
    blockedSeats: z.array(z.string()).optional().default([])
  })
  .strip();

export const createEventSchema = z
  .object({
    title: z.string({ required_error: 'title is required' }).min(1).max(180),
    description: z.string({ required_error: 'description is required' }).min(1).max(5000),
    venue: venueSchema,
    date: z.string({ required_error: 'date is required' }),
    category: z.string({ required_error: 'category is required' }).min(1).max(80),
    coverImageUrl: z.string().url().optional(),
    ticketTiers: z.array(ticketTierSchema).min(1).max(20),
    seatMap: seatMapSchema.optional()
  })
  .strip();

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(180).optional(),
    description: z.string().min(1).max(5000).optional(),
    venue: venueSchema.optional(),
    coverImageUrl: z.string().url().optional(),
    status: z.enum(['draft', 'published', 'cancelled']).optional()
  })
  .strip();

export const listEventsQuerySchema = paginationQuerySchema
  .extend({
    city: z.string().max(120).optional(),
    category: z.string().max(120).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    cursor: z.string().optional()
  })
  .strip();
