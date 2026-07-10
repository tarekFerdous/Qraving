'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { signOut } from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase-client';
import { useAuth, clearFirebaseTokenCookie } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionDoc {
  id: string;
  orderStatus: string;
  userCounter: number;
  lastActivity?: Timestamp;
  expiresAt?: Timestamp;
  paymentDeadline?: Timestamp | null;
}

interface OrderItem {
  itemId: string;
  name: string;
  quantity: number;
  price: number;
  customizations?: unknown;
}

interface Order {
  id: string;
  companyId: string;
  branchId: string;
  tableNodeId: string;
  sessionId: string;
  items: OrderItem[];
  totalCents: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
  user: { name: string; phone: string; email?: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatRelativeTime(ts?: Timestamp): string {
  if (!ts) return '—';
  const diffMs = Date.now() - ts.toDate().getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin === 1) return '1 min ago';
  if (diffMin < 60) return `${diffMin} mins ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr === 1) return '1 hr ago';
  return `${diffHr} hrs ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManagerDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const companySlug = params.companySlug as string;
  const branchSlug = params.branchSlug as string;

  const { user, role, companyId, branchId, companySlug: authCompanySlug, loading } = useAuth();

  // Widget state
  const [activeQrCount, setActiveQrCount] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'manager') {
      router.replace(`/${companySlug}/login`);
      return;
    }
    if (authCompanySlug && authCompanySlug !== companySlug) {
      router.replace(`/${companySlug}/login`);
    }
  }, [user, role, loading, companySlug, authCompanySlug, router]);

  // Active QR codes: nodes where active === true && qrCode !== null
  useEffect(() => {
    if (!companyId) return;
    getDocs(
      query(
        collection(db, `companies/${companyId}/nodes`),
        where('active', '==', true),
        where('qrCode', '!=', null),
      ),
    ).then((snap) => setActiveQrCount(snap.size));
  }, [companyId]);

  // Real-time sessions listener
  useEffect(() => {
    if (!companyId || !branchId) return;
    const q = query(
      collection(db, `companies/${companyId}/branches/${branchId}/sessions`),
      where('orderStatus', 'in', ['building', 'payment_pending']),
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs: SessionDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SessionDoc, 'id'>),
      }));
      setSessions(docs);
    });
    return unsub;
  }, [companyId, branchId]);

  // Real-time orders listener
  useEffect(() => {
    if (!companyId || !branchId) return;
    const q = query(
      collection(db, `companies/${companyId}/branches/${branchId}/orders`),
      where('status', '==', 'pending'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs: Order[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Order, 'id'>),
      }));
      setOrders(docs);
    });
    return unsub;
  }, [companyId, branchId]);

  async function handleSignOut() {
    clearFirebaseTokenCookie();
    await signOut(auth);
    router.replace(`/${companySlug}/login`);
  }

  async function acceptOrder(orderId: string) {
    if (!companyId || !branchId) return;
    setAcceptingOrderId(orderId);
    try {
      await updateDoc(doc(db, `companies/${companyId}/branches/${branchId}/orders/${orderId}`), {
        status: 'accepted',
      });
    } finally {
      setAcceptingOrderId(null);
    }
  }

  async function rejectOrder(orderId: string) {
    if (!companyId || !branchId) return;
    setRejectingOrderId(orderId);
    try {
      await updateDoc(doc(db, `companies/${companyId}/branches/${branchId}/orders/${orderId}`), {
        status: 'rejected',
      });
    } finally {
      setRejectingOrderId(null);
    }
  }

  // Loading state
  if (loading || !user || role !== 'manager') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const companyDisplayName = capitalize(companySlug);
  const branchDisplayName = capitalize(branchSlug);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">{companyDisplayName}</h1>
            <p className="text-xs text-gray-500">{branchDisplayName}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Nav tabs */}
        <div className="max-w-4xl mx-auto px-4 flex gap-1 border-t border-gray-100">
          <span className="px-3 py-2 text-sm font-medium text-gray-900 border-b-2 border-gray-900">
            Dashboard
          </span>
          <Link
            href={`/${companySlug}/${branchSlug}/menu`}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Menu
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Branch details card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Branch Overview</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Company</p>
              <p className="text-sm font-medium text-gray-900">{companyDisplayName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Branch</p>
              <p className="text-sm font-medium text-gray-900">{branchDisplayName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Active QR Codes</p>
              <p className="text-sm font-medium text-gray-900">
                {activeQrCount === null ? '—' : activeQrCount}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <Link
              href={`/${companySlug}/${branchSlug}/menu`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              Create / Modify Menu
            </Link>
          </div>
        </div>

        {/* Active Sessions widget */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Active Sessions</h2>
            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-gray-900 text-white text-xs font-medium">
              {sessions.length}
            </span>
          </div>

          {sessions.length === 0 ? (
            <p className="text-sm text-gray-400">No active sessions right now.</p>
          ) : (
            <ul className="space-y-3">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex items-center justify-between py-3 px-3 rounded-xl bg-gray-50 border border-gray-100"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 font-mono">{session.id}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {session.userCounter ?? 0} member{session.userCounter !== 1 ? 's' : ''}
                      {' · '}
                      {formatRelativeTime(session.lastActivity)}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      session.orderStatus === 'payment_pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {session.orderStatus === 'payment_pending' ? 'Paying' : 'Ordering'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Incoming Orders widget */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Incoming Orders</h2>
            {orders.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-red-500 text-white text-xs font-medium">
                {orders.length}
              </span>
            )}
          </div>

          {orders.length === 0 ? (
            <p className="text-sm text-gray-400">No pending orders.</p>
          ) : (
            <ul className="space-y-4">
              {orders.map((order) => {
                const tableName = order.tableNodeId || order.sessionId || order.id;
                const itemCount = order.items?.reduce((sum, i) => sum + (i.quantity ?? 1), 0) ?? 0;
                return (
                  <li
                    key={order.id}
                    className="rounded-xl border border-gray-200 overflow-hidden"
                  >
                    {/* Order header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <div>
                        <p className="text-sm font-medium text-gray-900 font-mono">{tableName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {order.user?.name || 'Guest'} · {order.user?.phone || '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatCents(order.totalCents ?? 0)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {itemCount} item{itemCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Items list */}
                    <ul className="divide-y divide-gray-100">
                      {(order.items ?? []).map((item, idx) => (
                        <li key={idx} className="px-4 py-2 flex items-center justify-between">
                          <span className="text-sm text-gray-700">
                            {item.quantity}× {item.name}
                          </span>
                          <span className="text-sm text-gray-500">
                            {formatCents((item.price ?? 0) * item.quantity)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* Actions */}
                    <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
                      <button
                        onClick={() => acceptOrder(order.id)}
                        disabled={acceptingOrderId === order.id || rejectingOrderId === order.id}
                        className="flex-1 rounded-lg bg-gray-900 text-white py-2 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        {acceptingOrderId === order.id ? 'Accepting…' : 'Accept'}
                      </button>
                      <button
                        onClick={() => rejectOrder(order.id)}
                        disabled={acceptingOrderId === order.id || rejectingOrderId === order.id}
                        className="flex-1 rounded-lg border border-red-200 text-red-600 py-2 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {rejectingOrderId === order.id ? 'Rejecting…' : 'Reject'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
