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
