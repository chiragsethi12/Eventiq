import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import AuthFormField from '../components/AuthFormField';
import { api } from '../services/api';
import { setCredentials, setError, setLoading } from '../store/authSlice';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isLoading, error } = useSelector((state) => state.auth);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: ''
    }
  });

  const passwordValue = watch('password');

  const onSubmit = handleSubmit(async ({ confirmPassword, ...values }) => {
    dispatch(setLoading(true));
    dispatch(setError(null));

    try {
      const response = await api.post('/api/v1/auth/register', values);
      const authData = response.data?.data;

      dispatch(
        setCredentials({
          user: authData.user,
          accessToken: authData.accessToken
        })
      );

      navigate('/', { replace: true });
    } catch (submitError) {
      dispatch(
        setError(
          submitError.response?.data?.message ||
            submitError.response?.data?.error ||
            'Unable to create your account right now.'
        )
      );
    } finally {
      dispatch(setLoading(false));
    }
  });

  return (
    <div className="mx-auto grid min-h-[calc(100vh-11rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="space-y-6">
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-indigo-300">
          New account
        </p>
        <div className="space-y-4">
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Join Eventiq and step into a sharper ticketing flow.
          </h1>
          <p className="max-w-lg text-base leading-7 text-slate-300">
            Registration defaults to the attendee role, keeps sensitive session state out of browser storage, and drops you directly into the live product shell after success.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <article className="card-surface">
            <h2 className="text-lg font-semibold text-white">Why this setup works</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              The access token lives only in Redux memory, while refresh stays in the backend-set cookie, which is a safer default for a browser client.
            </p>
          </article>
          <article className="card-surface">
            <h2 className="text-lg font-semibold text-white">Ready for scale</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              The auth shell is already aligned to attendee, organizer, and admin route boundaries so the product can grow without reworking its foundations.
            </p>
          </article>
        </div>
      </section>

      <section className="card-surface w-full max-w-xl justify-self-center p-8 sm:p-10">
        <div className="mb-8 space-y-2">
          <h2 className="text-3xl font-semibold text-white">Register</h2>
          <p className="text-sm text-slate-300">
            Create an attendee account to start browsing, booking, and managing tickets.
          </p>
        </div>

        <form className="space-y-5" onSubmit={onSubmit}>
          <AuthFormField
            autoComplete="name"
            error={errors.name?.message}
            label="Full name"
            placeholder="Akshat Shah"
            registration={register('name', {
              required: 'Name is required.',
              minLength: {
                value: 2,
                message: 'Name must be at least 2 characters.'
              }
            })}
          />

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
            autoComplete="new-password"
            error={errors.password?.message}
            label="Password"
            placeholder="Create a password"
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

          <AuthFormField
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            label="Confirm password"
            placeholder="Re-enter your password"
            registration={register('confirmPassword', {
              required: 'Please confirm your password.',
              validate: (value) =>
                value === passwordValue || 'Passwords do not match.'
            })}
            type={showPassword ? 'text' : 'password'}
          />

          {error ? (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <button className="button-primary w-full justify-center" disabled={isLoading} type="submit">
            {isLoading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-300">
          Already have an account?{' '}
          <Link className="font-semibold text-indigo-300 hover:text-indigo-200" to="/login">
            Sign in
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
