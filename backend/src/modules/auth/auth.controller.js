import {
  getClearRefreshTokenCookieOptions,
  getRefreshTokenCookieOptions,
  REFRESH_TOKEN_COOKIE_NAME,
  login,
  logout,
  refresh,
  register
} from './auth.service.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const parseCookieHeader = (cookieHeader) => {
  if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) {
    return {};
  }

  return cookieHeader.split(';').reduce((cookies, cookiePart) => {
    const separatorIndex = cookiePart.indexOf('=');

    if (separatorIndex === -1) {
      return cookies;
    }

    const name = cookiePart.slice(0, separatorIndex).trim();
    const rawValue = cookiePart.slice(separatorIndex + 1).trim();

    if (!name) {
      return cookies;
    }

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch (_err) {
      cookies[name] = rawValue;
    }

    return cookies;
  }, {});
};

const getRefreshTokenFromRequest = (req) =>
  parseCookieHeader(req.headers.cookie)[REFRESH_TOKEN_COOKIE_NAME];

const setRefreshTokenCookie = (res, authResult) => {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, authResult.refreshToken, getRefreshTokenCookieOptions());
};

const clearRefreshTokenCookie = (res) => {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, getClearRefreshTokenCookieOptions());
};

const sendAuthResponse = (res, statusCode, authResult) => {
  setRefreshTokenCookie(res, authResult);

  return res.status(statusCode).json({
    success: true,
    data: {
      user: authResult.user,
      accessToken: authResult.accessToken
    }
  });
};

export const registerUser = asyncHandler(async (req, res) => {
  const authResult = await register(req.body || {});
  return sendAuthResponse(res, 201, authResult);
});

export const loginUser = asyncHandler(async (req, res) => {
  const authResult = await login(req.body || {});
  return sendAuthResponse(res, 200, authResult);
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const authResult = await refresh(getRefreshTokenFromRequest(req));

  return res.status(200).json({
    success: true,
    data: {
      user: authResult.user,
      accessToken: authResult.accessToken
    }
  });
});

export const logoutUser = asyncHandler(async (req, res) => {
  try {
    await logout(getRefreshTokenFromRequest(req));
  } finally {
    clearRefreshTokenCookie(res);
  }

  return res.status(200).json({
    success: true,
    message: 'Logged out'
  });
});

export const authController = {
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser
};
