import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

/**
 * Generates a branded PDF ticket as a Buffer.
 *
 * @param {Object} options
 * @param {string} options.eventName
 * @param {string} options.eventDate    — ISO string or Date
 * @param {string} options.venueName
 * @param {string} options.venueCity
 * @param {string} options.venueAddress
 * @param {string} options.tierName     — e.g. "VIP", "General"
 * @param {string[]} options.seatNumbers
 * @param {string} options.bookingId
 * @param {string} options.attendeeName
 * @param {string} options.qrPayload   — the payload string to encode as QR
 * @returns {Promise<Buffer>}
 */
export const generateTicketPdf = async ({
  eventName,
  eventDate,
  venueName,
  venueCity,
  venueAddress,
  tierName,
  seatNumbers,
  bookingId,
  attendeeName,
  qrPayload
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        compress: process.env.NODE_ENV !== 'test'
      });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ─── Header bar ───
      const headerGradientStart = '#7c3aed';
      const headerGradientEnd = '#2563eb';
      const headerHeight = 80;

      const grad = doc.linearGradient(0, 0, doc.page.width, 0);
      grad.stop(0, headerGradientStart);
      grad.stop(1, headerGradientEnd);

      doc.save();
      doc.rect(0, 0, doc.page.width, headerHeight).fill(grad);

      doc.fontSize(28)
        .fillColor('#ffffff')
        .text('EVENTIQ', 50, 26, { width: doc.page.width - 100 });

      doc.fontSize(10)
        .fillColor('rgba(255,255,255,0.8)')
        .text('E-TICKET', doc.page.width - 150, 34, { width: 100, align: 'right' });
      doc.restore();

      // ─── Event details ───
      const yStart = headerHeight + 40;
      doc.fillColor('#1e293b');

      doc.fontSize(22).text(eventName || 'Event', 50, yStart);

      const formattedDate = eventDate
        ? new Date(eventDate).toLocaleString('en-IN', {
            dateStyle: 'full',
            timeStyle: 'short',
            timeZone: 'Asia/Kolkata'
          })
        : 'Date TBD';
      doc.fontSize(11).fillColor('#475569').text(formattedDate, 50, yStart + 32);

      // ─── Venue ───
      const yVenue = yStart + 60;
      doc.fontSize(9)
        .fillColor('#94a3b8')
        .text('VENUE', 50, yVenue);
      doc.fontSize(12)
        .fillColor('#1e293b')
        .text(`${venueName || 'Venue'}`, 50, yVenue + 14);
      doc.fontSize(10)
        .fillColor('#475569')
        .text(`${venueAddress || ''}${venueCity ? `, ${venueCity}` : ''}`, 50, yVenue + 30);

      // ─── Ticket info grid ───
      const yGrid = yVenue + 60;

      // Category
      doc.fontSize(9).fillColor('#94a3b8').text('CATEGORY', 50, yGrid);
      doc.fontSize(13).fillColor('#1e293b').text(tierName || 'General', 50, yGrid + 14);

      // Seats
      doc.fontSize(9).fillColor('#94a3b8').text('SEATS', 220, yGrid);
      doc.fontSize(13)
        .fillColor('#1e293b')
        .text(
          Array.isArray(seatNumbers) && seatNumbers.length > 0
            ? seatNumbers.join(', ')
            : 'General Admission',
          220,
          yGrid + 14,
          { width: 200 }
        );

      // Attendee
      doc.fontSize(9).fillColor('#94a3b8').text('ATTENDEE', 50, yGrid + 50);
      doc.fontSize(13).fillColor('#1e293b').text(attendeeName || '—', 50, yGrid + 64);

      // Booking Ref
      doc.fontSize(9).fillColor('#94a3b8').text('BOOKING REF', 220, yGrid + 50);
      doc.fontSize(10)
        .fillColor('#1e293b')
        .text(bookingId || '—', 220, yGrid + 64, { width: 250 });

      // ─── Divider ───
      const yDivider = yGrid + 110;
      doc.moveTo(50, yDivider)
        .lineTo(doc.page.width - 50, yDivider)
        .dash(4, { space: 4 })
        .strokeColor('#cbd5e1')
        .stroke()
        .undash();

      // ─── QR Code ───
      const yQr = yDivider + 20;
      let qrEmbedded = false;

      if (qrPayload) {
        try {
          const qrBuffer = await QRCode.toBuffer(qrPayload, {
            type: 'png',
            width: 180,
            margin: 1,
            errorCorrectionLevel: 'M'
          });

          doc.image(qrBuffer, (doc.page.width - 180) / 2, yQr, {
            width: 180,
            height: 180
          });
          qrEmbedded = true;
        } catch (_qrErr) {
          // Fallback: render QR payload as text
        }
      }

      if (!qrEmbedded && qrPayload) {
        doc.fontSize(8)
          .fillColor('#64748b')
          .text('QR Data (present to scanner):', 50, yQr);
        doc.fontSize(7)
          .fillColor('#334155')
          .text(qrPayload, 50, yQr + 14, { width: doc.page.width - 100 });
      }

      // ─── Footer ───
      const yFooter = qrEmbedded ? yQr + 200 : yQr + 50;
      doc.fontSize(10)
        .fillColor('#94a3b8')
        .text('Present this ticket at entry. This is a valid electronic ticket.', 50, yFooter, {
          width: doc.page.width - 100,
          align: 'center'
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
