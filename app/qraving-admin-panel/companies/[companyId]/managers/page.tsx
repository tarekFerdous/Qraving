'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import type { CompanyNode } from '@/lib/company';

interface Manager {
  uid: string;
  email: string;
  branchId: string;
  active: boolean;
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function ManagersPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [branches, setBranches] = useState<CompanyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createdPassword, setCreatedPassword] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/companies/${companyId}/managers`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json() as { managers: Manager[]; branches: CompanyNode[] };
    setManagers(data.managers);
    setBranches(data.branches);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  function handleAutoGenerate() {
    const newPassword = generatePassword();
    setPassword(newPassword);
    setAutoGenerate(true);
    setShowPassword(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);

    const res = await fetch(`/api/admin/companies/${companyId}/managers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, branchId }),
    });

    const data = await res.json() as { uid?: string; error?: string };

    if (!res.ok) {
      setError(data.error ?? 'Failed to create manager.');
      setCreating(false);
      return;
    }

    if (autoGenerate) {
      setCreatedPassword(password);
    }
    setEmail('');
    setPassword('');
    setBranchId('');
    setAutoGenerate(false);
    setShowForm(false);
    setCreating(false);
    await load();
  }

  async function handleDeactivate(uid: string, active: boolean) {
    const action = active ? 'deactivate' : 'reactivate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this manager?`)) return;

    await fetch(`/api/admin/companies/${companyId}/managers/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ active: !active }),
    });

    await load();
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/qraving-admin-panel/companies/${companyId}`} className="text-sm text-gray-400 hover:text-gray-600">
            ← Company
          </Link>
          <h1 className="text-xl font-semibold text-gray-900 mt-1">Managers</h1>
        </div>
        <button
          onClick={() => { setShowForm(true); setCreatedPassword(''); }}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          + New Manager
        </button>
      </div>

      {createdPassword && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-sm font-medium text-green-800 mb-1">Manager created. Save this password — it won&apos;t be shown again:</p>
          <code className="text-sm text-green-900 font-mono bg-green-100 px-2 py-1 rounded">{createdPassword}</code>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">New Manager Account</h3>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="manager@venue.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setAutoGenerate(false); }}
                      required
                      placeholder="Enter password"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoGenerate}
                    className="shrink-0 px-2.5 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1"
                  >
                    <RefreshCw size={12} />
                    Auto
                  </button>
                </div>
                {autoGenerate && (
                  <p className="mt-1 text-xs text-amber-600">Auto-generated — save this password before creating.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Assign to branch</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                >
                  <option value="">Select branch…</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(''); }}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-60"
                >
                  {creating ? 'Creating…' : 'Create manager'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {managers.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500">
          <p className="text-sm">No managers yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {managers.map((m) => {
            const branch = branches.find((b) => b.id === m.branchId);
            return (
              <div key={m.uid} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {branch ? branch.label : m.branchId}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${m.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {m.active ? 'Active' : 'Deactivated'}
                  </span>
                  <button
                    onClick={() => handleDeactivate(m.uid, m.active)}
                    className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    {m.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
