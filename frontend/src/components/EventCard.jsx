import { Link } from 'react-router-dom';
import {
  formatEventDate,
  formatStartingPrice,
  getCategoryTheme,
  getEventCity,
  getSeatAvailabilityTone,
  getTotalAvailableSeats,
  getTotalSeatCapacity,
  normalizeCategory
} from '../utils/eventPresentation';

const fallbackImage =
  'linear-gradient(135deg, rgba(56,189,248,0.25) 0%, rgba(99,102,241,0.3) 45%, rgba(15,23,42,0.8) 100%)';

export default function EventCard({ event }) {
  const category = normalizeCategory(event?.category);
  const theme = getCategoryTheme(category);
  const availableSeats = getTotalAvailableSeats(event?.ticketTiers);
  const totalSeats = getTotalSeatCapacity(event?.ticketTiers);
  const seatTone = getSeatAvailabilityTone(availableSeats, totalSeats);

  return (
    <Link
      className="group block overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.04] shadow-[0_22px_70px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '420px' }}
      to={`/events/${event?._id}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {event?.coverImageUrl ? (
          <img
            alt={event?.title || 'Event cover'}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            src={event.coverImageUrl}
          />
        ) : (
          <div className={`h-full w-full bg-gradient-to-br ${theme.accent}`} style={{ backgroundImage: fallbackImage }} />
        )}

        <div className={`absolute inset-0 bg-gradient-to-t ${theme.accent}`} />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h2 className="max-w-[85%] text-2xl font-semibold tracking-tight text-white">
            {event?.title || 'Untitled event'}
          </h2>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-300">{getEventCity(event)}</span>
          <span className="h-1 w-1 rounded-full bg-white/30" />
          <span className="text-sm text-slate-400">{formatEventDate(event?.date)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${theme.badge}`}>
            {category}
          </span>
          <span className="text-sm font-medium text-white">{formatStartingPrice(event?.ticketTiers)}</span>
        </div>

        <div className="flex items-center justify-between gap-4 text-sm">
          <p className={`font-medium ${seatTone}`}>{availableSeats} seats left</p>
          <p className="text-slate-400">
            {totalSeats > 0 ? `${Math.max(totalSeats - availableSeats, 0)} sold` : 'Seat plan pending'}
          </p>
        </div>
      </div>
    </Link>
  );
}
