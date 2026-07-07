export type Session = {
  id: string
  userCounter: number
  baskets: UserBasket[]
  orderStatus: 'building' | 'payment_pending' | 'fully_paid' | 'submitted' | 'accepted' | 'rejected'
  paymentDeadline: string | null  // ISO-8601, null by default
}

export type UserBasket = {
  userId: string
  name: string        // "User 1" default, max 50 chars
  phone: string       // E.164, "+1XXXXXXXXXX"
  items: BasketItem[]
  paymentStatus: 'pending' | 'paid' | 'failed'
  paymentMethod: 'apple_pay' | 'google_pay' | 'card' | 'interac' | null
  helcimTransactionId: string | null
}

export type BasketItem = {
  itemId: string
  name: string
  size: 'Small' | 'Medium' | 'Large'
  addOns: string[]
  instructions: string
  quantity: number
}

/** Initialise an empty session. */
export function createSession(id: string): Session {
  return { id, userCounter: 0, baskets: [], orderStatus: 'building', paymentDeadline: null }
}

/**
 * Returns the label for the next user ("User N") and a new session with the
 * counter incremented. Does not mutate the input session.
 */
export function nextUserLabel(session: Session): { label: string; session: Session } {
  const next = session.userCounter + 1
  return {
    label: `User ${next}`,
    session: { ...session, userCounter: next },
  }
}

/** Add a UserBasket to the session. Returns a new session. */
export function addBasket(session: Session, basket: UserBasket): Session {
  return { ...session, baskets: [...session.baskets, basket] }
}

/** Deep-equality check for two addOns arrays. */
function addOnsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Add item to basket, or increment its quantity when an exact match exists
 * (same itemId, size, and addOns). Returns a new UserBasket.
 */
export function upsertItem(basket: UserBasket, item: BasketItem): UserBasket {
  const existingIndex = basket.items.findIndex(
    (i) =>
      i.itemId === item.itemId &&
      i.size === item.size &&
      addOnsEqual(i.addOns, item.addOns),
  )

  if (existingIndex === -1) {
    return { ...basket, items: [...basket.items, item] }
  }

  const updatedItems = basket.items.map((i, idx) =>
    idx === existingIndex ? { ...i, quantity: i.quantity + item.quantity } : i,
  )
  return { ...basket, items: updatedItems }
}

/** Remove an item by itemId. Returns a new UserBasket. */
export function removeItem(basket: UserBasket, itemId: string): UserBasket {
  return { ...basket, items: basket.items.filter((i) => i.itemId !== itemId) }
}

/**
 * Set the quantity of an item. If quantity ≤ 0 the item is removed.
 * Returns a new UserBasket.
 */
export function updateItemQuantity(
  basket: UserBasket,
  itemId: string,
  quantity: number,
): UserBasket {
  if (quantity <= 0) {
    return removeItem(basket, itemId)
  }
  return {
    ...basket,
    items: basket.items.map((i) => (i.itemId === itemId ? { ...i, quantity } : i)),
  }
}

/** Replace the special instructions for an item. Returns a new UserBasket. */
export function updateItemInstructions(
  basket: UserBasket,
  itemId: string,
  instructions: string,
): UserBasket {
  return {
    ...basket,
    items: basket.items.map((i) => (i.itemId === itemId ? { ...i, instructions } : i)),
  }
}
