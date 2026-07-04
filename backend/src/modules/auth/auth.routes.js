import { Router } from 'express';
import { authController } from './auth.controller.js';
import { createRateLimiter, rateLimiter } from '../../middleware/rateLimiter.js';
import { validateBody } from '../../middleware/validate.js';
import { registerSchema, loginSchema } from '../../schemas/auth.schema.js';

const router = Router();
const isDevelopment = process.env.NODE_ENV === 'development';

const loginRateLimiter = isDevelopment
  ? rateLimiter
  : createRateLimiter({
      keyPrefix: 'rate:auth:login',
      max: 10,
      windowSeconds: 15 * 60
    });

router.post('/register', validateBody(registerSchema), authController.registerUser);
router.post('/login', loginRateLimiter, validateBody(loginSchema), authController.loginUser);
router.post('/refresh', authController.refreshAccessToken);
router.post('/logout', authController.logoutUser);

export default router;
