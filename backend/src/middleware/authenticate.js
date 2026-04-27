import { APIError } from '../utils/apiError.js';
import { verifyAccessToken } from '../modules/auth/auth.service.js';

const extractBearerToken = (authorizationHeader) => {
  if (typeof authorizationHeader !== 'string') {
    throw new APIError(401, 'AUTH_MISSING_TOKEN', 'Authentication required');
  }

  const match = authorizationHeader.match(/^Bearer ([A-Za-z0-9._-]+)$/);

  if (!match) {
    throw new APIError(401, 'AUTH_INVALID_TOKEN', 'Invalid token');
  }

  return match[1];
};

export const authenticate = (req, _res, next) => {
  try {
    const decoded = verifyAccessToken(extractBearerToken(req.get('authorization')));

    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      role: decoded.role,
      email: decoded.email
    };

    next();
  } catch (err) {
    next(err);
  }
};
