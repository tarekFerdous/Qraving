/**
 * Returns the CSS `translateX` value for the card track.
 *
 * Index 0: left-aligned (matches the existing formula, no centering offset).
 * Index > 0: the active card is centered in the content area, with equal peek
 * strips on both left and right.
 *
 * `dragOffsetPx` is added on top of either formula to enable live drag tracking.
 */
export function computeCarouselOffset(
  currentIndex: number,
  dragOffsetPx: number,
  cardWidthPx: number,
  gapPx: number,
  contentWidthPx: number
): string {
  const base =
    currentIndex === 0
      ? 0
      : -currentIndex * (cardWidthPx + gapPx) + (contentWidthPx - cardWidthPx) / 2;
  return `${base + dragOffsetPx}px`;
}

/**
 * Given a live drag offset, returns the nearest card index to snap to.
 *
 * Rounds to the nearest whole card based on fractional position and clamps the
 * result to `[0, totalCards - 1]`.
 *
 * Negative `dragOffsetPx` means the user swiped left (toward a higher index);
 * positive means the user swiped right (toward a lower index).
 */
export function resolveSnapIndex(
  currentIndex: number,
  dragOffsetPx: number,
  cardWidthPx: number,
  gapPx: number,
  totalCards: number
): number {
  const step = cardWidthPx + gapPx;
  const fractionalOffset = -dragOffsetPx / step;
  const nearest = Math.round(currentIndex + fractionalOffset);
  return Math.max(0, Math.min(nearest, totalCards - 1));
}
