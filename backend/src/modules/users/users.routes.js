import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import { updateProfileSchema } from '../../schemas/users.schema.js';
import { usersController } from './users.controller.js';

const router = Router();

router.get('/me', authenticate, usersController.getMe);
router.patch('/me', authenticate, validateBody(updateProfileSchema), usersController.updateMe);

export default router;
