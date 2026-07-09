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

function mockCollections(
  categoryDocs: { id: string; data: object }[],
  itemDocs: { id: string; data: object }[],
) {
  vi.mocked(adminDb.collection).mockImplementation((path: string) => {
    if (path.endsWith('/categories')) {
      return {
        orderBy: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(makeSnap(categoryDocs)),
        }),
      } as any;
    }
    return { get: vi.fn().mockResolvedValue(makeSnap(itemDocs)) } as any;
  });
}

describe('getMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles MenuSection[] sorted by category order field', async () => {
    mockCollections(
      [
        { id: 'cat-1', data: { name: 'Starters', description: 'Light bites', order: 1 } },
        { id: 'cat-2', data: { name: 'Mains', description: 'Main dishes', order: 2 } },
      ],
      [
        {
          id: 'item-a',
          data: {
            name: 'Soup', description: 'Hot soup', price: 800,
            imageUrl: 'https://img/soup.jpg', categoryId: 'cat-1',
            dietaryTags: ['Vegan'], allergens: [], isAvailable: true,
            customizations: { sizes: [], addOns: [] },
          },
        },
        {
          id: 'item-b',
          data: {
            name: 'Steak', description: 'Grilled steak', price: 2500,
            imageUrl: 'https://img/steak.jpg', categoryId: 'cat-2',
            dietaryTags: [], allergens: ['Gluten'], isAvailable: true,
            customizations: { sizes: ['Small', 'Large'], addOns: ['Sauce'] },
          },
        },
      ],
    );

    const sections = await getMenu();

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
      [{ id: 'cat-1', data: { name: 'Mains', description: '', order: 1 } }],
      [
        {
          id: 'item-1',
          data: {
            name: 'Burger', description: '', price: 1250,
            imageUrl: '', categoryId: 'cat-1',
            dietaryTags: [], allergens: [], isAvailable: true,
            customizations: { sizes: [], addOns: [] },
          },
        },
      ],
    );

    const sections = await getMenu();
    expect(sections[0].items[0].price).toBe(12.5);
  });

  it('propagates isAvailable: false from Firestore unchanged', async () => {
    mockCollections(
      [{ id: 'cat-1', data: { name: 'Drinks', description: '', order: 1 } }],
      [
        {
          id: 'item-1',
          data: {
            name: 'Cola', description: '', price: 300,
            imageUrl: '', categoryId: 'cat-1',
            dietaryTags: [], allergens: [], isAvailable: false,
            customizations: { sizes: [], addOns: [] },
          },
        },
      ],
    );

    const sections = await getMenu();
    expect(sections[0].items[0].isAvailable).toBe(false);
  });
});
