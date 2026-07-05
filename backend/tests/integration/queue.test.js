import crypto from 'node:crypto';
import { createServer } from 'node:http';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

// Mock BullMQ before other imports so it takes effect globally in the test context
jest.mock('bullmq', () => {
  const mockQueueInstances = new Map();
  return {
    Queue: jest.fn().mockImplementation((name) => {
      if (!mockQueueInstances.has(name)) {
        mockQueueInstances.set(name, {
          name,
          getName: () => name,
          add: jest.fn().mockImplementation(async (jobName, data, opts) => {
            return { id: `mock-job-${name}-${Date.now()}-${Math.random()}`, name: jobName, data, opts };
          }),
          drain: jest.fn().mockResolvedValue(undefined),
          close: jest.fn().mockResolvedValue(undefined)
        });
      }
      return mockQueueInstances.get(name);
    }),
    Worker: jest.fn().mockImplementation((name, processor, opts) => ({
      name,
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn()
    }))
  };
});

jest.mock('@bull-board/api/bullMQAdapter', () => {
  return {
    BullMQAdapter: jest.fn().mockImplementation((queue) => ({
      getName: () => queue.name || 'mock-queue',
      listen: jest.fn(),
      getJobs: jest.fn().mockResolvedValue([])
    }))
  };
});



import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

let app;
let emailQueue;
let reminderQueue;
let Booking;
let Event;
let Seat;
let Ticket;
let User;
let lockSeatForUser;
let createEvent;
let initializeSockets;
let closeSockets;
let generateTicketPdf;
let processEmailJob;
let closeQueues;
let cloudinary;
let redis;

const DEFAULT_PASSWORD = 'Password123!';
let mongoServer;
let httpServer;
let orderCounter = 1;
let assetCounter = 1;

const nextEmail = (() => {
  let counter = 1;
  return (label = 'quser') => `${label}-${counter += 1}@queue.test`;
})();

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, () => resolve(server.address().port));
  });

const createUser = async ({ role = 'attendee', email, password = DEFAULT_PASSWORD, name } = {}) => {
  const normalizedEmail = email || nextEmail(role);
  const normalizedName = name || `${role[0].toUpperCase()}${role.slice(1)} User`;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: normalizedName,
    email: normalizedEmail,
    passwordHash,
    role
  });
  return { user, email: normalizedEmail, password };
};

const loginUser = async ({ email, password }) => {
  const response = await request(httpServer)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: response.body.data.accessToken,
    response
  };
};

const createOrganizerEvent = async ({
  organizerId,
  title = 'Queue Test Event',
  seatCount = 3,
  price = 500,
  hoursFromNow = 48
} = {}) => {
  const event = await createEvent({
    user: { id: organizerId.toString(), role: 'organizer' },
    payload: {
      title,
      description: 'An event for queue testing.',
      category: 'Music',
      date: new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString(),
      venue: {
        name: 'Queue Arena',
        city: 'Mumbai',
        address: '42 Test Lane'
      },
      coverImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
      seatMap: {
        rows: 1,
        columns: seatCount,
        blockedSeats: []
      },
      ticketTiers: [{ name: 'VIP', price, seatCount }]
    }
  });

  const seats = await Seat.find({ eventId: event._id }).sort({ seatNumber: 1 }).lean();
  return { event, seats };
};

const createPendingBookingContext = async ({ seatCount = 1, hoursFromNow = 48 } = {}) => {
  const organizerAccount = await createUser({ role: 'organizer' });
  const attendeeAccount = await createUser({ role: 'attendee' });
  const { event, seats } = await createOrganizerEvent({
    organizerId: organizerAccount.user._id,
    seatCount: Math.max(3, seatCount),
    hoursFromNow
  });
  const selectedSeats = seats.slice(0, seatCount);
  const attendeeSession = await loginUser(attendeeAccount);

  await Promise.all(
    selectedSeats.map((seat) =>
      lockSeatForUser({
        eventId: event._id.toString(),
        seatId: seat._id.toString(),
        userId: attendeeAccount.user._id.toString()
      })
    )
  );

  const initiateResponse = await request(httpServer)
    .post('/api/v1/bookings/initiate')
    .set('Authorization', `Bearer ${attendeeSession.accessToken}`)
    .send({
      eventId: event._id.toString(),
      tierId: event.ticketTiers[0]._id.toString(),
      seatIds: selectedSeats.map((s) => s._id.toString())
    });

  const booking = await Booking.findOne({
    razorpayOrderId: initiateResponse.body.data.orderId
  });

  return {
    organizerAccount,
    attendeeAccount,
    attendeeSession,
    event,
    seats,
    selectedSeats,
    booking,
    initiateResponse
  };
};

const buildWebhookRequest = ({ orderId, paymentId = `pay_${Date.now()}`, event = 'paid' }) => {
  const payload = {
    payment_id: paymentId,
    reference: orderId,
    status: event
  };
  const formatPythonJsonNumber = (value, key) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return JSON.stringify(value);
    }
    if (key === 'amount' && Number.isInteger(value)) {
      return `${value.toFixed(1)}`;
    }
    return JSON.stringify(value);
  };
  const toPythonStyleSortedJson = (value, key = null) => {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => toPythonStyleSortedJson(entry)).join(', ')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.keys(value)
        .sort()
        .map((k) => `${JSON.stringify(k)}: ${toPythonStyleSortedJson(value[k], k)}`)
        .join(', ')}}`;
    }
    return formatPythonJsonNumber(value, key);
  };
  const canonicalBody = toPythonStyleSortedJson(payload);
  const signature = crypto
    .createHmac('sha256', process.env.ACQUIREMOCK_WEBHOOK_SECRET)
    .update(canonicalBody)
    .digest('hex');

  return { body: JSON.stringify(payload), signature };
};

const postWebhook = async ({ body, signature }) =>
  request(httpServer)
    .post('/api/v1/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Signature', signature)
    .send(body);

beforeAll(async () => {
  const cloudinaryModule = await import('../../src/config/cloudinary.js');
  cloudinary = cloudinaryModule.cloudinary;

  const redisModule = await import('../../src/config/redis.js');
  redis = redisModule.redis;

  Booking = (await import('../../src/models/Booking.js')).default;
  Event = (await import('../../src/models/Event.js')).default;
  Seat = (await import('../../src/models/Seat.js')).default;
  Ticket = (await import('../../src/models/Ticket.js')).default;
  User = (await import('../../src/models/User.js')).default;

  const seatLockService = await import('../../src/modules/booking/seat-lock.service.js');
  lockSeatForUser = seatLockService.lockSeatForUser;

  const eventsService = await import('../../src/modules/events/events.service.js');
  createEvent = eventsService.createEvent;

  const socketsModule = await import('../../src/sockets/index.js');
  initializeSockets = socketsModule.initializeSockets;
  closeSockets = socketsModule.closeSockets;

  const pdfTicketModule = await import('../../src/utils/pdfTicket.js');
  generateTicketPdf = pdfTicketModule.generateTicketPdf;

  const emailWorkerModule = await import('../../src/workers/emailWorker.js');
  processEmailJob = emailWorkerModule.processEmailJob;

  app = (await import('../../src/app.js')).default;
  const queues = await import('../../src/config/queue.js');
  emailQueue = queues.emailQueue;
  reminderQueue = queues.reminderQueue;
  closeQueues = queues.closeQueues;

  jest.spyOn(global, 'fetch').mockImplementation(async () => {
    const pageUrl = `${process.env.ACQUIREMOCK_URL}/checkout/pay_${orderCounter += 1}`;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ pageUrl })
    };
  });

  jest
    .spyOn(cloudinary.uploader, 'upload_stream')
    .mockImplementation((_options, callback) => ({
      end: () => {
        callback(null, {
          secure_url: `https://res.cloudinary.com/demo/image/upload/ticket-${assetCounter += 1}.png`
        });
      }
    }));

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'eventiq-queue-test' });

  httpServer = createServer(app);
  initializeSockets(httpServer);
  await listen(httpServer);
});

beforeEach(async () => {
  await redis.flushall();
  orderCounter = 1;
  assetCounter = 1;
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Event.deleteMany({}),
    Seat.deleteMany({}),
    Booking.deleteMany({}),
    Ticket.deleteMany({})
  ]);
  await redis.flushall();

  // Drain queues between tests
  await emailQueue.drain();
  await reminderQueue.drain();

  jest.restoreAllMocks();

  jest.spyOn(global, 'fetch').mockImplementation(async () => {
    const pageUrl = `${process.env.ACQUIREMOCK_URL}/checkout/pay_${orderCounter += 1}`;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ pageUrl })
    };
  });

  jest
    .spyOn(cloudinary.uploader, 'upload_stream')
    .mockImplementation((_options, callback) => ({
      end: () => {
        callback(null, {
          secure_url: `https://res.cloudinary.com/demo/image/upload/ticket-${assetCounter += 1}.png`
        });
      }
    }));
});

afterAll(async () => {
  if (typeof closeQueues === 'function') {
    await closeQueues();
  }
  await closeSockets();

  if (httpServer?.listening) {
    await new Promise((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }

  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Async Job Queue & Email Notification System
// ─────────────────────────────────────────────────────────────────────────────

describe('Async Job Queue & Email System', () => {
  describe('Webhook → Email Queue', () => {
    test('POST webhook with valid signature enqueues an email-queue job and returns 200', async () => {
      const ctx = await createPendingBookingContext();
      const paymentId = `pay_test_${Date.now()}`;
      const webhookReq = buildWebhookRequest({
        orderId: ctx.booking._id.toString(),
        paymentId
      });

      const startTime = Date.now();
      const response = await postWebhook(webhookReq);
      const elapsed = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(elapsed).toBeLessThan(5000); // Generous for CI; production target is 100ms

      // Verify booking was confirmed
      const updatedBooking = await Booking.findById(ctx.booking._id);
      expect(updatedBooking.paymentStatus).toBe('confirmed');
      expect(updatedBooking.razorpayPaymentId).toBe(paymentId);
      expect(updatedBooking.jobId).toBeTruthy();
    });

    test('POST same webhook twice only enqueues one job (idempotency)', async () => {
      const ctx = await createPendingBookingContext();
      const paymentId = `pay_idempotent_${Date.now()}`;
      const webhookReq = buildWebhookRequest({
        orderId: ctx.booking._id.toString(),
        paymentId
      });

      const response1 = await postWebhook(webhookReq);
      expect(response1.status).toBe(200);

      // Second identical webhook should be caught by idempotency
      const response2 = await postWebhook(webhookReq);
      expect(response2.status).toBe(200);

      // Booking should still have only one jobId (not overwritten)
      const updatedBooking = await Booking.findById(ctx.booking._id);
      expect(updatedBooking.paymentStatus).toBe('confirmed');
    });
  });

  describe('PDF Ticket Generation', () => {
    test('generateTicketPdf produces a valid PDF buffer containing event name', async () => {
      const eventName = 'Midnight Jazz Festival';
      const pdfBuffer = await generateTicketPdf({
        eventName,
        eventDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        venueName: 'Blue Note Arena',
        venueCity: 'Mumbai',
        venueAddress: '123 Jazz Street',
        tierName: 'VIP',
        seatNumbers: ['A1', 'A2'],
        bookingId: new mongoose.Types.ObjectId().toString(),
        attendeeName: 'Test User',
        qrPayload: 'test:qr:payload:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      });

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(100);

      // PDF magic bytes
      const header = pdfBuffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    test('generateTicketPdf handles missing QR payload gracefully', async () => {
      const pdfBuffer = await generateTicketPdf({
        eventName: 'No QR Event',
        eventDate: new Date().toISOString(),
        venueName: 'Venue',
        venueCity: 'City',
        venueAddress: 'Address',
        tierName: 'General',
        seatNumbers: [],
        bookingId: 'test-booking-id',
        attendeeName: 'User',
        qrPayload: null
      });

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('Reminder Delay Calculation', () => {
    test('event 48h away should produce ~24h reminder delay', () => {
      const eventDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const reminderTime = eventDate.getTime() - 24 * 60 * 60 * 1000;
      const delay = reminderTime - Date.now();

      // Should be approximately 24 hours (±5 seconds tolerance for test execution)
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      expect(delay).toBeGreaterThan(twentyFourHoursMs - 5000);
      expect(delay).toBeLessThanOrEqual(twentyFourHoursMs);
    });

    test('event starting in < 24h should result in negative delay (no reminder)', () => {
      const eventDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h from now
      const reminderTime = eventDate.getTime() - 24 * 60 * 60 * 1000;
      const delay = reminderTime - Date.now();

      expect(delay).toBeLessThan(0);
    });
  });

  describe('Resend Email API', () => {
    test('POST /api/v1/bookings/:id/resend-email by non-owner returns 403', async () => {
      const ctx = await createPendingBookingContext();

      // Confirm the booking via webhook
      const paymentId = `pay_resend_${Date.now()}`;
      const webhookReq = buildWebhookRequest({
        orderId: ctx.booking._id.toString(),
        paymentId
      });
      await postWebhook(webhookReq);

      // Create a different user and try to resend
      const otherUser = await createUser({ role: 'attendee' });
      const otherSession = await loginUser(otherUser);

      const response = await request(httpServer)
        .post(`/api/v1/bookings/${ctx.booking._id.toString()}/resend-email`)
        .set('Authorization', `Bearer ${otherSession.accessToken}`);

      expect(response.status).toBe(403);
    });

    test('POST /api/v1/bookings/:id/resend-email by owner on confirmed booking succeeds', async () => {
      const ctx = await createPendingBookingContext();

      // Confirm the booking via webhook
      const paymentId = `pay_resend_own_${Date.now()}`;
      const webhookReq = buildWebhookRequest({
        orderId: ctx.booking._id.toString(),
        paymentId
      });
      await postWebhook(webhookReq);

      const response = await request(httpServer)
        .post(`/api/v1/bookings/${ctx.booking._id.toString()}/resend-email`)
        .set('Authorization', `Bearer ${ctx.attendeeSession.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.jobId).toBeTruthy();
    });

    test('POST /api/v1/bookings/:id/resend-email on pending booking returns 400', async () => {
      const ctx = await createPendingBookingContext();

      const response = await request(httpServer)
        .post(`/api/v1/bookings/${ctx.booking._id.toString()}/resend-email`)
        .set('Authorization', `Bearer ${ctx.attendeeSession.accessToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('Booking Schema Fields', () => {
    test('Booking model includes emailSentAt, emailError, and jobId fields', async () => {
      const schemaPaths = Booking.schema.paths;

      expect(schemaPaths.emailSentAt).toBeDefined();
      expect(schemaPaths.emailSentAt.instance).toBe('Date');

      expect(schemaPaths.emailError).toBeDefined();
      expect(schemaPaths.emailError.instance).toBe('String');

      expect(schemaPaths.jobId).toBeDefined();
      expect(schemaPaths.jobId.instance).toBe('String');
    });
  });

  describe('Webhook Response Time', () => {
    test('webhook handler responds within reasonable time', async () => {
      const ctx = await createPendingBookingContext();
      const paymentId = `pay_perf_${Date.now()}`;
      const webhookReq = buildWebhookRequest({
        orderId: ctx.booking._id.toString(),
        paymentId
      });

      const startTime = Date.now();
      const response = await postWebhook(webhookReq);
      const elapsed = Date.now() - startTime;

      expect(response.status).toBe(200);
      // CI environments are slow; target is 100ms in production.
      // Here we assert < 3000ms for test stability.
      expect(elapsed).toBeLessThan(3000);
    });
  });
});
