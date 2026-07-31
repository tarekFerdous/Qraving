// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const {
  mockCollection,
  mockQuery,
  mockWhere,
  mockOnSnapshot,
  mockUpdateDoc,
  mockDoc,
  mockGetDocs,
  mockResetSessionInFirestore,
} = vi.hoisted(() => ({
  mockCollection: vi.fn((...args: unknown[]) => ({ __type: 'collection', args })),
  mockQuery: vi.fn((...args: unknown[]) => ({ __type: 'query', args })),
  mockWhere: vi.fn((...args: unknown[]) => ({ __type: 'where', args })),
  mockOnSnapshot: vi.fn(),
  mockUpdateDoc: vi.fn().mockResolvedValue(undefined),
  mockDoc: vi.fn((...args: unknown[]) => ({ __type: 'doc', args })),
  mockGetDocs: vi.fn().mockResolvedValue({ size: 0 }),
  mockResetSessionInFirestore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  query: mockQuery,
  where: mockWhere,
  onSnapshot: mockOnSnapshot,
  updateDoc: mockUpdateDoc,
  doc: mockDoc,
  getDocs: mockGetDocs,
  Timestamp: class {},
}));

vi.mock('@/lib/firebase-client', () => ({
  db: {},
}));

vi.mock('@/lib/session-reset', () => ({
  resetSessionInFirestore: mockResetSessionInFirestore,
}));

import DashboardTab from './DashboardTab';

const baseProps = {
  companyId: 'company-1',
  branchId: 'branch-1',
  companyName: 'Test Co',
  branchName: 'Downtown',
};

function makeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-1',
    companyId: 'company-1',
    branchId: 'branch-1',
    tableNodeId: 'table-5',
    sessionId: 'session-1',
    items: [{ itemId: 'item-1', name: 'Burger', quantity: 2, price: 1000 }],
    totalCents: 2000,
    status: 'pending',
    createdAt: null,
    user: { name: 'Alice', phone: '555-1234' },
    ...overrides,
  };
}

function snap(docs: Array<{ id: string; data: () => unknown }>) {
  return { docs };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Distinguish the two getDocs call sites by the shape of the arg mockCollection
  // / mockQuery produce: the active-QR-count widget calls getDocs(query(...)),
  // while the Free-the-table basket fetch calls getDocs(collection(...)) directly.
  mockGetDocs.mockImplementation((arg: { __type?: string }) => {
    if (arg?.__type === 'collection') {
      return Promise.resolve({ docs: [] });
    }
    return Promise.resolve({ size: 0 });
  });
  // onSnapshot returns an unsubscribe fn; default no-op implementation, callback
  // captured per-call by tests as needed.
  mockOnSnapshot.mockImplementation(() => vi.fn());
});

afterEach(() => {
  cleanup();
});

describe('DashboardTab', () => {
  it('renders company and branch names from props', () => {
    render(<DashboardTab {...baseProps} />);

    expect(screen.getByText('Test Co')).toBeTruthy();
    expect(screen.getByText('Downtown')).toBeTruthy();
  });

  it('fetches the active QR count once and displays it', async () => {
    mockGetDocs.mockResolvedValue({ size: 4 });

    render(<DashboardTab {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByText('4')).toBeTruthy();
    });
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('sets up onSnapshot listeners for sessions and orders on mount', () => {
    render(<DashboardTab {...baseProps} />);

    // Two onSnapshot subscriptions: sessions + orders.
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
    expect(mockCollection).toHaveBeenCalledWith({}, 'companies/company-1/branches/branch-1/sessions');
    expect(mockCollection).toHaveBeenCalledWith({}, 'companies/company-1/branches/branch-1/orders');
    expect(mockWhere).toHaveBeenCalledWith('orderStatus', 'in', ['building', 'payment_pending', 'fully_paid']);
    expect(mockWhere).toHaveBeenCalledWith('status', '==', 'pending');
  });

  it('renders sessions pushed through the onSnapshot callback', async () => {
    let sessionsCallback: ((snap: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((q, cb) => {
      if (q.args[0].args[1] === 'companies/company-1/branches/branch-1/sessions') {
        sessionsCallback = cb;
      }
      return vi.fn();
    });

    render(<DashboardTab {...baseProps} />);

    expect(sessionsCallback).toBeDefined();
    sessionsCallback!(
      snap([
        {
          id: 'sess-1',
          data: () => ({ orderStatus: 'building', userCounter: 2 }),
        },
      ]),
    );

    await waitFor(() => {
      expect(screen.getByText('sess-1')).toBeTruthy();
    });
  });

  it('shows a Free the table action for a session that has not reached submitted, and on confirm calls resetSessionInFirestore with the fetched baskets instead of updateDoc', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const basketDocs = [
      { id: 'user-1', data: () => ({ name: 'User 1', phone: '+15550001111', items: [], paymentStatus: 'pending', paymentMethod: null, helcimTransactionId: null }) },
    ];
    mockGetDocs.mockImplementation((arg: { __type?: string }) => {
      if (arg?.__type === 'collection') {
        return Promise.resolve({ docs: basketDocs });
      }
      return Promise.resolve({ size: 0 });
    });

    let sessionsCallback: ((snap: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((q, cb) => {
      if (q.args[0].args[1] === 'companies/company-1/branches/branch-1/sessions') {
        sessionsCallback = cb;
      }
      return vi.fn();
    });

    render(<DashboardTab {...baseProps} />);

    sessionsCallback!(
      snap([
        {
          id: 'sess-1',
          data: () => ({ orderStatus: 'building', userCounter: 2 }),
        },
      ]),
    );

    await waitFor(() => {
      expect(screen.getByText('Free the table')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Free the table'));

    expect(confirmSpy).toHaveBeenCalled();

    await waitFor(() => {
      expect(mockResetSessionInFirestore).toHaveBeenCalledWith(
        'company-1',
        'branch-1',
        'sess-1',
        [
          {
            userId: 'user-1',
            name: 'User 1',
            phone: '+15550001111',
            items: [],
            paymentStatus: 'pending',
            paymentMethod: null,
            helcimTransactionId: null,
          },
        ],
      );
    });

    // Regression guard: the old direct-write approach must be gone.
    expect(mockUpdateDoc).not.toHaveBeenCalledWith(expect.anything(), { orderStatus: 'submitted' });

    confirmSpy.mockRestore();
  });

  it('shows the confirm dialog with copy about clearing baskets and in-progress payment, and does nothing if the manager cancels', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    let sessionsCallback: ((snap: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((q, cb) => {
      if (q.args[0].args[1] === 'companies/company-1/branches/branch-1/sessions') {
        sessionsCallback = cb;
      }
      return vi.fn();
    });

    render(<DashboardTab {...baseProps} />);

    sessionsCallback!(
      snap([
        {
          id: 'sess-1',
          data: () => ({ orderStatus: 'building', userCounter: 2 }),
        },
      ]),
    );

    await waitFor(() => {
      expect(screen.getByText('Free the table')).toBeTruthy();
    });

    const getDocsCallsBefore = mockGetDocs.mock.calls.length;

    fireEvent.click(screen.getByText('Free the table'));

    expect(confirmSpy).toHaveBeenCalled();
    const confirmMessage = confirmSpy.mock.calls[0][0] as string;
    expect(confirmMessage.toLowerCase()).toContain('basket');
    expect(confirmMessage.toLowerCase()).toContain('payment');

    // No basket fetch, no reset call, no stuck "Freeing…" state on cancel.
    expect(mockGetDocs).toHaveBeenCalledTimes(getDocsCallsBefore);
    expect(mockResetSessionInFirestore).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(screen.getByText('Free the table')).toBeTruthy();
    expect(screen.queryByText('Freeing…')).toBeNull();

    confirmSpy.mockRestore();
  });

  it('shows Free the table for a fully_paid session (still short of submitted)', async () => {
    let sessionsCallback: ((snap: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((q, cb) => {
      if (q.args[0].args[1] === 'companies/company-1/branches/branch-1/sessions') {
        sessionsCallback = cb;
      }
      return vi.fn();
    });

    render(<DashboardTab {...baseProps} />);

    sessionsCallback!(
      snap([
        {
          id: 'sess-2',
          data: () => ({ orderStatus: 'fully_paid', userCounter: 1 }),
        },
      ]),
    );

    await waitFor(() => {
      expect(screen.getByText('sess-2')).toBeTruthy();
    });
    expect(screen.getByText('Free the table')).toBeTruthy();
  });

  it('does not render Free the table for a session that has already reached submitted', async () => {
    let sessionsCallback: ((snap: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((q, cb) => {
      if (q.args[0].args[1] === 'companies/company-1/branches/branch-1/sessions') {
        sessionsCallback = cb;
      }
      return vi.fn();
    });

    render(<DashboardTab {...baseProps} />);

    // A submitted session wouldn't normally come back from the 'in' query filter,
    // but the button must still be defensively hidden if one ever shows up here.
    sessionsCallback!(
      snap([
        {
          id: 'sess-3',
          data: () => ({ orderStatus: 'submitted', userCounter: 3 }),
        },
      ]),
    );

    await waitFor(() => {
      expect(screen.getByText('sess-3')).toBeTruthy();
    });
    expect(screen.queryByText('Free the table')).toBeNull();
  });

  it('renders incoming orders and calls updateDoc with accepted status on Accept', async () => {
    let ordersCallback: ((snap: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((q, cb) => {
      if (q.args[0].args[1] === 'companies/company-1/branches/branch-1/orders') {
        ordersCallback = cb;
      }
      return vi.fn();
    });

    render(<DashboardTab {...baseProps} />);

    expect(ordersCallback).toBeDefined();
    ordersCallback!(snap([{ id: 'order-1', data: () => makeOrder() }]));

    await waitFor(() => {
      expect(screen.getByText('Accept')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Accept'));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { __type: 'doc', args: [{}, 'companies/company-1/branches/branch-1/orders/order-1'] },
        { status: 'accepted' },
      );
    });
  });

  it('calls updateDoc with rejected status on Reject', async () => {
    let ordersCallback: ((snap: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((q, cb) => {
      if (q.args[0].args[1] === 'companies/company-1/branches/branch-1/orders') {
        ordersCallback = cb;
      }
      return vi.fn();
    });

    render(<DashboardTab {...baseProps} />);

    ordersCallback!(snap([{ id: 'order-1', data: () => makeOrder() }]));

    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Reject'));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { __type: 'doc', args: [{}, 'companies/company-1/branches/branch-1/orders/order-1'] },
        { status: 'rejected' },
      );
    });
  });

  it('does not tear down and recreate listeners on a re-render with unchanged props (simulating a tab switch, since AdminShell only toggles CSS display and never remounts this component)', () => {
    const unsubSessions = vi.fn();
    const unsubOrders = vi.fn();
    let callCount = 0;
    mockOnSnapshot.mockImplementation(() => {
      callCount += 1;
      return callCount % 2 === 1 ? unsubSessions : unsubOrders;
    });

    const { rerender } = render(<DashboardTab {...baseProps} />);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);

    // Re-render with the exact same prop values, as AdminShell does when the parent's
    // `activeTab` state changes but companyId/branchId/companyName/branchName do not.
    rerender(<DashboardTab {...baseProps} />);

    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
    expect(unsubSessions).not.toHaveBeenCalled();
    expect(unsubOrders).not.toHaveBeenCalled();
  });
});
