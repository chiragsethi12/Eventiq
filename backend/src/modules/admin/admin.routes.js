import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { updateRoleSchema, listUsersQuerySchema } from '../../schemas/admin.schema.js';

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/users', validateQuery(listUsersQuerySchema), adminController.listAllUsers);
router.patch('/users/:id/role', validateBody(updateRoleSchema), adminController.updateRole);
router.delete('/users/:id', adminController.removeUser);
router.get('/stats', adminController.getStats);

export default router;
