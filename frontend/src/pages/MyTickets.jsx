import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import {
  formatSeatList,
  getBookingStatusMeta,
  isPastEvent
} from '../utils/bookingPresentation';
import { formatDate } from '../utils/formatDate';

const tabs = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'all', label: 'All' }
];

function TicketCard({ booking }) {
  const statusMeta = getBookingStatusMeta(booking.paymentStatus);

  return (
    <Link
      className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.04] shadow-[0_24px_80px_rgba(2,6,23,0.28)] backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.05]"
      to={`/tickets/${booking.id}`}
    >
      <div className="grid gap-0 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="relative min-h-[12rem] overflow-hidden border-b border-white/10 md:border-b-0 md:border-r">
          {booking.event?.coverImageUrl ? (
            <img
              alt={booking.event.title || 'Event cover'}
              className="absolute inset-0 h-full w-full object-cover"
              src={booking.event.coverImageUrl}
            />
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(99,102,241,0.8),rgba(6,182,212,0.45),rgba(15,23,42,0.95))]" />
          )}

          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.1),rgba(2,6,23,0.82))]" />
        </div>

        <div className="space-y-5 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Ticket wallet
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {booking.event?.title || 'Untitled event'}
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                {formatDate(booking.event?.date, {
                  dateStyle: 'full',
                  timeStyle: 'short'
                })}
              </p>
            </div>

            <span
              className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.24em] ${statusMeta.className}`}
            >
              {statusMeta.label}
            </span>
          </div>

          <div className="grid gap-4 text-sm text-slate-300 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Seats</p>
              <p className="mt-2 font-medium text-white">{formatSeatList(booking.seats)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Venue</p>
              <p className="mt-2 font-medium text-white">
                {booking.event?.venue?.name || booking.event?.venue?.city || 'Venue TBA'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function MyTickets() {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadBookings = async () => {
      try {
        const { data } = await api.get('/api/v1/bookings/my');

        if (isMounted) {
          setBookings(data?.data?.bookings || []);
          setError('');
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'Unable to load your tickets.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadBookings();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredBookings = useMemo(() => {
    if (activeTab === 'all') {
      return bookings;
    }

    return bookings.filter((booking) => {
      const pastEvent = isPastEvent(booking.event?.date);
      return activeTab === 'past' ? pastEvent : !pastEvent;
    });
  }, [activeTab, bookings]);

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.34em] text-cyan-200">My tickets</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white">
          Your private ticket wallet.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          Every confirmed, pending, or refunded booking stays here so you can open the QR code,
          review seat assignments, and get to the venue fast.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {tabs.map((tab) => (
            <button
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-white text-slate-950'
                  : 'border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:bg-white/[0.06]'
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div className="rounded-[28px] border border-rose-400/20 bg-rose-500/10 p-5 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-5">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              className="h-52 animate-pulse rounded-[30px] border border-white/10 bg-white/[0.04]"
              key={index}
            />
          ))}
        </div>
      ) : filteredBookings.length > 0 ? (
        <div className="grid gap-5">
          {filteredBookings.map((booking) => (
            <TicketCard booking={booking} key={booking.id} />
          ))}
        </div>
      ) : (
        <div className="rounded-[30px] border border-dashed border-white/10 bg-white/[0.03] p-10 text-center">
          <p className="text-xl font-semibold text-white">No tickets in this view yet.</p>
          <p className="mt-3 text-sm text-slate-400">
            Try another tab, or book a new event to start building your wallet.
          </p>
        </div>
      )}
    </div>
  );
}
