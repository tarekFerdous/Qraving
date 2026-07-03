'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Session, createSession } from '@/lib/session';

const SESSION_ID = 'demo-table-1';

interface SessionContextValue {
  session: Session;
  updateSession: (s: Session) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() => createSession(SESSION_ID));

  // Load initial session from server on mount.
  useEffect(() => {
    fetch(`/api/session/${SESSION_ID}`)
      .then((r) => r.json())
      .then((s: Session) => setSession(s))
      .catch(() => {/* keep default */});
  }, []);

  // Subscribe to SSE stream — updates local state whenever another device
  // (or the same device after a PATCH) pushes a new session.
  useEffect(() => {
    const es = new EventSource(`/api/session/${SESSION_ID}/stream`);
    es.onmessage = (e) => {
      try {
        setSession(JSON.parse(e.data) as Session);
      } catch {
        // ignore malformed events
      }
    };
    return () => es.close();
  }, []);

  // Optimistic local update + PATCH to the server. The SSE stream will
  // echo the update back — `setSession` calls are idempotent so the
  // second no-op write from the stream is harmless.
  const updateSession = useCallback((s: Session) => {
    setSession(s);
    fetch(`/api/session/${SESSION_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: s }),
    }).catch(() => {/* optimistic update already applied */});
  }, []);

  return (
    <SessionContext.Provider value={{ session, updateSession }}>
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
