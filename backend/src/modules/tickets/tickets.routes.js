import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { ticketsController } from './tickets.controller.js';

const router = Router();

router.get('/:bookingId', authenticate, ticketsController.getTicketByBookingIdHandler);
router.post(
  '/validate',
  authenticate,
  authorize('organizer', 'admin'),
  ticketsController.validateTicketHandler
);

export default router;
