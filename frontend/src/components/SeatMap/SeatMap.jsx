import { useMemo } from 'react';
import Seat from './Seat';
import SeatLegend from './SeatLegend';

const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function SeatMapNotice({ title, description }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
    </div>
  );
}

function SeatSelectionBar({ lockedSeats, onProceedToCheckout }) {
  const selectedCount = lockedSeats.length;
  const selectedSeatNumbers = lockedSeats.map((seat) => seat.seatNumber).join(', ');

  return (
    <div className="sticky bottom-4 mt-6">
      <div className="flex flex-col gap-4 rounded-[26px] border border-indigo-300/20 bg-slate-950/90 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.48)] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-200">
            Selection
          </p>
          <p className="text-xl font-semibold text-white">
            {selectedCount} seat{selectedCount === 1 ? '' : 's'} selected
          </p>
          <p className="text-sm text-slate-300">
            {selectedCount > 0 ? selectedSeatNumbers : 'Lock seats from the map to continue.'}
          </p>
        </div>

        <button
          className="button-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 lg:w-auto"
          disabled={selectedCount === 0}
          onClick={onProceedToCheckout}
          type="button"
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}

export default function SeatMap({
  seatConfig,
  seats,
  selectedTier,
  isAuthenticated,
  isConnected,
  error,
  myLockedSeats,
  lockSeat,
  releaseSeat,
  refreshSeatState,
  onProceedToCheckout
}) {
  if (!selectedTier) {
    return (
      <SeatMapNotice
        description="Pick a ticket tier to unlock the live seat map for this event."
        title="Choose a tier first"
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <SeatMapNotice
        description="Sign in as an attendee to connect to live seat locks, hold seats, and continue to checkout."
        title="Attendee sign-in required"
      />
    );
  }

  if (!seatConfig) {
    return (
      <SeatMapNotice
        description="This event does not have a published seat map configuration yet."
        title="Seat map unavailable"
      />
    );
  }

  return (
    <InteractiveSeatMap
      error={error}
      isConnected={isConnected}
      lockSeat={lockSeat}
      myLockedSeats={myLockedSeats}
      onProceedToCheckout={onProceedToCheckout}
      refreshSeatState={refreshSeatState}
      releaseSeat={releaseSeat}
      seatConfig={seatConfig}
      seats={seats}
      selectedTier={selectedTier}
    />
  );
}

function InteractiveSeatMap({
  seatConfig,
  seats,
  selectedTier,
  isConnected,
  error,
  myLockedSeats,
  lockSeat,
  releaseSeat,
  refreshSeatState,
  onProceedToCheckout
}) {
  const blockedSeats = useMemo(
    () => new Set(seatConfig.blockedSeats || []),
    [seatConfig.blockedSeats]
  );

  const seatsByNumber = useMemo(() => {
    const lookup = new Map();

    seats.forEach((seat) => {
      lookup.set(seat.seatNumber, seat);
    });

    return lookup;
  }, [seats]);

  const rowData = useMemo(
    () =>
      Array.from({ length: seatConfig.rows }, (_, rowIndex) => {
        const rowLabel = rowLabels[rowIndex];
        const cells = Array.from({ length: seatConfig.columns }, (_, columnIndex) => {
          const seatNumber = `${rowLabel}${columnIndex + 1}`;

          if (blockedSeats.has(seatNumber)) {
            return {
              key: `blocked:${seatNumber}`,
              seatId: null,
              seatNumber,
              seatState: {
                status: 'blocked',
                lockExpiry: null
              }
            };
          }

          const seatState = seatsByNumber.get(seatNumber);

          return {
            key: seatState?.seatId || seatNumber,
            seatId: seatState?.seatId || null,
            seatNumber,
            seatState
          };
        });

        return {
          rowLabel,
          cells
        };
      }),
    [blockedSeats, seatConfig.columns, seatConfig.rows, seatsByNumber]
  );

  const totalSellableSeats =
    seatConfig.rows * seatConfig.columns - blockedSeats.size;
  const isSyncingSeatState = seats.size === 0 && totalSellableSeats > 0;

  return (
    <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">
            Interactive seat map
          </p>
          <h3 className="text-2xl font-semibold text-white">{selectedTier.name} access</h3>
          <p className="max-w-2xl text-sm leading-6 text-slate-300">
            Seat locks sync live through Socket.io. Hold your preferred seats before another attendee takes them.
          </p>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-slate-950/70 px-4 py-3 text-sm">
          <p className={isConnected ? 'text-emerald-300' : 'text-amber-300'}>
            {isConnected ? 'Live updates connected' : 'Connecting to live updates'}
          </p>
          <p className="mt-1 text-slate-400">
            Row labels appear on the left. Blocked positions are shown directly in the grid.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <SeatLegend />
      </div>

      {error ? (
        <div className="mt-5 rounded-[24px] border border-amber-300/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      {isSyncingSeatState ? (
        <div className="mt-6 rounded-[26px] border border-dashed border-white/10 bg-black/10 p-6 text-sm text-slate-300">
          Syncing live seat state...
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto pb-2">
          <div className="min-w-max space-y-3">
            {rowData.map((row) => (
              <div key={row.rowLabel} className="flex items-center gap-3">
                <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-slate-950/70 text-sm font-semibold text-slate-200">
                  {row.rowLabel}
                </div>

                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${seatConfig.columns}, minmax(3.75rem, 3.75rem))`
                  }}
                >
                  {row.cells.map((cell) => (
                    <Seat
                      key={cell.key}
                      onLock={lockSeat}
                      onRefreshSeatState={refreshSeatState}
                      onRelease={releaseSeat}
                      seatId={cell.seatId}
                      seatNumber={cell.seatNumber}
                      seatState={cell.seatState}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <SeatSelectionBar lockedSeats={myLockedSeats} onProceedToCheckout={onProceedToCheckout} />
    </section>
  );
}
