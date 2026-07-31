'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { doc, collection, onSnapshot, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Session, UserBasket, createSession } from '@/lib/session';
import { resetSessionInFirestore } from '@/lib/session-reset';

interface SessionContextValue {
  session: Session;
  updateSession: (s: Session) => void;
  isExpired: boolean;
  resetSession: () => void;
  /** True when Firestore reports fewer basket items than the previous snapshot,
   *  and the change was not triggered by the local user. */
  itemsRemovedExternally: boolean;
  /** Call this after consuming the flag (e.g. after showing the toast). */
  clearItemsRemovedExternally: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  company,
  branch,
  table,
  children,
}: {
  company: string;
  branch: string;
  table: string;
  children: ReactNode;
}) {
  const sessionDoc = `companies/${company}/branches/${branch}/sessions/${table}`;
  const basketsCol = `${sessionDoc}/baskets`;

  const [session, setSession] = useState<Session>(() => createSession(table));
  const [isExpired, setIsExpired] = useState(false);
  const [itemsRemovedExternally, setItemsRemovedExternally] = useState(false);

  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks the total number of basket items seen in the last Firestore snapshot.
  // Initialised to -1 so the very first snapshot never triggers the toast.
  const prevItemCountRef = useRef<number>(-1);

  // When the local user calls updateSession we suppress the toast for 1.5 s so
  // that the echo of our own writes doesn't look like an external removal.
  const suppressUntilRef = useRef<number>(0);

  useEffect(() => {
    const sessionRef = doc(db, sessionDoc);
    const basketsRef = collection(db, basketsCol);

    const unsubSession = onSnapshot(sessionRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      if (data.expiresAt instanceof Timestamp) {
        const expiresAtMs = data.expiresAt.toMillis();
        const msUntilExpiry = expiresAtMs - Date.now();
        if (expiryTimer.current) clearTimeout(expiryTimer.current);
        if (msUntilExpiry <= 0) {
          setIsExpired(true);
        } else {
          expiryTimer.current = setTimeout(() => setIsExpired(true), msUntilExpiry);
        }
      }

      setSession((prev) => ({
        ...prev,
        userCounter: data.userCounter ?? prev.userCounter,
        orderStatus: data.orderStatus ?? prev.orderStatus,
        paymentDeadline:
          data.paymentDeadline instanceof Timestamp
            ? data.paymentDeadline.toDate().toISOString()
            : (data.paymentDeadline as string | null) ?? null,
        paymentPlan: (data.paymentPlan as Session['paymentPlan'] | undefined) ?? null,
      }));
    });

    const unsubBaskets = onSnapshot(basketsRef, (snap) => {
      const baskets: UserBasket[] = snap.docs.map((d) => ({
        userId: d.id,
        ...(d.data() as Omit<UserBasket, 'userId'>),
      }));

      // Detect external item removal (e.g. manager deleted a menu item)
      const newTotal = baskets.reduce((sum, b) => sum + b.items.length, 0);
      const prevTotal = prevItemCountRef.current;
      const suppressed = Date.now() < suppressUntilRef.current;

      if (!suppressed && prevTotal > 0 && newTotal < prevTotal) {
        setItemsRemovedExternally(true);
      }

      prevItemCountRef.current = newTotal;
      setSession((prev) => ({ ...prev, baskets }));
    });

    return () => {
      unsubSession();
      unsubBaskets();
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
    };
  }, [sessionDoc, basketsCol]);

  const resetSession = useCallback(() => {
    if (expiryTimer.current) clearTimeout(expiryTimer.current);
    setIsExpired(false);
    const fresh = createSession(table);
    setSession(fresh);
    prevItemCountRef.current = -1;

    // Fire-and-forget: the shared Firestore reset swallows its own write
    // failures (see lib/session-reset.ts), and this callback has always been
    // synchronous from the caller's perspective (e.g. onClick={resetSession}).
    resetSessionInFirestore(company, branch, table, session.baskets).catch(() => {});
  }, [company, branch, table, session.baskets]);

  const updateSession = useCallback((s: Session) => {
    // Suppress the external-removal toast for 1.5 s after any local write so
    // the echo of our own Firestore updates does not look like an external change.
    suppressUntilRef.current = Date.now() + 1500;

    setSession(s);
    const sessionRef = doc(db, sessionDoc);

    setDoc(
      sessionRef,
      {
        orderStatus: s.orderStatus,
        paymentDeadline: s.paymentDeadline
          ? Timestamp.fromDate(new Date(s.paymentDeadline))
          : null,
        paymentPlan: s.paymentPlan,
        userCounter: s.userCounter,
      },
      { merge: true },
    ).catch(() => {});

    for (const basket of s.baskets) {
      const { userId, ...data } = basket;
      setDoc(doc(db, basketsCol, userId), data).catch(() => {});
    }

    if (s.baskets.length > 0) {
      // refresh activity window whenever baskets are written
      setDoc(
        sessionRef,
        {
          lastActivity: serverTimestamp(),
          expiresAt: Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000)),
        },
        { merge: true },
      ).catch(() => {});
    }
  }, [sessionDoc, basketsCol]);

  const clearItemsRemovedExternally = useCallback(() => {
    setItemsRemovedExternally(false);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        session,
        updateSession,
        isExpired,
        resetSession,
        itemsRemovedExternally,
        clearItemsRemovedExternally,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a <SessionProvider>');
  }
  return ctx;
}
