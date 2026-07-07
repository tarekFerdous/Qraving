import type { Session, UserBasket } from './session'
import type { MenuItem } from './menu'

/**
 * Sum of item.quantity * matching MenuItem.price for each BasketItem.
 * Items with no matching MenuItem are treated as price 0.
 */
export function computeBasketTotal(basket: UserBasket, menuItems: MenuItem[]): number {
  return basket.items.reduce((total, item) => {
    const menuItem = menuItems.find((m) => m.id === item.itemId)
    const price = menuItem ? menuItem.price : 0
    return total + price * item.quantity
  }, 0)
}

/**
 * Sum of computeBasketTotal across all session.baskets.
 */
export function computeSessionTotal(session: Session, menuItems: MenuItem[]): number {
  return session.baskets.reduce(
    (total, basket) => total + computeBasketTotal(basket, menuItems),
    0,
  )
}

/**
 * Returns 'single' when exactly one basket has items, or when no baskets have items.
 * Returns 'split' when two or more baskets have items.
 */
export function resolvePaymentMode(session: Session): 'single' | 'split' {
  const nonEmptyCount = session.baskets.filter((b) => b.items.length > 0).length
  return nonEmptyCount >= 2 ? 'split' : 'single'
}

/**
 * Returns true when every basket that has items has paymentStatus === 'paid'.
 * An empty session (no baskets with items) returns true.
 */
export function allBasketsPaid(session: Session): boolean {
  const nonEmptyBaskets = session.baskets.filter((b) => b.items.length > 0)
  return nonEmptyBaskets.every((b) => b.paymentStatus === 'paid')
}

/**
 * Returns true when paymentDeadline is non-null and Date.now() is past it.
 * Returns false when paymentDeadline is null.
 */
export function isPaymentDeadlineExpired(session: Session): boolean {
  if (session.paymentDeadline === null) return false
  return Date.now() > new Date(session.paymentDeadline).getTime()
}
