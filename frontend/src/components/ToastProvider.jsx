import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

const ToastContext = createContext(null);

const DEFAULT_DURATION_MS = 4000;

const toneStyles = {
  error: {
    border: 'border-rose-400/30',
    background: 'bg-rose-500/12',
    title: 'text-rose-100',
    body: 'text-rose-50/90'
  },
  info: {
    border: 'border-cyan-400/30',
    background: 'bg-cyan-500/12',
    title: 'text-cyan-100',
    body: 'text-cyan-50/90'
  },
  success: {
    border: 'border-emerald-400/30',
    background: 'bg-emerald-500/12',
    title: 'text-emerald-100',
    body: 'text-emerald-50/90'
  }
};

function ToastItem({ toast, onDismiss }) {
  const styles = toneStyles[toast.tone] || toneStyles.info;

  return (
    <article
      className={`pointer-events-auto w-full max-w-sm rounded-[22px] border ${styles.border} ${styles.background} p-4 shadow-[0_24px_80px_rgba(2,6,23,0.48)] backdrop-blur-xl`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-current text-white/80" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${styles.title}`}>{toast.title}</p>
          <p className={`mt-1 text-sm leading-6 ${styles.body}`}>{toast.message}</p>
        </div>
        <button
          aria-label="Dismiss notification"
          className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/10"
          onClick={() => onDismiss(toast.id)}
          type="button"
        >
          Close
        </button>
      </div>
    </article>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutIdsRef = useRef(new Map());

  const dismissToast = useCallback((toastId) => {
    const timeoutId = timeoutIdsRef.current.get(toastId);

    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutIdsRef.current.delete(toastId);
    }

    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  }, []);

  const showToast = useCallback(
    ({ title, message, tone = 'info', duration = DEFAULT_DURATION_MS }) => {
      const toastId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setToasts((currentToasts) => [
        ...currentToasts,
        {
          id: toastId,
          title,
          message,
          tone
        }
      ]);

      const timeoutId = window.setTimeout(() => {
        dismissToast(toastId);
      }, duration);

      timeoutIdsRef.current.set(toastId, timeoutId);

      return toastId;
    },
    [dismissToast]
  );

  useEffect(
    () => () => {
      timeoutIdsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timeoutIdsRef.current.clear();
    },
    []
  );

  const contextValue = useMemo(
    () => ({
      show: showToast,
      error: (message, options = {}) =>
        showToast({
          title: options.title || 'Seat selection issue',
          message,
          tone: 'error',
          duration: options.duration || DEFAULT_DURATION_MS
        }),
      info: (message, options = {}) =>
        showToast({
          title: options.title || 'Heads up',
          message,
          tone: 'info',
          duration: options.duration || DEFAULT_DURATION_MS
        }),
      success: (message, options = {}) =>
        showToast({
          title: options.title || 'Done',
          message,
          tone: 'success',
          duration: options.duration || DEFAULT_DURATION_MS
        })
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex justify-center px-4 sm:justify-end">
        <div className="flex w-full max-w-sm flex-col gap-3">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} onDismiss={dismissToast} toast={toast} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}
