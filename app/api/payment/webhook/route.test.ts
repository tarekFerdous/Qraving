import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { POST } from './route'
import type { Session, UserBasket, BasketItem } from '@/lib/session'
import { createSession } from '@/lib/session'

// ---------------------------------------------------------------------------
// In-memory mock for session-firestore and firebase-admin (getMenu via adminDb)
// ---------------------------------------------------------------------------

const mockSessions = new Map<string, Session>()

vi.mock('@/lib/session-firestore', () => ({
  getSession: vi.fn().mockImplementation(async (id: string) =>
    mockSessions.get(id) ?? createSession(id),
  ),
  setSession: vi.fn().mockImplementation(async (id: string, session: Session) => {
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

// Stub fetch for the fire-and-forget SMS call
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = 'test-webhook-secret-abc'

function sign(rawBody: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')
}

function makeItem(): BasketItem {
  return { itemId: 'item-1', name: 'Burger', size: 'Medium', addOns: [], instructions: '', quantity: 1 }
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
  return { id: 'sess-1', userCounter: 0, baskets: [], orderStatus: 'payment_pending', paymentDeadline: null, ...overrides }
}

interface WebhookPayload {
  sessionId: string
  basketId: string
  transactionId: string
  status: 'approved' | 'declined'
  paymentMethod: 'apple_pay' | 'google_pay' | 'card' | 'interac'
}

function seedSession(id: string, session: Session) { mockSessions.set(id, session) }
function readSession(id: string): Session { return mockSessions.get(id) ?? createSession(id) }

function makeRequest(payload: WebhookPayload, overrideSignature?: string): NextRequest {
  const rawBody = JSON.stringify(payload)
  const sig = overrideSignature ?? sign(rawBody)
  return new NextRequest('http://localhost/api/payment/webhook', {
    method: 'POST',
    body: rawBody,
    headers: { 'Content-Type': 'application/json', 'helcim-signature': sig },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/payment/webhook', () => {
  beforeEach(() => {
    mockSessions.clear()
    process.env.HELCIM_WEBHOOK_SECRET = WEBHOOK_SECRET
  })

  it('returns 401 for an invalid HMAC signature', async () => {
    seedSession('sess-webhook-401', makeSession({ id: 'sess-webhook-401', baskets: [makeBasket({ userId: 'user-1' })] }))

    const res = await POST(makeRequest({ sessionId: 'sess-webhook-401', basketId: 'user-1', transactionId: 'txn-1', status: 'approved', paymentMethod: 'card' }, 'bad-signature'))

    expect(res.status).toBe(401)
  })

  it('marks basket paymentStatus as paid and stores helcimTransactionId on approved', async () => {
    seedSession('sess-webhook-approved', makeSession({ id: 'sess-webhook-approved', baskets: [makeBasket({ userId: 'user-1' })] }))

    const res = await POST(makeRequest({ sessionId: 'sess-webhook-approved', basketId: 'user-1', transactionId: 'txn-approved-42', status: 'approved', paymentMethod: 'card' }))

    expect(res.status).toBe(200)

    const basket = readSession('sess-webhook-approved').baskets.find((b) => b.userId === 'user-1')!
    expect(basket.paymentStatus).toBe('paid')
    expect(basket.helcimTransactionId).toBe('txn-approved-42')
    expect(basket.paymentMethod).toBe('card')
  })

  it('marks basket paymentStatus as failed on declined payment', async () => {
    seedSession('sess-webhook-declined', makeSession({ id: 'sess-webhook-declined', baskets: [makeBasket({ userId: 'user-1' })] }))

    const res = await POST(makeRequest({ sessionId: 'sess-webhook-declined', basketId: 'user-1', transactionId: 'txn-declined-7', status: 'declined', paymentMethod: 'card' }))

    expect(res.status).toBe(200)
    expect(readSession('sess-webhook-declined').baskets.find((b) => b.userId === 'user-1')!.paymentStatus).toBe('failed')
  })

  it('sets orderStatus to submitted when all baskets are paid', async () => {
    seedSession('sess-webhook-all-paid', makeSession({
      id: 'sess-webhook-all-paid',
      orderStatus: 'payment_pending',
      baskets: [makeBasket({ userId: 'user-1', paymentStatus: 'paid' }), makeBasket({ userId: 'user-2', paymentStatus: 'pending' })],
    }))

    const res = await POST(makeRequest({ sessionId: 'sess-webhook-all-paid', basketId: 'user-2', transactionId: 'txn-final', status: 'approved', paymentMethod: 'interac' }))

    expect(res.status).toBe(200)
    expect(readSession('sess-webhook-all-paid').orderStatus).toBe('submitted')
  })

  it('keeps orderStatus as payment_pending when only some baskets are paid', async () => {
    seedSession('sess-webhook-partial', makeSession({
      id: 'sess-webhook-partial',
      orderStatus: 'payment_pending',
      baskets: [makeBasket({ userId: 'user-1', paymentStatus: 'pending' }), makeBasket({ userId: 'user-2', paymentStatus: 'pending' })],
    }))

    const res = await POST(makeRequest({ sessionId: 'sess-webhook-partial', basketId: 'user-1', transactionId: 'txn-partial', status: 'approved', paymentMethod: 'apple_pay' }))

    expect(res.status).toBe(200)
    expect(readSession('sess-webhook-partial').orderStatus).toBe('payment_pending')
  })

  it('returns 200 even for a declined payment (no retry loops)', async () => {
    seedSession('sess-webhook-declined-200', makeSession({ id: 'sess-webhook-declined-200', baskets: [makeBasket({ userId: 'user-1' })] }))

    const res = await POST(makeRequest({ sessionId: 'sess-webhook-declined-200', basketId: 'user-1', transactionId: 'txn-declined-200', status: 'declined', paymentMethod: 'card' }))

    expect(res.status).toBe(200)
  })
})
