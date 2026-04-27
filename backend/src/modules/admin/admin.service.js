import mongoose from 'mongoose';
import { updateUserRole } from '../auth/auth.service.js';
import Booking from '../../models/Booking.js';
import Event from '../../models/Event.js';
import User from '../../models/User.js';
import { APIError } from '../../utils/apiError.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const toAdminUserSummary = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt
});

const requireObjectId = (value, code, message) => {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    throw new APIError(400, code, message);
  }

  return new mongoose.Types.ObjectId(value);
};

const normalizePage = (value) => {
  if (value === undefined) {
    return 1;
  }

  if (typeof value !== 'string') {
    throw new APIError(400, 'ADMIN_INVALID_PAGE', 'page must be a number');
  }

  const page = Number(value);

  if (!Number.isInteger(page) || page < 1) {
    throw new APIError(400, 'ADMIN_INVALID_PAGE', 'page must be a positive integer');
  }

  return page;
};

const normalizeLimit = (value) => {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  if (typeof value !== 'string') {
    throw new APIError(400, 'ADMIN_INVALID_LIMIT', 'limit must be a number');
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new APIError(400, 'ADMIN_INVALID_LIMIT', `limit must be between 1 and ${MAX_LIMIT}`);
  }

  return limit;
};

export const listUsers = async ({ page, limit }) => {
  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const [users, total] = await Promise.all([
    User.find({})
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(normalizedLimit)
      .select('name email role createdAt')
      .lean(),
    User.countDocuments({})
  ]);

  return {
    users: users.map(toAdminUserSummary),
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / normalizedLimit)
    }
  };
};

export const changeUserRole = async ({ userId, role, currentUser }) => {
  const normalizedUserId = requireObjectId(userId, 'ADMIN_INVALID_USER_ID', 'Invalid user id');

  if (!currentUser?.id) {
    throw new APIError(401, 'AUTH_UNAUTHENTICATED', 'Authentication required');
  }

  if (currentUser.id === normalizedUserId.toString() && role !== 'admin') {
    throw new APIError(400, 'ADMIN_CANNOT_DEMOTE_SELF', 'Admins cannot demote themselves');
  }

  return updateUserRole({
    userId: normalizedUserId.toString(),
    role
  });
};

export const deleteUser = async ({ targetUserId, currentUser }) => {
  const normalizedTargetUserId = requireObjectId(
    targetUserId,
    'ADMIN_INVALID_USER_ID',
    'Invalid user id'
  );

  if (!currentUser?.id) {
    throw new APIError(401, 'AUTH_UNAUTHENTICATED', 'Authentication required');
  }

  if (currentUser.id === normalizedTargetUserId.toString()) {
    throw new APIError(400, 'ADMIN_CANNOT_DELETE_SELF', 'Cannot delete own account');
  }

  const deletedUser = await User.findByIdAndDelete(normalizedTargetUserId).select(
    'name email role createdAt'
  );

  if (!deletedUser) {
    throw new APIError(404, 'ADMIN_USER_NOT_FOUND', 'User not found');
  }

  return toAdminUserSummary(deletedUser);
};

export const getPlatformStats = async () => {
  const [totalUsers, totalEvents, bookingStats, recentBookings] = await Promise.all([
    User.countDocuments({}),
    Event.countDocuments({}),
    Booking.aggregate([
      { $match: { paymentStatus: 'confirmed' } },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' }
        }
      }
    ]),
    Booking.find({ paymentStatus: 'confirmed' })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'name')
      .populate('eventId', 'title')
      .lean()
  ]);

  const aggregate = bookingStats[0] || { totalBookings: 0, totalRevenue: 0 };

  return {
    totalUsers,
    totalEvents,
    totalBookings: aggregate.totalBookings,
    totalRevenue: aggregate.totalRevenue,
    recentBookings: recentBookings.map((booking) => ({
      id: booking._id.toString(),
      totalAmount: booking.totalAmount,
      createdAt: booking.createdAt,
      userName: booking.userId?.name || null,
      eventTitle: booking.eventId?.title || null
    }))
  };
};

export const adminService = {
  changeUserRole,
  deleteUser,
  getPlatformStats,
  listUsers
};
