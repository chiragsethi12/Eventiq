import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { paymentsController } from './payments.controller.js';

const router = Router();

router.post('/create-order', authenticate, authorize('attendee'), paymentsController.createOrderHandler);

export default router;
