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
  /** Mocked price in GBP (£8–£25), derived deterministically from idMeal */
  price: number;
  dietaryTags: DietaryTag[];
  allergens: AllergenInfo[];
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

interface MealDBCategory {
  idCategory: string;
  strCategory: string;
  strCategoryThumb: string;
  strCategoryDescription: string;
}

interface MealDBCategoriesResponse {
  categories: MealDBCategory[];
}

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
 * Derives a price in the range £8–£25 from the meal ID.
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

async function fetchCategories(): Promise<MealDBCategory[]> {
  const res = await fetch(
    'https://www.themealdb.com/api/json/v1/1/categories.php',
    CACHE_OPTIONS
  );
  if (!res.ok) return [];
  const data: MealDBCategoriesResponse = await res.json();
  return data.categories ?? [];
}

async function fetchMealsByCategory(category: string): Promise<MealDBSummary[]> {
  const url = `https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(category)}`;
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
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches up to 6 meal categories from TheMealDB, then for each category
 * fetches up to 5 meals (with full detail), and returns them as an array
 * of MenuSection objects.
 *
 * All fetch calls are cached by Next.js for 1 hour (revalidate: 3600).
 * Returns an empty array on any top-level failure.
 */
export async function getMenu(): Promise<MenuSection[]> {
  try {
    const categories = await fetchCategories();
    const selectedCategories = categories.slice(0, 6);

    const sections: MenuSection[] = await Promise.all(
      selectedCategories.map(async (cat): Promise<MenuSection> => {
        try {
          const summaries = await fetchMealsByCategory(cat.strCategory);
          const selectedSummaries = summaries.slice(0, 5);

          const items: MenuItem[] = (
            await Promise.all(
              selectedSummaries.map(async (summary): Promise<MenuItem | null> => {
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

          return {
            id: cat.idCategory,
            name: cat.strCategory,
            description: cat.strCategoryDescription.slice(0, 200),
            items,
          };
        } catch {
          return {
            id: cat.idCategory,
            name: cat.strCategory,
            description: cat.strCategoryDescription.slice(0, 200),
            items: [],
          };
        }
      })
    );

    return sections;
  } catch {
    return [];
  }
}
