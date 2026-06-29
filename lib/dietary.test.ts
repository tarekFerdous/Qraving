import { describe, it, expect } from 'vitest';
import { DIETARY_ICONS, getDietaryIcon } from './dietary';
import type { DietaryTag } from './menu';

// The canonical dietary vocabulary, in the order it is declared on the type.
const ALL_DIETARY_TAGS: DietaryTag[] = [
  'Vegan',
  'Vegetarian',
  'Halal',
  'Kosher',
  'GlutenFree',
  'LactoseFree',
  'NutFree',
];

const CANONICAL_LABELS: Record<DietaryTag, string> = {
  Vegan: 'Vegan',
  Vegetarian: 'Vegetarian',
  Halal: 'Halal',
  Kosher: 'Kosher',
  GlutenFree: 'Gluten-Free',
  LactoseFree: 'Lactose-Free',
  NutFree: 'Nut-Free',
};

describe('dietary-icon registry', () => {
  it('maps every DietaryTag to a defined icon asset and a non-empty label', () => {
    for (const tag of ALL_DIETARY_TAGS) {
      const entry = getDietaryIcon(tag);
      expect(entry, `missing registry entry for ${tag}`).toBeDefined();
      expect(typeof entry.icon).toBe('string');
      expect(entry.icon.length).toBeGreaterThan(0);
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it('uses labels that match the canonical dietary vocabulary', () => {
    for (const tag of ALL_DIETARY_TAGS) {
      expect(getDietaryIcon(tag).label).toBe(CANONICAL_LABELS[tag]);
    }
  });

  it('covers exactly the canonical tag set with no extra keys', () => {
    expect(Object.keys(DIETARY_ICONS).sort()).toEqual([...ALL_DIETARY_TAGS].sort());
  });

  it('points every tag at a distinct icon asset', () => {
    const assets = ALL_DIETARY_TAGS.map((t) => getDietaryIcon(t).icon);
    expect(new Set(assets).size).toBe(ALL_DIETARY_TAGS.length);
  });
});
