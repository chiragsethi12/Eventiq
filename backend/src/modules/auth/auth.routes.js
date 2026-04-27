import { Router } from 'express';
import { authController } from './auth.controller.js';
import { createRateLimiter, rateLimiter } from '../../middleware/rateLimiter.js';

const router = Router();
const isDevelopment = process.env.NODE_ENV === 'development';

const loginRateLimiter = isDevelopment
  ? rateLimiter
  : createRateLimiter({
      keyPrefix: 'rate:auth:login',
      max: 10,
      windowSeconds: 15 * 60
    });

router.post('/register', authController.registerUser);
router.post('/login', loginRateLimiter, authController.loginUser);
router.post('/refresh', authController.refreshAccessToken);
router.post('/logout', authController.logoutUser);

export default router;
