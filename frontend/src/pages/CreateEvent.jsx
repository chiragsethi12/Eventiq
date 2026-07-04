import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';
import { api } from '../services/api';
import { formatCurrency } from '../utils/formatCurrency';

const steps = [
  { id: 'details', label: 'Event details' },
  { id: 'cover', label: 'Cover image' },
  { id: 'seatmap', label: 'Seat map' },
  { id: 'tiers', label: 'Ticket tiers' },
  { id: 'review', label: 'Review' }
];

const createTier = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: '',
  price: '',
  seatCount: ''
});

const parseBlockedSeats = (value) =>
  value
    .split(',')
    .map((seat) => seat.trim().toUpperCase())
    .filter(Boolean)
    .filter((seat, index, seats) => seats.indexOf(seat) === index);

const normalizePositiveInteger = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : 0;
};

export default function CreateEvent() {
  const navigate = useNavigate();
  const toast = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    dateTime: '',
    venueName: '',
    venueCity: '',
    venueAddress: '',
    coverImageUrl: '',
    rows: '10',
    columns: '12',
    blockedSeatsText: '',
    tiers: [createTier()]
  });
  const [selectedCoverFile, setSelectedCoverFile] = useState(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!selectedCoverFile) {
      setCoverPreviewUrl(form.coverImageUrl);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedCoverFile);
    setCoverPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [form.coverImageUrl, selectedCoverFile]);

  const blockedSeats = useMemo(
    () => parseBlockedSeats(form.blockedSeatsText),
    [form.blockedSeatsText]
  );
  const totalSellableSeats = useMemo(() => {
    const rows = normalizePositiveInteger(form.rows);
    const columns = normalizePositiveInteger(form.columns);
    return Math.max(rows * columns - blockedSeats.length, 0);
  }, [blockedSeats.length, form.columns, form.rows]);
  const allocatedTierSeats = useMemo(
    () =>
      form.tiers.reduce((sum, tier) => sum + Math.max(0, Number(tier.seatCount || 0)), 0),
    [form.tiers]
  );
  const remainingSeats = Math.max(totalSellableSeats - allocatedTierSeats, 0);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const updateTier = (tierId, field, value) => {
    setForm((current) => ({
      ...current,
      tiers: current.tiers.map((tier) => (tier.id === tierId ? { ...tier, [field]: value } : tier))
    }));
  };

  const addTier = () => {
    setForm((current) => ({
      ...current,
      tiers: [...current.tiers, createTier()]
    }));
  };

  const removeTier = (tierId) => {
    setForm((current) => ({
      ...current,
      tiers: current.tiers.length > 1 ? current.tiers.filter((tier) => tier.id !== tierId) : current.tiers
    }));
  };

  const uploadCoverImage = async () => {
    if (!selectedCoverFile) {
      setCoverUploadError('Choose a JPEG, PNG, or WebP cover image first.');
      return false;
    }

    const payload = new FormData();
    payload.append('coverImage', selectedCoverFile);
    setIsUploadingCover(true);
    setCoverUploadError('');

    try {
      const { data } = await api.post('/api/v1/events/cover-upload', payload);
      const coverImageUrl = data?.data?.coverImageUrl || '';

      if (!coverImageUrl) {
        throw new Error('Cover image upload did not return a URL.');
      }

      setForm((current) => ({
        ...current,
        coverImageUrl
      }));
      toast.success('Cover image uploaded and ready for review.', {
        title: 'Image ready'
      });
      return true;
    } catch (requestError) {
      const message =
        requestError.response?.data?.message || requestError.message || 'Unable to upload cover image.';
      setCoverUploadError(message);
      return false;
    } finally {
      setIsUploadingCover(false);
    }
  };

  const validateStep = async () => {
    if (stepIndex === 0) {
      const requiredFields = [
        form.title,
        form.description,
        form.category,
        form.dateTime,
        form.venueName,
        form.venueCity,
        form.venueAddress
      ];

      if (requiredFields.some((field) => !String(field).trim())) {
        setSubmitError('Complete all event details before moving forward.');
        return false;
      }
    }

    if (stepIndex === 1) {
      if (!form.coverImageUrl) {
        setSubmitError('Upload a cover image before continuing.');
        return false;
      }
    }

    if (stepIndex === 2) {
      if (!normalizePositiveInteger(form.rows) || !normalizePositiveInteger(form.columns)) {
        setSubmitError('Seat map rows and columns must both be positive integers.');
        return false;
      }
    }

    if (stepIndex === 3) {
      const hasInvalidTier = form.tiers.some(
        (tier) =>
          !tier.name.trim() ||
          Number(tier.price) < 0 ||
          !normalizePositiveInteger(tier.seatCount)
      );

      if (hasInvalidTier) {
        setSubmitError('Every tier needs a name, a non-negative price, and a seat count.');
        return false;
      }

      if (allocatedTierSeats > totalSellableSeats) {
        setSubmitError('Tier seat counts cannot exceed the number of sellable seats.');
        return false;
      }
    }

    setSubmitError('');
    return true;
  };

  const goNext = async () => {
    const isValid = await validateStep();

    if (!isValid) {
      return;
    }

    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  };

  const goBack = () => {
    setSubmitError('');
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const handleSubmit = async () => {
    const isValid = await validateStep();

    if (!isValid) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      await api.post('/api/v1/events', {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        date: new Date(form.dateTime).toISOString(),
        venue: {
          name: form.venueName.trim(),
          city: form.venueCity.trim(),
          address: form.venueAddress.trim()
        },
        coverImageUrl: form.coverImageUrl,
        seatMap: {
          rows: normalizePositiveInteger(form.rows),
          columns: normalizePositiveInteger(form.columns),
          blockedSeats
        },
        ticketTiers: form.tiers.map((tier) => ({
          name: tier.name.trim(),
          price: Number(tier.price),
          seatCount: normalizePositiveInteger(tier.seatCount)
        }))
      });

      toast.success('Your event is live in the organizer dashboard.', {
        title: 'Event created'
      });
      navigate('/organizer/dashboard');
    } catch (requestError) {
      setSubmitError(requestError.response?.data?.message || 'Unable to create the event.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.34)] backdrop-blur-xl sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.34em] text-indigo-200">Organizer action</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white">Create a new event</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          Move through the event details, upload the cover image, define the seat map, assign ticket
          tiers, and review the final setup before publishing.
        </p>

        <div className="mt-8 grid gap-3 md:grid-cols-5">
          {steps.map((step, index) => (
            <div
              className={`rounded-[22px] border px-4 py-4 ${
                index === stepIndex
                  ? 'border-indigo-300/35 bg-indigo-500/12'
                  : index < stepIndex
                    ? 'border-emerald-300/20 bg-emerald-500/10'
                    : 'border-white/10 bg-white/[0.03]'
              }`}
              key={step.id}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Step {index + 1}
              </p>
              <p className="mt-2 text-sm font-semibold text-white">{step.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.3)] backdrop-blur-xl sm:p-8">
        {stepIndex === 0 ? (
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Title">
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                onChange={(event) => updateField('title', event.target.value)}
                value={form.title}
              />
            </Field>
            <Field label="Category">
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                onChange={(event) => updateField('category', event.target.value)}
                value={form.category}
              />
            </Field>
            <Field className="md:col-span-2" label="Description">
              <textarea
                className="min-h-40 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                onChange={(event) => updateField('description', event.target.value)}
                value={form.description}
              />
            </Field>
            <Field label="Date & time">
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                onChange={(event) => updateField('dateTime', event.target.value)}
                type="datetime-local"
                value={form.dateTime}
              />
            </Field>
            <Field label="Venue name">
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                onChange={(event) => updateField('venueName', event.target.value)}
                value={form.venueName}
              />
            </Field>
            <Field label="Venue city">
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                onChange={(event) => updateField('venueCity', event.target.value)}
                value={form.venueCity}
              />
            </Field>
            <Field label="Venue address">
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                onChange={(event) => updateField('venueAddress', event.target.value)}
                value={form.venueAddress}
              />
            </Field>
          </div>
        ) : null}

        {stepIndex === 1 ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <Field label="Cover image">
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="w-full rounded-2xl border border-dashed border-white/15 bg-slate-950/60 px-4 py-6 text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-indigo-500 file:px-4 file:py-2 file:font-semibold file:text-white"
                  onChange={(event) => {
                    setSelectedCoverFile(event.target.files?.[0] || null);
                    setForm((current) => ({
                      ...current,
                      coverImageUrl: ''
                    }));
                    setCoverUploadError('');
                  }}
                  type="file"
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <button
                  className="button-primary"
                  disabled={!selectedCoverFile || isUploadingCover}
                  onClick={uploadCoverImage}
                  type="button"
                >
                  {isUploadingCover ? 'Uploading...' : 'Upload cover image'}
                </button>
                {form.coverImageUrl ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100">
                    Uploaded to Cloudinary
                  </span>
                ) : null}
              </div>
              {coverUploadError ? (
                <p className="text-sm text-rose-100">{coverUploadError}</p>
              ) : (
                <p className="text-sm text-slate-400">
                  Images are uploaded through the backend with memory-only handling and a 5MB cap.
                </p>
              )}
            </div>

            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
              {coverPreviewUrl ? (
                <img alt="Event cover preview" className="aspect-[4/5] w-full rounded-[22px] object-cover" src={coverPreviewUrl} />
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-black/10 text-sm text-slate-400">
                  Choose a cover image to preview it here.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {stepIndex === 2 ? (
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Rows">
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                onChange={(event) => updateField('rows', event.target.value)}
                type="number"
                value={form.rows}
              />
            </Field>
            <Field label="Columns">
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                onChange={(event) => updateField('columns', event.target.value)}
                type="number"
                value={form.columns}
              />
            </Field>
            <Field className="md:col-span-2" label="Blocked seats">
              <textarea
                className="min-h-32 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                onChange={(event) => updateField('blockedSeatsText', event.target.value)}
                placeholder="A1, A2, B5"
                value={form.blockedSeatsText}
              />
            </Field>

            <article className="rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Sellable seats</p>
              <p className="mt-3 text-3xl font-semibold text-white">{totalSellableSeats}</p>
            </article>
            <article className="rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Blocked count</p>
              <p className="mt-3 text-3xl font-semibold text-white">{blockedSeats.length}</p>
            </article>
          </div>
        ) : null}

        {stepIndex === 3 ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
              <div className="text-sm text-slate-300">
                <p>{allocatedTierSeats} seats allocated across all ticket tiers.</p>
                <p className="mt-1 text-slate-400">
                  {remainingSeats} seats remain unassigned and will stay unavailable.
                </p>
              </div>
              <button className="button-secondary" onClick={addTier} type="button">
                Add tier
              </button>
            </div>

            {form.tiers.map((tier) => (
              <div
                className="grid gap-4 rounded-[26px] border border-white/10 bg-white/[0.03] p-5 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]"
                key={tier.id}
              >
                <Field label="Tier name">
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                    onChange={(event) => updateTier(tier.id, 'name', event.target.value)}
                    value={tier.name}
                  />
                </Field>
                <Field label="Price">
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                    min="0"
                    onChange={(event) => updateTier(tier.id, 'price', event.target.value)}
                    type="number"
                    value={tier.price}
                  />
                </Field>
                <Field label="Seat count">
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-indigo-300/35"
                    min="1"
                    onChange={(event) => updateTier(tier.id, 'seatCount', event.target.value)}
                    type="number"
                    value={tier.seatCount}
                  />
                </Field>
                <div className="flex items-end">
                  <button
                    className="w-full rounded-full border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:border-rose-200/35 hover:bg-rose-500/15"
                    onClick={() => removeTier(tier.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {stepIndex === 4 ? (
          <div className="space-y-6">
            <div className="grid gap-5 md:grid-cols-2">
              <SummaryCard label="Event" value={form.title || 'Untitled event'} />
              <SummaryCard label="Category" value={form.category || 'Category pending'} />
              <SummaryCard label="Venue" value={form.venueName || 'Venue pending'} />
              <SummaryCard label="City" value={form.venueCity || 'City pending'} />
              <SummaryCard label="Sellable seats" value={String(totalSellableSeats)} />
              <SummaryCard label="Allocated seats" value={String(allocatedTierSeats)} />
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-950/55 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Ticket tiers</p>
              <div className="mt-4 space-y-3">
                {form.tiers.map((tier) => (
                  <div
                    className="flex flex-col gap-2 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    key={tier.id}
                  >
                    <div>
                      <p className="font-semibold text-white">{tier.name || 'Untitled tier'}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {tier.seatCount || 0} seats assigned
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-white">
                      {tier.price ? formatCurrency(Number(tier.price)) : formatCurrency(0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {submitError ? (
          <div className="mt-6 rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {submitError}
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <button
            className="button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
            disabled={stepIndex === 0}
            onClick={goBack}
            type="button"
          >
            Back
          </button>

          {stepIndex < steps.length - 1 ? (
            <button className="button-primary justify-center" onClick={goNext} type="button">
              Continue
            </button>
          ) : (
            <button
              className="button-primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
              onClick={handleSubmit}
              type="button"
            >
              {isSubmitting ? 'Creating event...' : 'Submit Event'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`space-y-2 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({ label, value }) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-slate-950/55 p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
    </article>
  );
}
