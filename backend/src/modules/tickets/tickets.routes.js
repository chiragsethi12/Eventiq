import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import { validateTicketSchema } from '../../schemas/tickets.schema.js';
import { ticketsController } from './tickets.controller.js';

const router = Router();

router.get('/:bookingId', authenticate, ticketsController.getTicketByBookingIdHandler);
router.post(
  '/validate',
  authenticate,
  authorize('organizer', 'admin'),
  validateBody(validateTicketSchema),
  ticketsController.validateTicketHandler
);

export default router;
