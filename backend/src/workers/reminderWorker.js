import Booking from '../models/Booking.js';
import Event from '../models/Event.js';
import User from '../models/User.js';
import { sendMail } from '../config/email.js';
import { logger } from '../utils/logger.js';

/**
 * Builds the reminder email HTML body.
 */
const buildReminderHtml = ({ eventName, eventDate, venueName, venueAddress, venueCity, attendeeName }) => {
  const formattedDate = eventDate
    ? new Date(eventDate).toLocaleString('en-IN', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata'
      })
    : 'soon';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #f59e0b, #f97316); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">EVENTIQ</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 13px;">Event Reminder</p>
      </div>
      <div style="background: #fffbeb; padding: 32px; border: 1px solid #fde68a; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #1e293b; font-size: 16px; margin: 0 0 8px;">Hi ${attendeeName || 'there'},</p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Your event <strong>${eventName}</strong> starts tomorrow!
        </p>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="margin: 0 0 8px; color: #1e293b; font-size: 15px; font-weight: 600;">${eventName}</p>
          <p style="margin: 0 0 4px; color: #475569; font-size: 13px;">📅 ${formattedDate}</p>
          <p style="margin: 0; color: #475569; font-size: 13px;">📍 ${venueName}${venueAddress ? `, ${venueAddress}` : ''}${venueCity ? `, ${venueCity}` : ''}</p>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
          Don't forget to bring your ticket! You can view it anytime in the Eventiq app.
        </p>
      </div>
    </div>
  `;
};

/**
 * Reminder worker processor function.
 * Job payload: { bookingId }
 */
export const processReminderJob = async (job) => {
  const { bookingId } = job.data;

  logger.info(
    { module: 'reminderWorker', jobId: job.id, bookingId },
    'Processing reminder job'
  );

  const booking = await Booking.findById(bookingId).lean();

  if (!booking) {
    logger.warn({ module: 'reminderWorker', bookingId }, 'Booking not found — skipping reminder');
    return { skipped: true, reason: 'booking_not_found' };
  }

  if (booking.paymentStatus !== 'confirmed') {
    logger.info({ module: 'reminderWorker', bookingId }, 'Booking not confirmed — skipping reminder');
    return { skipped: true, reason: 'not_confirmed' };
  }

  const [user, event] = await Promise.all([
    User.findById(booking.userId).lean(),
    Event.findById(booking.eventId).lean()
  ]);

  if (!user?.email || !event) {
    logger.warn(
      { module: 'reminderWorker', bookingId, hasUser: !!user, hasEvent: !!event },
      'Missing user or event — skipping reminder'
    );
    return { skipped: true, reason: 'missing_data' };
  }

  await sendMail({
    to: user.email,
    subject: `Reminder: ${event.title} starts tomorrow!`,
    html: buildReminderHtml({
      eventName: event.title,
      eventDate: event.date,
      venueName: event.venue?.name || 'Venue',
      venueAddress: event.venue?.address || '',
      venueCity: event.venue?.city || '',
      attendeeName: user.name
    })
  });

  logger.info(
    { module: 'reminderWorker', jobId: job.id, bookingId, to: user.email },
    'Reminder email sent'
  );

  return { success: true, bookingId, to: user.email };
};
