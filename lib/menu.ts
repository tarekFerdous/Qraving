import { adminDb } from '@/lib/firebase-admin';
import type { Category as AdminCategory, MenuItem as AdminMenuItem } from '@/lib/manager-menu';

export type DietaryTag =
  | 'Vegan'
  | 'Vegetarian'
  | 'Halal'
  | 'Kosher'
  | 'GlutenFree'
  | 'LactoseFree'
  | 'NutFree'
  | 'DairyFree';

export type AllergenInfo =
  | 'Peanuts'
  | 'Shellfish'
  | 'Dairy'
  | 'Gluten'
  | 'Eggs'
  | 'Soy'
  | 'TreeNuts';

// Maps the admin dashboard's lowercase-hyphen dietary tag vocabulary
// (`lib/manager-menu.ts`'s `MenuItem.dietaryTags: string[]`) to the
// PascalCase enum consumed by `lib/dietary.ts`'s icon registry. Any admin
// tag value not present here is silently dropped (defensive — the current
// admin UI never writes anything outside this set).
const DIETARY_TAG_MAP: Record<string, DietaryTag> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  halal: 'Halal',
  'gluten-free': 'GlutenFree',
  'nut-free': 'NutFree',
  'dairy-free': 'DairyFree',
};

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  dietaryTags: DietaryTag[];
  allergens: string[];
  isAvailable: boolean;
  customizations?: {
    sizes: Array<{ label: string; priceDelta: number }>;
    addOns: Array<{ label: string; priceDelta: number }>;
    specialInstructions?: boolean;
  };
}

export interface MenuSection {
  id: string;
  name: string;
  description: string;
  items: MenuItem[];
}

export async function isMenuPublished(companyId: string, branchId: string): Promise<boolean> {
  if (!companyId || !branchId) return false;
  const snap = await adminDb
    .doc(`companies/${companyId}/branches/${branchId}/menu/config`)
    .get();
  if (!snap.exists) return false;
  return snap.data()?.published === true;
}

function mapDietaryTags(tags: string[] | undefined): DietaryTag[] {
  if (!tags) return [];
  return tags
    .map((tag) => DIETARY_TAG_MAP[tag])
    .filter((tag): tag is DietaryTag => tag !== undefined);
}

function mapCustomizations(
  customizations: AdminMenuItem['customizations'] | undefined,
): MenuItem['customizations'] {
  if (!customizations) {
    return { sizes: [], addOns: [], specialInstructions: false };
  }
  return {
    sizes: (customizations.sizes ?? []).map((s) => ({
      label: s.label,
      priceDelta: s.priceDelta / 100,
    })),
    addOns: (customizations.addOns ?? []).map((a) => ({
      label: a.label,
      priceDelta: a.priceDelta / 100,
    })),
    specialInstructions: customizations.specialInstructions ?? false,
  };
}

export async function getMenu(company: string, branch: string): Promise<MenuSection[]> {
  const base = `companies/${company}/branches/${branch}`;

  const categoriesSnap = await adminDb.collection(`${base}/categories`).orderBy('order', 'asc').get();

  return Promise.all(
    categoriesSnap.docs.map(async (categoryDoc) => {
      const categoryData = categoryDoc.data() as AdminCategory;
      const itemsSnap = await adminDb
        .collection(`${base}/categories/${categoryDoc.id}/items`)
        .get();

      const items: MenuItem[] = itemsSnap.docs
        .map((itemDoc) => {
          const d = itemDoc.data() as AdminMenuItem;
          const item: MenuItem = {
            id: itemDoc.id,
            name: d.name,
            description: d.description,
            imageUrl: d.imageUrl ?? '',
            price: (d.price ?? 0) / 100,
            dietaryTags: mapDietaryTags(d.dietaryTags),
            allergens: d.allergens ?? [],
            isAvailable: d.available ?? true,
            customizations: mapCustomizations(d.customizations),
          };
          return { item, order: d.order ?? 0 };
        })
        .sort((a, b) => a.order - b.order)
        .map(({ item }) => item);

      return {
        id: categoryDoc.id,
        name: categoryData.name,
        description: (categoryData as { description?: string }).description ?? '',
        items,
      };
    }),
  );
}
