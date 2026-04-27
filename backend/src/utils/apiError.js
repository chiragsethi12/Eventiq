export class APIError extends Error {
  constructor(statusCodeOrOptions, code, message, options = {}) {
    const normalized =
      typeof statusCodeOrOptions === 'object' && statusCodeOrOptions !== null
        ? statusCodeOrOptions
        : { statusCode: statusCodeOrOptions, code, message, ...options };

    const statusCode = Number(normalized.statusCode);

    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
      throw new TypeError('APIError statusCode must be an HTTP error status code');
    }

    if (typeof normalized.code !== 'string' || normalized.code.trim().length === 0) {
      throw new TypeError('APIError code must be a non-empty string');
    }

    if (typeof normalized.message !== 'string' || normalized.message.trim().length === 0) {
      throw new TypeError('APIError message must be a non-empty string');
    }

    super(normalized.message, { cause: normalized.cause });
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = normalized.code;
    Error.captureStackTrace?.(this, APIError);
  }
}

export const ApiError = APIError;
