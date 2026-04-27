import {
  cancelEvent,
  createEvent,
  deleteEvent,
  getEventById,
  listEventBookings,
  listEvents,
  listOrganizerEvents,
  uploadCoverImage,
  updateEvent
} from './events.service.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const createEventHandler = asyncHandler(async (req, res) => {
  const event = await createEvent({
    user: req.user,
    payload: req.body || {}
  });

  return res.status(201).json({
    success: true,
    data: { event }
  });
});

export const listEventsHandler = asyncHandler(async (req, res) => {
  const result = await listEvents(req.query || {});

  return res.status(200).json({
    success: true,
    data: result
  });
});

export const listOrganizerEventsHandler = asyncHandler(async (req, res) => {
  const result = await listOrganizerEvents({
    user: req.user
  });

  return res.status(200).json({
    success: true,
    data: result
  });
});

export const getEventHandler = asyncHandler(async (req, res) => {
  const event = await getEventById(req.params.id);

  return res.status(200).json({
    success: true,
    data: { event }
  });
});

export const updateEventHandler = asyncHandler(async (req, res) => {
  const event = await updateEvent({
    eventId: req.params.id,
    user: req.user,
    payload: req.body || {}
  });

  return res.status(200).json({
    success: true,
    data: { event }
  });
});

export const deleteEventHandler = asyncHandler(async (req, res) => {
  await deleteEvent({
    eventId: req.params.id,
    user: req.user
  });

  return res.status(204).send();
});

export const cancelEventHandler = asyncHandler(async (req, res) => {
  const result = await cancelEvent({
    eventId: req.params.id,
    user: req.user
  });

  return res.status(200).json({
    success: true,
    data: result
  });
});

export const listEventBookingsHandler = asyncHandler(async (req, res) => {
  const bookings = await listEventBookings({
    eventId: req.params.id,
    user: req.user
  });

  return res.status(200).json({
    success: true,
    data: { bookings }
  });
});

export const uploadCoverImageHandler = asyncHandler(async (req, res) => {
  const result = await uploadCoverImage({
    file: req.file
  });

  return res.status(201).json({
    success: true,
    data: result
  });
});

export const eventsController = {
  cancelEventHandler,
  createEventHandler,
  deleteEventHandler,
  getEventHandler,
  listEventBookingsHandler,
  listEventsHandler,
  listOrganizerEventsHandler,
  uploadCoverImageHandler,
  updateEventHandler
};
