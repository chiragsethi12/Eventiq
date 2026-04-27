import { memo } from 'react';
import LockCountdown from './LockCountdown';

function CircleIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <path
        d="M5.25 6V4.75a2.75 2.75 0 1 1 5.5 0V6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <rect
        height="6"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.5"
        width="7.5"
        x="4.25"
        y="6"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <path
        d="m4 8.25 2.4 2.4L12 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <path
        d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <path d="M4 8h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  );
}

const seatVariants = {
  available: {
    label: 'Available',
    classes:
      'border-emerald-300/35 bg-emerald-500/15 text-emerald-50 hover:-translate-y-0.5 hover:border-emerald-200/60 hover:bg-emerald-400/20',
    icon: CircleIcon,
    interactive: true
  },
  locked: {
    label: 'Reserved by others',
    classes: 'border-amber-300/35 bg-amber-400/18 text-amber-50',
    icon: LockIcon,
    interactive: false
  },
  mine: {
    label: 'Your selection',
    classes:
      'border-indigo-300/45 bg-indigo-500/22 text-indigo-50 shadow-[0_0_0_1px_rgba(165,180,252,0.22)] hover:-translate-y-0.5 hover:border-indigo-200/60 hover:bg-indigo-400/28',
    icon: CheckIcon,
    interactive: true
  },
  booked: {
    label: 'Sold',
    classes: 'border-slate-500/35 bg-slate-500/18 text-slate-100',
    icon: XIcon,
    interactive: false
  },
  blocked: {
    label: 'Blocked',
    classes: 'border-slate-700/50 bg-slate-900/85 text-slate-500',
    icon: DashIcon,
    interactive: false
  }
};

const defaultSeatState = Object.freeze({
  status: 'blocked',
  lockExpiry: null
});

function SeatComponent({ seatId, seatNumber, seatState, onLock, onRefreshSeatState, onRelease }) {
  const resolvedSeatState = seatState || defaultSeatState;
  const variant = seatVariants[resolvedSeatState.status] || seatVariants.available;
  const VariantIcon = variant.icon;

  const handleClick = () => {
    if (!variant.interactive) {
      return;
    }

    if (resolvedSeatState.status === 'available') {
      onLock?.(seatId);
      return;
    }

    if (resolvedSeatState.status === 'mine') {
      const shouldRelease = window.confirm(`Release seat ${seatNumber}?`);

      if (shouldRelease) {
        onRelease?.(seatId);
      }
    }
  };

  const isInteractive = variant.interactive && Boolean(seatId);

  return (
    <button
      aria-label={`${seatNumber} - ${variant.label}`}
      className={`relative flex h-16 w-full flex-col items-center justify-center rounded-[20px] border px-1 text-center transition ${
        variant.classes
      } ${isInteractive ? 'cursor-pointer' : 'cursor-not-allowed opacity-85'}`}
      disabled={!isInteractive}
      onClick={handleClick}
      type="button"
    >
      <span className="absolute left-2 top-2 inline-flex items-center justify-center">
        <VariantIcon />
      </span>
      <span className="text-[11px] font-semibold tracking-[0.18em]">{seatNumber}</span>
      {resolvedSeatState.status === 'mine' ? (
        <LockCountdown lockExpiry={resolvedSeatState.lockExpiry} onExpire={onRefreshSeatState} />
      ) : (
        <span className="mt-1 text-[10px] font-medium leading-4 opacity-80">{variant.label}</span>
      )}
    </button>
  );
}

const areSeatPropsEqual = (previousProps, nextProps) =>
  previousProps.seatId === nextProps.seatId &&
  previousProps.seatNumber === nextProps.seatNumber &&
  previousProps.seatState === nextProps.seatState &&
  previousProps.onLock === nextProps.onLock &&
  previousProps.onRelease === nextProps.onRelease &&
  previousProps.onRefreshSeatState === nextProps.onRefreshSeatState;

const Seat = memo(SeatComponent, areSeatPropsEqual);

export default Seat;
