import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { eventsController } from './events.controller.js';
import { MAX_COVER_IMAGE_BYTES } from './events.service.js';

const router = Router();
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_COVER_IMAGE_BYTES
  }
});

router.post('/', authenticate, authorize('organizer'), eventsController.createEventHandler);
router.get(
  '/organizer/mine',
  authenticate,
  authorize('organizer'),
  eventsController.listOrganizerEventsHandler
);
router.post(
  '/cover-upload',
  authenticate,
  authorize('organizer', 'admin'),
  coverUpload.single('coverImage'),
  eventsController.uploadCoverImageHandler
);
router.get('/', eventsController.listEventsHandler);
router.get('/:id', eventsController.getEventHandler);
router.patch(
  '/:id',
  authenticate,
  authorize('organizer', 'admin'),
  eventsController.updateEventHandler
);
router.delete('/:id', authenticate, authorize('admin'), eventsController.deleteEventHandler);
router.post(
  '/:id/cancel',
  authenticate,
  authorize('organizer', 'admin'),
  eventsController.cancelEventHandler
);
router.get(
  '/:id/bookings',
  authenticate,
  authorize('organizer', 'admin'),
  eventsController.listEventBookingsHandler
);

export default router;
