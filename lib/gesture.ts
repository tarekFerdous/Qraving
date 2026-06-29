// ---------------------------------------------------------------------------
// Gesture resolver — the single seam for menu navigation.
//
// This pure, DOM-free function is the sole authority on what a gesture means.
// It collapses an entire gesture (start coordinates → end coordinates) into
// exactly one discrete intent. All axis-lock, one-unit, and threshold logic
// lives here and nowhere else, which is what makes the "one flick = one step"
// guarantee structural rather than something re-checked at every call site.
// ---------------------------------------------------------------------------

export type GestureIntent = 'up' | 'down' | 'left' | 'right' | 'none';

export interface Point {
  x: number;
  y: number;
}

/**
 * Resolve a gesture into a single discrete navigation intent.
 *
 * Resolution rules:
 *  - The axis with the larger absolute delta wins; the losing axis is ignored.
 *  - Ties (|dx| === |dy|, including pure-zero) resolve to the horizontal axis.
 *    This is the pinned, deterministic tie-break for the near-equal diagonal.
 *  - If the winning axis's magnitude is below `threshold`, the intent is `none`.
 *  - The sign of the winning delta picks the direction:
 *      horizontal: dx < 0 → 'left',  dx > 0 → 'right'
 *      vertical:   dy < 0 → 'up',    dy > 0 → 'down'
 *
 * @param start     Gesture start coordinates.
 * @param end       Gesture end coordinates.
 * @param threshold Minimum dominant-axis movement (px) to register a swipe.
 */
export function resolveGesture(
  start: Point,
  end: Point,
  threshold: number
): GestureIntent {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  // Horizontal wins on a strict-greater magnitude OR on a tie (absX === absY),
  // giving a deterministic resolution for the near-equal diagonal case.
  const horizontalWins = absX >= absY;

  if (horizontalWins) {
    if (absX < threshold) return 'none';
    return dx < 0 ? 'left' : 'right';
  }

  if (absY < threshold) return 'none';
  return dy < 0 ? 'up' : 'down';
}

/**
 * Decide whether an in-flight touch move should be prevented from reaching the
 * browser (i.e. whether to call `preventDefault()` on the `touchmove` event).
 *
 * This is the second pure seam for menu navigation. Where `resolveGesture`
 * decides what a *completed* gesture means, this decides — mid-gesture — whether
 * the move belongs to the app or to the browser's native vertical pull
 * (pull-to-refresh / overscroll, which on iOS WebKit reloads the whole page).
 *
 * It owns no DOM and no axis/threshold logic beyond what is stated here; the
 * non-passive `touchmove` listener delegates the entire decision to it.
 *
 * Rules (mirroring the axis-dominance convention of `resolveGesture`):
 *  - Active card flipped → `false`. Its back face owns native `pan-y` scrolling.
 *  - Horizontal-dominant move (incl. the |dx| === |dy| tie) → `false`.
 *    Horizontal card nav resolves on release and never triggers a native
 *    reload; leaving it alone also preserves iOS edge-swipe back navigation.
 *  - Vertical-dominant move, not flipped, past `threshold` → `true`.
 *    This is a category-change pan that must be claimed by the app.
 *  - Sub-threshold / near-zero movement → `false`. Never block taps or jitter.
 *
 * @param start     Gesture start coordinates.
 * @param current   Current touch coordinates for the in-flight move.
 * @param isFlipped Whether the active card is currently flipped to its back.
 * @param threshold Minimum vertical movement (px) before claiming the gesture.
 */
export function shouldPreventTouchMove(
  start: Point,
  current: Point,
  isFlipped: boolean,
  threshold: number
): boolean {
  // A flipped card's back face owns native vertical scrolling — never block it.
  if (isFlipped) return false;

  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  // Horizontal wins on strict-greater magnitude OR on a tie, matching
  // `resolveGesture`. Horizontal/diagonal-tie moves are left to the browser.
  if (absX >= absY) return false;

  // Vertical-dominant: only claim the gesture once it clears the threshold,
  // so taps and tiny jitters keep native behavior.
  return absY >= threshold;
}
