import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-14rem)] max-w-3xl items-center justify-center">
      <section className="card-surface w-full text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-slate-400">
          404
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
          That page is off the lineup.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-slate-300">
          The route exists outside the current Eventiq shell. Head back to the homepage and continue from there.
        </p>
        <div className="mt-8">
          <Link className="button-primary" to="/">
            Return home
          </Link>
        </div>
      </section>
    </div>
  );
}
