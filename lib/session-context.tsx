'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { doc, collection, onSnapshot, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Session, UserBasket, createSession } from '@/lib/session';

const SESSION_ID = 'demo-table-1';
const SESSION_DOC = 'companies/demo-company/branches/demo-branch/sessions/demo-table-1';
const BASKETS_COL = `${SESSION_DOC}/baskets`;

interface SessionContextValue {
  session: Session;
  updateSession: (s: Session) => void;
  isExpired: boolean;
  resetSession: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() => createSession(SESSION_ID));
  const [isExpired, setIsExpired] = useState(false);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sessionRef = doc(db, SESSION_DOC);
    const basketsRef = collection(db, BASKETS_COL);

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
      }));
    });

    const unsubBaskets = onSnapshot(basketsRef, (snap) => {
      const baskets: UserBasket[] = snap.docs.map((d) => ({
        userId: d.id,
        ...(d.data() as Omit<UserBasket, 'userId'>),
      }));
      setSession((prev) => ({ ...prev, baskets }));
    });

    return () => {
      unsubSession();
      unsubBaskets();
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
    };
  }, []);

  const resetSession = useCallback(() => {
    if (expiryTimer.current) clearTimeout(expiryTimer.current);
    setIsExpired(false);
    const fresh = createSession(SESSION_ID);
    setSession(fresh);
    const sessionRef = doc(db, SESSION_DOC);
    setDoc(
      sessionRef,
      {
        userCounter: 0,
        orderStatus: 'pending',
        paymentDeadline: null,
        lastActivity: serverTimestamp(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000)),
      },
      { merge: true },
    ).catch(() => {});
  }, []);

  const updateSession = useCallback((s: Session) => {
    setSession(s);
    const sessionRef = doc(db, SESSION_DOC);

    setDoc(
      sessionRef,
      {
        orderStatus: s.orderStatus,
        paymentDeadline: s.paymentDeadline
          ? Timestamp.fromDate(new Date(s.paymentDeadline))
          : null,
        userCounter: s.userCounter,
      },
      { merge: true },
    ).catch(() => {});

    for (const basket of s.baskets) {
      const { userId, ...data } = basket;
      setDoc(doc(db, BASKETS_COL, userId), data).catch(() => {});
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
  }, []);

  return (
    <SessionContext.Provider value={{ session, updateSession, isExpired, resetSession }}>
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
