import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/users', adminController.listAllUsers);
router.patch('/users/:id/role', adminController.updateRole);
router.delete('/users/:id', adminController.removeUser);
router.get('/stats', adminController.getStats);

export default router;
