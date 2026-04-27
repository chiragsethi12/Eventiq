export const BOOKING_STATUS_META = {
  confirmed: {
    label: 'CONFIRMED',
    className: 'border-emerald-300/25 bg-emerald-500/12 text-emerald-100'
  },
  pending: {
    label: 'PENDING',
    className: 'border-amber-300/25 bg-amber-500/12 text-amber-100'
  },
  failed: {
    label: 'FAILED',
    className: 'border-rose-300/25 bg-rose-500/12 text-rose-100'
  },
  refund_pending: {
    label: 'REFUND PENDING',
    className: 'border-orange-300/25 bg-orange-500/12 text-orange-100'
  }
};

export const getBookingStatusMeta = (status) =>
  BOOKING_STATUS_META[status] || BOOKING_STATUS_META.pending;

export const formatSeatList = (seats = []) =>
  seats
    .map((seat) => {
      if (typeof seat === 'string') {
        return seat;
      }

      return seat?.seatNumber || null;
    })
    .filter(Boolean)
    .join(', ');

export const isPastEvent = (date) => {
  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) ? timestamp < Date.now() : false;
};

export const formatTicketReference = (reference) => {
  if (!reference) {
    return 'Pending';
  }

  const normalizedReference = String(reference).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalizedReference.length > 10
    ? `EVTQ-${normalizedReference.slice(-10)}`
    : normalizedReference;
};
