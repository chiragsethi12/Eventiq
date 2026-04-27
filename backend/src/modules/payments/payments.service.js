import { APIError } from '../../utils/apiError.js';

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const getAcquireMockBaseUrl = () => {
  const baseUrl = process.env.ACQUIREMOCK_URL?.trim();

  if (!baseUrl) {
    throw new Error('ACQUIREMOCK_URL is required');
  }

  return trimTrailingSlash(baseUrl);
};

const getAcquireMockWebhookUrl = () => {
  const webhookUrl = process.env.ACQUIREMOCK_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    throw new Error('ACQUIREMOCK_WEBHOOK_URL is required');
  }

  return webhookUrl;
};

const getAcquireMockRedirectUrl = () => {
  const clientUrl = process.env.CLIENT_URL?.trim();

  if (!clientUrl) {
    throw new Error('CLIENT_URL is required');
  }

  return `${trimTrailingSlash(clientUrl)}/booking/confirmation`;
};

const getPaymentIdFromInvoiceUrl = (invoiceUrl) => {
  const url = new URL(invoiceUrl);
  const paymentId = url.pathname.split('/').filter(Boolean).at(-1);

  if (!paymentId) {
    throw new Error('AcquireMock invoice URL is missing a payment id');
  }

  return paymentId;
};

const normalizeAcquireMockResponse = (payload) => {
  const invoiceUrl = payload?.pageUrl;

  if (typeof invoiceUrl !== 'string' || invoiceUrl.length === 0) {
    throw new Error('AcquireMock did not return a valid invoice URL');
  }

  return {
    invoiceUrl,
    paymentId: getPaymentIdFromInvoiceUrl(invoiceUrl)
  };
};

export const createAcquireMockInvoice = async ({ amount, bookingId }) => {
  let responseText = '';

  try {
    const response = await fetch(`${getAcquireMockBaseUrl()}/api/create-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount,
        reference: bookingId,
        webhookUrl: getAcquireMockWebhookUrl(),
        redirectUrl: getAcquireMockRedirectUrl()
      })
    });

    responseText = await response.text();

    let responseBody = {};

    if (responseText) {
      try {
        responseBody = JSON.parse(responseText);
      } catch (_parseError) {
        responseBody = {};
      }
    }

    if (!response.ok) {
      throw new APIError(
        503,
        'BOOKING_PAYMENT_PROVIDER_UNAVAILABLE',
        'Unable to initiate payment',
        {
          providerStatus: response.status,
          providerBody: responseText || null
        }
      );
    }

    return normalizeAcquireMockResponse(responseBody);
  } catch (err) {
    if (err instanceof APIError) {
      throw err;
    }

    throw new APIError(503, 'BOOKING_PAYMENT_PROVIDER_UNAVAILABLE', 'Unable to initiate payment', {
      cause: err,
      providerBody: responseText || null
    });
  }
};

export const createOrder = async ({ user, payload }) => {
  const { initiateBooking } = await import('../booking/booking.service.js');
  return initiateBooking({ user, payload });
};

export const paymentsService = {
  createAcquireMockInvoice,
  createOrder
};
