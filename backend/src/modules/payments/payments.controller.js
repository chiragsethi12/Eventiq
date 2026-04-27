import { createOrder } from './payments.service.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const createOrderHandler = asyncHandler(async (req, res) => {
  const result = await createOrder({
    user: req.user,
    payload: req.body || {}
  });

  return res.status(200).json({
    success: true,
    data: result
  });
});

export const paymentsController = {
  createOrderHandler
};
