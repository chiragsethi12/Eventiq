import { useDeferredValue, useEffect, useMemo, useState, useTransition } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import EventCard from '../components/EventCard';
import { fetchEvents } from '../store/eventSlice';
import { EVENT_CATEGORIES, normalizeCategory } from '../utils/eventPresentation';

const defaultFilters = {
  city: '',
  category: 'all',
  dateFrom: '',
  dateTo: '',
  search: ''
};

function HomeSkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.04]">
      <div className="aspect-[4/3] animate-pulse bg-white/[0.06]" />
      <div className="space-y-3 p-5">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="h-7 w-5/6 animate-pulse rounded-full bg-white/[0.08]" />
        <div className="h-4 w-1/2 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
    </div>
  );
}

export default function Home() {
  const dispatch = useDispatch();
  const { events, isLoading, error, pagination } = useSelector((state) => state.event);
  const [filters, setFilters] = useState(defaultFilters);
  const [isPending, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(filters.search);

  useEffect(() => {
    dispatch(
      fetchEvents({
        limit: 12,
        city: filters.city,
        category: filters.category,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo
      })
    );
  }, [dispatch, filters.category, filters.city, filters.dateFrom, filters.dateTo]);

  const filteredEvents = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    if (!query) {
      return events;
    }

    return events.filter((event) => {
      const haystack = [
        event.title,
        event.description,
        event.category,
        event?.venue?.city,
        event?.venue?.name
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [deferredSearch, events]);

  const cityOptions = useMemo(() => {
    const cities = new Set(events.map((event) => event?.venue?.city).filter(Boolean));
    return [...cities].sort((left, right) => left.localeCompare(right));
  }, [events]);

  const updateFilter = (key, value) => {
    startTransition(() => {
      setFilters((current) => ({
        ...current,
        [key]: value
      }));
    });
  };

  const handleLoadMore = () => {
    if (!pagination.hasMore || isLoading) {
      return;
    }

    dispatch(
      fetchEvents({
        append: true,
        cursor: pagination.cursor,
        limit: 12,
        city: filters.city,
        category: filters.category,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo
      })
    );
  };

  return (
    <div className="space-y-8">
      <section className="-mx-4 overflow-hidden border-y border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.22),transparent_26%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.88),rgba(3,7,18,0.98))] px-4 py-10 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 lg:py-14">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end">
          <div className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-cyan-200">
              Browse live drops
            </p>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">
                Find &amp; Book Amazing Events
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Search cinematic live experiences, sharpen your filters, and lock seats before the room shifts beneath you.
              </p>
            </div>

            <label className="group flex items-center gap-3 rounded-[28px] border border-white/10 bg-black/25 px-5 py-4 shadow-[0_24px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl transition focus-within:border-cyan-300/40">
              <span className="text-slate-400">⌕</span>
              <input
                className="w-full bg-transparent text-base text-white outline-none placeholder:text-slate-500"
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder="Search by title, city, venue, or category"
                value={filters.search}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Curated now</p>
              <p className="mt-4 text-3xl font-semibold text-white">{events.length}</p>
              <p className="mt-2 text-sm text-slate-300">events loaded into the browse surface</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Signal speed</p>
              <p className="mt-4 text-3xl font-semibold text-white">Live</p>
              <p className="mt-2 text-sm text-slate-300">seat availability continues on the detail page</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Browse mode</p>
              <p className="mt-4 text-3xl font-semibold text-white">Dark</p>
              <p className="mt-2 text-sm text-slate-300">poster-led listings tuned for night launches</p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-4 rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_220px_220px]">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">City</span>
              <select
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/35"
                onChange={(event) => updateFilter('city', event.target.value)}
                value={filters.city}
              >
                <option value="">All cities</option>
                {cityOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Category</span>
              <div className="flex flex-wrap gap-2">
                <button
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    filters.category === 'all'
                      ? 'bg-white text-slate-950'
                      : 'border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20'
                  }`}
                  onClick={() => updateFilter('category', 'all')}
                  type="button"
                >
                  All
                </button>
                {EVENT_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition ${
                      filters.category === category
                        ? 'bg-cyan-200 text-slate-950'
                        : 'border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20'
                    }`}
                    onClick={() => updateFilter('category', normalizeCategory(category))}
                    type="button"
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">From</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/35"
                onChange={(event) => updateFilter('dateFrom', event.target.value)}
                type="date"
                value={filters.dateFrom}
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">To</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/35"
                onChange={(event) => updateFilter('dateTo', event.target.value)}
                type="date"
                value={filters.dateTo}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-slate-300">
              {filteredEvents.length} matching events
              {isPending ? ' · updating filters' : ''}
            </p>
            <button
              className="rounded-full border border-white/10 px-4 py-2 font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/5"
              onClick={() => setFilters(defaultFilters)}
              type="button"
            >
              Reset filters
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-[26px] border border-rose-400/25 bg-rose-500/10 p-5 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && events.length === 0
            ? Array.from({ length: 6 }, (_, index) => <HomeSkeletonCard key={index} />)
            : filteredEvents.map((event) => <EventCard event={event} key={event._id} />)}
        </div>

        {!isLoading && filteredEvents.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-10 text-center">
            <p className="text-lg font-semibold text-white">No events match those filters yet.</p>
            <p className="mt-2 text-sm text-slate-400">Try clearing a category, date, or search term to widen the browse window.</p>
          </div>
        ) : null}

        {pagination.hasMore ? (
          <div className="flex justify-center pt-2">
            <button className="button-secondary" disabled={isLoading} onClick={handleLoadMore} type="button">
              {isLoading && events.length > 0 ? 'Loading more…' : 'Load More'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
