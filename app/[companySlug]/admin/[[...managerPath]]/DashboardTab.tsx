'use client';

import { useState, useEffect } from 'react';
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
import { db } from '@/lib/firebase-client';
import { isSessionClosed, type Session, type UserBasket } from '@/lib/session';
import { resetSessionInFirestore } from '@/lib/session-reset';

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

interface DashboardTabProps {
  companyId: string;
  branchId: string;
  companyName: string;
  branchName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardTab({ companyId, branchId, companyName, branchName }: DashboardTabProps) {
  // Widget state
  const [activeQrCount, setActiveQrCount] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [freeingSessionId, setFreeingSessionId] = useState<string | null>(null);

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
      where('orderStatus', 'in', ['building', 'payment_pending', 'fully_paid']),
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

  // Manual staff override (#163): force-close a session that was abandoned before
  // payment completed, so the table can be reused without waiting on the 30-minute
  // inactivity expiry. As of #200 this performs a genuine session reset (via the
  // shared #198 resetSessionInFirestore helper) instead of writing
  // orderStatus: 'submitted' directly — the old approach made the public menu page
  // show "Your basket will be ready soon" for a table that never actually paid, and
  // never touched baskets/counters/payment plan at all. The confirm() gate runs
  // before setFreeingSessionId is set, so cancelling leaves no stuck spinner and
  // performs no Firestore reads/writes.
  async function freeTable(sessionId: string) {
    if (!companyId || !branchId) return;
    const confirmed = window.confirm(
      'Free this table? This clears all baskets and cancels any in-progress payment for the table. This cannot be undone.',
    );
    if (!confirmed) return;

    setFreeingSessionId(sessionId);
    try {
      const basketsSnap = await getDocs(
        collection(db, `companies/${companyId}/branches/${branchId}/sessions/${sessionId}/baskets`),
      );
      const baskets: UserBasket[] = basketsSnap.docs.map((d) => ({
        userId: d.id,
        ...(d.data() as Omit<UserBasket, 'userId'>),
      }));
      await resetSessionInFirestore(companyId, branchId, sessionId, baskets);
    } finally {
      setFreeingSessionId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Branch details card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Branch Overview</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Company</p>
            <p className="text-sm font-medium text-gray-900">{companyName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Branch</p>
            <p className="text-sm font-medium text-gray-900">{branchName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Active QR Codes</p>
            <p className="text-sm font-medium text-gray-900">
              {activeQrCount === null ? '—' : activeQrCount}
            </p>
          </div>
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
            {sessions.map((session) => {
              // Reuse #159's exact closed-session definition (orderStatus === 'submitted')
              // to decide whether Free Table is still offered for this session.
              const sessionIsClosed = isSessionClosed({ orderStatus: session.orderStatus } as Session);
              return (
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
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        session.orderStatus === 'payment_pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : session.orderStatus === 'fully_paid'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {session.orderStatus === 'payment_pending'
                        ? 'Paying'
                        : session.orderStatus === 'fully_paid'
                          ? 'Paid'
                          : 'Ordering'}
                    </span>
                    {!sessionIsClosed && (
                      <button
                        onClick={() => freeTable(session.id)}
                        disabled={freeingSessionId === session.id}
                        className="rounded-lg border border-gray-300 text-gray-700 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
                      >
                        {freeingSessionId === session.id ? 'Freeing…' : 'Free the table'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
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
                <li key={order.id} className="rounded-xl border border-gray-200 overflow-hidden">
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
    </div>
  );
}
