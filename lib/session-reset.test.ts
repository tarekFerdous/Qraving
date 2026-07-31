// Coverage for the shared Firestore session-reset helper extracted from
// lib/session-context.tsx's resetSession callback (#198), so it can be
// called directly — without SessionProvider's React context — from both the
// customer-facing session-expiry flow and, in a follow-up (#200), an
// admin-triggered "Free the table" action.
import { describe, it, expect, vi, afterEach } from 'vitest';

const {
  mockDoc,
  mockSetDoc,
  mockDeleteDoc,
  mockServerTimestamp,
  mockTimestamp,
} = vi.hoisted(() => ({
  // Returns an object that encodes the resolved path (args after `db`) so
  // tests can assert exactly which Firestore doc a call targeted, without
  // caring whether it was built as doc(db, path) or doc(db, col, id).
  mockDoc: vi.fn((..._args: unknown[]) => ({ __path: _args.slice(1).join('/') })),
  mockSetDoc: vi.fn().mockResolvedValue(undefined),
  mockDeleteDoc: vi.fn().mockResolvedValue(undefined),
  mockServerTimestamp: vi.fn((..._args: unknown[]) => 'server-timestamp'),
  mockTimestamp: {
    fromDate: vi.fn(() => ({ toMillis: () => 0 })),
  },
}));

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  serverTimestamp: (...args: unknown[]) => mockServerTimestamp(...args),
  Timestamp: mockTimestamp,
}));

vi.mock('@/lib/firebase-client', () => ({
  db: {},
}));

import { resetSessionInFirestore } from './session-reset';
import type { UserBasket } from './session';

afterEach(() => {
  vi.clearAllMocks();
});

function makeBasket(overrides: Partial<UserBasket> = {}): UserBasket {
  return {
    userId: 'u1',
    name: 'User 1',
    phone: '+10000000000',
    items: [{ itemId: 'item-1', name: 'Burger', size: 'Medium', addOns: [], instructions: '', quantity: 1, isShared: false, sharerIds: null }],
    paymentStatus: 'pending',
    paymentMethod: null,
    helcimTransactionId: null,
    ...overrides,
  };
}

const sessionDoc = 'companies/c1/branches/b1/sessions/table-A';
const basketsCol = `${sessionDoc}/baskets`;
const archivedBasketsCol = `${sessionDoc}/archivedBaskets`;

describe('resetSessionInFirestore', () => {
  it('hard-deletes pending baskets from the live baskets subcollection', async () => {
    const baskets = [makeBasket({ userId: 'u-pending', paymentStatus: 'pending' })];

    await resetSessionInFirestore('c1', 'b1', 'table-A', baskets);

    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${basketsCol}/u-pending` }),
    );
    expect(mockSetDoc).not.toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${archivedBasketsCol}/u-pending` }),
      expect.anything(),
    );
  });

  it('archives paid baskets (write to archivedBaskets, then delete from baskets) without the userId field', async () => {
    const baskets = [makeBasket({ userId: 'u-paid', paymentStatus: 'paid' })];

    await resetSessionInFirestore('c1', 'b1', 'table-A', baskets);

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${archivedBasketsCol}/u-paid` }),
      expect.objectContaining({ paymentStatus: 'paid' }),
    );
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${basketsCol}/u-paid` }),
    );

    const archiveCall = mockSetDoc.mock.calls.find(
      (call) => (call[0] as { __path?: string }).__path === `${archivedBasketsCol}/u-paid`,
    );
    expect(archiveCall?.[1]).not.toHaveProperty('userId');
  });

  it('leaves failed baskets untouched (no delete, no archive write)', async () => {
    const baskets = [makeBasket({ userId: 'u-failed', paymentStatus: 'failed' })];

    await resetSessionInFirestore('c1', 'b1', 'table-A', baskets);

    expect(mockDeleteDoc).not.toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${basketsCol}/u-failed` }),
    );
    expect(mockSetDoc).not.toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${archivedBasketsCol}/u-failed` }),
      expect.anything(),
    );
  });

  it('handles a mixed basket list, partitioning each basket independently', async () => {
    const baskets = [
      makeBasket({ userId: 'u-pending', paymentStatus: 'pending' }),
      makeBasket({ userId: 'u-paid', paymentStatus: 'paid' }),
      makeBasket({ userId: 'u-failed', paymentStatus: 'failed' }),
    ];

    await resetSessionInFirestore('c1', 'b1', 'table-A', baskets);

    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${basketsCol}/u-pending` }),
    );
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${basketsCol}/u-paid` }),
    );
    expect(mockDeleteDoc).not.toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${basketsCol}/u-failed` }),
    );
  });

  it('resets the session document: userCounter 0, orderStatus building, paymentDeadline/paymentPlan null, merge true', async () => {
    await resetSessionInFirestore('c1', 'b1', 'table-A', []);

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: sessionDoc }),
      expect.objectContaining({
        userCounter: 0,
        orderStatus: 'building',
        paymentDeadline: null,
        paymentPlan: null,
      }),
      { merge: true },
    );
  });

  it('refreshes the activity/expiry window (lastActivity via serverTimestamp, expiresAt via Timestamp.fromDate)', async () => {
    await resetSessionInFirestore('c1', 'b1', 'table-A', []);

    expect(mockServerTimestamp).toHaveBeenCalled();
    expect(mockTimestamp.fromDate).toHaveBeenCalled();

    const sessionCall = mockSetDoc.mock.calls.find(
      (call) => (call[0] as { __path?: string }).__path === sessionDoc,
    );
    expect(sessionCall?.[1]).toHaveProperty('lastActivity', 'server-timestamp');
    expect(sessionCall?.[1]).toHaveProperty('expiresAt');
  });

  it('derives Firestore paths from the given companyId/branchId/sessionId, independent of any React context', async () => {
    await resetSessionInFirestore('other-co', 'other-branch', 'table-Z', [
      makeBasket({ userId: 'u1', paymentStatus: 'pending' }),
    ]);

    const expectedSessionDoc = 'companies/other-co/branches/other-branch/sessions/table-Z';
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: expectedSessionDoc }),
      expect.anything(),
      { merge: true },
    );
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: `${expectedSessionDoc}/baskets/u1` }),
    );
  });

  it('does not throw when a Firestore write rejects (matches the pre-extraction fire-and-forget behavior)', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('boom'));

    await expect(resetSessionInFirestore('c1', 'b1', 'table-A', [])).resolves.toBeUndefined();
  });
});
