import { describe, it, expect } from 'vitest'
import {
  computeBasketTotal,
  computeSessionTotal,
  resolvePaymentMode,
  allBasketsPaid,
  isPaymentDeadlineExpired,
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
