export function PageShell({ eyebrow, title, description, children, aside }) {
  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.38em] text-indigo-300">
            {eyebrow}
          </p>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {title}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              {description}
            </p>
          </div>
        </div>
        {children}
      </div>

      {aside ? (
        <aside className="card-surface h-fit space-y-4">
          {aside}
        </aside>
      ) : null}
    </section>
  );
}

export function StatGrid({ items }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <article key={item.label} className="card-surface space-y-2">
          <p className="text-sm text-slate-400">{item.label}</p>
          <p className="text-3xl font-semibold tracking-tight text-white">{item.value}</p>
          <p className="text-sm text-slate-300">{item.caption}</p>
        </article>
      ))}
    </div>
  );
}

export function InfoCard({ title, description, action }) {
  return (
    <article className="card-surface flex flex-col gap-4">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="text-sm leading-6 text-slate-300">{description}</p>
      </div>
      {action}
    </article>
  );
}
