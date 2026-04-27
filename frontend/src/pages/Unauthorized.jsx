import { Link } from 'react-router-dom';

export default function Unauthorized() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-14rem)] max-w-3xl items-center justify-center">
      <section className="card-surface w-full text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-amber-300">
          Unauthorized
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
          This route belongs to a different role.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-300">
          You are signed in, but this area is restricted. Eventiq is separating attendee, organizer, and admin experiences at the route layer.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <Link className="button-primary" to="/">
            Back to home
          </Link>
          <Link className="button-secondary" to="/login">
            Switch account
          </Link>
        </div>
      </section>
    </div>
  );
}
