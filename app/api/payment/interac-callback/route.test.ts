import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import type { Session, UserBasket, BasketItem } from '@/lib/session'
import { createSession } from '@/lib/session'

// ---------------------------------------------------------------------------
// In-memory mock for session-firestore and firebase-admin (getMenu via adminDb)
// ---------------------------------------------------------------------------

const mockSessions = new Map<string, Session>()

vi.mock('@/lib/session-firestore', () => ({
  getSession: vi.fn().mockImplementation(async (_companyId: string, _branchId: string, id: string) =>
    mockSessions.get(id) ?? createSession(id),
  ),
  setSession: vi.fn().mockImplementation(async (_companyId: string, _branchId: string, id: string, session: Session) => {
    mockSessions.set(id, session)
  }),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ docs: [] }) }),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }),
  },
}))

// Stub fetch so the fire-and-forget SMS call doesn't fail during tests
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(): BasketItem {
  return {
    itemId: 'item-1',
    name: 'Burger',
    size: 'Medium',
    addOns: [],
    instructions: '',
    quantity: 1,
    isShared: false,
    sharerIds: null,
  }
}

function makeBasket(overrides: Partial<UserBasket> = {}): UserBasket {
  return {
    userId: 'user-1',
    name: 'User 1',
    phone: '+10000000000',
    items: [makeItem()],
    paymentStatus: 'pending',
    paymentMethod: null,
    helcimTransactionId: null,
    ...overrides,
  }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return { id: 'sess-1', userCounter: 0, baskets: [], orderStatus: 'payment_pending', paymentDeadline: null, paymentPlan: null, ...overrides }
}

function seedSession(id: string, session: Session) { mockSessions.set(id, session) }
function readSession(id: string): Session { return mockSessions.get(id) ?? createSession(id) }

function makeRequest(params: { sessionId: string; basketId: string; transactionId: string; status: string }): NextRequest {
  const url = new URL('http://localhost/api/payment/interac-callback')
  url.searchParams.set('sessionId', params.sessionId)
  url.searchParams.set('basketId', params.basketId)
  url.searchParams.set('transactionId', params.transactionId)
  url.searchParams.set('status', params.status)
  return new NextRequest(url.toString(), { method: 'GET' })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/payment/interac-callback', () => {
  beforeEach(() => { mockSessions.clear() })

  it('marks basket as paid and redirects to ?payment=success on approved', async () => {
    seedSession('sess-ic-approved', makeSession({ id: 'sess-ic-approved', baskets: [makeBasket({ userId: 'user-1' })] }))

    const res = await GET(makeRequest({ sessionId: 'sess-ic-approved', basketId: 'user-1', transactionId: 'txn-ic-42', status: 'approved' }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sess-ic-approved?payment=success')

    const basket = readSession('sess-ic-approved').baskets.find((b) => b.userId === 'user-1')!
    expect(basket.paymentStatus).toBe('paid')
    expect(basket.helcimTransactionId).toBe('txn-ic-42')
    expect(basket.paymentMethod).toBe('interac')
  })

  it('marks basket as failed and redirects to ?payment=failed on declined', async () => {
    seedSession('sess-ic-declined', makeSession({ id: 'sess-ic-declined', baskets: [makeBasket({ userId: 'user-1' })] }))

    const res = await GET(makeRequest({ sessionId: 'sess-ic-declined', basketId: 'user-1', transactionId: 'txn-ic-declined', status: 'declined' }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sess-ic-declined?payment=failed')
    expect(readSession('sess-ic-declined').baskets.find((b) => b.userId === 'user-1')!.paymentStatus).toBe('failed')
  })

  it('sets orderStatus to submitted when all baskets are paid', async () => {
    seedSession('sess-ic-all-paid', makeSession({
      id: 'sess-ic-all-paid',
      orderStatus: 'payment_pending',
      baskets: [makeBasket({ userId: 'user-1', paymentStatus: 'paid' }), makeBasket({ userId: 'user-2', paymentStatus: 'pending' })],
    }))

    await GET(makeRequest({ sessionId: 'sess-ic-all-paid', basketId: 'user-2', transactionId: 'txn-ic-final', status: 'approved' }))

    expect(readSession('sess-ic-all-paid').orderStatus).toBe('submitted')
  })

  it('keeps orderStatus unchanged when only some baskets are paid', async () => {
    seedSession('sess-ic-partial', makeSession({
      id: 'sess-ic-partial',
      orderStatus: 'payment_pending',
      baskets: [makeBasket({ userId: 'user-1', paymentStatus: 'pending' }), makeBasket({ userId: 'user-2', paymentStatus: 'pending' })],
    }))

    await GET(makeRequest({ sessionId: 'sess-ic-partial', basketId: 'user-1', transactionId: 'txn-ic-partial', status: 'approved' }))

    expect(readSession('sess-ic-partial').orderStatus).toBe('payment_pending')
  })

  it('is idempotent: already-paid basket skips updates and redirects success', async () => {
    seedSession('sess-ic-idem', makeSession({
      id: 'sess-ic-idem',
      baskets: [makeBasket({ userId: 'user-1', paymentStatus: 'paid', helcimTransactionId: 'original-txn', paymentMethod: 'interac' })],
    }))

    const res = await GET(makeRequest({ sessionId: 'sess-ic-idem', basketId: 'user-1', transactionId: 'duplicate-txn', status: 'approved' }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sess-ic-idem?payment=success')
    expect(readSession('sess-ic-idem').baskets.find((b) => b.userId === 'user-1')!.helcimTransactionId).toBe('original-txn')
  })

  // -------------------------------------------------------------------------
  // Whole-table payment (paymentPlan === 'single')
  // -------------------------------------------------------------------------

  it('marks every non-empty basket paid with the same shared transaction on approval when paymentPlan is single', async () => {
    seedSession('sess-ic-whole-table', makeSession({
      id: 'sess-ic-whole-table',
      paymentPlan: 'single',
      baskets: [
        makeBasket({ userId: 'user-1' }),
        makeBasket({ userId: 'user-2' }),
        makeBasket({ userId: 'user-3', items: [] }), // empty basket — untouched
      ],
    }))

    const res = await GET(makeRequest({ sessionId: 'sess-ic-whole-table', basketId: 'user-1', transactionId: 'txn-ic-whole-table', status: 'approved' }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sess-ic-whole-table?payment=success')

    const updated = readSession('sess-ic-whole-table')
    const user1 = updated.baskets.find((b) => b.userId === 'user-1')!
    const user2 = updated.baskets.find((b) => b.userId === 'user-2')!
    const user3 = updated.baskets.find((b) => b.userId === 'user-3')!

    expect(user1.paymentStatus).toBe('paid')
    expect(user2.paymentStatus).toBe('paid')
    expect(user1.helcimTransactionId).toBe('txn-ic-whole-table')
    expect(user2.helcimTransactionId).toBe('txn-ic-whole-table')
    expect(user1.paymentMethod).toBe('interac')
    expect(user2.paymentMethod).toBe('interac')
    expect(user3.paymentStatus).toBe('pending')

    expect(updated.orderStatus).toBe('submitted')
  })

  it('only marks the initiating basket failed on decline when paymentPlan is single', async () => {
    seedSession('sess-ic-whole-table-declined', makeSession({
      id: 'sess-ic-whole-table-declined',
      paymentPlan: 'single',
      baskets: [makeBasket({ userId: 'user-1' }), makeBasket({ userId: 'user-2' })],
    }))

    await GET(makeRequest({ sessionId: 'sess-ic-whole-table-declined', basketId: 'user-1', transactionId: 'txn-ic-whole-declined', status: 'declined' }))

    const updated = readSession('sess-ic-whole-table-declined')
    expect(updated.baskets.find((b) => b.userId === 'user-1')!.paymentStatus).toBe('failed')
    expect(updated.baskets.find((b) => b.userId === 'user-2')!.paymentStatus).toBe('pending')
    expect(updated.orderStatus).not.toBe('submitted')
  })

  it('does not fan out to other baskets when paymentPlan is split (existing per-basket behavior)', async () => {
    seedSession('sess-ic-split-unchanged', makeSession({
      id: 'sess-ic-split-unchanged',
      paymentPlan: 'split',
      baskets: [makeBasket({ userId: 'user-1' }), makeBasket({ userId: 'user-2' })],
    }))

    await GET(makeRequest({ sessionId: 'sess-ic-split-unchanged', basketId: 'user-1', transactionId: 'txn-ic-split-1', status: 'approved' }))

    const updated = readSession('sess-ic-split-unchanged')
    expect(updated.baskets.find((b) => b.userId === 'user-1')!.paymentStatus).toBe('paid')
    expect(updated.baskets.find((b) => b.userId === 'user-2')!.paymentStatus).toBe('pending')
    expect(updated.orderStatus).not.toBe('submitted')
  })
})
