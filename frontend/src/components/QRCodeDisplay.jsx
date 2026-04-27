export default function QRCodeDisplay({ qrImageUrl, alt }) {
  if (!qrImageUrl) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-black/10 px-6 text-center text-sm text-slate-400">
        QR code is being prepared.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white p-4 shadow-[0_24px_80px_rgba(2,6,23,0.3)]">
      <img alt={alt} className="aspect-square w-full rounded-[20px] object-contain" src={qrImageUrl} />
    </div>
  );
}
