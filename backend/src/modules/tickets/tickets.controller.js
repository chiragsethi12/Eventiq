import { getTicketByBookingId, validateTicket } from './qr.service.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const getTicketByBookingIdHandler = asyncHandler(async (req, res) => {
  const ticket = await getTicketByBookingId({
    bookingId: req.params.bookingId,
    user: req.user
  });

  return res.status(200).json({
    success: true,
    data: { ticket }
  });
});

export const validateTicketHandler = asyncHandler(async (req, res) => {
  const result = await validateTicket({
    payload: req.body || {},
    user: req.user
  });

  return res.status(200).json({
    success: true,
    data: result
  });
});

export const ticketsController = {
  getTicketByBookingIdHandler,
  validateTicketHandler
};
