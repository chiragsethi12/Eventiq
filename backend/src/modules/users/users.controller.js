import { getCurrentUserProfile, updateCurrentUserProfile } from './users.service.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const getMe = asyncHandler(async (req, res) => {
  const user = await getCurrentUserProfile(req.user);

  return res.status(200).json({
    success: true,
    data: { user }
  });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await updateCurrentUserProfile({
    user: req.user,
    payload: req.body || {}
  });

  return res.status(200).json({
    success: true,
    data: { user }
  });
});

export const usersController = {
  getMe,
  updateMe
};
