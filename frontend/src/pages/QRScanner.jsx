import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

const scannerElementId = 'eventiq-ticket-scanner';
const normalizeScannedQrPayload = (value) => value.trim().replace(/[\s\u200B-\u200D\uFEFF]+/g, '');

export default function QRScanner() {
  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const resumeTimeoutRef = useRef(null);
  const [scanResult, setScanResult] = useState(null);
  const [scannerError, setScannerError] = useState('');
  const [isScannerLoading, setIsScannerLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const resumeScanner = async () => {
      if (!isMounted || !scannerRef.current) {
        return;
      }

      try {
        await scannerRef.current.resume();
      } catch (_error) {
        setScannerError('Camera preview needs a refresh before scanning can continue.');
      }
    };

    const handleDecodedText = async (decodedText) => {
      if (processingRef.current) {
        return;
      }

      processingRef.current = true;

      try {
        await scanner.pause(true);
        const normalizedQrPayload = normalizeScannedQrPayload(decodedText);

        const { data } = await api.post('/api/v1/tickets/validate', {
          qrPayload: normalizedQrPayload
        });

        const result = data?.data || {};

        setScanResult({
          tone: 'success',
          title: 'Ticket valid',
          body: `${result.attendeeName || 'Attendee'} • ${Array.isArray(result.seatNumbers) ? result.seatNumbers.join(', ') : ''}`
        });
      } catch (requestError) {
        const code = requestError.response?.data?.code || requestError.response?.data?.message || 'INVALID_TICKET';

        setScanResult({
          tone: 'error',
          title: 'Ticket rejected',
          body: code
        });
      } finally {
        resumeTimeoutRef.current = window.setTimeout(async () => {
          setScanResult(null);
          processingRef.current = false;
          await resumeScanner();
        }, 3000);
      }
    };

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');

        if (!isMounted) {
          return;
        }

        const scanner = new Html5Qrcode(scannerElementId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1.333333
          },
          handleDecodedText,
          () => {}
        );

        if (isMounted) {
          setIsScannerLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setScannerError(error?.message || 'Unable to access the camera.');
          setIsScannerLoading(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      window.clearTimeout(resumeTimeoutRef.current);

      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            scannerRef.current?.clear?.().catch?.(() => {});
          });
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.34)] backdrop-blur-xl sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.34em] text-emerald-200">Venue ops</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white">Scan Tickets</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          Point the camera at the attendee QR code. Eventiq validates the signed payload against the
          backend, flashes the venue-safe result for three seconds, then resumes automatically.
        </p>
      </section>

      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.34)] backdrop-blur-xl sm:p-6">
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/40">
          <div className="min-h-[32rem]" id={scannerElementId} />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.05),rgba(2,6,23,0.5))]" />
            <div className="absolute left-1/2 top-1/2 h-[18rem] w-[18rem] -translate-x-1/2 -translate-y-1/2 rounded-[32px] border-2 border-cyan-300/70 shadow-[0_0_0_9999px_rgba(2,6,23,0.42)]" />
          </div>
          {isScannerLoading && !scannerError ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70 px-6 text-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-200">
                  Preparing scanner
                </p>
                <p className="mt-3 text-sm text-slate-300">
                  Requesting camera access and loading the QR scanner.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {scannerError ? (
          <div className="mt-5 rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
            {scannerError}
          </div>
        ) : null}
      </section>

      {scanResult ? (
        <div
          className={`fixed inset-0 z-[80] flex items-center justify-center px-6 ${
            scanResult.tone === 'success' ? 'bg-emerald-600/85' : 'bg-rose-600/85'
          }`}
        >
          <div className="max-w-2xl text-center text-white">
            <p className="text-6xl font-black">{scanResult.tone === 'success' ? 'VALID' : 'REJECTED'}</p>
            <p className="mt-4 text-3xl font-semibold">{scanResult.title}</p>
            <p className="mt-4 text-lg">{scanResult.body}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
