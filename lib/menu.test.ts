import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(),
  },
}));

import { getMenu } from '@/lib/menu';
import { adminDb } from '@/lib/firebase-admin';

function makeSnap(docs: { id: string; data: object }[]) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
}

/**
 * Mocks `adminDb.collection` to match the real nested-query shape `getMenu`
 * now issues: one call for `.../categories` (with `.orderBy().get()`), plus
 * one call per category for `.../categories/{categoryId}/items` (plain
 * `.get()`, no orderBy — item ordering is done client-side in `getMenu` via
 * each item's `order` field).
 *
 * `itemsByCategory` maps categoryId -> that category's item docs.
 */
function mockCollections(
  categoryDocs: { id: string; data: object }[],
  itemsByCategory: Record<string, { id: string; data: object }[]>,
) {
  vi.mocked(adminDb.collection).mockImplementation((path: string) => {
    if (path.endsWith('/categories')) {
      return {
        orderBy: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(makeSnap(categoryDocs)),
        }),
      } as any;
    }
    // path shape: companies/{c}/branches/{b}/categories/{categoryId}/items
    const match = path.match(/\/categories\/([^/]+)\/items$/);
    const categoryId = match?.[1] ?? '';
    return {
      get: vi.fn().mockResolvedValue(makeSnap(itemsByCategory[categoryId] ?? [])),
    } as any;
  });
}

describe('getMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles MenuSection[] sorted by category order field, reading items from each category\'s nested subcollection', async () => {
    mockCollections(
      [
        { id: 'cat-1', data: { name: 'Starters', order: 1 } },
        { id: 'cat-2', data: { name: 'Mains', order: 2 } },
      ],
      {
        'cat-1': [
          {
            id: 'item-a',
            data: {
              name: 'Soup', description: 'Hot soup', price: 800,
              imageUrl: 'https://img/soup.jpg', available: true, order: 0,
              dietaryTags: ['vegan'], allergens: [],
              customizations: { sizes: [], addOns: [], specialInstructions: false },
            },
          },
        ],
        'cat-2': [
          {
            id: 'item-b',
            data: {
              name: 'Steak', description: 'Grilled steak', price: 2500,
              imageUrl: 'https://img/steak.jpg', available: true, order: 0,
              dietaryTags: [], allergens: ['Gluten'],
              customizations: { sizes: [{ label: 'Large', priceDelta: 300 }], addOns: [], specialInstructions: false },
            },
          },
        ],
      },
    );

    const sections = await getMenu('demo-company', 'demo-branch');

    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe('cat-1');
    expect(sections[0].name).toBe('Starters');
    expect(sections[0].items).toHaveLength(1);
    expect(sections[0].items[0].name).toBe('Soup');
    expect(sections[1].id).toBe('cat-2');
    expect(sections[1].items[0].dietaryTags).toEqual([]);
    expect(sections[1].items[0].allergens).toEqual(['Gluten']);
  });

  it('divides Firestore price (cents) by 100 for display', async () => {
    mockCollections(
      [{ id: 'cat-1', data: { name: 'Mains', order: 1 } }],
      {
        'cat-1': [
          {
            id: 'item-1',
            data: {
              name: 'Burger', description: '', price: 1250,
              imageUrl: '', available: true, order: 0,
              dietaryTags: [], allergens: [],
              customizations: { sizes: [], addOns: [], specialInstructions: false },
            },
          },
        ],
      },
    );

    const sections = await getMenu('demo-company', 'demo-branch');
    expect(sections[0].items[0].price).toBe(12.5);
  });

  it('maps `available: false` to `isAvailable: false` (renamed from admin field, not passed through unchanged)', async () => {
    mockCollections(
      [{ id: 'cat-1', data: { name: 'Drinks', order: 1 } }],
      {
        'cat-1': [
          {
            id: 'item-1',
            data: {
              name: 'Cola', description: '', price: 300,
              imageUrl: '', available: false, order: 0,
              dietaryTags: [], allergens: [],
              customizations: { sizes: [], addOns: [], specialInstructions: false },
            },
          },
        ],
      },
    );

    const sections = await getMenu('demo-company', 'demo-branch');
    expect(sections[0].items[0].isAvailable).toBe(false);
  });

  it('maps every admin lowercase-hyphen dietary tag (including dairy-free) to its PascalCase enum value, and silently drops unmapped tags', async () => {
    mockCollections(
      [{ id: 'cat-1', data: { name: 'Mains', order: 1 } }],
      {
        'cat-1': [
          {
            id: 'item-1',
            data: {
              name: 'Bowl', description: '', price: 1000,
              imageUrl: '', available: true, order: 0,
              dietaryTags: ['vegan', 'vegetarian', 'halal', 'gluten-free', 'nut-free', 'dairy-free', 'bogus-tag'],
              allergens: [],
              customizations: { sizes: [], addOns: [], specialInstructions: false },
            },
          },
        ],
      },
    );

    const sections = await getMenu('demo-company', 'demo-branch');
    expect(sections[0].items[0].dietaryTags).toEqual([
      'Vegan', 'Vegetarian', 'Halal', 'GlutenFree', 'NutFree', 'DairyFree',
    ]);
  });

  it('passes allergens through as a plain string array of free-form tags', async () => {
    mockCollections(
      [{ id: 'cat-1', data: { name: 'Mains', order: 1 } }],
      {
        'cat-1': [
          {
            id: 'item-1',
            data: {
              name: 'Curry', description: '', price: 1500,
              imageUrl: '', available: true, order: 0,
              dietaryTags: [], allergens: ['Peanuts', 'Shellfish', 'Custom Allergen'],
              customizations: { sizes: [], addOns: [], specialInstructions: false },
            },
          },
        ],
      },
    );

    const sections = await getMenu('demo-company', 'demo-branch');
    expect(sections[0].items[0].allergens).toEqual(['Peanuts', 'Shellfish', 'Custom Allergen']);
  });

  it('converts customizations sizes/addOns priceDelta from admin cents to dollars', async () => {
    mockCollections(
      [{ id: 'cat-1', data: { name: 'Mains', order: 1 } }],
      {
        'cat-1': [
          {
            id: 'item-1',
            data: {
              name: 'Pizza', description: '', price: 1800,
              imageUrl: '', available: true, order: 0,
              dietaryTags: [], allergens: [],
              customizations: {
                sizes: [
                  { label: 'Small', priceDelta: 0 },
                  { label: 'Large', priceDelta: 400 },
                ],
                addOns: [
                  { label: 'Extra cheese', priceDelta: 150 },
                ],
                specialInstructions: true,
              },
            },
          },
        ],
      },
    );

    const sections = await getMenu('demo-company', 'demo-branch');
    expect(sections[0].items[0].customizations).toEqual({
      sizes: [
        { label: 'Small', priceDelta: 0 },
        { label: 'Large', priceDelta: 4 },
      ],
      addOns: [
        { label: 'Extra cheese', priceDelta: 1.5 },
      ],
      specialInstructions: true,
    });
  });

  it('defaults customizations when the doc lacks the field entirely', async () => {
    mockCollections(
      [{ id: 'cat-1', data: { name: 'Mains', order: 1 } }],
      {
        'cat-1': [
          {
            id: 'item-1',
            data: {
              name: 'Sandwich', description: '', price: 900,
              imageUrl: '', available: true, order: 0,
              dietaryTags: [], allergens: [],
            },
          },
        ],
      },
    );

    const sections = await getMenu('demo-company', 'demo-branch');
    expect(sections[0].items[0].customizations).toEqual({
      sizes: [], addOns: [], specialInstructions: false,
    });
  });

  it('defaults a category with no description field to an empty string', async () => {
    mockCollections(
      [{ id: 'cat-1', data: { name: 'Mains', order: 1 } }],
      { 'cat-1': [] },
    );

    const sections = await getMenu('demo-company', 'demo-branch');
    expect(sections[0].description).toBe('');
  });

  it('orders items within a category by the admin order field ascending', async () => {
    mockCollections(
      [{ id: 'cat-1', data: { name: 'Mains', order: 1 } }],
      {
        'cat-1': [
          { id: 'item-c', data: { name: 'Third', description: '', price: 100, imageUrl: '', available: true, order: 2, dietaryTags: [], allergens: [] } },
          { id: 'item-a', data: { name: 'First', description: '', price: 100, imageUrl: '', available: true, order: 0, dietaryTags: [], allergens: [] } },
          { id: 'item-b', data: { name: 'Second', description: '', price: 100, imageUrl: '', available: true, order: 1, dietaryTags: [], allergens: [] } },
        ],
      },
    );

    const sections = await getMenu('demo-company', 'demo-branch');
    expect(sections[0].items.map((i) => i.name)).toEqual(['First', 'Second', 'Third']);
  });
});
