import { randomUUID } from 'node:crypto';

export const requestId = (req, res, next) => {
  const incomingRequestId = req.get('X-Request-ID');
  const id =
    typeof incomingRequestId === 'string' && incomingRequestId.trim().length > 0
      ? incomingRequestId.trim().slice(0, 128)
      : randomUUID();

  req.correlationId = id;
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
};
