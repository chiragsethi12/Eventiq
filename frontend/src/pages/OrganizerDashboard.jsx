import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { formatCurrency } from '../utils/formatCurrency';
import { formatDate } from '../utils/formatDate';
import { getBookingStatusMeta } from '../utils/bookingPresentation';

const eventStatusMeta = {
  published: 'border-emerald-300/25 bg-emerald-500/12 text-emerald-100',
  draft: 'border-slate-300/25 bg-slate-500/12 text-slate-100',
  cancelled: 'border-rose-300/25 bg-rose-500/12 text-rose-100'
};

const buildSeatStateMap = (seats = []) =>
  new Map(seats.map((seat) => [seat.seatId, seat.status]));

export default function OrganizerDashboard() {
  const [dashboard, setDashboard] = useState({ events: [], stats: null });
  const [bookingsByEventId, setBookingsByEventId] = useState({});
  const [expandedEventId, setExpandedEventId] = useState('');
  const [loadingBookingsFor, setLoadingBookingsFor] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveSeatStateByEventId, setLiveSeatStateByEventId] = useState({});
  const { socket, emit, connected } = useSocket();

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      try {
        const { data } = await api.get('/api/v1/events/organizer/mine');

        if (isMounted) {
          setDashboard({
            events: data?.data?.events || [],
            stats: data?.data?.stats || {
              totalEvents: 0,
              totalAttendees: 0,
              totalRevenue: 0
            }
          });
          setError('');
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'Unable to load your events.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!socket || dashboard.events.length === 0) {
      return undefined;
    }

    const joinEventRooms = () => {
      dashboard.events.forEach((event) => {
        emit('join_event', { eventId: event.id });
      });
    };

    const handleSeatState = (payload = {}) => {
      if (!payload.eventId) {
        return;
      }

      const seatStates = buildSeatStateMap(payload.seats || []);
      const availableSeats = (payload.seats || []).filter((seat) => seat.status === 'available').length;

      setLiveSeatStateByEventId((current) => ({
        ...current,
        [payload.eventId]: {
          availableSeats,
          seatsById: seatStates
        }
      }));
    };

    const handleSeatUpdated = (payload = {}) => {
      if (!payload.eventId || !payload.seatId) {
        return;
      }

      setLiveSeatStateByEventId((current) => {
        const currentState = current[payload.eventId];

        if (!currentState) {
          return current;
        }

        const nextSeatsById = new Map(currentState.seatsById);
        const previousStatus = nextSeatsById.get(payload.seatId);

        nextSeatsById.set(payload.seatId, payload.status);

        let nextAvailableSeats = currentState.availableSeats;

        if (previousStatus === 'available' && payload.status !== 'available') {
          nextAvailableSeats -= 1;
        } else if (previousStatus !== 'available' && payload.status === 'available') {
          nextAvailableSeats += 1;
        }

        return {
          ...current,
          [payload.eventId]: {
            availableSeats: Math.max(0, nextAvailableSeats),
            seatsById: nextSeatsById
          }
        };
      });
    };

    socket.on('connect', joinEventRooms);
    socket.on('seat_state', handleSeatState);
    socket.on('seat_updated', handleSeatUpdated);

    if (socket.connected) {
      joinEventRooms();
    }

    return () => {
      socket.off('connect', joinEventRooms);
      socket.off('seat_state', handleSeatState);
      socket.off('seat_updated', handleSeatUpdated);
    };
  }, [dashboard.events, emit, socket]);

  const statsCards = useMemo(() => {
    const stats = dashboard.stats || {
      totalEvents: 0,
      totalAttendees: 0,
      totalRevenue: 0
    };

    return [
      {
        label: 'Total events',
        value: stats.totalEvents,
        caption: 'published, draft, and cancelled events in your workspace'
      },
      {
        label: 'Total attendees',
        value: stats.totalAttendees,
        caption: 'confirmed attendee seats across your catalog'
      },
      {
        label: 'Total revenue',
        value: formatCurrency(stats.totalRevenue),
        caption: 'sum of confirmed bookings only'
      }
    ];
  }, [dashboard.stats]);

  const loadBookings = async (eventId) => {
    setLoadingBookingsFor(eventId);

    try {
      const { data } = await api.get(`/api/v1/events/${eventId}/bookings`);

      setBookingsByEventId((current) => ({
        ...current,
        [eventId]: data?.data?.bookings || []
      }));
    } finally {
      setLoadingBookingsFor('');
    }
  };

  const handleToggleBookings = async (eventId) => {
    if (expandedEventId === eventId) {
      setExpandedEventId('');
      return;
    }

    setExpandedEventId(eventId);

    if (!bookingsByEventId[eventId]) {
      await loadBookings(eventId);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-6 rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between sm:p-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.34em] text-cyan-200">Organizer dashboard</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white">My Events</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Monitor bookings, keep an eye on live availability, expand attendee lists, and jump into
            venue scanning from one control room.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link className="button-secondary justify-center" to="/organizer/scan">
            Scan Tickets
          </Link>
          <Link className="button-primary justify-center" to="/organizer/events/create">
            Create New Event
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {statsCards.map((card) => (
          <article
            className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl"
            key={card.label}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              {card.label}
            </p>
            <p className="mt-4 text-3xl font-semibold text-white">{card.value}</p>
            <p className="mt-2 text-sm text-slate-300">{card.caption}</p>
          </article>
        ))}
      </section>

      {error ? (
        <div className="rounded-[28px] border border-rose-400/20 bg-rose-500/10 p-5 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] shadow-[0_24px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200">Event table</p>
            <p className="mt-2 text-sm text-slate-400">
              {connected ? 'Socket.io is streaming live availability updates.' : 'Live availability reconnects automatically.'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-black/10">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                <th className="px-6 py-4">Title</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">City</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Bookings</th>
                <th className="px-6 py-4">Revenue</th>
                <th className="px-6 py-4">Seats</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-sm text-slate-200">
              {isLoading ? (
                <tr>
                  <td className="px-6 py-8 text-slate-400" colSpan="8">
                    Loading events...
                  </td>
                </tr>
              ) : dashboard.events.length > 0 ? (
                dashboard.events.map((event) => {
                  const liveSeatState = liveSeatStateByEventId[event.id];
                  const availableSeats = liveSeatState?.availableSeats ?? event.availableSeats;
                  const statusClassName =
                    eventStatusMeta[event.status] || 'border-white/15 bg-white/10 text-white';

                  return (
                    <FragmentRow
                      actionCell={
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
                            onClick={() => handleToggleBookings(event.id)}
                            type="button"
                          >
                            {expandedEventId === event.id ? 'Hide Bookings' : 'View Bookings'}
                          </button>
                          <Link
                            className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-500/15"
                            to="/organizer/scan"
                          >
                            Scan Tickets
                          </Link>
                        </div>
                      }
                      bookings={bookingsByEventId[event.id] || []}
                      event={event}
                      expanded={expandedEventId === event.id}
                      key={event.id}
                      loadingBookings={loadingBookingsFor === event.id}
                      seatsCell={
                        <div>
                          <p className="font-semibold text-white">
                            {event.seatsFilled}/{event.totalSeats}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {availableSeats} live available
                          </p>
                        </div>
                      }
                      statusBadge={
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusClassName}`}
                        >
                          {event.status}
                        </span>
                      }
                    />
                  );
                })
              ) : (
                <tr>
                  <td className="px-6 py-8 text-slate-400" colSpan="8">
                    No events yet. Create your first event to start selling seats.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FragmentRow({
  event,
  statusBadge,
  seatsCell,
  actionCell,
  expanded,
  bookings,
  loadingBookings
}) {
  return (
    <>
      <tr className="align-top">
        <td className="px-6 py-5">
          <div>
            <p className="font-semibold text-white">{event.title}</p>
            <p className="mt-1 text-xs text-slate-500">ID {event.id.slice(-8).toUpperCase()}</p>
          </div>
        </td>
        <td className="px-6 py-5 text-slate-300">
          {formatDate(event.date, {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
        </td>
        <td className="px-6 py-5">{event.city}</td>
        <td className="px-6 py-5">{statusBadge}</td>
        <td className="px-6 py-5">{event.totalBookings}</td>
        <td className="px-6 py-5 font-semibold text-white">{formatCurrency(event.totalRevenue)}</td>
        <td className="px-6 py-5">{seatsCell}</td>
        <td className="px-6 py-5">{actionCell}</td>
      </tr>

      {expanded ? (
        <tr className="bg-black/10">
          <td className="px-6 py-5" colSpan="8">
            {loadingBookings ? (
              <p className="text-sm text-slate-400">Loading attendee list...</p>
            ) : bookings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Email</th>
                      <th className="py-3 pr-4">Seats</th>
                      <th className="py-3">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-sm text-slate-200">
                    {bookings.map((booking) => {
                      const statusMeta = getBookingStatusMeta(booking.paymentStatus);

                      return (
                        <tr key={booking.id}>
                          <td className="py-3 pr-4 font-medium text-white">{booking.attendee.name}</td>
                          <td className="py-3 pr-4 text-slate-300">{booking.attendee.email}</td>
                          <td className="py-3 pr-4 text-slate-300">
                            {booking.seatNumbers.join(', ')}
                          </td>
                          <td className="py-3">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.18em] ${statusMeta.className}`}
                            >
                              {statusMeta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No bookings have landed for this event yet.</p>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
