import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { formatCurrency } from '../utils/formatCurrency';
import { formatDate } from '../utils/formatDate';

const roleOptions = ['attendee', 'organizer', 'admin'];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingRoleUserId, setPendingRoleUserId] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      try {
        const [statsResponse, usersResponse] = await Promise.all([
          api.get('/admin/stats'),
          api.get('/admin/users')
        ]);

        if (isMounted) {
          setStats(statsResponse.data?.data?.stats || null);
          setUsers(usersResponse.data?.data?.users || []);
          setPagination(usersResponse.data?.data?.pagination || null);
          setError('');
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'Unable to load the admin dashboard.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const statCards = useMemo(
    () =>
      stats
        ? [
            { label: 'Total users', value: stats.totalUsers },
            { label: 'Total events', value: stats.totalEvents },
            { label: 'Total bookings', value: stats.totalBookings },
            { label: 'Total revenue', value: formatCurrency(stats.totalRevenue) }
          ]
        : [],
    [stats]
  );

  const handleRoleChange = async (userId, role) => {
    setPendingRoleUserId(userId);

    try {
      const { data } = await api.patch(`/admin/users/${userId}/role`, { role });
      const updatedUser = data?.data?.user;

      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === userId ? { ...user, ...updatedUser } : user))
      );
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update the user role.');
    } finally {
      setPendingRoleUserId('');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteCandidate) {
      return;
    }

    try {
      await api.delete(`/admin/users/${deleteCandidate.id}`);

      setUsers((currentUsers) => currentUsers.filter((user) => user.id !== deleteCandidate.id));
      setStats((currentStats) =>
        currentStats
          ? {
              ...currentStats,
              totalUsers: Math.max(0, currentStats.totalUsers - 1)
            }
          : currentStats
      );
      setDeleteCandidate(null);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete the selected user.');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.34)] backdrop-blur-xl sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.34em] text-rose-200">Admin control</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white">Platform dashboard</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          Manage user roles, remove accounts when necessary, and keep an eye on the latest confirmed
          revenue across the full Eventiq platform.
        </p>
      </section>

      {error ? (
        <div className="rounded-[28px] border border-rose-400/20 bg-rose-500/10 p-5 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <div
                className="h-36 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]"
                key={index}
              />
            ))
          : statCards.map((card) => (
              <article
                className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl"
                key={card.label}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  {card.label}
                </p>
                <p className="mt-4 text-3xl font-semibold text-white">{card.value}</p>
              </article>
            ))}
      </section>

      <section className="overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] shadow-[0_24px_80px_rgba(2,6,23,0.34)] backdrop-blur-xl">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-rose-200">Users</p>
          <p className="mt-2 text-sm text-slate-400">
            {pagination ? `${pagination.total} users currently in the first page of results.` : 'User directory'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-black/10">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-sm text-slate-200">
              {isLoading ? (
                <tr>
                  <td className="px-6 py-8 text-slate-400" colSpan="5">
                    Loading users...
                  </td>
                </tr>
              ) : users.length > 0 ? (
                users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-5 font-semibold text-white">{user.name}</td>
                    <td className="px-6 py-5 text-slate-300">{user.email}</td>
                    <td className="px-6 py-5">
                      <select
                        className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none transition focus:border-rose-300/35"
                        disabled={pendingRoleUserId === user.id}
                        onChange={(event) => handleRoleChange(user.id, event.target.value)}
                        value={user.role}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-5 text-slate-300">
                      {formatDate(user.createdAt, { dateStyle: 'medium' })}
                    </td>
                    <td className="px-6 py-5">
                      <button
                        className="rounded-full border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:border-rose-200/40 hover:bg-rose-500/15"
                        onClick={() => setDeleteCandidate(user)}
                        type="button"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-6 py-8 text-slate-400" colSpan="5">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.34)] backdrop-blur-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-rose-200">Recent bookings</p>
        <div className="mt-5 space-y-3">
          {stats?.recentBookings?.length ? (
            stats.recentBookings.map((booking) => (
              <div
                className="flex flex-col gap-3 rounded-[24px] border border-white/10 bg-slate-950/55 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                key={booking.id}
              >
                <div>
                  <p className="font-semibold text-white">{booking.eventTitle || 'Untitled event'}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {booking.userName || 'Attendee'} • {formatDate(booking.createdAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })}
                  </p>
                </div>
                <p className="text-lg font-semibold text-white">{formatCurrency(booking.totalAmount)}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">No confirmed bookings yet.</p>
          )}
        </div>
      </section>

      {deleteCandidate ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 px-6">
          <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-slate-950 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.5)]">
            <p className="text-xl font-semibold text-white">Delete user?</p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              This will remove {deleteCandidate.name} from Eventiq. You can close this dialog if you
              want to keep the account.
            </p>
            <div className="mt-6 flex gap-3">
              <button className="button-secondary flex-1 justify-center" onClick={() => setDeleteCandidate(null)} type="button">
                Cancel
              </button>
              <button
                className="flex-1 rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-400"
                onClick={handleDeleteUser}
                type="button"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
