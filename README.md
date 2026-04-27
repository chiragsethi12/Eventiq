# Eventiq

Eventiq is a full-stack real-time event ticketing platform with seat locking, Razorpay checkout, QR-backed tickets, organizer dashboards, and admin controls.

## Stack

- Frontend: React + Vite + Tailwind + Redux Toolkit + Socket.io client
- Backend: Express + MongoDB + Redis + Socket.io + Razorpay + Cloudinary
- Testing: Jest + Supertest + `mongodb-memory-server` + `ioredis-mock`

## Repository Layout

- `frontend/` - Vite SPA deployed to Vercel
- `backend/` - Express API and Socket.io server deployed to Render

## Local Development

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Required backend environment variables are documented in [backend/.env.example](/Users/akshatshah17/Documents/Eventiq/backend/.env.example).

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend environment variables are documented in [frontend/.env.example](/Users/akshatshah17/Documents/Eventiq/frontend/.env.example).

### 3. Verification

```bash
cd backend
npm test

cd ../frontend
npm run build
```

## Environment Variables

### Frontend

- `VITE_API_URL` - public base URL for the backend API, for example `https://api.example.com`

### Backend

- `PORT`
- `NODE_ENV`
- `CLIENT_URL`
- `MONGODB_URI`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `BCRYPT_SALT_ROUNDS`
- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `QR_HMAC_SECRET`

## Security and Runtime Notes

- `helmet()` is enabled globally in the backend.
- CORS never uses `*` in production. Only `CLIENT_URL` is allowed.
- The Razorpay webhook route uses `express.raw()` before `express.json()`.
- `GET /health` returns `{ status: 'ok', timestamp }`.
- Cover image uploads are stored in memory with `multer.memoryStorage()` and validated for MIME type and size before Cloudinary upload.
- Production refresh cookies are `HttpOnly`, `Secure`, and `SameSite=Strict`.
- Winston uses JSON console logging only when `NODE_ENV=production`.

### Same-Site Cookie Requirement

Production refresh cookies use `SameSite=Strict`, so the frontend and backend must be deployed on the same site.

Working example:

- Frontend: `https://app.example.com`
- Backend: `https://api.example.com`

Non-working default pairing for cookie-based refresh:

- Frontend: `https://your-app.vercel.app`
- Backend: `https://your-api.onrender.com`

If you deploy on Vercel and Render, configure custom domains that share the same registrable domain.

## Deploying the Frontend on Vercel

1. Import the `frontend/` directory as a Vercel project.
2. Set the framework preset to Vite if Vercel does not auto-detect it.
3. Add the frontend environment variable:
   - `VITE_API_URL=https://api.example.com`
4. Deploy.

SPA routing is already configured in [frontend/vercel.json](/Users/akshatshah17/Documents/Eventiq/frontend/vercel.json) with a rewrite to `index.html`.

The Razorpay Checkout SDK is loaded in [frontend/index.html](/Users/akshatshah17/Documents/Eventiq/frontend/index.html), so no extra Vercel step is needed for that script.

## Deploying the Backend on Render

1. Create a new Render Web Service from the `backend/` directory.
2. Set the start command to:

```bash
node src/server.js
```

3. Set the health check path to:

```text
/health
```

4. Add all backend environment variables from [backend/.env.example](/Users/akshatshah17/Documents/Eventiq/backend/.env.example).
5. Set `NODE_ENV=production`.
6. Set `CLIENT_URL` to your deployed frontend URL, for example `https://app.example.com`.

## Third-Party Setup

### MongoDB Atlas

- Use an Atlas connection string in `MONGODB_URI`.
- Ensure Atlas network access allows your Render outbound IPs.

### Redis

- Use a production Redis instance in `REDIS_URL`.

### Razorpay

- Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`.
- In the Razorpay dashboard, point the webhook URL to:

```text
https://api.example.com/payments/webhook
```

- Ensure the webhook secret in Razorpay matches `RAZORPAY_WEBHOOK_SECRET`.

### Cloudinary

- Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.

## Production Checklist

- [x] `helmet()` enabled
- [x] CORS locked to `CLIENT_URL`
- [x] `Secure: true` on the refresh token cookie in production
- [x] `.env` ignored by git
- [x] Frontend `VITE_` env vars documented
- [x] Backend `.env.example` includes placeholder values
- [x] `/health` endpoint responds
- [ ] MongoDB Atlas network access allows Render IPs
- [ ] Razorpay webhook URL configured in the Razorpay dashboard

## Test Coverage Added

Backend integration tests cover:

- Auth register, login, session fetch, logout, and refresh-token blacklist behavior
- Login rate limiting
- Concurrent seat locking over Socket.io
- Booking initiation guardrails
- Razorpay webhook success, invalid signature handling, and idempotency
- Ticket QR validation, replay rejection, and tamper rejection
- Edge cases for Redis lock cleanup, cancelled-event refunds, and admin self-demotion
