import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { createRateLimiter } from '../../middleware/rateLimiter.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { initiateBookingSchema, listBookingsQuerySchema } from '../../schemas/booking.schema.js';
import { bookingController } from './booking.controller.js';

const router = Router();

const bookingInitiateRateLimiter = createRateLimiter({
  keyPrefix: 'rate:booking',
  max: 5,
  windowSeconds: 60,
  getKey: (req) => req.user?.id
});

router.post(
  '/initiate',
  authenticate,
  authorize('attendee'),
  bookingInitiateRateLimiter,
  validateBody(initiateBookingSchema),
  bookingController.initiateBookingHandler
);
router.get('/my', authenticate, validateQuery(listBookingsQuerySchema), bookingController.listMyBookingsHandler);
router.get('/:id', authenticate, bookingController.getBookingByIdHandler);

export default router;
