import { useEffect, useRef, useState } from 'react';

const WARNING_THRESHOLD_MS = 30 * 1000;

const getRemainingMilliseconds = (lockExpiry) => {
  const expiryTimestamp = new Date(lockExpiry).getTime();

  if (!Number.isFinite(expiryTimestamp)) {
    return 0;
  }

  return Math.max(0, expiryTimestamp - Date.now());
};

const formatRemainingTime = (remainingMilliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(remainingMilliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')} remaining`;
};

export default function LockCountdown({ lockExpiry, onExpire }) {
  const [remainingMilliseconds, setRemainingMilliseconds] = useState(
    getRemainingMilliseconds(lockExpiry)
  );
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    hasExpiredRef.current = false;
    setRemainingMilliseconds(getRemainingMilliseconds(lockExpiry));
  }, [lockExpiry]);

  useEffect(() => {
    if (!lockExpiry) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setRemainingMilliseconds(getRemainingMilliseconds(lockExpiry));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [lockExpiry]);

  useEffect(() => {
    if (remainingMilliseconds > 0 || hasExpiredRef.current) {
      return;
    }

    hasExpiredRef.current = true;
    onExpire?.();
  }, [onExpire, remainingMilliseconds]);

  if (!lockExpiry) {
    return null;
  }

  return (
    <span
      className={`text-[10px] font-medium leading-4 ${
        remainingMilliseconds < WARNING_THRESHOLD_MS ? 'text-rose-100' : 'text-indigo-100/90'
      }`}
    >
      {formatRemainingTime(remainingMilliseconds)}
    </span>
  );
}
