import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import AuthFormField from '../components/AuthFormField';
import { api } from '../services/api';
import { setCredentials, setError, setLoading } from '../store/authSlice';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isLoading, error } = useSelector((state) => state.auth);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    defaultValues: {
      email: '',
      password: ''
    }
  });

  const redirectTarget = useMemo(() => {
    const redirectFromState = location.state?.from;

    if (redirectFromState?.pathname) {
      return `${redirectFromState.pathname}${redirectFromState.search || ''}${redirectFromState.hash || ''}`;
    }

    return searchParams.get('redirect') || '/';
  }, [location.state, searchParams]);

  const onSubmit = handleSubmit(async (values) => {
    dispatch(setLoading(true));
    dispatch(setError(null));

    try {
      const response = await api.post('/api/v1/auth/login', values);
      const authData = response.data?.data;

      dispatch(
        setCredentials({
          user: authData.user,
          accessToken: authData.accessToken
        })
      );

      navigate(redirectTarget, { replace: true });
    } catch (submitError) {
      dispatch(
        setError(
          submitError.response?.data?.message ||
            submitError.response?.data?.error ||
            'Unable to log in with those credentials.'
        )
      );
    } finally {
      dispatch(setLoading(false));
    }
  });

  return (
    <div className="mx-auto grid min-h-[calc(100vh-11rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-6">
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-indigo-300">
          Welcome back
        </p>
        <div className="space-y-4">
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Sign in to keep checkout, tickets, and event ops moving.
          </h1>
          <p className="max-w-lg text-base leading-7 text-slate-300">
            Eventiq keeps the active access token in Redux memory and relies on the secure refresh cookie behind the scenes, so your auth flow stays sharp without leaking session state into browser storage.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Role-aware routes', 'Attendee, organizer, and admin access stays separated.'],
            ['Fast recovery', 'Expired access tokens refresh once and retry automatically.'],
            ['Focused design', 'Dark surfaces, clear hierarchy, and minimal noise.']
          ].map(([title, body]) => (
            <article key={title} className="card-surface">
              <h2 className="text-sm font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card-surface w-full max-w-xl justify-self-center p-8 sm:p-10">
        <div className="mb-8 space-y-2">
          <h2 className="text-3xl font-semibold text-white">Login</h2>
          <p className="text-sm text-slate-300">
            Enter your account details to continue.
          </p>
        </div>

        <form className="space-y-5" onSubmit={onSubmit}>
          <AuthFormField
            autoComplete="email"
            error={errors.email?.message}
            label="Email"
            placeholder="you@example.com"
            registration={register('email', {
              required: 'Email is required.',
              pattern: {
                value: emailPattern,
                message: 'Enter a valid email address.'
              }
            })}
            type="email"
          />

          <AuthFormField
            autoComplete="current-password"
            error={errors.password?.message}
            label="Password"
            placeholder="Enter your password"
            registration={register('password', {
              required: 'Password is required.',
              minLength: {
                value: 8,
                message: 'Password must be at least 8 characters.'
              }
            })}
            rightElement={
              <button
                className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 transition hover:text-white"
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            }
            type={showPassword ? 'text' : 'password'}
          />

          {error ? (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <button className="button-primary w-full justify-center" disabled={isLoading} type="submit">
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-300">
          Need an account?{' '}
          <Link className="font-semibold text-indigo-300 hover:text-indigo-200" to="/register">
            Create one here
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
