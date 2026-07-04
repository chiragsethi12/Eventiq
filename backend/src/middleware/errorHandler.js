import mongoose from 'mongoose';
import { APIError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let errors = undefined;

  if (err instanceof APIError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid request data';
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid resource identifier';
  } else if (err?.name === 'MulterError') {
    statusCode = 400;
    code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_FILE_UPLOAD';
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Uploaded file exceeds the 5MB limit'
        : 'Invalid file upload';
  } else if (err?.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'Resource already exists';
  } else if (process.env.NODE_ENV !== 'production' && err?.message) {
    message = err.message;
  }

  logger.error({
    err,
    correlationId: req.correlationId,
    requestId: req.requestId,
    userId: req.user?._id?.toString?.() || req.user?.id,
    module: 'errorHandler'
  }, 'Request failed');

  const responseBody = {
    success: false,
    code,
    message,
    correlationId: req.correlationId
  };

  if (errors) {
    responseBody.errors = errors;
  }

  return res.status(statusCode).json(responseBody);
};
