import Booking from '../models/Booking.js';
import Event from '../models/Event.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import Seat from '../models/Seat.js';
import { sendMail } from '../config/email.js';
import { reminderQueue } from '../config/queue.js';
import { generateTicketPdf } from '../utils/pdfTicket.js';
import { logger } from '../utils/logger.js';

/**
 * Resolves the tier name from the event's ticketTiers array.
 */
const resolveTierName = (event, tierId) => {
  if (!event?.ticketTiers || !tierId) {
    return 'General';
  }

  const tier = event.ticketTiers.find(
    (t) => t._id.toString() === tierId.toString()
  );

  return tier?.name || 'General';
};

/**
 * Resolves seat numbers from the booking's seat references.
 */
const resolveSeatNumbers = async (booking) => {
  if (!booking.seats || booking.seats.length === 0) {
    return [];
  }

  const seatIds = booking.seats.map((s) =>
    typeof s === 'object' && s._id ? s._id : s
  );

  const seats = await Seat.find({ _id: { $in: seatIds } })
    .select('seatNumber')
    .lean();

  return seats.map((s) => s.seatNumber).filter(Boolean);
};

/**
 * Builds the confirmation email HTML body.
 */
const buildConfirmationHtml = ({ eventName, eventDate, venueName, attendeeName, seatNumbers, tierName }) => {
  const formattedDate = eventDate
    ? new Date(eventDate).toLocaleString('en-IN', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata'
      })
    : 'Date TBD';

  const seatsDisplay = seatNumbers.length > 0 ? seatNumbers.join(', ') : 'General Admission';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #7c3aed, #2563eb); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">EVENTIQ</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 13px;">Booking Confirmation</p>
      </div>
      <div style="background: #f8fafc; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #1e293b; font-size: 16px; margin: 0 0 6px;">Hi ${attendeeName || 'there'},</p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Your booking is confirmed! Your PDF ticket is attached to this email.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Event</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 14px; font-weight: 600;">${eventName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Date</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 14px;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Venue</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 14px;">${venueName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Category</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 14px;">${tierName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Seats</td>
            <td style="padding: 10px 0; color: #1e293b; font-size: 14px; font-weight: 600;">${seatsDisplay}</td>
          </tr>
        </table>
        <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
          Present the attached PDF ticket at the venue entrance. You can also view your ticket in the Eventiq app.
        </p>
      </div>
    </div>
  `;
};

/**
 * Enqueues a reminder job for 24h before event start.
 */
const enqueueReminder = async (bookingId, eventDate) => {
  if (!eventDate) {
    return;
  }

  const eventTime = new Date(eventDate).getTime();
  const reminderTime = eventTime - 24 * 60 * 60 * 1000; // 24h before
  const delay = reminderTime - Date.now();

  if (delay <= 0) {
    logger.info(
      { module: 'emailWorker', bookingId },
      'Event starts within 24h — skipping reminder'
    );
    return;
  }

  await reminderQueue.add(
    'event-reminder',
    { bookingId },
    { delay, jobId: `reminder-${bookingId}` }
  );

  logger.info(
    { module: 'emailWorker', bookingId, delayMs: delay },
    'Enqueued pre-event reminder'
  );
};

/**
 * Email worker processor function.
 * Job payload: { bookingId, userId, eventId, userEmail, userName }
 */
export const processEmailJob = async (job) => {
  const { bookingId, userId, eventId, userEmail, userName } = job.data;

  logger.info(
    { module: 'emailWorker', jobId: job.id, bookingId },
    'Processing email job'
  );

  // 1. Fetch all required data
  const [booking, user, event, ticket] = await Promise.all([
    Booking.findById(bookingId),
    User.findById(userId).lean(),
    Event.findById(eventId).lean(),
    Ticket.findOne({ bookingId }).lean()
  ]);

  if (!booking) {
    throw new Error(`Booking ${bookingId} not found`);
  }

  if (!event) {
    throw new Error(`Event ${eventId} not found`);
  }

  // Use the snapshotted email from job data (per edge case spec)
  const recipientEmail = userEmail || user?.email;

  if (!recipientEmail) {
    throw new Error(`No email address for user ${userId}`);
  }

  const recipientName = userName || user?.name || 'Attendee';

  // 2. Resolve tier and seats
  const tierName = resolveTierName(event, booking.tierId);
  const seatNumbers = await resolveSeatNumbers(booking);

  // 3. Generate PDF
  let pdfBuffer;

  try {
    pdfBuffer = await generateTicketPdf({
      eventName: event.title,
      eventDate: event.date,
      venueName: event.venue?.name,
      venueCity: event.venue?.city,
      venueAddress: event.venue?.address,
      tierName,
      seatNumbers,
      bookingId: bookingId.toString(),
      attendeeName: recipientName,
      qrPayload: ticket?.qrPayload || null
    });
  } catch (pdfErr) {
    // PDF generation failed — mark error but don't block confirmation
    booking.emailError = `PDF generation failed: ${pdfErr.message}`;
    await booking.save();
    throw pdfErr; // Let BullMQ retry
  }

  // 4. Send email
  await sendMail({
    to: recipientEmail,
    subject: `Your Eventiq ticket for ${event.title}`,
    html: buildConfirmationHtml({
      eventName: event.title,
      eventDate: event.date,
      venueName: event.venue?.name || 'Venue',
      attendeeName: recipientName,
      seatNumbers,
      tierName
    }),
    attachments: [
      {
        filename: `ticket-${bookingId}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  });

  // 5. Mark success
  booking.emailSentAt = new Date();
  booking.emailError = undefined;
  await booking.save();

  logger.info(
    { module: 'emailWorker', jobId: job.id, bookingId, to: recipientEmail },
    'Confirmation email sent'
  );

  // 6. Enqueue 24h reminder
  await enqueueReminder(bookingId.toString(), event.date);

  return { success: true, bookingId, to: recipientEmail };
};
