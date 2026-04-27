import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../services/api';
import { logout } from '../store/authSlice';

const linkClassName = ({ isActive }) =>
  [
    'rounded-full px-4 py-2 text-sm font-medium transition',
    isActive
      ? 'bg-white/12 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.1)]'
      : 'text-slate-300 hover:bg-white/8 hover:text-white'
  ].join(' ');

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, accessToken } = useSelector((state) => state.auth);

  const closeMenu = () => {
    setIsOpen(false);
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (_error) {
      // Even if the server-side revoke fails, the client should exit the session.
    } finally {
      dispatch(logout());
      closeMenu();
      navigate('/');
    }
  };

  const navLinks = [
    { to: '/', label: 'Browse Events', show: true },
    { to: '/my-tickets', label: 'My Tickets', show: user?.role === 'attendee' },
    {
      to: user?.role === 'admin' ? '/admin' : '/organizer/dashboard',
      label: 'Dashboard',
      show: user?.role === 'organizer' || user?.role === 'admin'
    }
  ].filter((item) => item.show);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <NavLink
          className="flex items-center gap-3"
          to="/"
          onClick={closeMenu}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-lg font-black text-white shadow-[0_0_30px_rgba(99,102,241,0.45)]">
            E
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight text-white">Eventiq</p>
            <p className="text-xs uppercase tracking-[0.32em] text-slate-400">
              Live experiences
            </p>
          </div>
        </NavLink>

        <button
          aria-expanded={isOpen}
          aria-label="Toggle navigation menu"
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100 transition hover:border-white/20 hover:bg-white/10 lg:hidden"
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          <span className="space-y-1.5">
            <span className="block h-0.5 w-5 rounded-full bg-current" />
            <span className="block h-0.5 w-5 rounded-full bg-current" />
            <span className="block h-0.5 w-5 rounded-full bg-current" />
          </span>
        </button>

        <div
          className={[
            'absolute inset-x-4 top-full mt-3 rounded-3xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl lg:static lg:mt-0 lg:flex lg:flex-1 lg:items-center lg:justify-between lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none',
            isOpen ? 'block' : 'hidden lg:flex'
          ].join(' ')}
        >
          <nav className="flex flex-col gap-2 lg:mx-auto lg:flex-row lg:items-center">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                className={linkClassName}
                to={link.to}
                onClick={closeMenu}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 lg:mt-0 lg:flex-row lg:items-center lg:border-t-0 lg:pt-0">
            {accessToken && user ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-sm font-semibold text-white">{user.name}</p>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    {user.role}
                  </p>
                </div>
                <button
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-indigo-400/40 hover:bg-indigo-500/15"
                  onClick={handleLogout}
                  type="button"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <NavLink
                  className="rounded-full border border-white/10 px-5 py-2.5 text-center text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/5"
                  to="/login"
                  onClick={closeMenu}
                >
                  Login
                </NavLink>
                <NavLink
                  className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2.5 text-center text-sm font-semibold text-white shadow-[0_16px_40px_rgba(99,102,241,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_46px_rgba(99,102,241,0.36)]"
                  to="/register"
                  onClick={closeMenu}
                >
                  Register
                </NavLink>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
