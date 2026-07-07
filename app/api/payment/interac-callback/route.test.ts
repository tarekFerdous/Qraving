import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { sessionStore } from '@/lib/session-store'
import type { Session, UserBasket, BasketItem } from '@/lib/session'

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
  return {
    id: 'sess-1',
    userCounter: 0,
    baskets: [],
    orderStatus: 'payment_pending',
    paymentDeadline: null,
    ...overrides,
  }
}

function makeRequest(params: {
  sessionId: string
  basketId: string
  transactionId: string
  status: string
}): NextRequest {
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
  beforeEach(() => {
    // No env setup required for this handler
  })

  it('marks basket as paid and redirects to ?payment=success on approved', async () => {
    const session = makeSession({
      id: 'sess-ic-approved',
      baskets: [makeBasket({ userId: 'user-1' })],
    })
    sessionStore.set('sess-ic-approved', session)

    const req = makeRequest({
      sessionId: 'sess-ic-approved',
      basketId: 'user-1',
      transactionId: 'txn-ic-42',
      status: 'approved',
    })
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sess-ic-approved?payment=success')

    const updatedSession = sessionStore.get('sess-ic-approved')
    const basket = updatedSession.baskets.find((b) => b.userId === 'user-1')!
    expect(basket.paymentStatus).toBe('paid')
    expect(basket.helcimTransactionId).toBe('txn-ic-42')
    expect(basket.paymentMethod).toBe('interac')
  })

  it('marks basket as failed and redirects to ?payment=failed on declined', async () => {
    const session = makeSession({
      id: 'sess-ic-declined',
      baskets: [makeBasket({ userId: 'user-1' })],
    })
    sessionStore.set('sess-ic-declined', session)

    const req = makeRequest({
      sessionId: 'sess-ic-declined',
      basketId: 'user-1',
      transactionId: 'txn-ic-declined',
      status: 'declined',
    })
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sess-ic-declined?payment=failed')

    const updatedSession = sessionStore.get('sess-ic-declined')
    const basket = updatedSession.baskets.find((b) => b.userId === 'user-1')!
    expect(basket.paymentStatus).toBe('failed')
  })

  it('sets orderStatus to submitted when all baskets are paid', async () => {
    const session = makeSession({
      id: 'sess-ic-all-paid',
      orderStatus: 'payment_pending',
      baskets: [
        makeBasket({ userId: 'user-1', paymentStatus: 'paid' }),
        makeBasket({ userId: 'user-2', paymentStatus: 'pending' }),
      ],
    })
    sessionStore.set('sess-ic-all-paid', session)

    const req = makeRequest({
      sessionId: 'sess-ic-all-paid',
      basketId: 'user-2',
      transactionId: 'txn-ic-final',
      status: 'approved',
    })
    const res = await GET(req)

    expect(res.status).toBe(307)

    const updatedSession = sessionStore.get('sess-ic-all-paid')
    expect(updatedSession.orderStatus).toBe('submitted')
  })

  it('keeps orderStatus unchanged when only some baskets are paid', async () => {
    const session = makeSession({
      id: 'sess-ic-partial',
      orderStatus: 'payment_pending',
      baskets: [
        makeBasket({ userId: 'user-1', paymentStatus: 'pending' }),
        makeBasket({ userId: 'user-2', paymentStatus: 'pending' }),
      ],
    })
    sessionStore.set('sess-ic-partial', session)

    const req = makeRequest({
      sessionId: 'sess-ic-partial',
      basketId: 'user-1',
      transactionId: 'txn-ic-partial',
      status: 'approved',
    })
    const res = await GET(req)

    expect(res.status).toBe(307)

    const updatedSession = sessionStore.get('sess-ic-partial')
    expect(updatedSession.orderStatus).toBe('payment_pending')
  })

  it('is idempotent: already-paid basket skips updates and redirects success', async () => {
    const session = makeSession({
      id: 'sess-ic-idem',
      baskets: [
        makeBasket({
          userId: 'user-1',
          paymentStatus: 'paid',
          helcimTransactionId: 'original-txn',
          paymentMethod: 'interac',
        }),
      ],
    })
    sessionStore.set('sess-ic-idem', session)

    const req = makeRequest({
      sessionId: 'sess-ic-idem',
      basketId: 'user-1',
      transactionId: 'duplicate-txn',
      status: 'approved',
    })
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/sess-ic-idem?payment=success')

    // Transaction ID must not have changed (idempotent)
    const updatedSession = sessionStore.get('sess-ic-idem')
    const basket = updatedSession.baskets.find((b) => b.userId === 'user-1')!
    expect(basket.helcimTransactionId).toBe('original-txn')
  })
})
