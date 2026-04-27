import { randomUUID } from 'node:crypto';

export const requestId = (req, res, next) => {
  const incomingRequestId = req.get('X-Request-ID');
  const requestId =
    typeof incomingRequestId === 'string' && incomingRequestId.trim().length > 0
      ? incomingRequestId.trim().slice(0, 128)
      : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};
