import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { sessionStore } from '@/lib/session-store'
import type { Session, UserBasket, BasketItem } from '@/lib/session'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<BasketItem> = {}): BasketItem {
  return {
    itemId: 'item-1',
    name: 'Burger',
    size: 'Medium',
    addOns: [],
    instructions: '',
    quantity: 1,
    ...overrides,
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
    orderStatus: 'building',
    paymentDeadline: null,
    ...overrides,
  }
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/payment/initiate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/payment/initiate', () => {
  beforeEach(() => {
    // Stub global fetch to handle both TheMealDB calls (used by getMenu) and
    // Helcim API calls. TheMealDB returns empty so computeBasketTotal uses
    // price 0; Helcim mock returns a fixed token and redirectUrl.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('helcim.com')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                secretToken: 'test-token-abc',
                redirectUrl: 'https://helcim.com/interac/redirect',
              }),
          })
        }
        // TheMealDB or any other call — return empty meals list
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ meals: [] }),
        })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('card mode returns { token } and sets orderStatus to payment_pending', async () => {
    const session = makeSession({
      id: 'sess-initiate-card',
      baskets: [makeBasket({ userId: 'user-1' })],
    })
    sessionStore.set('sess-initiate-card', session)

    const req = makeRequest({
      sessionId: 'sess-initiate-card',
      basketId: 'user-1',
      paymentMode: 'card',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ token: 'test-token-abc' })
    expect(sessionStore.get('sess-initiate-card').orderStatus).toBe('payment_pending')
  })

  it('interac mode returns { redirectUrl }', async () => {
    const session = makeSession({
      id: 'sess-initiate-interac',
      baskets: [makeBasket({ userId: 'user-1' })],
    })
    sessionStore.set('sess-initiate-interac', session)

    const req = makeRequest({
      sessionId: 'sess-initiate-interac',
      basketId: 'user-1',
      paymentMode: 'interac',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ redirectUrl: 'https://helcim.com/interac/redirect' })
  })

  it('first split-session call stamps paymentDeadline approximately 30 minutes from now', async () => {
    const session = makeSession({
      id: 'sess-initiate-split',
      baskets: [
        makeBasket({ userId: 'user-1' }),
        makeBasket({ userId: 'user-2' }),
      ],
    })
    sessionStore.set('sess-initiate-split', session)

    const before = Date.now()
    const req = makeRequest({
      sessionId: 'sess-initiate-split',
      basketId: 'user-1',
      paymentMode: 'card',
    })
    const res = await POST(req)
    const after = Date.now()

    expect(res.status).toBe(200)

    const updatedSession = sessionStore.get('sess-initiate-split')
    expect(updatedSession.paymentDeadline).not.toBeNull()

    const deadline = new Date(updatedSession.paymentDeadline!).getTime()
    const thirtyMin = 30 * 60 * 1000
    expect(deadline).toBeGreaterThanOrEqual(before + thirtyMin - 50)
    expect(deadline).toBeLessThanOrEqual(after + thirtyMin + 50)
  })

  it('second split-session call does not overwrite an existing paymentDeadline', async () => {
    const existingDeadline = new Date(Date.now() + 25 * 60 * 1000).toISOString()
    const session = makeSession({
      id: 'sess-initiate-split-no-overwrite',
      orderStatus: 'payment_pending',
      paymentDeadline: existingDeadline,
      baskets: [
        makeBasket({ userId: 'user-1' }),
        makeBasket({ userId: 'user-2' }),
      ],
    })
    sessionStore.set('sess-initiate-split-no-overwrite', session)

    const req = makeRequest({
      sessionId: 'sess-initiate-split-no-overwrite',
      basketId: 'user-2',
      paymentMode: 'card',
    })
    await POST(req)

    const updatedSession = sessionStore.get('sess-initiate-split-no-overwrite')
    expect(updatedSession.paymentDeadline).toBe(existingDeadline)
  })

  it('returns 410 when the payment deadline has expired', async () => {
    const session = makeSession({
      id: 'sess-initiate-expired',
      baskets: [makeBasket({ userId: 'user-1' })],
      paymentDeadline: new Date(Date.now() - 60_000).toISOString(), // 1 min in the past
    })
    sessionStore.set('sess-initiate-expired', session)

    const req = makeRequest({
      sessionId: 'sess-initiate-expired',
      basketId: 'user-1',
      paymentMode: 'card',
    })
    const res = await POST(req)

    expect(res.status).toBe(410)
  })

  it('returns 502 when the Helcim API returns a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('helcim.com')) {
          return Promise.resolve({ ok: false, status: 500 })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ meals: [] }) })
      }),
    )

    const session = makeSession({
      id: 'sess-initiate-helcim-error',
      baskets: [makeBasket({ userId: 'user-1' })],
    })
    sessionStore.set('sess-initiate-helcim-error', session)

    const req = makeRequest({
      sessionId: 'sess-initiate-helcim-error',
      basketId: 'user-1',
      paymentMode: 'card',
    })
    const res = await POST(req)

    expect(res.status).toBe(502)
  })
})
