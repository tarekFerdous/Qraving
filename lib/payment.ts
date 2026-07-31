import type { Session, UserBasket, BasketItem } from './session'
import type { MenuItem } from './menu'

/**
 * Sum of a BasketItem's selected size and add-on price deltas, looked up by
 * label from the matching MenuItem's customizations. Missing customizations,
 * or a size/add-on label with no matching entry, contribute 0.
 */
function customizationDelta(item: BasketItem, menuItem: MenuItem | undefined): number {
  if (!menuItem?.customizations) return 0
  const sizeDelta = menuItem.customizations.sizes.find((s) => s.label === item.size)?.priceDelta ?? 0
  const addOnsDelta = item.addOns.reduce((sum, label) => {
    const delta = menuItem.customizations!.addOns.find((a) => a.label === label)?.priceDelta ?? 0
    return sum + delta
  }, 0)
  return sizeDelta + addOnsDelta
}

/**
 * Sum of item.quantity * (matching MenuItem.price + selected size/add-on
 * price deltas) for each BasketItem. Items with no matching MenuItem are
 * treated as price 0 (deltas still resolve to 0 via customizationDelta).
 */
export function computeBasketTotal(basket: UserBasket, menuItems: MenuItem[]): number {
  return basket.items.reduce((total, item) => {
    const menuItem = menuItems.find((m) => m.id === item.itemId)
    const price = menuItem ? menuItem.price : 0
    return total + (price + customizationDelta(item, menuItem)) * item.quantity
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

/**
 * Computes what a given basket actually owes, redistributing the cost of
 * shared items across their resolved sharer lists instead of leaving it
 * entirely on the basket that physically added the item row.
 *
 * Walks every basket in the session (not just `basket.items`) because a
 * shared item might have been added by a *different* basket that this
 * basket is sharing the cost of. For each item found anywhere in the
 * session:
 *   - Not shared, or shared but not yet resolved (sharerIds === null): the
 *     safe fallback is to treat it exactly like computeBasketTotal — full
 *     price * quantity attributed only to the basket that physically holds
 *     the item row. (In practice this function is only ever called once
 *     every shared item on the basket has been resolved, since payment is
 *     gated on that — but the pure function stays well-defined either way.)
 *   - Shared and resolved: price * quantity is divided evenly across
 *     item.sharerIds, and this basket's share is included only if its
 *     userId appears in that resolved list.
 *
 * computeSessionTotal is unaffected by any of this — redistribution changes
 * only per-basket allocation, never the whole-table sum.
 */
export function computeBasketDue(
  basket: UserBasket,
  session: Session,
  menuItems: MenuItem[],
): number {
  return session.baskets.reduce((sessionSubtotal, owningBasket) => {
    const basketSubtotal = owningBasket.items.reduce((itemSubtotal, item) => {
      const menuItem = menuItems.find((m) => m.id === item.itemId)
      const price = menuItem ? menuItem.price : 0
      const itemCost = (price + customizationDelta(item, menuItem)) * item.quantity

      if (!item.isShared || item.sharerIds === null) {
        // Not shared, or shared but unresolved: full cost stays on the
        // basket that physically added it.
        return owningBasket.userId === basket.userId ? itemSubtotal + itemCost : itemSubtotal
      }

      // Shared and resolved: split evenly across the resolved sharer list.
      if (item.sharerIds.length === 0 || !item.sharerIds.includes(basket.userId)) {
        return itemSubtotal
      }
      return itemSubtotal + itemCost / item.sharerIds.length
    }, 0)
    return sessionSubtotal + basketSubtotal
  }, 0)
}

/**
 * Returns true when 2 or more baskets in the session have items — i.e. more
 * than one person could plausibly be paying serially on a single shared
 * device passed around the table.
 *
 * Deliberately independent of session.paymentPlan / resolvePaymentMode: a
 * whole-table 'single' payment plan can still have 2+ non-empty baskets (one
 * person covering everyone), and a shared-device confirm gate is still
 * exactly the right guard in that case. resolvePaymentMode answers "how
 * should this session be charged"; this answers "could this device be
 * passed between people mid-checkout" — the raw basket-count check happens
 * to be the same threshold, but the two questions are not the same question,
 * so this is kept as its own named predicate rather than reused via
 * effectivePlan/isSplit.
 */
export function isSharedDevicePayment(session: Session): boolean {
  return session.baskets.filter((b) => b.items.length > 0).length > 1
}

/**
 * Resolves a possibly-relative redirect URL into a fully-qualified absolute
 * URL, using `origin` as the base when the URL has no scheme of its own.
 *
 * Needed because /api/payment/initiate's test-mode sentinel redirectUrl
 * (used whenever HELCIM_API_KEY isn't configured) is a relative path like
 * '/api/payment/interac-callback?sessionId=...&basketId=...&status=approved&transactionId=__test__'
 * — fine for an on-device `window.location.href` redirect, but useless
 * encoded into a QR code or link opened fresh on a different device, which
 * has no origin to resolve a relative path against. A real Helcim redirect
 * URL is already absolute (has a scheme) and is returned unchanged.
 */
export function resolveAbsoluteUrl(url: string, origin: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) {
    // Already absolute (has a scheme) — return unchanged.
    return url
  }
  return new URL(url, origin).toString()
}

/**
 * Marks every non-empty basket (items.length > 0) as paid via a single shared
 * Helcim transaction, used when session.paymentPlan === 'single' (one person
 * covers the whole table). Every affected basket gets the same
 * helcimTransactionId and paymentMethod, so a refund lookup can trace any
 * basket back to the one covering transaction. Pure function — no I/O.
 */
export function applyWholeTablePayment(
  session: Session,
  transactionId: string,
  paymentMethod: UserBasket['paymentMethod'],
): Session {
  return {
    ...session,
    baskets: session.baskets.map((basket) =>
      basket.items.length > 0
        ? { ...basket, paymentStatus: 'paid', paymentMethod, helcimTransactionId: transactionId }
        : basket,
    ),
  }
}
