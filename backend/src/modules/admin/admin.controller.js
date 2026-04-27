import {
  changeUserRole,
  deleteUser,
  getPlatformStats,
  listUsers
} from './admin.service.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const listAllUsers = asyncHandler(async (req, res) => {
  const result = await listUsers({
    page: req.query?.page,
    limit: req.query?.limit
  });

  return res.status(200).json({
    success: true,
    data: result
  });
});

export const updateRole = asyncHandler(async (req, res) => {
  const user = await changeUserRole({
    userId: req.params.id,
    role: req.body?.role,
    currentUser: req.user
  });

  return res.status(200).json({
    success: true,
    data: { user }
  });
});

export const removeUser = asyncHandler(async (req, res) => {
  const user = await deleteUser({
    targetUserId: req.params.id,
    currentUser: req.user
  });

  return res.status(200).json({
    success: true,
    data: { user }
  });
});

export const getStats = asyncHandler(async (_req, res) => {
  const stats = await getPlatformStats();

  return res.status(200).json({
    success: true,
    data: { stats }
  });
});

export const adminController = {
  getStats,
  listAllUsers,
  removeUser,
  updateRole
};
