import { describe, it, expect } from 'vitest'
import {
  createSession,
  nextUserLabel,
  addBasket,
  upsertItem,
  removeItem,
  updateItemQuantity,
  updateItemInstructions,
  updateItemSharers,
  hasUnresolvedSharedItems,
  isSessionClosed,
} from './session'
import type { Session, UserBasket, BasketItem } from './session'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe('createSession', () => {
  it('returns a session with the given id, userCounter 0, empty baskets, orderStatus building, and null paymentDeadline', () => {
    const session = createSession('sess-abc')
    expect(session).toEqual({
      id: 'sess-abc',
      userCounter: 0,
      baskets: [],
      orderStatus: 'building',
      paymentDeadline: null,
      paymentPlan: null,
    })
  })
})

// ---------------------------------------------------------------------------
// nextUserLabel
// ---------------------------------------------------------------------------

describe('nextUserLabel', () => {
  it('returns "User 1" on first call', () => {
    const session = createSession('s1')
    const { label } = nextUserLabel(session)
    expect(label).toBe('User 1')
  })

  it('returns "User 2" on second call using updated session', () => {
    const session = createSession('s1')
    const { session: s2 } = nextUserLabel(session)
    const { label } = nextUserLabel(s2)
    expect(label).toBe('User 2')
  })

  it('increments the counter in the returned session', () => {
    const session = createSession('s1')
    const { session: updated } = nextUserLabel(session)
    expect(updated.userCounter).toBe(1)
  })

  it('does not mutate the input session', () => {
    const session = createSession('s1')
    nextUserLabel(session)
    expect(session.userCounter).toBe(0)
  })

  it('tracks counter across multiple calls', () => {
    let s: Session = createSession('s1')
    let label = ''
    for (let i = 1; i <= 5; i++) {
      const result = nextUserLabel(s)
      label = result.label
      s = result.session
    }
    expect(label).toBe('User 5')
    expect(s.userCounter).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// addBasket
// ---------------------------------------------------------------------------

describe('addBasket', () => {
  it('adds a basket and returns a new session', () => {
    const session = createSession('s1')
    const basket = makeBasket()
    const updated = addBasket(session, basket)
    expect(updated.baskets).toHaveLength(1)
    expect(updated.baskets[0]).toEqual(basket)
  })

  it('does not mutate the input session', () => {
    const session = createSession('s1')
    addBasket(session, makeBasket())
    expect(session.baskets).toHaveLength(0)
  })

  it('returns a new session object (pure)', () => {
    const session = createSession('s1')
    const updated = addBasket(session, makeBasket())
    expect(updated).not.toBe(session)
  })
})

// ---------------------------------------------------------------------------
// upsertItem
// ---------------------------------------------------------------------------

describe('upsertItem', () => {
  it('adds a new item when the basket is empty', () => {
    const basket = makeBasket()
    const item = makeItem()
    const updated = upsertItem(basket, item)
    expect(updated.items).toHaveLength(1)
    expect(updated.items[0]).toEqual(item)
  })

  it('adds a new item when itemId differs', () => {
    const basket = makeBasket({ items: [makeItem({ itemId: 'item-1' })] })
    const updated = upsertItem(basket, makeItem({ itemId: 'item-2' }))
    expect(updated.items).toHaveLength(2)
  })

  it('adds a new item when size differs', () => {
    const basket = makeBasket({ items: [makeItem({ size: 'Small' })] })
    const updated = upsertItem(basket, makeItem({ size: 'Large' }))
    expect(updated.items).toHaveLength(2)
  })

  it('adds a new item when addOns differ', () => {
    const basket = makeBasket({ items: [makeItem({ addOns: ['cheese'] })] })
    const updated = upsertItem(basket, makeItem({ addOns: ['bacon'] }))
    expect(updated.items).toHaveLength(2)
  })

  it('increments quantity on exact match (same itemId, size, addOns)', () => {
    const item = makeItem({ addOns: ['cheese'], quantity: 1 })
    const basket = makeBasket({ items: [item] })
    const updated = upsertItem(basket, makeItem({ addOns: ['cheese'], quantity: 2 }))
    expect(updated.items).toHaveLength(1)
    expect(updated.items[0].quantity).toBe(3)
  })

  it('does not mutate the input basket', () => {
    const basket = makeBasket()
    upsertItem(basket, makeItem())
    expect(basket.items).toHaveLength(0)
  })

  it('returns a new basket object (pure)', () => {
    const basket = makeBasket()
    const updated = upsertItem(basket, makeItem())
    expect(updated).not.toBe(basket)
  })
})

// ---------------------------------------------------------------------------
// removeItem
// ---------------------------------------------------------------------------

describe('removeItem', () => {
  it('removes the target item', () => {
    const basket = makeBasket({ items: [makeItem({ itemId: 'item-1' })] })
    const updated = removeItem(basket, 'item-1')
    expect(updated.items).toHaveLength(0)
  })

  it('leaves other items intact', () => {
    const basket = makeBasket({
      items: [
        makeItem({ itemId: 'item-1' }),
        makeItem({ itemId: 'item-2', name: 'Pizza' }),
      ],
    })
    const updated = removeItem(basket, 'item-1')
    expect(updated.items).toHaveLength(1)
    expect(updated.items[0].itemId).toBe('item-2')
  })

  it('does nothing when itemId is not found', () => {
    const basket = makeBasket({ items: [makeItem({ itemId: 'item-1' })] })
    const updated = removeItem(basket, 'nonexistent')
    expect(updated.items).toHaveLength(1)
  })

  it('does not mutate the input basket', () => {
    const basket = makeBasket({ items: [makeItem({ itemId: 'item-1' })] })
    removeItem(basket, 'item-1')
    expect(basket.items).toHaveLength(1)
  })

  it('returns a new basket object (pure)', () => {
    const basket = makeBasket({ items: [makeItem()] })
    const updated = removeItem(basket, 'item-1')
    expect(updated).not.toBe(basket)
  })
})

// ---------------------------------------------------------------------------
// updateItemQuantity
// ---------------------------------------------------------------------------

describe('updateItemQuantity', () => {
  it('updates quantity when positive', () => {
    const basket = makeBasket({ items: [makeItem({ quantity: 1 })] })
    const updated = updateItemQuantity(basket, 'item-1', 5)
    expect(updated.items[0].quantity).toBe(5)
  })

  it('removes the item when quantity is 0', () => {
    const basket = makeBasket({ items: [makeItem()] })
    const updated = updateItemQuantity(basket, 'item-1', 0)
    expect(updated.items).toHaveLength(0)
  })

  it('removes the item when quantity is negative', () => {
    const basket = makeBasket({ items: [makeItem()] })
    const updated = updateItemQuantity(basket, 'item-1', -1)
    expect(updated.items).toHaveLength(0)
  })

  it('leaves other items intact when removing', () => {
    const basket = makeBasket({
      items: [makeItem({ itemId: 'item-1' }), makeItem({ itemId: 'item-2' })],
    })
    const updated = updateItemQuantity(basket, 'item-1', 0)
    expect(updated.items).toHaveLength(1)
    expect(updated.items[0].itemId).toBe('item-2')
  })

  it('does not mutate the input basket', () => {
    const basket = makeBasket({ items: [makeItem({ quantity: 1 })] })
    updateItemQuantity(basket, 'item-1', 3)
    expect(basket.items[0].quantity).toBe(1)
  })

  it('returns a new basket object (pure)', () => {
    const basket = makeBasket({ items: [makeItem()] })
    const updated = updateItemQuantity(basket, 'item-1', 2)
    expect(updated).not.toBe(basket)
  })
})

// ---------------------------------------------------------------------------
// updateItemInstructions
// ---------------------------------------------------------------------------

describe('updateItemInstructions', () => {
  it('replaces the instructions for the target item', () => {
    const basket = makeBasket({ items: [makeItem({ instructions: '' })] })
    const updated = updateItemInstructions(basket, 'item-1', 'no onions')
    expect(updated.items[0].instructions).toBe('no onions')
  })

  it('leaves other items intact', () => {
    const basket = makeBasket({
      items: [
        makeItem({ itemId: 'item-1', instructions: '' }),
        makeItem({ itemId: 'item-2', instructions: 'extra sauce' }),
      ],
    })
    const updated = updateItemInstructions(basket, 'item-1', 'no onions')
    expect(updated.items[1].instructions).toBe('extra sauce')
  })

  it('does not mutate the input basket', () => {
    const basket = makeBasket({ items: [makeItem({ instructions: '' })] })
    updateItemInstructions(basket, 'item-1', 'no onions')
    expect(basket.items[0].instructions).toBe('')
  })

  it('returns a new basket object (pure)', () => {
    const basket = makeBasket({ items: [makeItem()] })
    const updated = updateItemInstructions(basket, 'item-1', 'no onions')
    expect(updated).not.toBe(basket)
  })
})

// ---------------------------------------------------------------------------
// updateItemSharers
// ---------------------------------------------------------------------------

describe('updateItemSharers', () => {
  it('sets sharerIds on the target item', () => {
    const basket = makeBasket({
      userId: 'u1',
      items: [makeItem({ itemId: 'item-1', isShared: true, sharerIds: null })],
    })
    const updated = updateItemSharers(basket, 'item-1', ['u1', 'u2'])
    expect(updated.items[0].sharerIds).toEqual(['u1', 'u2'])
  })

  it("always includes the basket's own userId even if omitted by the caller", () => {
    const basket = makeBasket({
      userId: 'u1',
      items: [makeItem({ itemId: 'item-1', isShared: true, sharerIds: null })],
    })
    const updated = updateItemSharers(basket, 'item-1', ['u2', 'u3'])
    expect(updated.items[0].sharerIds).toEqual(['u1', 'u2', 'u3'])
  })

  it("does not duplicate the basket's own userId when already included", () => {
    const basket = makeBasket({
      userId: 'u1',
      items: [makeItem({ itemId: 'item-1', isShared: true, sharerIds: null })],
    })
    const updated = updateItemSharers(basket, 'item-1', ['u1', 'u2'])
    expect(updated.items[0].sharerIds).toEqual(['u1', 'u2'])
  })

  it('leaves other items intact', () => {
    const basket = makeBasket({
      userId: 'u1',
      items: [
        makeItem({ itemId: 'item-1', isShared: true, sharerIds: null }),
        makeItem({ itemId: 'item-2', isShared: false, sharerIds: null }),
      ],
    })
    const updated = updateItemSharers(basket, 'item-1', ['u1', 'u2'])
    expect(updated.items[1].sharerIds).toBeNull()
  })

  it('does not mutate the input basket', () => {
    const basket = makeBasket({
      userId: 'u1',
      items: [makeItem({ itemId: 'item-1', isShared: true, sharerIds: null })],
    })
    updateItemSharers(basket, 'item-1', ['u1', 'u2'])
    expect(basket.items[0].sharerIds).toBeNull()
  })

  it('returns a new basket object (pure)', () => {
    const basket = makeBasket({
      userId: 'u1',
      items: [makeItem({ itemId: 'item-1', isShared: true, sharerIds: null })],
    })
    const updated = updateItemSharers(basket, 'item-1', ['u1'])
    expect(updated).not.toBe(basket)
  })
})

// ---------------------------------------------------------------------------
// hasUnresolvedSharedItems
// ---------------------------------------------------------------------------

describe('hasUnresolvedSharedItems', () => {
  it('returns false for a basket with no items', () => {
    const basket = makeBasket()
    expect(hasUnresolvedSharedItems(basket)).toBe(false)
  })

  it('returns false when no items are shared', () => {
    const basket = makeBasket({ items: [makeItem({ isShared: false })] })
    expect(hasUnresolvedSharedItems(basket)).toBe(false)
  })

  it('returns true when a shared item has a null sharerIds', () => {
    const basket = makeBasket({ items: [makeItem({ isShared: true, sharerIds: null })] })
    expect(hasUnresolvedSharedItems(basket)).toBe(true)
  })

  it('returns false when a shared item has a resolved sharerIds', () => {
    const basket = makeBasket({
      items: [makeItem({ isShared: true, sharerIds: ['u1', 'u2'] })],
    })
    expect(hasUnresolvedSharedItems(basket)).toBe(false)
  })

  it('returns true when any one of multiple items is an unresolved shared item', () => {
    const basket = makeBasket({
      items: [
        makeItem({ itemId: 'item-1', isShared: false }),
        makeItem({ itemId: 'item-2', isShared: true, sharerIds: null }),
      ],
    })
    expect(hasUnresolvedSharedItems(basket)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isSessionClosed
// ---------------------------------------------------------------------------

describe('isSessionClosed', () => {
  it('returns false for a freshly created session (building)', () => {
    const session = createSession('s1')
    expect(isSessionClosed(session)).toBe(false)
  })

  it('returns false when orderStatus is payment_pending', () => {
    const session = makeSession({ orderStatus: 'payment_pending' })
    expect(isSessionClosed(session)).toBe(false)
  })

  it('returns false when orderStatus is fully_paid', () => {
    const session = makeSession({ orderStatus: 'fully_paid' })
    expect(isSessionClosed(session)).toBe(false)
  })

  it('returns true when orderStatus is submitted', () => {
    const session = makeSession({ orderStatus: 'submitted' })
    expect(isSessionClosed(session)).toBe(true)
  })

  it('returns false when orderStatus is accepted', () => {
    const session = makeSession({ orderStatus: 'accepted' })
    expect(isSessionClosed(session)).toBe(false)
  })

  it('returns false when orderStatus is rejected', () => {
    const session = makeSession({ orderStatus: 'rejected' })
    expect(isSessionClosed(session)).toBe(false)
  })
})
