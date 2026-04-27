import { AUTH_ROLES } from '../modules/auth/auth.service.js';
import { APIError } from '../utils/apiError.js';

const validateAllowedRoles = (roles) => {
  if (roles.length === 0) {
    throw new Error('authorize requires at least one role');
  }

  for (const role of roles) {
    if (!AUTH_ROLES.includes(role)) {
      throw new Error(`Invalid role passed to authorize: ${role}`);
    }
  }
};

export const authorize = (...roles) => {
  validateAllowedRoles(roles);

  return (req, _res, next) => {
    if (!req.user) {
      next(new APIError(401, 'AUTH_UNAUTHENTICATED', 'Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new APIError(403, 'AUTH_FORBIDDEN', 'Forbidden'));
      return;
    }

    next();
  };
};
