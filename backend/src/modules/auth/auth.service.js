import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { redis } from '../../config/redis.js';
import User from '../../models/User.js';
import { APIError } from '../../utils/apiError.js';
import { logger } from '../../utils/logger.js';

export const AUTH_ROLES = Object.freeze(['attendee', 'organizer', 'admin']);
export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
const isProduction = process.env.NODE_ENV === 'production';

const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '7d';
const REFRESH_TOKEN_SECONDS = 7 * 24 * 60 * 60;
const MIN_BCRYPT_SALT_ROUNDS = 10;
const DEFAULT_BCRYPT_SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_BCRYPT_PASSWORD_BYTES = 72;
const MIN_JWT_SECRET_LENGTH = 32;
const JWT_ALGORITHMS = Object.freeze(['HS256']);
const BLACKLIST_PREFIX = 'token:blacklist';
const DUMMY_PASSWORD_HASH =
  '$2b$10$R/kZEr1Qh6LPGW/ntBLP4Ow1fWrkQSLyZqtztJSsRe3TTp/sK0WbK';

const duplicateKeyCode = 11000;

const requireEnv = (name) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const getJwtSecrets = () => {
  const accessSecret = requireEnv('JWT_ACCESS_SECRET');
  const refreshSecret = requireEnv('JWT_REFRESH_SECRET');

  if (accessSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_ACCESS_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  if (refreshSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_REFRESH_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  if (accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }

  return { accessSecret, refreshSecret };
};

const getBcryptSaltRounds = () => {
  const rawRounds = process.env.BCRYPT_SALT_ROUNDS;

  if (!rawRounds) {
    return DEFAULT_BCRYPT_SALT_ROUNDS;
  }

  const rounds = Number(rawRounds);

  if (!Number.isInteger(rounds) || rounds < MIN_BCRYPT_SALT_ROUNDS) {
    throw new Error(`BCRYPT_SALT_ROUNDS must be an integer >= ${MIN_BCRYPT_SALT_ROUNDS}`);
  }

  return rounds;
};

const isValidEmail = (email) =>
  typeof email === 'string' &&
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const normalizeEmail = (email) => {
  if (typeof email !== 'string') {
    throw new APIError(400, 'AUTH_INVALID_EMAIL', 'Invalid email');
  }

  const normalized = email.trim().toLowerCase();

  if (!isValidEmail(normalized)) {
    throw new APIError(400, 'AUTH_INVALID_EMAIL', 'Invalid email');
  }

  return normalized;
};

const normalizeName = (name) => {
  if (typeof name !== 'string') {
    throw new APIError(400, 'AUTH_INVALID_NAME', 'Invalid name');
  }

  const normalized = name.trim().replace(/\s+/g, ' ');

  if (normalized.length < 1 || normalized.length > 120) {
    throw new APIError(400, 'AUTH_INVALID_NAME', 'Invalid name');
  }

  return normalized;
};

const validatePassword = (password) => {
  if (typeof password !== 'string') {
    throw new APIError(400, 'AUTH_INVALID_PASSWORD', 'Invalid password');
  }

  const passwordBytes = Buffer.byteLength(password, 'utf8');

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    passwordBytes > MAX_BCRYPT_PASSWORD_BYTES
  ) {
    throw new APIError(400, 'AUTH_INVALID_PASSWORD', 'Invalid password');
  }
};

const normalizeRole = (role) => {
  if (typeof role !== 'string' || !AUTH_ROLES.includes(role)) {
    throw new APIError(400, 'AUTH_INVALID_ROLE', 'Invalid role');
  }

  return role;
};

const toPublicUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role
});

const userTokenPayload = (user) => ({
  userId: user._id.toString(),
  role: user.role,
  email: user.email
});

const signAccessToken = (user) => {
  const { accessSecret } = getJwtSecrets();

  return jwt.sign(userTokenPayload(user), accessSecret, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_EXPIRES_IN
  });
};

const signRefreshToken = (user) => {
  const { refreshSecret } = getJwtSecrets();

  return jwt.sign(userTokenPayload(user), refreshSecret, {
    algorithm: 'HS256',
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    jwtid: randomUUID()
  });
};

const validateDecodedPayload = (decoded, { requireJti = false } = {}) => {
  if (
    !decoded ||
    typeof decoded !== 'object' ||
    typeof decoded.userId !== 'string' ||
    !mongoose.isValidObjectId(decoded.userId) ||
    !isValidEmail(decoded.email) ||
    !AUTH_ROLES.includes(decoded.role) ||
    typeof decoded.exp !== 'number' ||
    (requireJti && typeof decoded.jti !== 'string')
  ) {
    throw new APIError(401, 'AUTH_INVALID_TOKEN', 'Invalid token');
  }

  return decoded;
};

const verifyRefreshToken = (refreshToken) => {
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    throw new APIError(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  }

  const { refreshSecret } = getJwtSecrets();

  try {
    return validateDecodedPayload(
      jwt.verify(refreshToken, refreshSecret, { algorithms: JWT_ALGORITHMS }),
      { requireJti: true }
    );
  } catch (err) {
    throw new APIError(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token', {
      cause: err
    });
  }
};

const blacklistKey = (jti) => `${BLACKLIST_PREFIX}:${jti}`;

const ensureRefreshTokenNotBlacklisted = async (jti) => {
  try {
    const isBlacklisted = await redis.get(blacklistKey(jti));

    if (isBlacklisted === '1') {
      throw new APIError(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    }
  } catch (err) {
    if (err instanceof APIError) {
      throw err;
    }

    throw new APIError(503, 'AUTH_BLACKLIST_UNAVAILABLE', 'Unable to verify session state', {
      cause: err
    });
  }
};

const buildAuthResult = (user) => ({
  user: toPublicUser(user),
  accessToken: signAccessToken(user),
  refreshToken: signRefreshToken(user)
});

const createPasswordHash = async (password) => bcrypt.hash(password, getBcryptSaltRounds());

const throwInvalidCredentials = () => {
  throw new APIError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials');
};

const isDuplicateKeyError = (err) => err?.code === duplicateKeyCode;

export const assertAuthConfig = () => {
  getJwtSecrets();
  getBcryptSaltRounds();
};

export const verifyAccessToken = (accessToken) => {
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new APIError(401, 'AUTH_INVALID_TOKEN', 'Invalid token');
  }

  const { accessSecret } = getJwtSecrets();

  try {
    return validateDecodedPayload(
      jwt.verify(accessToken, accessSecret, { algorithms: JWT_ALGORITHMS })
    );
  } catch (err) {
    if (err instanceof APIError) {
      throw err;
    }

    throw new APIError(401, 'AUTH_INVALID_TOKEN', 'Invalid token', { cause: err });
  }
};

export const register = async ({ name, email, password }) => {
  const normalizedName = normalizeName(name);
  const normalizedEmail = normalizeEmail(email);
  validatePassword(password);

  const passwordHash = await createPasswordHash(password);

  try {
    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
      role: 'attendee'
    });

    return buildAuthResult(user);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new APIError(409, 'AUTH_REGISTRATION_FAILED', 'Unable to register account');
    }

    throw err;
  }
};

export const login = async ({ email, password }) => {
  let normalizedEmail;

  try {
    normalizedEmail = normalizeEmail(email);
    validatePassword(password);
  } catch (_err) {
    throwInvalidCredentials();
  }

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
  const passwordHash = user?.passwordHash || DUMMY_PASSWORD_HASH;
  const isPasswordValid = await bcrypt.compare(password, passwordHash);

  if (!user || !isPasswordValid) {
    throwInvalidCredentials();
  }

  return buildAuthResult(user);
};

export const refresh = async (refreshToken) => {
  const decoded = verifyRefreshToken(refreshToken);
  await ensureRefreshTokenNotBlacklisted(decoded.jti);

  const user = await User.findById(decoded.userId);

  if (!user) {
    throw new APIError(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  }

  return {
    user: toPublicUser(user),
    accessToken: signAccessToken(user)
  };
};

export const logout = async (refreshToken) => {
  let decoded;

  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (err) {
    if (err instanceof APIError && err.statusCode === 401) {
      return;
    }

    throw err;
  }

  const remainingSeconds = Math.max(decoded.exp - Math.floor(Date.now() / 1000), 0);

  if (remainingSeconds <= 0) {
    return;
  }

  try {
    await redis.set(blacklistKey(decoded.jti), '1', 'EX', remainingSeconds);
  } catch (err) {
    throw new APIError(503, 'AUTH_BLACKLIST_UNAVAILABLE', 'Unable to revoke session', {
      cause: err
    });
  }
};

export const updateUserRole = async ({ userId, role }) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw new APIError(400, 'AUTH_INVALID_USER_ID', 'Invalid user id');
  }

  const normalizedRole = normalizeRole(role);
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { role: normalizedRole } },
    { new: true, runValidators: true }
  );

  if (!user) {
    throw new APIError(404, 'AUTH_USER_NOT_FOUND', 'User not found');
  }

  return toPublicUser(user);
};

export const seedAdminUser = async () => {
  const existingAdmin = await User.exists({ role: 'admin' });

  if (existingAdmin) {
    return { created: false };
  }

  const email = normalizeEmail(requireEnv('ADMIN_EMAIL'));
  const password = requireEnv('ADMIN_PASSWORD');
  const name = process.env.ADMIN_NAME ? normalizeName(process.env.ADMIN_NAME) : 'Eventiq Admin';
  validatePassword(password);

  const existingSeedUser = await User.exists({ email });

  if (existingSeedUser) {
    throw new Error('ADMIN_EMAIL already belongs to a non-admin user');
  }

  await User.create({
    name,
    email,
    passwordHash: await createPasswordHash(password),
    role: 'admin'
  });

  logger.info({ module: 'auth' }, 'Seed admin user created');
  return { created: true };
};

export const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'strict' : 'lax',
  path: '/auth',
  maxAge: REFRESH_TOKEN_SECONDS * 1000
});

export const getClearRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'strict' : 'lax',
  path: '/auth'
});

export const authService = {
  assertAuthConfig,
  getClearRefreshTokenCookieOptions,
  getRefreshTokenCookieOptions,
  login,
  logout,
  refresh,
  register,
  seedAdminUser,
  updateUserRole,
  verifyAccessToken
};
