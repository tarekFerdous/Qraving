export type Session = {
  id: string
  userCounter: number
  baskets: UserBasket[]
  orderStatus: 'building' | 'payment_pending' | 'fully_paid' | 'submitted' | 'accepted' | 'rejected'
  paymentDeadline: string | null  // ISO-8601, null by default
  /**
   * Set once during the payment sequence when the table has 2+ non-empty
   * baskets and a member chooses how the whole table pays. null until a
   * choice is made (including for sessions that never need one, e.g. a
   * single-basket session). 'single' = one person pays computeSessionTotal
   * in one transaction; 'split' = each basket pays independently (today's
   * existing per-basket behavior).
   */
  paymentPlan: 'single' | 'split' | null
}

export type UserBasket = {
  userId: string
  name: string        // "User 1" default, max 50 chars
  phone: string       // E.164, "+1XXXXXXXXXX"
  email?: string      // optional, captured at identity step
  items: BasketItem[]
  paymentStatus: 'pending' | 'paid' | 'failed'
  paymentMethod: 'apple_pay' | 'google_pay' | 'card' | 'interac' | null
  helcimTransactionId: string | null
}

export type BasketItem = {
  itemId: string
  name: string
  size: string
  addOns: string[]
  instructions: string
  quantity: number
  /**
   * Whether this item's cost should be split evenly across multiple baskets
   * (e.g. a shared table dessert) rather than landing entirely on the basket
   * that added it. Settable when the item is added — no sharer selection is
   * required at that point (see sharerIds).
   */
  isShared: boolean
  /**
   * The resolved list of basket userIds sharing this item's cost, set once at
   * payment time when the adding basket picks who else is splitting it. null
   * until resolved (including for non-shared items, where it's unused).
   * Always includes the adding basket's userId once resolved — the adder
   * can't be removed from their own sharer list.
   */
  sharerIds: string[] | null
}

/** Initialise an empty session. */
export function createSession(id: string): Session {
  return {
    id,
    userCounter: 0,
    baskets: [],
    orderStatus: 'building',
    paymentDeadline: null,
    paymentPlan: null,
  }
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

/**
 * Persist the resolved sharer list (basket userIds) onto a specific item,
 * keyed by itemId — mirrors updateItemInstructions. The adding basket's own
 * userId is always included even if the caller's sharerIds omits it, since
 * the adder can't be deselected from their own item's sharer list. Returns a
 * new UserBasket.
 */
export function updateItemSharers(
  basket: UserBasket,
  itemId: string,
  sharerIds: string[],
): UserBasket {
  const resolvedSharerIds = sharerIds.includes(basket.userId)
    ? sharerIds
    : [basket.userId, ...sharerIds]
  return {
    ...basket,
    items: basket.items.map((i) =>
      i.itemId === itemId ? { ...i, sharerIds: resolvedSharerIds } : i,
    ),
  }
}

/**
 * True when this basket contains any item flagged isShared whose sharer list
 * hasn't been resolved yet (sharerIds === null). Used to gate payment: such a
 * basket must go through sharer selection before checkout can open.
 */
export function hasUnresolvedSharedItems(basket: UserBasket): boolean {
  return basket.items.some((i) => i.isShared && i.sharerIds === null)
}

/**
 * Returns true once a session has been submitted to the kitchen
 * (orderStatus === 'submitted'). A closed session accepts no further items —
 * the table must re-scan the QR code to start a new session.
 */
export function isSessionClosed(session: Session): boolean {
  return session.orderStatus === 'submitted'
}
