import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import { createOrderSchema } from '../../schemas/payments.schema.js';
import { paymentsController } from './payments.controller.js';

const router = Router();

router.post('/create-order', authenticate, authorize('attendee'), validateBody(createOrderSchema), paymentsController.createOrderHandler);

export default router;
