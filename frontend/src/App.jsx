import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import { requestTokenRefresh } from './services/api';
import { logout, setCredentials, setLoading } from './store/authSlice';

const EventDetail = lazy(() => import('./pages/EventDetail'));
const Checkout = lazy(() => import('./pages/Checkout'));
const BookingConfirmation = lazy(() => import('./pages/BookingConfirmation'));
const MyTickets = lazy(() => import('./pages/MyTickets'));
const TicketView = lazy(() => import('./pages/TicketView'));
const OrganizerDashboard = lazy(() => import('./pages/OrganizerDashboard'));
const CreateEvent = lazy(() => import('./pages/CreateEvent'));
const QRScanner = lazy(() => import('./pages/QRScanner'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Unauthorized = lazy(() => import('./pages/Unauthorized'));
const NotFound = lazy(() => import('./pages/NotFound'));

function AppBootSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f13] px-6">
      <div className="card-surface max-w-md text-center">
        <div className="mx-auto mb-6 h-14 w-14 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_18px_45px_rgba(99,102,241,0.35)]" />
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-indigo-300">
          Eventiq
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-white">Restoring your session</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Checking the refresh-backed session before the app shell loads.
        </p>
      </div>
    </div>
  );
}

function RouteTransitionFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="card-surface max-w-md text-center">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_18px_45px_rgba(99,102,241,0.28)]" />
        <h2 className="mt-5 text-2xl font-semibold text-white">Loading your next step</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Pulling in the page code only when it&apos;s needed keeps Eventiq fast on first load.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const dispatch = useDispatch();
  const accessToken = useSelector((state) => state.auth.accessToken);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const bootstrapAuth = async () => {
      if (accessToken) {
        if (isMounted) {
          setIsReady(true);
        }
        return;
      }

      dispatch(setLoading(true));

      try {
        const authData = await requestTokenRefresh();

        if (!isMounted) {
          return;
        }

        dispatch(
          setCredentials({
            user: authData.user,
            accessToken: authData.accessToken
          })
        );
      } catch (_error) {
        if (isMounted) {
          dispatch(logout());
        }
      } finally {
        if (isMounted) {
          dispatch(setLoading(false));
          setIsReady(true);
        }
      }
    };

    bootstrapAuth();

    return () => {
      isMounted = false;
    };
  }, [accessToken, dispatch]);

  if (!isReady) {
    return <AppBootSplash />;
  }

  return (
    <Suspense fallback={<RouteTransitionFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          <Route element={<ProtectedRoute role="attendee" />}>
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/my-tickets" element={<MyTickets />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/booking/confirmation" element={<BookingConfirmation />} />
            <Route path="/booking/confirmation/:bookingId" element={<BookingConfirmation />} />
            <Route path="/tickets/:bookingId" element={<TicketView />} />
          </Route>

          <Route element={<ProtectedRoute role="organizer" />}>
            <Route path="/organizer/dashboard" element={<OrganizerDashboard />} />
            <Route path="/organizer/events/create" element={<CreateEvent />} />
            <Route path="/organizer/scan" element={<QRScanner />} />
          </Route>

          <Route element={<ProtectedRoute role="admin" />}>
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
