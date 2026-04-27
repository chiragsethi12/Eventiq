import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { formatSeatList, formatTicketReference, getBookingStatusMeta } from '../utils/bookingPresentation';
import { formatCurrency } from '../utils/formatCurrency';
import { formatDate } from '../utils/formatDate';

const PENDING_BOOKING_STORAGE_KEY = 'eventiq:pendingBookingId';
const BOOKING_STATUS_POLL_INTERVAL_MS = 2000;
const BOOKING_STATUS_POLL_TIMEOUT_MS = 30000;

function ConfirmationStatusIcon({ status }) {
  const theme =
    status === 'confirmed'
      ? {
          containerClass: 'bg-emerald-400/15',
          ringClass: 'border-emerald-300/25',
          iconClass:
            'border-emerald-300/25 bg-emerald-500/15 text-emerald-100 shadow-[0_24px_80px_rgba(16,185,129,0.2)]',
          icon: '✓'
        }
      : status === 'failed'
        ? {
            containerClass: 'bg-rose-400/15',
            ringClass: 'border-rose-300/25',
            iconClass:
              'border-rose-300/25 bg-rose-500/15 text-rose-100 shadow-[0_24px_80px_rgba(244,63,94,0.2)]',
            icon: '!'
          }
        : {
            containerClass: 'bg-amber-400/15',
            ringClass: 'border-amber-300/25',
            iconClass:
              'border-amber-300/25 bg-amber-500/15 text-amber-100 shadow-[0_24px_80px_rgba(245,158,11,0.2)]',
            icon: '…'
          };

  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <div className={`absolute inset-0 rounded-full blur-xl ${theme.containerClass}`} />
      <div className={`absolute inset-2 rounded-full border ${theme.ringClass} ${status === 'confirmed' ? 'animate-ping' : ''}`} />
      <div
        className={`relative flex h-24 w-24 items-center justify-center rounded-full border text-5xl ${theme.iconClass}`}
      >
        {theme.icon}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.28)] backdrop-blur-xl">
      <div className="h-5 w-40 animate-pulse rounded-full bg-white/[0.08]" />
      <div className="mt-5 h-12 w-2/3 animate-pulse rounded-full bg-white/[0.08]" />
      <div className="mt-4 h-5 w-full animate-pulse rounded-full bg-white/[0.06]" />
      <div className="mt-2 h-5 w-4/5 animate-pulse rounded-full bg-white/[0.06]" />
    </div>
  );
}

export default function BookingConfirmation() {
  const { bookingId: routeBookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPollingStatus, setIsPollingStatus] = useState(false);
  const bookingId = useMemo(() => {
    if (routeBookingId) {
      return routeBookingId;
    }

    if (typeof window === 'undefined') {
      return '';
    }

    return window.sessionStorage.getItem(PENDING_BOOKING_STORAGE_KEY) || '';
  }, [routeBookingId]);

  useEffect(() => {
    if (!bookingId) {
      setBooking(null);
      setError('We could not find a recent booking to confirm.');
      setIsLoading(false);
      return undefined;
    }

    let isMounted = true;
    let pollIntervalId;
    let pollTimeoutId;

    const clearPolling = () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
      }

      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
      }
    };

    const persistPendingBooking = (nextBooking) => {
      if (typeof window === 'undefined' || !nextBooking?.id) {
        return;
      }

      if (nextBooking.paymentStatus === 'confirmed' || nextBooking.paymentStatus === 'failed') {
        window.sessionStorage.removeItem(PENDING_BOOKING_STORAGE_KEY);
        return;
      }

      window.sessionStorage.setItem(PENDING_BOOKING_STORAGE_KEY, nextBooking.id);
    };

    const loadBooking = async () => {
      try {
        const { data } = await api.get(`/booking/${bookingId}`);
        const nextBooking = data?.data?.booking || null;

        if (isMounted) {
          setBooking(nextBooking);
          setError('');
          persistPendingBooking(nextBooking);

          const shouldKeepPolling =
            nextBooking &&
            nextBooking.paymentStatus !== 'confirmed' &&
            nextBooking.paymentStatus !== 'failed';

          setIsPollingStatus(Boolean(shouldKeepPolling));

          if (!shouldKeepPolling) {
            clearPolling();
          }
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'We could not load this confirmation.');
          setIsPollingStatus(false);
        }

        clearPolling();
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    pollIntervalId = setInterval(loadBooking, BOOKING_STATUS_POLL_INTERVAL_MS);
    pollTimeoutId = setTimeout(() => {
      if (!isMounted) {
        return;
      }

      clearPolling();
      setIsPollingStatus(false);
    }, BOOKING_STATUS_POLL_TIMEOUT_MS);
    loadBooking();

    return () => {
      isMounted = false;
      clearPolling();
    };
  }, [bookingId]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (!booking) {
    return (
      <div className="rounded-[32px] border border-rose-400/20 bg-rose-500/10 p-8 text-rose-100">
        <p className="text-xl font-semibold text-white">Confirmation unavailable</p>
        <p className="mt-3 text-sm leading-6">{error || 'Booking details could not be loaded.'}</p>
      </div>
    );
  }

  const statusMeta = getBookingStatusMeta(booking.paymentStatus);
  const isConfirmed = booking.paymentStatus === 'confirmed';
  const isFailed = booking.paymentStatus === 'failed';
  const eyebrow = isConfirmed
    ? 'Booking confirmed'
    : isFailed
      ? 'Payment failed'
      : 'Awaiting confirmation';
  const title = isConfirmed
    ? 'Your seats are secured.'
    : isFailed
      ? 'This booking was not confirmed.'
      : 'Finalizing your booking.';
  const description = isConfirmed
    ? 'Eventiq received the live confirmation from the server. Your ticket is ready to open and the QR code can be viewed from any signed-in device.'
    : isFailed
      ? 'The payment did not complete successfully. You can head back to the event and try again while seats are still available.'
      : 'Eventiq is waiting for the payment webhook to finish confirming your seats. This page refreshes automatically for a short time.';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-8 shadow-[0_28px_90px_rgba(2,6,23,0.36)] backdrop-blur-xl sm:p-10">
        <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <ConfirmationStatusIcon status={booking.paymentStatus} />
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.34em] text-emerald-200">{eyebrow}</p>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white">{title}</h1>
              <p className="max-w-2xl text-base leading-7 text-slate-200">{description}</p>
              {isPollingStatus ? (
                <p className="text-sm font-medium text-amber-100">
                  Waiting for the secure payment webhook to confirm your seats.
                </p>
              ) : null}
            </div>
          </div>

          <span
            className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.24em] ${statusMeta.className}`}
          >
            {statusMeta.label}
          </span>
        </div>
      </section>

      <section className="grid gap-5 rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.28)] backdrop-blur-xl sm:grid-cols-2 sm:p-8">
        <article className="rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Event</p>
          <p className="mt-3 text-2xl font-semibold text-white">{booking.event?.title || 'Eventiq event'}</p>
          <p className="mt-2 text-sm text-slate-300">
            {formatDate(booking.event?.date, {
              dateStyle: 'full',
              timeStyle: 'short'
            })}
          </p>
        </article>

        <article className="rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Seats</p>
          <p className="mt-3 text-2xl font-semibold text-white">{formatSeatList(booking.seats)}</p>
          <p className="mt-2 text-sm text-slate-300">
            {booking.quantity} ticket{booking.quantity === 1 ? '' : 's'} in this booking
          </p>
        </article>

        <article className="rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Ticket reference</p>
          <p className="mt-3 text-2xl font-semibold text-white">
            {formatTicketReference(booking.ticketReference)}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Keep this handy if you ever need support at the venue.
          </p>
        </article>

        <article className="rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Amount paid</p>
          <p className="mt-3 text-2xl font-semibold text-white">
            {booking.totalAmount ? formatCurrency(booking.totalAmount) : 'Pending'}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Confirmation came through the server-side payment webhook.
          </p>
        </article>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        {isConfirmed ? (
          <Link className="button-primary justify-center sm:flex-1" to={`/tickets/${booking.id}`}>
            View Ticket
          </Link>
        ) : null}
        <Link className="button-secondary justify-center sm:flex-1" to="/">
          {isFailed ? 'Back to events' : 'Browse More Events'}
        </Link>
      </div>
    </div>
  );
}
