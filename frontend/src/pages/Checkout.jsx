import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import LockCountdown from '../components/SeatMap/LockCountdown';
import { useBooking } from '../hooks/useBooking';
import { formatCurrency } from '../utils/formatCurrency';

function CheckoutEmptyState() {
  return (
    <div className="mx-auto max-w-3xl rounded-[30px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.3)] backdrop-blur-xl">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-300">
        Checkout
      </p>
      <h1 className="mt-4 text-3xl font-semibold text-white">No locked seats are ready for payment.</h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        Go back to an event, lock the seats you want, and return here once your hold is active.
      </p>
      <Link className="button-primary mt-6 inline-flex" to="/">
        Browse events
      </Link>
    </div>
  );
}

const getNearestLockExpiry = (lockedSeats) => {
  const timestamps = lockedSeats
    .map((seat) => new Date(seat.lockExpiry).getTime())
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > Date.now())
    .sort((left, right) => left - right);

  return timestamps.length > 0 ? new Date(timestamps[0]).toISOString() : null;
};

export default function Checkout() {
  const location = useLocation();
  const checkoutState = location.state || {};
  const lockedSeats = checkoutState.lockedSeats || [];
  const seatPrice = Number(checkoutState.price || 0);

  const {
    lockedSeats: normalizedLockedSeats,
    isCheckoutLoading,
    isAwaitingConfirmation,
    isReserveReminderVisible,
    dismissReserveReminder,
    startCheckout
  } = useBooking({
    eventId: checkoutState.eventId,
    tierId: checkoutState.tierId,
    lockedSeats,
    eventTitle: checkoutState.eventTitle,
    expectedAmount: seatPrice * lockedSeats.length
  });

  const seatRows = useMemo(
    () =>
      normalizedLockedSeats.map((seat) => ({
        seatId: seat.seatId,
        seatNumber: seat.seatNumber,
        tierName: checkoutState.tierName || 'Selected tier',
        pricePerSeat: seatPrice
      })),
    [checkoutState.tierName, normalizedLockedSeats, seatPrice]
  );
  const orderSummary = useMemo(() => {
    const subtotal = seatRows.reduce((sum, seat) => sum + seat.pricePerSeat, 0);

    return {
      seatCount: seatRows.length,
      subtotal,
      total: subtotal
    };
  }, [seatRows]);
  const nearestLockExpiry = useMemo(
    () => getNearestLockExpiry(normalizedLockedSeats),
    [normalizedLockedSeats]
  );

  if (!checkoutState.eventId || !checkoutState.tierId || normalizedLockedSeats.length === 0) {
    return <CheckoutEmptyState />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.28)] backdrop-blur-xl sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.32em] text-indigo-300">
          Checkout
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-white">
          Review your locked seats for {checkoutState.eventTitle || 'this event'}.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          Payment opens on the hosted AcquireMock invoice page only after the backend verifies the
          live seat lock. You&apos;ll return here on the confirmation route once the payment flow
          completes.
        </p>

        {isReserveReminderVisible && nearestLockExpiry ? (
          <div className="mt-6 flex flex-col gap-3 rounded-[24px] border border-amber-300/20 bg-amber-500/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-amber-100">
              <p className="font-semibold">Your seats are still reserved.</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-amber-50/90">
                <span>Your seats are reserved for</span>
                <LockCountdown lockExpiry={nearestLockExpiry} onExpire={dismissReserveReminder} />
              </div>
            </div>
            <button
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
              onClick={dismissReserveReminder}
              type="button"
            >
              Hide
            </button>
          </div>
        ) : null}

        {isAwaitingConfirmation ? (
          <div className="mt-6 rounded-[24px] border border-cyan-300/20 bg-cyan-500/10 px-4 py-4 text-sm text-cyan-100">
            Payment is complete on the checkout sheet. We’re waiting for the server to confirm the
            booking and release your confirmation route.
          </div>
        ) : null}

        <div className="mt-8 overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/55">
          <div className="grid grid-cols-[minmax(0,1fr)_140px_140px] border-b border-white/10 px-5 py-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            <span>Seat</span>
            <span>Tier</span>
            <span className="text-right">Price</span>
          </div>

          <div className="divide-y divide-white/10">
            {seatRows.map((seat) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_140px_140px] items-center gap-4 px-5 py-4 text-sm text-slate-200"
                key={seat.seatId || seat.seatNumber}
              >
                <div>
                  <p className="font-semibold text-white">{seat.seatNumber}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.24em] text-slate-500">
                    Locked seat
                  </p>
                </div>
                <span>{seat.tierName}</span>
                <span className="text-right font-semibold text-white">
                  {formatCurrency(seat.pricePerSeat)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.28)] backdrop-blur-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.32em] text-indigo-300">
          Order summary
        </p>

        <div className="mt-5 space-y-4 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-4">
            <span>Event</span>
            <span className="text-right font-medium text-white">
              {checkoutState.eventTitle || 'Selected event'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>Subtotal</span>
            <span className="text-right font-medium text-white">
              {formatCurrency(orderSummary.subtotal)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>Seat count</span>
            <span className="text-right font-medium text-white">{orderSummary.seatCount}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4">
            <span>Total</span>
            <span className="text-right text-lg font-semibold text-white">
              {formatCurrency(orderSummary.total)}
            </span>
          </div>
        </div>

        <button
          className="button-primary mt-8 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          disabled={isCheckoutLoading || isAwaitingConfirmation}
          onClick={startCheckout}
          type="button"
        >
          {isCheckoutLoading
            ? 'Preparing payment...'
            : isAwaitingConfirmation
              ? 'Waiting for confirmation...'
              : `Continue to payment · ${formatCurrency(orderSummary.total)}`}
        </button>

        <Link className="button-secondary mt-3 w-full justify-center" to={checkoutState.from || '/'}>
          Back to seat map
        </Link>

        <p className="mt-4 text-xs leading-6 text-slate-400">
          Totals are calculated client-side from the locked seat selection and checked against the
          backend amount before the hosted payment page opens.
        </p>
      </aside>
    </div>
  );
}
