process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.REDIS_MOCK = 'true';
process.env.JWT_ACCESS_SECRET =
  'test-access-secret-should-be-longer-than-thirty-two-characters';
process.env.JWT_REFRESH_SECRET =
  'test-refresh-secret-should-be-longer-than-thirty-two-characters';
process.env.BCRYPT_SALT_ROUNDS = '10';
process.env.ACQUIREMOCK_URL = 'http://localhost:8000';
process.env.ACQUIREMOCK_WEBHOOK_SECRET = 'acquiremock-webhook-test-secret';
process.env.ACQUIREMOCK_WEBHOOK_URL = 'http://127.0.0.1:5000/payments/webhook';
process.env.CLOUDINARY_CLOUD_NAME = 'demo';
process.env.CLOUDINARY_API_KEY = 'cloudinary-api-key';
process.env.CLOUDINARY_API_SECRET = 'cloudinary-api-secret';
process.env.QR_HMAC_SECRET = 'qr-hmac-secret-long-enough-for-tests';
process.env.SMTP_HOST = '';
process.env.SMTP_PORT = '1025';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.SMTP_FROM = 'test@eventiq.test';
