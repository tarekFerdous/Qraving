import { Session, createSession } from '@/lib/session';

// ---------------------------------------------------------------------------
// Server-side in-memory session store with SSE subscriber management.
// Global variables survive Next.js dev hot-reloads in the Node.js runtime.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __qraving_sessions: Map<string, Session> | undefined;
  // eslint-disable-next-line no-var
  var __qraving_subscribers: Map<string, Set<ReadableStreamDefaultController<Uint8Array>>> | undefined;
}

const sessions: Map<string, Session> =
  global.__qraving_sessions ?? (global.__qraving_sessions = new Map());

const subscribers: Map<string, Set<ReadableStreamDefaultController<Uint8Array>>> =
  global.__qraving_subscribers ?? (global.__qraving_subscribers = new Map());

export const sessionStore = {
  get(id: string): Session {
    if (!sessions.has(id)) {
      sessions.set(id, createSession(id));
    }
    return sessions.get(id)!;
  },

  set(id: string, session: Session): void {
    sessions.set(id, session);
    const subs = subscribers.get(id);
    if (!subs) return;
    const encoded = new TextEncoder().encode(`data: ${JSON.stringify(session)}\n\n`);
    for (const ctrl of subs) {
      try {
        ctrl.enqueue(encoded);
      } catch {
        subs.delete(ctrl);
      }
    }
  },

  subscribe(id: string, ctrl: ReadableStreamDefaultController<Uint8Array>): void {
    if (!subscribers.has(id)) {
      subscribers.set(id, new Set());
    }
    subscribers.get(id)!.add(ctrl);
  },

  unsubscribe(id: string, ctrl: ReadableStreamDefaultController<Uint8Array>): void {
    subscribers.get(id)?.delete(ctrl);
  },
};
