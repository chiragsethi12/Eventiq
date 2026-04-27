import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function AppLayout() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0f0f13] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-[-12rem] h-[28rem] bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.28),transparent_52%)]" />
        <div className="absolute right-[-8rem] top-1/4 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute left-[-10rem] bottom-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:96px_96px] opacity-25" />
      </div>

      <div className="relative z-10">
        <Navbar />
        <main className="mx-auto min-h-[calc(100vh-88px)] w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
