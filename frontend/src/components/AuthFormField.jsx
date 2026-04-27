export default function AuthFormField({
  label,
  type = 'text',
  error,
  registration,
  rightElement,
  ...props
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <div className="relative">
        <input
          className={[
            'w-full rounded-2xl border bg-white/5 px-4 py-3.5 text-base text-white outline-none transition placeholder:text-slate-500',
            error
              ? 'border-rose-400/70 focus:border-rose-400'
              : 'border-white/10 focus:border-indigo-400'
          ].join(' ')}
          type={type}
          {...registration}
          {...props}
        />
        {rightElement ? (
          <div className="absolute inset-y-0 right-3 flex items-center">
            {rightElement}
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </label>
  );
}
