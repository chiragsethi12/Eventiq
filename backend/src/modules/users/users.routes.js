import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { usersController } from './users.controller.js';

const router = Router();

router.get('/me', authenticate, usersController.getMe);
router.patch('/me', authenticate, usersController.updateMe);

export default router;
