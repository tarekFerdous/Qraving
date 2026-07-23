import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import type { Session, UserBasket, BasketItem } from '@/lib/session'
import { createSession } from '@/lib/session'

// ---------------------------------------------------------------------------
// In-memory mock for session-firestore and firebase-admin (getMenu via adminDb)
// ---------------------------------------------------------------------------

const mockSessions = new Map<string, Session>()

// Mutable per-test menu fixtures for getMenu (empty by default, matching the
// prior fixed-empty mock — individual tests can populate these to exercise
// real menu-item prices, e.g. the shared-item charge-amount test below).
let mockCategoryDocs: Array<{ id: string; data: () => unknown }> = []
let mockMenuItemDocs: Array<{ id: string; data: () => unknown }> = []

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
    collection: vi.fn().mockImplementation((path: string) => {
      if (path.endsWith('/categories')) {
        return {
          orderBy: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(async () => ({ docs: mockCategoryDocs })),
          }),
        }
      }
      return { get: vi.fn().mockImplementation(async () => ({ docs: mockMenuItemDocs })) }
    }),
  },
}))

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
    isShared: false,
    sharerIds: null,
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
    paymentPlan: null,
    ...overrides,
  }
}

function seedSession(id: string, session: Session) {
  mockSessions.set(id, session)
}

function readSession(id: string): Session {
  return mockSessions.get(id) ?? createSession(id)
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
    mockSessions.clear()
    mockCategoryDocs = []
    mockMenuItemDocs = []
    process.env.HELCIM_API_KEY = 'test-api-key'
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
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ meals: [] }) })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.HELCIM_API_KEY
  })

  it('card mode returns { token } and sets orderStatus to payment_pending', async () => {
    seedSession('sess-initiate-card', makeSession({
      id: 'sess-initiate-card',
      baskets: [makeBasket({ userId: 'user-1' })],
    }))

    const req = makeRequest({ sessionId: 'sess-initiate-card', basketId: 'user-1', paymentMode: 'card' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ token: 'test-token-abc' })
    expect(readSession('sess-initiate-card').orderStatus).toBe('payment_pending')
  })

  it('interac mode returns { redirectUrl }', async () => {
    seedSession('sess-initiate-interac', makeSession({
      id: 'sess-initiate-interac',
      baskets: [makeBasket({ userId: 'user-1' })],
    }))

    const req = makeRequest({ sessionId: 'sess-initiate-interac', basketId: 'user-1', paymentMode: 'interac' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ redirectUrl: 'https://helcim.com/interac/redirect' })
  })

  it('first split-session call stamps paymentDeadline approximately 30 minutes from now', async () => {
    seedSession('sess-initiate-split', makeSession({
      id: 'sess-initiate-split',
      baskets: [makeBasket({ userId: 'user-1' }), makeBasket({ userId: 'user-2' })],
    }))

    const before = Date.now()
    const req = makeRequest({ sessionId: 'sess-initiate-split', basketId: 'user-1', paymentMode: 'card' })
    const res = await POST(req)
    const after = Date.now()

    expect(res.status).toBe(200)

    const updatedSession = readSession('sess-initiate-split')
    expect(updatedSession.paymentDeadline).not.toBeNull()

    const deadline = new Date(updatedSession.paymentDeadline!).getTime()
    const thirtyMin = 30 * 60 * 1000
    expect(deadline).toBeGreaterThanOrEqual(before + thirtyMin - 50)
    expect(deadline).toBeLessThanOrEqual(after + thirtyMin + 50)
  })

  it('second split-session call does not overwrite an existing paymentDeadline', async () => {
    const existingDeadline = new Date(Date.now() + 25 * 60 * 1000).toISOString()
    seedSession('sess-initiate-split-no-overwrite', makeSession({
      id: 'sess-initiate-split-no-overwrite',
      orderStatus: 'payment_pending',
      paymentDeadline: existingDeadline,
      baskets: [makeBasket({ userId: 'user-1' }), makeBasket({ userId: 'user-2' })],
    }))

    const req = makeRequest({ sessionId: 'sess-initiate-split-no-overwrite', basketId: 'user-2', paymentMode: 'card' })
    await POST(req)

    expect(readSession('sess-initiate-split-no-overwrite').paymentDeadline).toBe(existingDeadline)
  })

  it('returns 410 when the payment deadline has expired', async () => {
    seedSession('sess-initiate-expired', makeSession({
      id: 'sess-initiate-expired',
      baskets: [makeBasket({ userId: 'user-1' })],
      paymentDeadline: new Date(Date.now() - 60_000).toISOString(),
    }))

    const req = makeRequest({ sessionId: 'sess-initiate-expired', basketId: 'user-1', paymentMode: 'card' })
    const res = await POST(req)

    expect(res.status).toBe(410)
  })

  // ---------------------------------------------------------------------
  // paymentPlan-aware behavior (issue #160)
  // ---------------------------------------------------------------------

  it('persists a client-supplied paymentPlan onto the session', async () => {
    seedSession('sess-initiate-plan-persist', makeSession({
      id: 'sess-initiate-plan-persist',
      baskets: [makeBasket({ userId: 'user-1' }), makeBasket({ userId: 'user-2' }), makeBasket({ userId: 'user-3' })],
    }))

    const req = makeRequest({
      sessionId: 'sess-initiate-plan-persist',
      basketId: 'user-1',
      paymentMode: 'card',
      paymentPlan: 'single',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(readSession('sess-initiate-plan-persist').paymentPlan).toBe('single')
  })

  it('does not stamp a paymentDeadline for a whole-table (single) payment plan even with 2+ baskets', async () => {
    seedSession('sess-initiate-whole-table-no-deadline', makeSession({
      id: 'sess-initiate-whole-table-no-deadline',
      baskets: [makeBasket({ userId: 'user-1' }), makeBasket({ userId: 'user-2' }), makeBasket({ userId: 'user-3' })],
    }))

    const req = makeRequest({
      sessionId: 'sess-initiate-whole-table-no-deadline',
      basketId: 'user-1',
      paymentMode: 'card',
      paymentPlan: 'single',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(readSession('sess-initiate-whole-table-no-deadline').paymentDeadline).toBeNull()
  })

  it('does not overwrite an already-recorded paymentPlan with a later client-supplied value', async () => {
    seedSession('sess-initiate-plan-locked', makeSession({
      id: 'sess-initiate-plan-locked',
      paymentPlan: 'split',
      baskets: [makeBasket({ userId: 'user-1' }), makeBasket({ userId: 'user-2' })],
    }))

    const req = makeRequest({
      sessionId: 'sess-initiate-plan-locked',
      basketId: 'user-1',
      paymentMode: 'card',
      paymentPlan: 'single',
    })
    await POST(req)

    expect(readSession('sess-initiate-plan-locked').paymentPlan).toBe('split')
  })

  it('still stamps a paymentDeadline when paymentPlan is split, even when explicitly supplied', async () => {
    seedSession('sess-initiate-split-explicit', makeSession({
      id: 'sess-initiate-split-explicit',
      baskets: [makeBasket({ userId: 'user-1' }), makeBasket({ userId: 'user-2' })],
    }))

    const req = makeRequest({
      sessionId: 'sess-initiate-split-explicit',
      basketId: 'user-1',
      paymentMode: 'card',
      paymentPlan: 'split',
    })
    await POST(req)

    expect(readSession('sess-initiate-split-explicit').paymentDeadline).not.toBeNull()
  })

  // ---------------------------------------------------------------------
  // computeBasketDue-aware charge amount (issue #162 — shared items)
  // ---------------------------------------------------------------------

  it('split-mode charge amount reflects computeBasketDue, redistributing a shared item across its sharers', async () => {
    mockCategoryDocs = [{ id: 'cat-1', data: () => ({ name: 'Mains', description: '', order: 0 }) }]
    mockMenuItemDocs = [
      {
        id: 'dessert',
        data: () => ({
          name: 'Cake',
          description: '',
          price: 2000, // $20.00, stored in cents per FirestoreMenuItem
          imageUrl: '',
          categoryId: 'cat-1',
          dietaryTags: [],
          allergens: [],
          isAvailable: true,
          customizations: { sizes: [], addOns: [] },
        }),
      },
      {
        id: 'burger',
        data: () => ({
          name: 'Burger',
          description: '',
          price: 1000, // $10.00
          imageUrl: '',
          categoryId: 'cat-1',
          dietaryTags: [],
          allergens: [],
          isAvailable: true,
          customizations: { sizes: [], addOns: [] },
        }),
      },
    ]

    seedSession('sess-initiate-shared-item', makeSession({
      id: 'sess-initiate-shared-item',
      paymentPlan: 'split',
      baskets: [
        makeBasket({
          userId: 'user-1',
          items: [
            makeItem({
              itemId: 'dessert',
              quantity: 1,
              isShared: true,
              sharerIds: ['user-1', 'user-2'],
            }),
          ],
        }),
        makeBasket({
          userId: 'user-2',
          items: [makeItem({ itemId: 'burger', quantity: 1, isShared: false })],
        }),
      ],
    }))

    const req = makeRequest({
      sessionId: 'sess-initiate-shared-item',
      basketId: 'user-1',
      paymentMode: 'card',
      paymentPlan: 'split',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const helcimCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('helcim.com'),
    )
    expect(helcimCall).toBeDefined()
    const helcimBody = JSON.parse(helcimCall![1].body as string)

    // user-1 owes half of the $20 shared dessert ($10 = 1000 cents), not the
    // full $2000 it would be charged under computeBasketTotal.
    expect(helcimBody.amount).toBe(1000)
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

    seedSession('sess-initiate-helcim-error', makeSession({
      id: 'sess-initiate-helcim-error',
      baskets: [makeBasket({ userId: 'user-1' })],
    }))

    const req = makeRequest({ sessionId: 'sess-initiate-helcim-error', basketId: 'user-1', paymentMode: 'card' })
    const res = await POST(req)

    expect(res.status).toBe(502)
  })
})
