// ---------------------------------------------------------------------------
// Section-navigation helpers — pure resolution of the "next category" preview.
//
// The bottom 10vh strip previews whatever comes after the active category. On
// every category except the last, that's the next category (its index + name).
// On the last category there is nothing after it, so the strip becomes a
// "Back to top" control that returns to the first category. This pure function
// is the single seam deciding which of those two states the strip is in.
// ---------------------------------------------------------------------------

export type NextSectionPreview =
  | { kind: 'next'; index: number; name: string }
  | { kind: 'back-to-top' };

/**
 * Resolve the bottom-strip preview state for a given active category.
 *
 * @param names       Ordered category names.
 * @param activeIndex Index of the currently active category.
 * @returns A `next` descriptor (index + name of the following category), or
 *          `back-to-top` when the active category is the last one (or the input
 *          is empty / out of range).
 */
export function resolveNextSection(
  names: string[],
  activeIndex: number
): NextSectionPreview {
  const nextIndex = activeIndex + 1;
  if (nextIndex < 0 || nextIndex >= names.length) {
    return { kind: 'back-to-top' };
  }
  return { kind: 'next', index: nextIndex, name: names[nextIndex] };
}
