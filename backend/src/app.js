import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import adminRoutes from './modules/admin/admin.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import eventsRoutes from './modules/events/events.routes.js';
import bookingRoutes from './modules/booking/booking.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import { webhookHandler } from './modules/payments/webhook.handler.js';
import ticketsRoutes from './modules/tickets/tickets.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import { APIError } from './utils/apiError.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

const normalizeOrigin = (value, envName) => {
  try {
    return new URL(value).origin;
  } catch (err) {
    throw new Error(`${envName} must be a valid URL`, { cause: err });
  }
};

const getAllowedOrigins = () => {
  const configuredClientUrl = process.env.CLIENT_URL?.trim();

  if (isProduction) {
    if (!configuredClientUrl) {
      throw new Error('CLIENT_URL is required in production');
    }

    return new Set([normalizeOrigin(configuredClientUrl, 'CLIENT_URL')]);
  }

  const origins = new Set(['http://localhost:5173']);

  if (configuredClientUrl) {
    origins.add(normalizeOrigin(configuredClientUrl, 'CLIENT_URL'));
  }

  return origins;
};

const allowedOrigins = getAllowedOrigins();
const corsOptions = {
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new APIError(403, 'CORS_NOT_ALLOWED', 'Origin not allowed by CORS'));
  }
};

app.disable('x-powered-by');
app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(requestId);
app.post('/payments/webhook', express.raw({ type: 'application/json' }), webhookHandler);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/events', eventsRoutes);
app.use('/booking', bookingRoutes);
app.use('/payments', paymentsRoutes);
app.use('/tickets', ticketsRoutes);
app.use('/users', usersRoutes);

app.use((req, _res, next) => {
  next(new APIError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
});

app.use(errorHandler);

export default app;
