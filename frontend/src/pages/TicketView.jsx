import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCodeDisplay from '../components/QRCodeDisplay';
import { api } from '../services/api';
import {
  formatSeatList,
  formatTicketReference,
  getBookingStatusMeta
} from '../utils/bookingPresentation';
import { formatDate } from '../utils/formatDate';

export default function TicketView() {
  const { bookingId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadTicket = async () => {
      try {
        const { data } = await api.get(`/api/v1/tickets/${bookingId}`);

        if (isMounted) {
          setTicket(data?.data?.ticket || null);
          setError('');
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'Unable to load this ticket.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadTicket();

    return () => {
      isMounted = false;
    };
  }, [bookingId]);

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-[32rem] animate-pulse rounded-[32px] border border-white/10 bg-white/[0.04]" />
        <div className="h-[32rem] animate-pulse rounded-[32px] border border-white/10 bg-white/[0.04]" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="rounded-[32px] border border-rose-400/20 bg-rose-500/10 p-8 text-rose-100">
        <p className="text-xl font-semibold text-white">Ticket unavailable</p>
        <p className="mt-3 text-sm leading-6">{error || 'The requested ticket could not be loaded.'}</p>
      </div>
    );
  }

  const statusMeta = getBookingStatusMeta(ticket.status);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.34)] backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.34em] text-cyan-200">Digital ticket</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white">
              {ticket.event?.title || 'Eventiq ticket'}
            </h1>
            <p className="mt-3 text-base leading-7 text-slate-300">
              This is the entry-ready view for your booking. Show the QR code at the gate and keep
              the seat assignment visible while you’re in line.
            </p>
          </div>

          <span
            className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.24em] ${statusMeta.className}`}
          >
            {statusMeta.label}
          </span>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <article className="rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Date</p>
            <p className="mt-3 text-xl font-semibold text-white">
              {formatDate(ticket.event?.date, {
                dateStyle: 'full',
                timeStyle: 'short'
              })}
            </p>
          </article>

          <article className="rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Venue</p>
            <p className="mt-3 text-xl font-semibold text-white">
              {ticket.event?.venue?.name || 'Venue TBA'}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {[ticket.event?.venue?.city, ticket.event?.venue?.address].filter(Boolean).join(', ')}
            </p>
          </article>

          <article className="rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Seat numbers</p>
            <p className="mt-3 text-xl font-semibold text-white">{formatSeatList(ticket.seats)}</p>
          </article>

          <article className="rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Attendee</p>
            <p className="mt-3 text-xl font-semibold text-white">{ticket.attendeeName || 'Attendee'}</p>
            <p className="mt-2 text-sm text-slate-300">
              Reference {formatTicketReference(ticket.ticketReference)}
            </p>
          </article>
        </div>
      </section>

      <aside className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.34)] backdrop-blur-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.34em] text-cyan-200">QR access</p>
        <div className="mt-5">
          <QRCodeDisplay alt={`Ticket QR for ${ticket.event?.title || 'Eventiq'}`} qrImageUrl={ticket.qrImageUrl} />
        </div>

        <button
          className="button-primary mt-6 w-full justify-center"
          onClick={() => {
            if (ticket.qrImageUrl) {
              window.open(ticket.qrImageUrl, '_blank', 'noopener,noreferrer');
            }
          }}
          type="button"
        >
          Download
        </button>

        <p className="mt-4 text-xs leading-6 text-slate-400">
          The venue team validates the signed QR payload from this image. Re-open this page at any
          time from My Tickets if you need it again.
        </p>
      </aside>
    </div>
  );
}
