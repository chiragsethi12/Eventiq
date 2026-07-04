import { ZodError } from 'zod';

const formatZodErrors = (zodError) =>
  zodError.errors.map((issue) => ({
    field: issue.path.join('.') || '_root',
    message: issue.message
  }));

export const validateBody = (schema) => (req, _res, next) => {
  try {
    req.body = schema.parse(req.body || {});
    next();
  } catch (err) {
    if (err instanceof ZodError || err.name === 'ZodError') {
      return _res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: formatZodErrors(err),
        correlationId: req.correlationId
      });
    }

    next(err);
  }
};

export const validateQuery = (schema) => (req, _res, next) => {
  try {
    req.query = schema.parse(req.query || {});
    next();
  } catch (err) {
    if (err instanceof ZodError || err.name === 'ZodError') {
      return _res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: formatZodErrors(err),
        correlationId: req.correlationId
      });
    }

    next(err);
  }
};
