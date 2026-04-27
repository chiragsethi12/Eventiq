import { getBookingById, initiateBooking, listMyBookings } from './booking.service.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const initiateBookingHandler = asyncHandler(async (req, res) => {
  const result = await initiateBooking({
    user: req.user,
    payload: req.body || {}
  });

  return res.status(200).json({
    success: true,
    data: result
  });
});

export const listMyBookingsHandler = asyncHandler(async (req, res) => {
  const bookings = await listMyBookings({
    user: req.user,
    status: req.query?.status
  });

  return res.status(200).json({
    success: true,
    data: { bookings }
  });
});

export const getBookingByIdHandler = asyncHandler(async (req, res) => {
  const booking = await getBookingById({
    bookingId: req.params.id,
    user: req.user
  });

  return res.status(200).json({
    success: true,
    data: { booking }
  });
});

export const bookingController = {
  getBookingByIdHandler,
  initiateBookingHandler,
  listMyBookingsHandler
};
