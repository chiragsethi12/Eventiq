import crypto from 'node:crypto';
import { createServer } from 'node:http';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as createSocketClient } from 'socket.io-client';
import request from 'supertest';
import app from '../../src/app.js';
import { cloudinary } from '../../src/config/cloudinary.js';
import { redis } from '../../src/config/redis.js';
import Booking from '../../src/models/Booking.js';
import Event from '../../src/models/Event.js';
import Seat from '../../src/models/Seat.js';
import Ticket from '../../src/models/Ticket.js';
import User from '../../src/models/User.js';
import { lockSeatForUser, seatLockKey } from '../../src/modules/booking/seat-lock.service.js';
import { createEvent } from '../../src/modules/events/events.service.js';
import { closeSockets, initializeSockets } from '../../src/sockets/index.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const DEFAULT_PASSWORD = 'Password123!';
const activeSockets = new Set();

let mongoServer;
let httpServer;
let baseUrl;
let orderCounter = 1;
let assetCounter = 1;

const nextEmail = (() => {
  let counter = 1;

  return (label = 'user') => `${label}-${counter += 1}@eventiq.test`;
})();

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, () => {
      resolve(server.address().port);
    });
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

const extractCookieValue = (cookies, cookieName) => {
  const cookie = (cookies || []).find((item) => item.startsWith(`${cookieName}=`));

  if (!cookie) {
    return null;
  }

  return cookie.split(';')[0].slice(cookieName.length + 1);
};

const loginUser = async ({ email, password }) => {
  const agent = request.agent(httpServer);
  const response = await agent.post('/api/v1/auth/login').send({ email, password });

  return {
    agent,
    accessToken: response.body.data.accessToken,
    refreshToken: extractCookieValue(response.headers['set-cookie'], REFRESH_COOKIE_NAME),
    response
  };
};

const createOrganizerEvent = async ({
  organizerId,
  title = 'Midnight Session',
  seatCount = 3,
  price = 1800
} = {}) => {
  const event = await createEvent({
    user: {
      id: organizerId.toString(),
      role: 'organizer'
    },
    payload: {
      title,
      description: 'A test event for integration coverage.',
      category: 'Music',
      date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      venue: {
        name: 'Eventiq Arena',
        city: 'Mumbai',
        address: '123 Test Street'
      },
      coverImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
      seatMap: {
        rows: 1,
        columns: seatCount,
        blockedSeats: []
      },
      ticketTiers: [
        {
          name: 'VIP',
          price,
          seatCount
        }
      ]
    }
  });

  const seats = await Seat.find({ eventId: event._id }).sort({ seatNumber: 1 }).lean();
  return { event, seats };
};

const createPendingBookingContext = async ({ seatCount = 1 } = {}) => {
  const organizerAccount = await createUser({ role: 'organizer' });
  const attendeeAccount = await createUser({ role: 'attendee' });
  const { event, seats } = await createOrganizerEvent({
    organizerId: organizerAccount.user._id,
    seatCount: Math.max(3, seatCount)
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
      seatIds: selectedSeats.map((seat) => seat._id.toString())
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
  const body = JSON.stringify(payload);
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
        .map((entryKey) => `${JSON.stringify(entryKey)}: ${toPythonStyleSortedJson(value[entryKey], entryKey)}`)
        .join(', ')}}`;
    }

    return formatPythonJsonNumber(value, key);
  };
  const canonicalBody = toPythonStyleSortedJson(payload);

  const signature = crypto
    .createHmac('sha256', process.env.ACQUIREMOCK_WEBHOOK_SECRET)
    .update(canonicalBody)
    .digest('hex');

  return { body, signature };
};

const postWebhook = async ({ body, signature }) =>
  request(httpServer)
    .post('/api/v1/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Signature', signature)
    .send(body);

const connectSocket = async (accessToken) => {
  const socket = createSocketClient(baseUrl, {
    auth: { token: accessToken },
    transports: ['websocket']
  });

  activeSockets.add(socket);

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Socket connection timed out'));
    }, 5000);

    socket.once('connect', () => {
      clearTimeout(timeoutId);
      resolve();
    });

    socket.once('connect_error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });

  return socket;
};

const joinEventRoom = async (socket, eventId) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Timed out waiting for seat state'));
    }, 5000);

    const handleSeatState = (payload) => {
      if (payload.eventId !== eventId) {
        return;
      }

      clearTimeout(timeoutId);
      socket.off('seat_state', handleSeatState);
      resolve(payload);
    };

    socket.on('seat_state', handleSeatState);
    socket.emit('join_event', { eventId });
  });

const waitForLockOutcome = (socket, userId) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for lock outcome'));
    }, 5000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.off('seat_updated', handleSeatUpdated);
      socket.off('lock_failed', handleLockFailed);
    };

    const handleSeatUpdated = (payload) => {
      if (payload.lockedBy === userId && payload.status === 'locked') {
        cleanup();
        resolve('success');
      }
    };

    const handleLockFailed = () => {
      cleanup();
      resolve('failed');
    };

    socket.on('seat_updated', handleSeatUpdated);
    socket.on('lock_failed', handleLockFailed);
  });

beforeAll(async () => {
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
  await mongoose.connect(mongoServer.getUri(), {
    dbName: 'eventiq-test'
  });

  httpServer = createServer(app);
  initializeSockets(httpServer);
  const port = await listen(httpServer);
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(async () => {
  await redis.flushall();
  orderCounter = 1;
  assetCounter = 1;
});

afterEach(async () => {
  activeSockets.forEach((socket) => {
    socket.disconnect();
  });
  activeSockets.clear();

  await Promise.all([
    User.deleteMany({}),
    Event.deleteMany({}),
    Seat.deleteMany({}),
    Booking.deleteMany({}),
    Ticket.deleteMany({})
  ]);
  await redis.flushall();
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
  await closeSockets();

  if (httpServer?.listening) {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => {
        if (error && error.message !== 'Server is not running.') {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await mongoose.disconnect();
  await mongoServer.stop();
  await redis.disconnect?.();
});

describe('Eventiq integration coverage', () => {
  test('AUTH — register → login → get /users/me → logout → verify refresh token blacklisted', async () => {
    const registration = await request(httpServer).post('/api/v1/auth/register').send({
      name: 'Auth Flow User',
      email: 'auth-flow@example.com',
      password: DEFAULT_PASSWORD
    });

    expect(registration.status).toBe(201);

    const session = await loginUser({
      email: 'auth-flow@example.com',
      password: DEFAULT_PASSWORD
    });
    const meResponse = await request(httpServer)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.data.user.email).toBe('auth-flow@example.com');

    const logoutResponse = await session.agent.post('/api/v1/auth/logout');

    expect(logoutResponse.status).toBe(200);

    const decodedRefreshToken = jwt.verify(
      session.refreshToken,
      process.env.JWT_REFRESH_SECRET
    );
    const isBlacklisted = await redis.get(`token:blacklist:${decodedRefreshToken.jti}`);

    expect(isBlacklisted).toBe('1');
  });

  test('AUTH — login rate limit: 11 rapid login attempts on same IP → 11th returns 429', async () => {
    await createUser({
      email: 'rate-limit@example.com'
    });

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await request(httpServer).post('/api/v1/auth/login').send({
        email: 'rate-limit@example.com',
        password: 'WrongPassword123!'
      });

      expect(response.status).toBe(401);
    }

    const blockedResponse = await request(httpServer).post('/api/v1/auth/login').send({
      email: 'rate-limit@example.com',
      password: 'WrongPassword123!'
    });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  test('SEAT LOCK — simulate two concurrent lock_seat requests for the same seat. Exactly one must succeed and one must receive lock_failed.', async () => {
    const organizerAccount = await createUser({ role: 'organizer' });
    const attendeeOne = await createUser({ role: 'attendee' });
    const attendeeTwo = await createUser({ role: 'attendee' });
    const { event, seats } = await createOrganizerEvent({
      organizerId: organizerAccount.user._id,
      seatCount: 3
    });
    const seat = seats[0];
    const attendeeOneSession = await loginUser(attendeeOne);
    const attendeeTwoSession = await loginUser(attendeeTwo);
    const socketOne = await connectSocket(attendeeOneSession.accessToken);
    const socketTwo = await connectSocket(attendeeTwoSession.accessToken);

    await Promise.all([
      joinEventRoom(socketOne, event._id.toString()),
      joinEventRoom(socketTwo, event._id.toString())
    ]);

    const attendeeOneOutcome = waitForLockOutcome(socketOne, attendeeOne.user._id.toString());
    const attendeeTwoOutcome = waitForLockOutcome(socketTwo, attendeeTwo.user._id.toString());

    await Promise.all([
      socketOne.emit('lock_seat', {
        eventId: event._id.toString(),
        seatId: seat._id.toString()
      }),
      socketTwo.emit('lock_seat', {
        eventId: event._id.toString(),
        seatId: seat._id.toString()
      })
    ]);

    const outcomes = await Promise.all([attendeeOneOutcome, attendeeTwoOutcome]);
    const lockedSeat = await Seat.findById(seat._id).lean();

    expect(outcomes.sort()).toEqual(['failed', 'success']);
    expect(lockedSeat.status).toBe('locked');
    expect(
      [attendeeOne.user._id.toString(), attendeeTwo.user._id.toString()].includes(
        lockedSeat.lockedBy.toString()
      )
    ).toBe(true);
  });

  test('BOOKING — initiate booking with seat not locked by user → 400 SEAT_NOT_LOCKED_BY_USER', async () => {
    const organizerAccount = await createUser({ role: 'organizer' });
    const attendeeAccount = await createUser({ role: 'attendee' });
    const { event, seats } = await createOrganizerEvent({
      organizerId: organizerAccount.user._id
    });
    const attendeeSession = await loginUser(attendeeAccount);

    const response = await request(httpServer)
      .post('/api/v1/bookings/initiate')
      .set('Authorization', `Bearer ${attendeeSession.accessToken}`)
      .send({
        eventId: event._id.toString(),
        tierId: event.ticketTiers[0]._id.toString(),
        seatIds: [seats[0]._id.toString()]
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SEAT_NOT_LOCKED_BY_USER');
  });

  test('WEBHOOK — valid HMAC + paid → booking confirmed, seats booked, ticket created', async () => {
    const context = await createPendingBookingContext({ seatCount: 1 });
    const { body, signature } = buildWebhookRequest({
      orderId: context.booking._id.toString(),
      paymentId: context.booking.razorpayOrderId,
      event: 'paid'
    });

    const response = await postWebhook({ body, signature });
    const booking = await Booking.findById(context.booking._id).lean();
    const seat = await Seat.findById(context.selectedSeats[0]._id).lean();
    const ticket = await Ticket.findOne({ bookingId: context.booking._id }).lean();

    expect(response.status).toBe(200);
    expect(booking.paymentStatus).toBe('confirmed');
    expect(seat.status).toBe('booked');
    expect(ticket).not.toBeNull();
  });

  test('WEBHOOK — invalid HMAC → 400 INVALID_SIGNATURE', async () => {
    const context = await createPendingBookingContext({ seatCount: 1 });
    const { body } = buildWebhookRequest({
      orderId: context.booking._id.toString(),
      paymentId: context.booking.razorpayOrderId,
      event: 'paid'
    });

    const response = await postWebhook({
      body,
      signature: 'not-a-valid-signature'
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_SIGNATURE');
  });

  test('WEBHOOK — duplicate orderId (idempotency) → second call returns 200 without creating duplicate ticket', async () => {
    const context = await createPendingBookingContext({ seatCount: 1 });
    const webhookRequest = buildWebhookRequest({
      orderId: context.booking._id.toString(),
      paymentId: context.booking.razorpayOrderId,
      event: 'paid'
    });

    const firstResponse = await postWebhook(webhookRequest);
    const secondResponse = await postWebhook(webhookRequest);
    const tickets = await Ticket.find({ bookingId: context.booking._id }).lean();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.message).toBe('Already processed');
    expect(tickets).toHaveLength(1);
  });

  test('TICKET — validate a valid QR payload → 200, isUsed set to true', async () => {
    const context = await createPendingBookingContext({ seatCount: 1 });
    const webhookRequest = buildWebhookRequest({
      orderId: context.booking._id.toString(),
      paymentId: context.booking.razorpayOrderId,
      event: 'paid'
    });

    await postWebhook(webhookRequest);

    const organizerSession = await loginUser(context.organizerAccount);
    const ticket = await Ticket.findOne({ bookingId: context.booking._id }).lean();

    const response = await request(httpServer)
      .post('/api/v1/tickets/validate')
      .set('Authorization', `Bearer ${organizerSession.accessToken}`)
      .send({
        qrPayload: ticket.qrPayload
      });
    const updatedTicket = await Ticket.findById(ticket._id).lean();

    expect(response.status).toBe(200);
    expect(response.body.data.valid).toBe(true);
    expect(updatedTicket.isUsed).toBe(true);
  });

  test('TICKET — validate the same QR payload again → 400 TICKET_ALREADY_USED', async () => {
    const context = await createPendingBookingContext({ seatCount: 1 });
    const webhookRequest = buildWebhookRequest({
      orderId: context.booking._id.toString(),
      paymentId: context.booking.razorpayOrderId,
      event: 'paid'
    });

    await postWebhook(webhookRequest);

    const organizerSession = await loginUser(context.organizerAccount);
    const ticket = await Ticket.findOne({ bookingId: context.booking._id }).lean();

    await request(httpServer)
      .post('/api/v1/tickets/validate')
      .set('Authorization', `Bearer ${organizerSession.accessToken}`)
      .send({
        qrPayload: ticket.qrPayload
      });

    const secondResponse = await request(httpServer)
      .post('/api/v1/tickets/validate')
      .set('Authorization', `Bearer ${organizerSession.accessToken}`)
      .send({
        qrPayload: ticket.qrPayload
      });

    expect(secondResponse.status).toBe(400);
    expect(secondResponse.body.code).toBe('TICKET_ALREADY_USED');
  });

  test('TICKET — tampered HMAC in QR payload → 400 INVALID_TICKET', async () => {
    const context = await createPendingBookingContext({ seatCount: 1 });
    const webhookRequest = buildWebhookRequest({
      orderId: context.booking._id.toString(),
      paymentId: context.booking.razorpayOrderId,
      event: 'paid'
    });

    await postWebhook(webhookRequest);

    const organizerSession = await loginUser(context.organizerAccount);
    const ticket = await Ticket.findOne({ bookingId: context.booking._id }).lean();
    const tamperedPayload = `${ticket.qrPayload.slice(0, -1)}x`;

    const response = await request(httpServer)
      .post('/api/v1/tickets/validate')
      .set('Authorization', `Bearer ${organizerSession.accessToken}`)
      .send({
        qrPayload: tamperedPayload
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_TICKET');
  });

  test('TICKET — uppercase HMAC and padded QR payload still validate', async () => {
    const context = await createPendingBookingContext({ seatCount: 1 });
    const webhookRequest = buildWebhookRequest({
      orderId: context.booking._id.toString(),
      paymentId: context.booking.razorpayOrderId,
      event: 'paid'
    });

    await postWebhook(webhookRequest);

    const organizerSession = await loginUser(context.organizerAccount);
    const ticket = await Ticket.findOne({ bookingId: context.booking._id }).lean();
    const [bookingId, userId, eventId, hmac] = ticket.qrPayload.split(':');
    const scannedPayload = ` ${bookingId} : ${userId} : ${eventId} : ${hmac.toUpperCase()} `;

    const response = await request(httpServer)
      .post('/api/v1/tickets/validate')
      .set('Authorization', `Bearer ${organizerSession.accessToken}`)
      .send({
        qrPayload: scannedPayload
      });

    expect(response.status).toBe(200);
    expect(response.body.data.valid).toBe(true);
  });

  test('TICKET — QR payload with embedded whitespace artifacts still validates', async () => {
    const context = await createPendingBookingContext({ seatCount: 1 });
    const webhookRequest = buildWebhookRequest({
      orderId: context.booking._id.toString(),
      paymentId: context.booking.razorpayOrderId,
      event: 'paid'
    });

    await postWebhook(webhookRequest);

    const organizerSession = await loginUser(context.organizerAccount);
    const ticket = await Ticket.findOne({ bookingId: context.booking._id }).lean();
    const [bookingId, userId, eventId, hmac] = ticket.qrPayload.split(':');
    const scannedPayload = `${bookingId}:\n${userId}: ${eventId}:\u200B${hmac}`;

    const response = await request(httpServer)
      .post('/api/v1/tickets/validate')
      .set('Authorization', `Bearer ${organizerSession.accessToken}`)
      .send({
        qrPayload: scannedPayload
      });

    expect(response.status).toBe(200);
    expect(response.body.data.valid).toBe(true);
  });

  test('SEAT LOCK edge case — MongoDB failure releases the Redis reservation', async () => {
    const organizerAccount = await createUser({ role: 'organizer' });
    const attendeeAccount = await createUser({ role: 'attendee' });
    const { event, seats } = await createOrganizerEvent({
      organizerId: organizerAccount.user._id
    });
    const seat = seats[0];
    const findOneAndUpdateSpy = jest
      .spyOn(Seat, 'findOneAndUpdate')
      .mockImplementationOnce(() => {
        throw new Error('mongo write failed');
      });

    await expect(
      lockSeatForUser({
        eventId: event._id.toString(),
        seatId: seat._id.toString(),
        userId: attendeeAccount.user._id.toString()
      })
    ).rejects.toMatchObject({
      code: 'SEAT_LOCK_MONGO_UNAVAILABLE'
    });

    const redisLockValue = await redis.get(
      seatLockKey(event._id.toString(), seat._id.toString())
    );

    expect(redisLockValue).toBeNull();
    findOneAndUpdateSpy.mockRestore();
  });

  test('EVENT cancel edge case — confirmed bookings become refund_pending and seats are freed', async () => {
    const context = await createPendingBookingContext({ seatCount: 1 });
    const organizerSession = await loginUser(context.organizerAccount);
    const webhookRequest = buildWebhookRequest({
      orderId: context.booking._id.toString(),
      paymentId: context.booking.razorpayOrderId,
      event: 'paid'
    });

    await postWebhook(webhookRequest);

    const cancelResponse = await request(httpServer)
      .post(`/api/v1/events/${context.event._id.toString()}/cancel`)
      .set('Authorization', `Bearer ${organizerSession.accessToken}`);

    const booking = await Booking.findById(context.booking._id).lean();
    const seat = await Seat.findById(context.selectedSeats[0]._id).lean();

    expect(cancelResponse.status).toBe(200);
    expect(booking.paymentStatus).toBe('refund_pending');
    expect(seat.status).toBe('available');
  });

  test('ADMIN edge case — cannot demote your own role', async () => {
    const adminAccount = await createUser({ role: 'admin' });
    const adminSession = await loginUser(adminAccount);

    const response = await request(httpServer)
      .patch(`/api/v1/admin/users/${adminAccount.user._id.toString()}/role`)
      .set('Authorization', `Bearer ${adminSession.accessToken}`)
      .send({
        role: 'organizer'
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('ADMIN_CANNOT_DEMOTE_SELF');
  });

  // --- NEW PRODUCTION-GRADE HARDENING TESTS ---

  test('SECURITY — POST /api/v1/auth/login with wrong email → 401 with message "Invalid email or password"', async () => {
    const response = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({
        email: 'nonexistent-email@eventiq.test',
        password: 'SomePassword123!'
      });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password');
  });

  test('SECURITY — POST /api/v1/auth/login with wrong password → 401 with SAME message "Invalid email or password"', async () => {
    const attendeeAccount = await createUser({ role: 'attendee' });
    const response = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({
        email: attendeeAccount.email,
        password: 'DefinitelyWrongPassword123!'
      });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password');
  });

  test('SECURITY — POST /api/v1/bookings/initiate with client-sent amount=1 for a ₹500 event → server computes correct amount', async () => {
    const organizerAccount = await createUser({ role: 'organizer' });
    const attendeeAccount = await createUser({ role: 'attendee' });
    const { event, seats } = await createOrganizerEvent({
      organizerId: organizerAccount.user._id,
      seatCount: 1,
      price: 500
    });
    const seat = seats[0];
    const attendeeSession = await loginUser(attendeeAccount);

    await lockSeatForUser({
      eventId: event._id.toString(),
      seatId: seat._id.toString(),
      userId: attendeeAccount.user._id.toString()
    });

    const response = await request(httpServer)
      .post('/api/v1/bookings/initiate')
      .set('Authorization', `Bearer ${attendeeSession.accessToken}`)
      .send({
        eventId: event._id.toString(),
        tierId: event.ticketTiers[0]._id.toString(),
        seatIds: [seat._id.toString()],
        amount: 1 // Client tampered amount
      });

    expect(response.status).toBe(200);
    expect(response.body.data.amount).toBe(500); // Server-computed price (500 * 1)
  });

  test('PAGINATION — GET /api/v1/events?page=1&limit=5 → returns max 5 events with totalPages field', async () => {
    const organizerAccount = await createUser({ role: 'organizer' });
    // Create 6 events
    for (let i = 1; i <= 6; i++) {
      await createOrganizerEvent({
        organizerId: organizerAccount.user._id,
        title: `Midnight Session ${i}`,
        seatCount: 1
      });
    }

    const response = await request(httpServer)
      .get('/api/v1/events?page=1&limit=5');

    expect(response.status).toBe(200);
    expect(response.body.data.events.length).toBeLessThanOrEqual(5);
    expect(response.body.data.totalPages).toBe(2); // 6 events total / limit 5 = 2 pages
    expect(response.body.data.total).toBe(6);
  });

  test('SOCKETS — Socket.io connection without JWT → connection rejected with Unauthorized error', async () => {
    const socket = createSocketClient(baseUrl, {
      auth: { token: '' }, // No token
      transports: ['websocket']
    });

    activeSockets.add(socket);

    await expect(
      new Promise((resolve, reject) => {
        socket.once('connect', () => {
          resolve('connected');
        });

        socket.once('connect_error', (error) => {
          reject(error);
        });
      })
    ).rejects.toThrow('Unauthorized');
  });

  test('VALIDATION — Any route with missing required field → 400 with errors array containing field name', async () => {
    const response = await request(httpServer)
      .post('/api/v1/auth/register')
      .send({
        email: 'incomplete@eventiq.test',
        password: 'Password123!'
        // missing 'name'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Validation failed');
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'name',
          message: expect.any(String)
        })
      ])
    );
  });
});
