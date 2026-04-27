import mongoose from 'mongoose';
import User from '../../models/User.js';
import { APIError } from '../../utils/apiError.js';

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toPublicUserProfile = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const requireAuthenticatedUserId = (user) => {
  if (!user?.id || !mongoose.isValidObjectId(user.id)) {
    throw new APIError(401, 'AUTH_UNAUTHENTICATED', 'Authentication required');
  }

  return new mongoose.Types.ObjectId(user.id);
};

const normalizeName = (name) => {
  if (typeof name !== 'string') {
    throw new APIError(400, 'USER_INVALID_NAME', 'Invalid name');
  }

  const normalized = name.trim().replace(/\s+/g, ' ');

  if (normalized.length < 1 || normalized.length > 120) {
    throw new APIError(400, 'USER_INVALID_NAME', 'Invalid name');
  }

  return normalized;
};

export const getCurrentUserProfile = async (user) => {
  const userId = requireAuthenticatedUserId(user);
  const profile = await User.findById(userId).select('name email role createdAt updatedAt');

  if (!profile) {
    throw new APIError(404, 'USER_NOT_FOUND', 'User not found');
  }

  return toPublicUserProfile(profile);
};

export const updateCurrentUserProfile = async ({ user, payload }) => {
  const userId = requireAuthenticatedUserId(user);

  if (!isPlainObject(payload)) {
    throw new APIError(400, 'USER_INVALID_INPUT', 'Request body must be an object');
  }

  const allowedKeys = ['name'];
  const unexpectedKeys = Object.keys(payload).filter((key) => !allowedKeys.includes(key));

  if (unexpectedKeys.length > 0) {
    throw new APIError(400, 'USER_INVALID_INPUT', 'Only name can be updated');
  }

  if (Object.hasOwn(payload, 'email')) {
    throw new APIError(400, 'USER_EMAIL_CHANGE_NOT_ALLOWED', 'Email changes are not permitted');
  }

  if (!Object.hasOwn(payload, 'name')) {
    throw new APIError(400, 'USER_INVALID_NAME', 'name is required');
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        name: normalizeName(payload.name)
      }
    },
    {
      new: true,
      runValidators: true
    }
  ).select('name email role createdAt updatedAt');

  if (!updatedUser) {
    throw new APIError(404, 'USER_NOT_FOUND', 'User not found');
  }

  return toPublicUserProfile(updatedUser);
};

export const usersService = {
  getCurrentUserProfile,
  updateCurrentUserProfile
};
