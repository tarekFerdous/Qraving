import { describe, it, expect } from 'vitest'
import {
  computeBasketTotal,
  computeBasketDue,
  computeSessionTotal,
  resolvePaymentMode,
  allBasketsPaid,
  isPaymentDeadlineExpired,
  applyWholeTablePayment,
  isSharedDevicePayment,
  resolveAbsoluteUrl,
} from './payment'
import type { Session, UserBasket, BasketItem } from './session'
import type { MenuItem } from './menu'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeBasket(overrides: Partial<UserBasket> = {}): UserBasket {
  return {
    userId: 'u1',
    name: 'User 1',
    phone: '+10000000000',
    items: [],
    paymentStatus: 'pending',
    paymentMethod: null,
    helcimTransactionId: null,
    ...overrides,
  }
}

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

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-1',
    name: 'Burger',
    description: 'A tasty burger',
    imageUrl: 'https://example.com/burger.jpg',
    price: 10,
    dietaryTags: [],
    allergens: [],
    isAvailable: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// computeBasketTotal
// ---------------------------------------------------------------------------

describe('computeBasketTotal', () => {
  it('returns 0 for an empty basket', () => {
    const basket = makeBasket()
    expect(computeBasketTotal(basket, [makeMenuItem()])).toBe(0)
  })

  it('returns 0 for an empty basket with no menu items', () => {
    const basket = makeBasket()
    expect(computeBasketTotal(basket, [])).toBe(0)
  })

  it('multiplies price by quantity for a single item', () => {
    const basket = makeBasket({ items: [makeItem({ itemId: 'item-1', quantity: 3 })] })
    const menuItems = [makeMenuItem({ id: 'item-1', price: 12 })]
    expect(computeBasketTotal(basket, menuItems)).toBe(36)
  })

  it('sums across multiple items with different prices and quantities', () => {
    const basket = makeBasket({
      items: [
        makeItem({ itemId: 'item-1', quantity: 2 }),
        makeItem({ itemId: 'item-2', quantity: 1 }),
      ],
    })
    const menuItems = [
      makeMenuItem({ id: 'item-1', price: 10 }),
      makeMenuItem({ id: 'item-2', price: 15 }),
    ]
    // 2 * 10 + 1 * 15 = 35
    expect(computeBasketTotal(basket, menuItems)).toBe(35)
  })

  it('treats items not found in menu as price 0', () => {
    const basket = makeBasket({ items: [makeItem({ itemId: 'unknown-item', quantity: 5 })] })
    const menuItems = [makeMenuItem({ id: 'item-1', price: 10 })]
    expect(computeBasketTotal(basket, menuItems)).toBe(0)
  })

  it('handles a mix of matched and unmatched items', () => {
    const basket = makeBasket({
      items: [
        makeItem({ itemId: 'item-1', quantity: 2 }),
        makeItem({ itemId: 'missing', quantity: 3 }),
      ],
    })
    const menuItems = [makeMenuItem({ id: 'item-1', price: 8 })]
    // 2 * 8 + 3 * 0 = 16
    expect(computeBasketTotal(basket, menuItems)).toBe(16)
  })
})

// ---------------------------------------------------------------------------
// computeSessionTotal
// ---------------------------------------------------------------------------

describe('computeSessionTotal', () => {
  it('returns 0 for a session with no baskets', () => {
    const session = makeSession()
    expect(computeSessionTotal(session, [makeMenuItem()])).toBe(0)
  })

  it('sums totals across multiple baskets', () => {
    const basket1 = makeBasket({ userId: 'u1', items: [makeItem({ itemId: 'item-1', quantity: 2 })] })
    const basket2 = makeBasket({ userId: 'u2', items: [makeItem({ itemId: 'item-2', quantity: 1 })] })
    const session = makeSession({ baskets: [basket1, basket2] })
    const menuItems = [
      makeMenuItem({ id: 'item-1', price: 10 }),
      makeMenuItem({ id: 'item-2', price: 20 }),
    ]
    // 2 * 10 + 1 * 20 = 40
    expect(computeSessionTotal(session, menuItems)).toBe(40)
  })

  it('returns 0 when all baskets are empty', () => {
    const session = makeSession({
      baskets: [makeBasket({ userId: 'u1' }), makeBasket({ userId: 'u2' })],
    })
    expect(computeSessionTotal(session, [makeMenuItem()])).toBe(0)
  })

  it('handles three baskets correctly', () => {
    const menuItems = [makeMenuItem({ id: 'item-1', price: 5 })]
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem({ quantity: 1 })] }),
        makeBasket({ userId: 'u2', items: [makeItem({ quantity: 2 })] }),
        makeBasket({ userId: 'u3', items: [makeItem({ quantity: 3 })] }),
      ],
    })
    // 1*5 + 2*5 + 3*5 = 30
    expect(computeSessionTotal(session, menuItems)).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// computeBasketDue
// ---------------------------------------------------------------------------

describe('computeBasketDue', () => {
  it('matches computeBasketTotal when the basket has no shared items', () => {
    const basket = makeBasket({
      userId: 'u1',
      items: [
        makeItem({ itemId: 'item-1', quantity: 2 }),
        makeItem({ itemId: 'item-2', quantity: 1 }),
      ],
    })
    const menuItems = [
      makeMenuItem({ id: 'item-1', price: 10 }),
      makeMenuItem({ id: 'item-2', price: 15 }),
    ]
    const session = makeSession({ baskets: [basket] })

    expect(computeBasketDue(basket, session, menuItems)).toBe(computeBasketTotal(basket, menuItems))
    expect(computeBasketDue(basket, session, menuItems)).toBe(35)
  })

  it('splits one shared item evenly across 2 baskets and each basket still owes its own unshared items', () => {
    const menuItems = [
      makeMenuItem({ id: 'dessert', price: 20 }),
      makeMenuItem({ id: 'burger', price: 10 }),
    ]
    const basket1 = makeBasket({
      userId: 'u1',
      items: [makeItem({ itemId: 'dessert', quantity: 1, isShared: true, sharerIds: ['u1', 'u2'] })],
    })
    const basket2 = makeBasket({
      userId: 'u2',
      items: [makeItem({ itemId: 'burger', quantity: 1, isShared: false })],
    })
    const session = makeSession({ baskets: [basket1, basket2] })

    // basket1: 20 / 2 (its half of the shared dessert) = 10
    expect(computeBasketDue(basket1, session, menuItems)).toBe(10)
    // basket2: 20 / 2 (its half of the shared dessert) + 10 (its own burger) = 20
    expect(computeBasketDue(basket2, session, menuItems)).toBe(20)
    // Redistribution never changes the whole-table total.
    expect(computeBasketDue(basket1, session, menuItems) + computeBasketDue(basket2, session, menuItems)).toBe(
      computeSessionTotal(session, menuItems),
    )
  })

  it('splits one shared item evenly across every basket in the session', () => {
    const menuItems = [makeMenuItem({ id: 'dessert', price: 30 })]
    const basket1 = makeBasket({
      userId: 'u1',
      items: [
        makeItem({ itemId: 'dessert', quantity: 1, isShared: true, sharerIds: ['u1', 'u2', 'u3'] }),
      ],
    })
    const basket2 = makeBasket({ userId: 'u2', items: [] })
    const basket3 = makeBasket({ userId: 'u3', items: [] })
    const session = makeSession({ baskets: [basket1, basket2, basket3] })

    expect(computeBasketDue(basket1, session, menuItems)).toBe(10)
    expect(computeBasketDue(basket2, session, menuItems)).toBe(10)
    expect(computeBasketDue(basket3, session, menuItems)).toBe(10)
    expect(computeSessionTotal(session, menuItems)).toBe(30)
  })

  it('excludes a basket from a shared item cost when it is not in the resolved sharer list', () => {
    const menuItems = [makeMenuItem({ id: 'dessert', price: 20 })]
    const basket1 = makeBasket({
      userId: 'u1',
      items: [makeItem({ itemId: 'dessert', quantity: 1, isShared: true, sharerIds: ['u1', 'u2'] })],
    })
    const basket2 = makeBasket({ userId: 'u2', items: [] })
    const basket3 = makeBasket({ userId: 'u3', items: [] }) // not a sharer
    const session = makeSession({ baskets: [basket1, basket2, basket3] })

    expect(computeBasketDue(basket3, session, menuItems)).toBe(0)
  })

  it('treats an unresolved shared item (sharerIds null) as full price on the adder, as a safe fallback', () => {
    const menuItems = [makeMenuItem({ id: 'dessert', price: 20 })]
    const basket1 = makeBasket({
      userId: 'u1',
      items: [makeItem({ itemId: 'dessert', quantity: 1, isShared: true, sharerIds: null })],
    })
    const basket2 = makeBasket({ userId: 'u2', items: [] })
    const session = makeSession({ baskets: [basket1, basket2] })

    expect(computeBasketDue(basket1, session, menuItems)).toBe(20)
    expect(computeBasketDue(basket2, session, menuItems)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// resolvePaymentMode
// ---------------------------------------------------------------------------

describe('resolvePaymentMode', () => {
  it("returns 'single' when there are no baskets", () => {
    const session = makeSession()
    expect(resolvePaymentMode(session)).toBe('single')
  })

  it("returns 'single' when no baskets have items", () => {
    const session = makeSession({
      baskets: [makeBasket({ userId: 'u1' }), makeBasket({ userId: 'u2' })],
    })
    expect(resolvePaymentMode(session)).toBe('single')
  })

  it("returns 'single' when exactly one basket has items", () => {
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()] }),
        makeBasket({ userId: 'u2' }),
      ],
    })
    expect(resolvePaymentMode(session)).toBe('single')
  })

  it("returns 'split' when two baskets have items", () => {
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()] }),
        makeBasket({ userId: 'u2', items: [makeItem()] }),
      ],
    })
    expect(resolvePaymentMode(session)).toBe('split')
  })

  it("returns 'split' when three or more baskets have items", () => {
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()] }),
        makeBasket({ userId: 'u2', items: [makeItem()] }),
        makeBasket({ userId: 'u3', items: [makeItem()] }),
      ],
    })
    expect(resolvePaymentMode(session)).toBe('split')
  })
})

// ---------------------------------------------------------------------------
// allBasketsPaid
// ---------------------------------------------------------------------------

describe('allBasketsPaid', () => {
  it('returns true when session has no baskets', () => {
    const session = makeSession()
    expect(allBasketsPaid(session)).toBe(true)
  })

  it('returns true when no baskets have items (only empty baskets)', () => {
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', paymentStatus: 'pending' }),
        makeBasket({ userId: 'u2', paymentStatus: 'pending' }),
      ],
    })
    expect(allBasketsPaid(session)).toBe(true)
  })

  it('returns true when all non-empty baskets are paid', () => {
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()], paymentStatus: 'paid' }),
        makeBasket({ userId: 'u2', items: [makeItem()], paymentStatus: 'paid' }),
      ],
    })
    expect(allBasketsPaid(session)).toBe(true)
  })

  it('returns false when one non-empty basket is still pending', () => {
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()], paymentStatus: 'paid' }),
        makeBasket({ userId: 'u2', items: [makeItem()], paymentStatus: 'pending' }),
      ],
    })
    expect(allBasketsPaid(session)).toBe(false)
  })

  it('returns false when one non-empty basket has a failed status', () => {
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()], paymentStatus: 'paid' }),
        makeBasket({ userId: 'u2', items: [makeItem()], paymentStatus: 'failed' }),
      ],
    })
    expect(allBasketsPaid(session)).toBe(false)
  })

  it('ignores empty baskets when evaluating paid status', () => {
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()], paymentStatus: 'paid' }),
        // empty basket with pending status — should be ignored
        makeBasket({ userId: 'u2', items: [], paymentStatus: 'pending' }),
      ],
    })
    expect(allBasketsPaid(session)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isPaymentDeadlineExpired
// ---------------------------------------------------------------------------

describe('isPaymentDeadlineExpired', () => {
  it('returns false when paymentDeadline is null', () => {
    const session = makeSession({ paymentDeadline: null })
    expect(isPaymentDeadlineExpired(session)).toBe(false)
  })

  it('returns false when paymentDeadline is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const session = makeSession({ paymentDeadline: future })
    expect(isPaymentDeadlineExpired(session)).toBe(false)
  })

  it('returns true when paymentDeadline is in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const session = makeSession({ paymentDeadline: past })
    expect(isPaymentDeadlineExpired(session)).toBe(true)
  })

  it('returns true for a deadline well in the past', () => {
    const session = makeSession({ paymentDeadline: '2020-01-01T00:00:00.000Z' })
    expect(isPaymentDeadlineExpired(session)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isSharedDevicePayment
// ---------------------------------------------------------------------------

describe('isSharedDevicePayment', () => {
  it('returns false when there are no baskets', () => {
    const session = makeSession()
    expect(isSharedDevicePayment(session)).toBe(false)
  })

  it('returns false when no baskets have items', () => {
    const session = makeSession({
      baskets: [makeBasket({ userId: 'u1' }), makeBasket({ userId: 'u2' })],
    })
    expect(isSharedDevicePayment(session)).toBe(false)
  })

  it('returns false when exactly one basket has items', () => {
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()] }),
        makeBasket({ userId: 'u2' }),
      ],
    })
    expect(isSharedDevicePayment(session)).toBe(false)
  })

  it('returns true when two baskets have items', () => {
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()] }),
        makeBasket({ userId: 'u2', items: [makeItem()] }),
      ],
    })
    expect(isSharedDevicePayment(session)).toBe(true)
  })

  it('returns true when three or more baskets have items', () => {
    const session = makeSession({
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()] }),
        makeBasket({ userId: 'u2', items: [makeItem()] }),
        makeBasket({ userId: 'u3', items: [makeItem()] }),
      ],
    })
    expect(isSharedDevicePayment(session)).toBe(true)
  })

  it('remains true regardless of session.paymentPlan (independent of the chosen plan)', () => {
    const session = makeSession({
      paymentPlan: 'single',
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()] }),
        makeBasket({ userId: 'u2', items: [makeItem()] }),
      ],
    })
    // A whole-table 'single' payer plan can still have 2+ non-empty baskets —
    // the shared-device gate cares about basket count, not the chosen plan.
    expect(isSharedDevicePayment(session)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// resolveAbsoluteUrl
// ---------------------------------------------------------------------------

describe('resolveAbsoluteUrl', () => {
  it('returns an already-absolute https URL unchanged', () => {
    const url = 'https://secure.helcim.app/interac/abc123?token=xyz'
    expect(resolveAbsoluteUrl(url, 'https://qraving.app')).toBe(url)
  })

  it('returns an already-absolute http URL unchanged', () => {
    const url = 'http://example.com/pay'
    expect(resolveAbsoluteUrl(url, 'https://qraving.app')).toBe(url)
  })

  it('resolves a relative path against the given origin', () => {
    const url = '/api/payment/interac-callback?sessionId=sess-1&basketId=u1&result=APPROVED'
    expect(resolveAbsoluteUrl(url, 'https://qraving.app')).toBe(
      'https://qraving.app/api/payment/interac-callback?sessionId=sess-1&basketId=u1&result=APPROVED',
    )
  })

  it('resolves a relative path against an origin with a port', () => {
    const url = '/api/payment/interac-callback?sessionId=sess-1&basketId=u1&result=APPROVED'
    expect(resolveAbsoluteUrl(url, 'http://localhost:3000')).toBe(
      'http://localhost:3000/api/payment/interac-callback?sessionId=sess-1&basketId=u1&result=APPROVED',
    )
  })
})

// ---------------------------------------------------------------------------
// applyWholeTablePayment
// ---------------------------------------------------------------------------

describe('applyWholeTablePayment', () => {
  it('marks every non-empty basket as paid with the shared transaction id and payment method', () => {
    const session = makeSession({
      paymentPlan: 'single',
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()] }),
        makeBasket({ userId: 'u2', items: [makeItem()] }),
      ],
    })

    const updated = applyWholeTablePayment(session, 'txn-shared-1', 'card')

    for (const basket of updated.baskets) {
      expect(basket.paymentStatus).toBe('paid')
      expect(basket.helcimTransactionId).toBe('txn-shared-1')
      expect(basket.paymentMethod).toBe('card')
    }
  })

  it('leaves empty baskets untouched', () => {
    const session = makeSession({
      paymentPlan: 'single',
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()] }),
        makeBasket({ userId: 'u2', items: [], paymentStatus: 'pending' }),
      ],
    })

    const updated = applyWholeTablePayment(session, 'txn-shared-2', 'apple_pay')

    const emptyBasket = updated.baskets.find((b) => b.userId === 'u2')!
    expect(emptyBasket.paymentStatus).toBe('pending')
    expect(emptyBasket.helcimTransactionId).toBeNull()
    expect(emptyBasket.paymentMethod).toBeNull()
  })

  it('results in allBasketsPaid returning true for a 3-basket session', () => {
    const session = makeSession({
      paymentPlan: 'single',
      baskets: [
        makeBasket({ userId: 'u1', items: [makeItem()] }),
        makeBasket({ userId: 'u2', items: [makeItem()] }),
        makeBasket({ userId: 'u3', items: [makeItem()] }),
      ],
    })

    const updated = applyWholeTablePayment(session, 'txn-shared-3', 'interac')

    expect(allBasketsPaid(updated)).toBe(true)
  })

  it('does not mutate the input session', () => {
    const session = makeSession({
      baskets: [makeBasket({ userId: 'u1', items: [makeItem()] })],
    })

    applyWholeTablePayment(session, 'txn-shared-4', 'card')

    expect(session.baskets[0].paymentStatus).toBe('pending')
    expect(session.baskets[0].helcimTransactionId).toBeNull()
  })

  it('returns a new session object (pure)', () => {
    const session = makeSession({ baskets: [makeBasket({ items: [makeItem()] })] })
    const updated = applyWholeTablePayment(session, 'txn-shared-5', 'card')
    expect(updated).not.toBe(session)
  })
})
