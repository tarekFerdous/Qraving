// @vitest-environment jsdom
//
// Regression coverage for issue #191: SessionProvider used to key every
// session off hardcoded module-level constants (SESSION_ID/SESSION_DOC), so
// every table sharing the app shared one single Firestore session document.
// It now derives the session doc + baskets collection paths from its
// `company`/`branch`/`table` props, so two different scanned tables get
// fully independent Firestore paths.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';

const {
  mockDoc,
  mockCollection,
  mockOnSnapshot,
  mockSetDoc,
  mockDeleteDoc,
  mockServerTimestamp,
  mockTimestamp,
} = vi.hoisted(() => ({
  // Returns an object that encodes the resolved path (args after `db`) so
  // tests can assert exactly which Firestore doc a call targeted, without
  // caring whether it was built as doc(db, path) or doc(db, col, id).
  mockDoc: vi.fn((..._args: unknown[]) => ({ __path: _args.slice(1).join('/') })),
  mockCollection: vi.fn((..._args: unknown[]) => ({ __path: _args.slice(1).join('/') })),
  mockOnSnapshot: vi.fn((..._args: unknown[]) => vi.fn()),
  mockSetDoc: vi.fn().mockResolvedValue(undefined),
  mockDeleteDoc: vi.fn().mockResolvedValue(undefined),
  mockServerTimestamp: vi.fn((..._args: unknown[]) => 'server-timestamp'),
  mockTimestamp: {
    fromDate: vi.fn(() => ({ toMillis: () => 0 })),
  },
}));

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  collection: (...args: unknown[]) => mockCollection(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  serverTimestamp: (...args: unknown[]) => mockServerTimestamp(...args),
  Timestamp: mockTimestamp,
}));

vi.mock('@/lib/firebase-client', () => ({
  db: {},
}));

import { SessionProvider, useSession } from './session-context';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SessionProvider Firestore path derivation (#191)', () => {
  it('derives the session doc + baskets collection paths from company/branch/table props, independently per table', () => {
    render(
      <SessionProvider company="c1" branch="b1" table="table-A">
        <div>child</div>
      </SessionProvider>,
    );

    const docPathsA = mockDoc.mock.calls.map((call) => call[1]);
    const collectionPathsA = mockCollection.mock.calls.map((call) => call[1]);

    expect(docPathsA).toContain('companies/c1/branches/b1/sessions/table-A');
    expect(collectionPathsA).toContain('companies/c1/branches/b1/sessions/table-A/baskets');

    cleanup();
    mockDoc.mockClear();
    mockCollection.mockClear();

    render(
      <SessionProvider company="c1" branch="b1" table="table-B">
        <div>child</div>
      </SessionProvider>,
    );

    const docPathsB = mockDoc.mock.calls.map((call) => call[1]);
    const collectionPathsB = mockCollection.mock.calls.map((call) => call[1]);

    expect(docPathsB).toContain('companies/c1/branches/b1/sessions/table-B');
    expect(collectionPathsB).toContain('companies/c1/branches/b1/sessions/table-B/baskets');

    // The two tables must never resolve to the same Firestore paths.
    expect(docPathsB).not.toContain('companies/c1/branches/b1/sessions/table-A');
    expect(collectionPathsB).not.toContain('companies/c1/branches/b1/sessions/table-A/baskets');
  });

  it('resolves the well-known /demo-table path unchanged', () => {
    render(
      <SessionProvider company="demo-company" branch="demo-branch" table="demo-table-1">
        <div>child</div>
      </SessionProvider>,
    );

    const docPaths = mockDoc.mock.calls.map((call) => call[1]);
    const collectionPaths = mockCollection.mock.calls.map((call) => call[1]);

    expect(docPaths).toContain('companies/demo-company/branches/demo-branch/sessions/demo-table-1');
    expect(collectionPaths).toContain(
      'companies/demo-company/branches/demo-branch/sessions/demo-table-1/baskets',
    );
  });
});

// ---------------------------------------------------------------------------
// resetSession (#192): partitions the live baskets subcollection by
// paymentStatus instead of leaving it for the fresh session to inherit.
// ---------------------------------------------------------------------------

function ResetHarness() {
  const { resetSession } = useSession();
  return (
    <button type="button" onClick={resetSession}>
      reset
    </button>
  );
}

function rawBasket(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    name: 'User',
    phone: '+10000000000',
    items: [{ itemId: 'item-1' }],
    paymentStatus: 'pending',
    paymentMethod: null,
    helcimTransactionId: null,
    ...overrides,
  };
}

describe('resetSession basket partitioning (#192)', () => {
  it('hard-deletes pending baskets, archives-then-deletes paid baskets, and leaves failed baskets untouched', async () => {
    const { getByText } = render(
      <SessionProvider company="c1" branch="b1" table="table-A">
        <ResetHarness />
      </SessionProvider>,
    );

    const sessionDoc = 'companies/c1/branches/b1/sessions/table-A';
    const basketsCol = `${sessionDoc}/baskets`;
    const archivedBasketsCol = `${sessionDoc}/archivedBaskets`;

    // The effect registers onSnapshot(sessionRef, ...) then
    // onSnapshot(basketsRef, ...), in that order — grab the baskets callback.
    const basketsCallback = mockOnSnapshot.mock.calls[1][1] as (snap: unknown) => void;

    act(() => {
      basketsCallback({
        docs: [
          { id: 'u-pending', data: () => rawBasket({ paymentStatus: 'pending' }) },
          { id: 'u-paid', data: () => rawBasket({ paymentStatus: 'paid' }) },
          { id: 'u-failed', data: () => rawBasket({ paymentStatus: 'failed' }) },
        ],
      });
    });

    mockDoc.mockClear();
    mockSetDoc.mockClear();
    mockDeleteDoc.mockClear();

    await act(async () => {
      fireEvent.click(getByText('reset'));
      // Flush the setDoc(...).then(() => deleteDoc(...)) microtask chain for
      // the archived basket.
      await Promise.resolve();
      await Promise.resolve();
    });

    // Pending basket: hard-deleted from the live baskets subcollection.
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${basketsCol}/u-pending` }),
    );

    // Paid basket: written to the archive location, then removed from the
    // live subcollection — never deleted without first being archived.
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${archivedBasketsCol}/u-paid` }),
      expect.objectContaining({ paymentStatus: 'paid' }),
    );
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${basketsCol}/u-paid` }),
    );

    // Archived basket data must not carry the userId field (mirrors
    // updateSession's existing `const { userId, ...data } = basket` pattern).
    const archiveCall = mockSetDoc.mock.calls.find(
      (call) => (call[0] as { __path?: string }).__path === `${archivedBasketsCol}/u-paid`,
    );
    expect(archiveCall?.[1]).not.toHaveProperty('userId');

    // Failed basket: no delete, no archive write — left fully untouched.
    expect(mockDeleteDoc).not.toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${basketsCol}/u-failed` }),
    );
    expect(mockSetDoc).not.toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${archivedBasketsCol}/u-failed` }),
      expect.anything(),
    );

    // The session document itself is reset with a valid orderStatus, not the
    // old buggy 'pending' value (not a member of Session['orderStatus']).
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: sessionDoc }),
      expect.objectContaining({ orderStatus: 'building' }),
      { merge: true },
    );
  });
});
