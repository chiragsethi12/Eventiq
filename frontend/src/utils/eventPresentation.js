import { formatCurrency } from './formatCurrency';
import { formatDate } from './formatDate';

const categoryThemes = {
  concert: {
    badge: 'border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-100',
    accent: 'from-fuchsia-500/70 via-pink-500/20 to-transparent'
  },
  sports: {
    badge: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100',
    accent: 'from-emerald-500/70 via-lime-500/20 to-transparent'
  },
  conference: {
    badge: 'border-sky-400/30 bg-sky-500/15 text-sky-100',
    accent: 'from-sky-500/70 via-cyan-500/15 to-transparent'
  },
  workshop: {
    badge: 'border-amber-400/30 bg-amber-500/15 text-amber-100',
    accent: 'from-amber-500/70 via-orange-500/15 to-transparent'
  },
  other: {
    badge: 'border-slate-200/15 bg-slate-200/10 text-slate-100',
    accent: 'from-slate-300/40 via-slate-500/10 to-transparent'
  }
};

export const EVENT_CATEGORIES = ['concert', 'sports', 'conference', 'workshop', 'other'];

export function normalizeCategory(category) {
  const normalized = String(category || 'other').trim().toLowerCase();
  return EVENT_CATEGORIES.includes(normalized) ? normalized : 'other';
}

export function getCategoryTheme(category) {
  return categoryThemes[normalizeCategory(category)];
}

export function getEventCity(event) {
  return event?.venue?.city || 'City TBA';
}

export function getEventVenue(event) {
  return event?.venue?.name || 'Venue TBA';
}

export function formatEventDate(value) {
  if (!value) {
    return 'Date TBA';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date TBA';
  }

  const weekday = formatDate(date, { weekday: 'short' });
  const day = formatDate(date, { day: 'numeric' });
  const month = formatDate(date, { month: 'short' });
  const year = formatDate(date, { year: 'numeric' });
  const time = formatDate(date, { hour: 'numeric', minute: '2-digit' });

  return `${weekday}, ${day} ${month} ${year} · ${time}`;
}

export function getMinTierPrice(tiers = []) {
  const minimum = tiers.reduce((lowest, tier) => {
    const price = Number(tier?.price);
    return Number.isFinite(price) ? Math.min(lowest, price) : lowest;
  }, Number.POSITIVE_INFINITY);

  return Number.isFinite(minimum) ? minimum : null;
}

export function formatStartingPrice(tiers = []) {
  const minimum = getMinTierPrice(tiers);
  return minimum === null ? 'Pricing soon' : `From ${formatCurrency(minimum)}`;
}

export function getTotalAvailableSeats(tiers = []) {
  return tiers.reduce((total, tier) => total + Math.max(0, Number(tier?.availableSeats) || 0), 0);
}

export function getTotalSeatCapacity(tiers = []) {
  return tiers.reduce((total, tier) => total + Math.max(0, Number(tier?.totalSeats) || 0), 0);
}

export function getSeatAvailabilityTone(availableSeats, totalSeats) {
  if (!Number.isFinite(totalSeats) || totalSeats <= 0) {
    return 'text-slate-300';
  }

  const ratio = availableSeats / totalSeats;

  if (ratio < 0.1) {
    return 'text-rose-300';
  }

  if (ratio < 0.2) {
    return 'text-amber-300';
  }

  return 'text-emerald-300';
}

export function getOrganizerLabel(event) {
  if (!event?.organizerId) {
    return 'Independent organizer';
  }

  const shortId = String(event.organizerId).slice(-6).toUpperCase();
  return `Organizer ${shortId}`;
}
