import { adminDb } from '@/lib/firebase-admin';
import type { FirestoreCategory, FirestoreMenuItem } from '@/lib/firestore-types';

export type DietaryTag =
  | 'Vegan'
  | 'Vegetarian'
  | 'Halal'
  | 'Kosher'
  | 'GlutenFree'
  | 'LactoseFree'
  | 'NutFree';

export type AllergenInfo =
  | 'Peanuts'
  | 'Shellfish'
  | 'Dairy'
  | 'Gluten'
  | 'Eggs'
  | 'Soy'
  | 'TreeNuts';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  dietaryTags: DietaryTag[];
  allergens: AllergenInfo[];
  isAvailable: boolean;
  customizations?: { sizes: string[]; addOns: string[] };
}

export interface MenuSection {
  id: string;
  name: string;
  description: string;
  items: MenuItem[];
}

export async function getMenu(company: string, branch: string): Promise<MenuSection[]> {
  const base = `companies/${company}/branches/${branch}`;

  const [categoriesSnap, itemsSnap] = await Promise.all([
    adminDb.collection(`${base}/categories`).orderBy('order', 'asc').get(),
    adminDb.collection(`${base}/menuItems`).get(),
  ]);

  const itemsByCategory = new Map<string, MenuItem[]>();

  for (const doc of itemsSnap.docs) {
    const d = doc.data() as FirestoreMenuItem;
    const item: MenuItem = {
      id: doc.id,
      name: d.name,
      description: d.description,
      imageUrl: d.imageUrl,
      price: d.price / 100,
      dietaryTags: (d.dietaryTags ?? []) as DietaryTag[],
      allergens: (d.allergens ?? []) as AllergenInfo[],
      isAvailable: d.isAvailable,
      customizations: d.customizations,
    };
    const list = itemsByCategory.get(d.categoryId) ?? [];
    list.push(item);
    itemsByCategory.set(d.categoryId, list);
  }

  return categoriesSnap.docs.map((doc) => {
    const d = doc.data() as FirestoreCategory;
    return {
      id: doc.id,
      name: d.name,
      description: d.description,
      items: itemsByCategory.get(doc.id) ?? [],
    };
  });
}
