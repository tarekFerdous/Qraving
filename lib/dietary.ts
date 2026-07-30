// ---------------------------------------------------------------------------
// Dietary-icon registry — the single source of truth for dietary-tag presentation.
//
// Both the card front (icon only) and the card back ("Allergies & More", icon +
// label) read from this one map, so the two render paths can never drift apart.
// The icon assets are local placeholder SVGs under /public/dietary; the design is
// expected to change later, which is exactly why the mapping is isolated here —
// swapping the artwork is a one-file edit.
// ---------------------------------------------------------------------------

import { DietaryTag } from './menu';

export interface DietaryIcon {
  /** Public path to the icon asset (served from /public). */
  icon: string;
  /** Human-readable label, the canonical dietary vocabulary. */
  label: string;
}

export const DIETARY_ICONS: Record<DietaryTag, DietaryIcon> = {
  Vegan: { icon: '/dietary/vegan.svg', label: 'Vegan' },
  Vegetarian: { icon: '/dietary/vegetarian.svg', label: 'Vegetarian' },
  Halal: { icon: '/dietary/halal.svg', label: 'Halal' },
  Kosher: { icon: '/dietary/kosher.svg', label: 'Kosher' },
  GlutenFree: { icon: '/dietary/gluten-free.svg', label: 'Gluten-Free' },
  LactoseFree: { icon: '/dietary/lactose-free.svg', label: 'Lactose-Free' },
  NutFree: { icon: '/dietary/nut-free.svg', label: 'Nut-Free' },
  // No dedicated artwork yet — reuse the lactose-free icon as a placeholder
  // per the PRD until real Dairy-Free artwork exists.
  DairyFree: { icon: '/dietary/lactose-free.svg', label: 'Dairy-Free' },
};

/** Resolve a dietary tag to its icon asset + label. */
export function getDietaryIcon(tag: DietaryTag): DietaryIcon {
  return DIETARY_ICONS[tag];
}
