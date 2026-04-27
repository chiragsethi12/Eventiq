import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import SeatMap from '../components/SeatMap/SeatMap';
import { useSeatMap } from '../hooks/useSeatMap';
import { clearCurrentEvent, fetchEventById } from '../store/eventSlice';
import { formatCurrency } from '../utils/formatCurrency';
import {
  formatEventDate,
  getCategoryTheme,
  getEventCity,
  getEventVenue,
  getOrganizerLabel,
  getTotalAvailableSeats,
  getTotalSeatCapacity,
  normalizeCategory
} from '../utils/eventPresentation';

function EventDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-[24rem] animate-pulse rounded-[34px] bg-white/[0.06]" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4 rounded-[30px] border border-white/10 bg-white/[0.04] p-6">
          <div className="h-4 w-28 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-10 w-2/3 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="h-5 w-full animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-5 w-5/6 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
        <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6">
          <div className="h-40 animate-pulse rounded-[24px] bg-white/[0.06]" />
        </div>
      </div>
    </div>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { currentEvent, isLoading, error } = useSelector((state) => state.event);
  const { accessToken, user } = useSelector((state) => state.auth);
  const [selectedTierId, setSelectedTierId] = useState('');

  useEffect(() => {
    dispatch(fetchEventById(id));

    return () => {
      dispatch(clearCurrentEvent());
    };
  }, [dispatch, id]);

  useEffect(() => {
    if (!currentEvent?.ticketTiers?.length) {
      setSelectedTierId('');
      return;
    }

    setSelectedTierId((currentTierId) => {
      const tierStillExists = currentEvent.ticketTiers.some((tier) => tier._id === currentTierId);
      return tierStillExists ? currentTierId : '';
    });
  }, [currentEvent]);

  const {
    seats,
    error: seatError,
    connected: isConnected,
    lockSeat,
    releaseSeat,
    myLockedSeats,
    refreshSeatState
  } = useSeatMap({
    eventId: currentEvent?._id,
    currentUserId: user?.id
  });

  const ticketTierAvailability = useMemo(() => {
    if (!currentEvent?.ticketTiers?.length || seats.size === 0) {
      return null;
    }

    const counts = new Map(currentEvent.ticketTiers.map((tier) => [tier._id, 0]));

    seats.forEach((seat) => {
      if (seat.status !== 'available' || !seat.tierId) {
        return;
      }

      counts.set(seat.tierId, (counts.get(seat.tierId) || 0) + 1);
    });

    return counts;
  }, [currentEvent?.ticketTiers, seats]);

  const ticketTiers = useMemo(
    () =>
      (currentEvent?.ticketTiers || []).map((tier) => ({
        ...tier,
        availableSeats: ticketTierAvailability?.get(tier._id) ?? tier.availableSeats
      })),
    [currentEvent?.ticketTiers, ticketTierAvailability]
  );

  const selectedTier = useMemo(
    () => ticketTiers.find((tier) => tier._id === selectedTierId) || null,
    [selectedTierId, ticketTiers]
  );

  const category = normalizeCategory(currentEvent?.category);
  const categoryTheme = getCategoryTheme(category);
  const availableSeats = ticketTierAvailability
    ? [...ticketTierAvailability.values()].reduce((total, count) => total + count, 0)
    : getTotalAvailableSeats(currentEvent?.ticketTiers);
  const totalSeats = getTotalSeatCapacity(currentEvent?.ticketTiers);

  const proceedToCheckout = () => {
    navigate('/checkout', {
      state: {
        from: location.pathname,
        eventId: currentEvent?._id,
        eventTitle: currentEvent?.title,
        tierId: selectedTier?._id,
        tierName: selectedTier?.name,
        price: selectedTier?.price,
        lockedSeats: myLockedSeats
      }
    });
  };

  if (isLoading && !currentEvent) {
    return <EventDetailSkeleton />;
  }

  if (error && !currentEvent) {
    return (
      <div className="rounded-[30px] border border-rose-400/25 bg-rose-500/10 p-8">
        <p className="text-lg font-semibold text-white">We couldn’t load this event.</p>
        <p className="mt-2 text-sm text-rose-100">{error}</p>
      </div>
    );
  }

  if (!currentEvent) {
    return null;
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[34px] border border-white/10">
        {currentEvent.coverImageUrl ? (
          <img
            alt={currentEvent.title}
            className="h-[28rem] w-full object-cover"
            src={currentEvent.coverImageUrl}
          />
        ) : (
          <div className={`h-[28rem] w-full bg-gradient-to-br ${categoryTheme.accent}`} />
        )}

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.2),rgba(2,6,23,0.82)_70%,rgba(2,6,23,0.96))]" />

        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${categoryTheme.badge}`}>
                  {category}
                </span>
                <span className="text-sm text-slate-200">{getEventCity(currentEvent)}</span>
              </div>

              <div className="space-y-3">
                <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                  {currentEvent.title}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-slate-200 sm:text-lg">
                  {currentEvent.description}
                </p>
              </div>

              <div className="grid gap-4 text-sm text-slate-200 sm:grid-cols-3">
                <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Organizer</p>
                  <p className="mt-2 font-semibold text-white">{getOrganizerLabel(currentEvent)}</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Date & time</p>
                  <p className="mt-2 font-semibold text-white">{formatEventDate(currentEvent.date)}</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Venue</p>
                  <p className="mt-2 font-semibold text-white">{getEventVenue(currentEvent)}</p>
                  <p className="mt-1 text-slate-300">{currentEvent.venue?.address}</p>
                </div>
              </div>
            </div>

            <aside className="rounded-[30px] border border-white/10 bg-slate-950/55 p-6 shadow-[0_26px_80px_rgba(2,6,23,0.42)] backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Booking snapshot</p>
              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-4xl font-semibold text-white">{availableSeats}</p>
                  <p className="mt-1 text-sm text-slate-300">
                    live seats available across {totalSeats} total seats
                  </p>
                </div>
                <div className="space-y-2 text-sm text-slate-300">
                  <p>{selectedTier ? `${selectedTier.name} selected` : 'Select a tier to continue'}</p>
                  <p>{myLockedSeats.length > 0 ? `${myLockedSeats.length} seat${myLockedSeats.length > 1 ? 's' : ''} locked` : 'No seats locked yet'}</p>
                  <p className={isConnected ? 'text-emerald-300' : 'text-amber-300'}>
                    {isConnected ? 'Live seat channel active' : 'Live seat channel waiting for sign-in'}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl">
            <div className="flex flex-col gap-2 border-b border-white/10 pb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Ticket tiers</p>
              <h2 className="text-3xl font-semibold text-white">Choose your access</h2>
              <p className="text-sm leading-6 text-slate-300">
                Select a tier first, then move into the live seat map below to hold your preferred seats before checkout.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ticketTiers.map((tier) => {
                const isSelected = selectedTierId === tier._id;

                return (
                  <button
                    className={`rounded-[26px] border p-5 text-left transition ${
                      isSelected
                        ? 'border-cyan-300/50 bg-cyan-400/10 shadow-[0_18px_60px_rgba(34,211,238,0.12)]'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                    key={tier._id}
                    onClick={() => setSelectedTierId(tier._id)}
                    type="button"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Tier</p>
                    <h3 className="mt-3 text-2xl font-semibold text-white">{tier.name}</h3>
                    <p className="mt-2 text-lg font-medium text-cyan-100">{formatCurrency(tier.price)}</p>
                    <p className="mt-4 text-sm text-slate-300">{tier.availableSeats} seats available</p>
                  </button>
                );
              })}
            </div>
          </div>

          <SeatMap
            seatConfig={currentEvent.seatMap}
            error={seatError}
            isAuthenticated={Boolean(accessToken && user)}
            isConnected={isConnected}
            lockSeat={lockSeat}
            myLockedSeats={myLockedSeats}
            onProceedToCheckout={proceedToCheckout}
            refreshSeatState={refreshSeatState}
            releaseSeat={releaseSeat}
            seats={seats}
            selectedTier={selectedTier}
          />
        </div>

        <aside className="space-y-5">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Checkout lane</p>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p>Tier: {selectedTier?.name || 'Choose a ticket tier'}</p>
              <p>Seats locked: {myLockedSeats.length}</p>
              <p>
                Seats: {myLockedSeats.length > 0 ? myLockedSeats.map((seat) => seat.seatNumber).join(', ') : 'None yet'}
              </p>
            </div>

            <button
              className="button-primary mt-6 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              disabled={!selectedTier || myLockedSeats.length < 1}
              onClick={proceedToCheckout}
              type="button"
            >
              Proceed to Checkout
            </button>

            {!accessToken ? (
              <p className="mt-4 text-sm text-slate-400">
                <Link className="font-semibold text-cyan-200 hover:text-cyan-100" to="/login">
                  Sign in
                </Link>{' '}
                to lock seats and continue.
              </p>
            ) : null}
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Realtime status</p>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p>{availableSeats} seats still open across the venue.</p>
              <p>{isConnected ? 'Socket feed is updating counts live.' : 'Live seat feed activates after attendee sign-in.'}</p>
              <p>{seatError || 'Tier availability is derived directly from the live seat feed.'}</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
