import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';

const isTest = process.env.NODE_ENV === 'test';

const createTransport = () => {
  if (isTest) {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host) {
    logger.warn({ module: 'email' }, 'SMTP_HOST not configured — emails will not be sent');
    return nodemailer.createTransport({ jsonTransport: true });
  }

  const transportOptions = {
    host,
    port,
    secure: port === 465
  };

  if (user && pass) {
    transportOptions.auth = { user, pass };
  }

  return nodemailer.createTransport(transportOptions);
};

const transporter = createTransport();

const defaultFrom = process.env.SMTP_FROM || 'Eventiq <noreply@eventiq.app>';

export const sendMail = async ({ to, subject, html, attachments = [] }) => {
  const mailOptions = {
    from: defaultFrom,
    to,
    subject,
    html,
    attachments
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info({ module: 'email', to, subject, messageId: info.messageId }, 'Email sent');
    return info;
  } catch (err) {
    logger.error({ err, module: 'email', to, subject }, 'Email send failed');
    throw err;
  }
};
