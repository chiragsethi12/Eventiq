const legendItems = [
  {
    label: 'Available',
    swatch: 'border-emerald-300/35 bg-emerald-500/15 text-emerald-50',
    icon: 'Open'
  },
  {
    label: 'Your Selection',
    swatch: 'border-indigo-300/45 bg-indigo-500/22 text-indigo-50',
    icon: 'Held'
  },
  {
    label: 'Reserved by Others',
    swatch: 'border-amber-300/35 bg-amber-400/18 text-amber-50',
    icon: 'Lock'
  },
  {
    label: 'Sold',
    swatch: 'border-slate-500/35 bg-slate-500/18 text-slate-100',
    icon: 'X'
  }
];

export default function SeatLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-200">
      {legendItems.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-2"
        >
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold uppercase tracking-[0.14em] ${item.swatch}`}
          >
            {item.icon}
          </span>
          <span className="font-medium text-slate-200">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
