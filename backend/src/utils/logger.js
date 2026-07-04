import winston from 'winston';

const { combine, colorize, errors, json, printf, splat, timestamp } = winston.format;

const productionFields = winston.format((info) => {
  const normalized = {
    timestamp: info.timestamp,
    level: info.level,
    correlationId: info.correlationId,
    requestId: info.requestId,
    userId: info.userId,
    module: info.module,
    message: info.message
  };

  if (info.stack) {
    normalized.stack = info.stack;
  }

  if (info.err instanceof Error) {
    normalized.error = {
      name: info.err.name,
      message: info.err.message,
      stack: info.err.stack
    };
  }

  return normalized;
});

const developmentFormat = combine(
  colorize(),
  timestamp(),
  errors({ stack: true }),
  splat(),
  printf((info) => {
    const context = [
      info.module && `module=${info.module}`,
      info.correlationId && `correlationId=${info.correlationId}`,
      info.requestId && !info.correlationId && `requestId=${info.requestId}`,
      info.userId && `userId=${info.userId}`
    ].filter(Boolean);

    const suffix = context.length > 0 ? ` ${context.join(' ')}` : '';
    const stack = info.stack ? `\n${info.stack}` : '';

    return `${info.timestamp} ${info.level}: ${info.message}${suffix}${stack}`;
  })
);

const productionFormat = combine(
  timestamp(),
  errors({ stack: true }),
  productionFields(),
  json()
);

const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  transports: [new winston.transports.Console()],
  exitOnError: false
});

const normalizeLogArgs = (first, second) => {
  if (typeof first === 'object' && first !== null && typeof second === 'string') {
    return [second, first];
  }

  return [first, second];
};

export const logger = {
  debug(first, second) {
    baseLogger.debug(...normalizeLogArgs(first, second));
  },
  info(first, second) {
    baseLogger.info(...normalizeLogArgs(first, second));
  },
  warn(first, second) {
    baseLogger.warn(...normalizeLogArgs(first, second));
  },
  error(first, second) {
    baseLogger.error(...normalizeLogArgs(first, second));
  },
  child(defaultMeta) {
    return baseLogger.child(defaultMeta);
  }
};
