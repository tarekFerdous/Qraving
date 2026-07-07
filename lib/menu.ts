// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  /** Mocked price in CAD ($8–$25), derived deterministically from idMeal */
  price: number;
  dietaryTags: DietaryTag[];
  allergens: AllergenInfo[];
  /** Deterministically derived — ~20% of items are marked out of stock */
  isAvailable: boolean;
}

export interface MenuSection {
  id: string;
  name: string;
  description: string;
  items: MenuItem[];
}

// ---------------------------------------------------------------------------
// TheMealDB API response shapes
// ---------------------------------------------------------------------------

interface MealDBSummary {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
}

interface MealDBFilterResponse {
  meals: MealDBSummary[] | null;
}

interface MealDBDetail {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
  strInstructions: string;
  [key: string]: string | null;
}

interface MealDBLookupResponse {
  meals: MealDBDetail[] | null;
}

// ---------------------------------------------------------------------------
// Deterministic mock helpers
// ---------------------------------------------------------------------------

const ALL_DIETARY_TAGS: DietaryTag[] = [
  'Vegan',
  'Vegetarian',
  'Halal',
  'Kosher',
  'GlutenFree',
  'LactoseFree',
  'NutFree',
];

const ALL_ALLERGENS: AllergenInfo[] = [
  'Peanuts',
  'Shellfish',
  'Dairy',
  'Gluten',
  'Eggs',
  'Soy',
  'TreeNuts',
];

/**
 * Derives a price in the range CAD $8–$25 from the meal ID.
 * Formula: 8 + (parseInt(idMeal) % 18)
 */
function derivePrice(idMeal: string): number {
  return 8 + (parseInt(idMeal, 10) % 18);
}

/**
 * Deterministically assigns 0–3 dietary tags based on idMeal.
 * Uses `parseInt(idMeal) % 7` to pick a pattern index, then maps
 * that index to a slice of ALL_DIETARY_TAGS, cycling through the list.
 */
function deriveDietaryTags(idMeal: string): DietaryTag[] {
  const seed = parseInt(idMeal, 10);
  const count = seed % 4; // 0, 1, 2, or 3 tags
  if (count === 0) return [];

  const startIndex = (seed % 7);
  const tags: DietaryTag[] = [];
  for (let i = 0; i < count; i++) {
    tags.push(ALL_DIETARY_TAGS[(startIndex + i) % ALL_DIETARY_TAGS.length]);
  }
  return tags;
}

/** ~20% of items are out of stock: those where idMeal mod 5 equals 0. */
function deriveAvailability(idMeal: string): boolean {
  return parseInt(idMeal, 10) % 5 !== 0;
}

/**
 * Deterministically assigns 0–2 allergens based on idMeal.
 * Uses `parseInt(idMeal) % 5` to select offset into ALL_ALLERGENS.
 */
function deriveAllergens(idMeal: string): AllergenInfo[] {
  const seed = parseInt(idMeal, 10);
  const count = seed % 3; // 0, 1, or 2 allergens
  if (count === 0) return [];

  const startIndex = seed % 5;
  const allergens: AllergenInfo[] = [];
  for (let i = 0; i < count; i++) {
    allergens.push(ALL_ALLERGENS[(startIndex + i) % ALL_ALLERGENS.length]);
  }
  return allergens;
}

// ---------------------------------------------------------------------------
// Fetch helpers (all cached for 1 hour via Next.js fetch cache)
// ---------------------------------------------------------------------------

const CACHE_OPTIONS: RequestInit = { next: { revalidate: 3600 } };

async function fetchMealsByArea(area: string): Promise<MealDBSummary[]> {
  const url = `https://www.themealdb.com/api/json/v1/1/filter.php?a=${encodeURIComponent(area)}`;
  const res = await fetch(url, CACHE_OPTIONS);
  if (!res.ok) return [];
  const data: MealDBFilterResponse = await res.json();
  return data.meals ?? [];
}

async function fetchMealDetail(idMeal: string): Promise<MealDBDetail | null> {
  const url = `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(idMeal)}`;
  const res = await fetch(url, CACHE_OPTIONS);
  if (!res.ok) return null;
  const data: MealDBLookupResponse = await res.json();
  return data.meals?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapDetailToMenuItem(detail: MealDBDetail): MenuItem {
  const { idMeal, strMeal, strMealThumb, strInstructions } = detail;

  const rawDescription = strInstructions ?? '';
  // Truncate to 150 characters, trim at a word boundary if possible
  const description =
    rawDescription.length <= 150
      ? rawDescription
      : rawDescription.slice(0, 150).replace(/\s\S*$/, '') + '…';

  return {
    id: idMeal,
    name: strMeal,
    description,
    imageUrl: strMealThumb,
    price: derivePrice(idMeal),
    dietaryTags: deriveDietaryTags(idMeal),
    allergens: deriveAllergens(idMeal),
    isAvailable: deriveAvailability(idMeal),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const MENU_AREAS = [
  { id: 'italian',  name: 'Italian Cuisine',  description: 'Classic pasta, risotto, and more.', area: 'Italian'  },
  { id: 'greek',    name: 'Greek Cuisine',     description: 'Mediterranean flavours from Greece.', area: 'Greek'    },
  { id: 'japanese', name: 'Japanese Cuisine',  description: 'Traditional dishes from Japan.',    area: 'Japanese' },
  { id: 'mexican',  name: 'Mexican Cuisine',   description: 'Bold, vibrant Mexican flavours.',   area: 'Mexican'  },
];

/**
 * Fetches up to 7 meals per cuisine area from TheMealDB in parallel,
 * returning one MenuSection per area. Sections with no results are dropped.
 *
 * All fetch calls are cached by Next.js for 1 hour (revalidate: 3600).
 */
export async function getMenu(): Promise<MenuSection[]> {
  const sections = await Promise.all(
    MENU_AREAS.map(async ({ id, name, description, area }) => {
      try {
        const summaries = await fetchMealsByArea(area);
        const items: MenuItem[] = (
          await Promise.all(
            summaries.slice(0, 7).map(async (summary): Promise<MenuItem | null> => {
              try {
                const detail = await fetchMealDetail(summary.idMeal);
                if (!detail) return null;
                return mapDetailToMenuItem(detail);
              } catch {
                return null;
              }
            })
          )
        ).filter((item): item is MenuItem => item !== null);
        return { id, name, description, items };
      } catch {
        return { id, name, description, items: [] };
      }
    })
  );

  return sections.filter((s) => s.items.length > 0);
}
