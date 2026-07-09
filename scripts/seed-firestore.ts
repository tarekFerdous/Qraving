/**
 * One-time seed script. Populates a demo company/branch in Firestore.
 * Run with: npx ts-node --esm scripts/seed-firestore.ts
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON in environment (or .env.local).
 */

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { FirestoreCategory, FirestoreMenuItem } from '../lib/firestore-types';

// Load .env.local for local dev
import { config } from 'dotenv';
config({ path: '.env.local' });

const app = getApps().length
  ? getApp()
  : initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)) });

const db = getFirestore(app);

const COMPANY_ID = 'demo-company';
const BRANCH_ID = 'demo-branch';

const branchRef = db
  .collection('companies')
  .doc(COMPANY_ID)
  .collection('branches')
  .doc(BRANCH_ID);

const categories: Array<{ id: string } & FirestoreCategory> = [
  { id: 'italian', name: 'Italian', description: 'Classic pasta, risotto, and more.', order: 1 },
  { id: 'greek', name: 'Greek', description: 'Mediterranean flavours from Greece.', order: 2 },
  { id: 'japanese', name: 'Japanese', description: 'Traditional dishes from Japan.', order: 3 },
  { id: 'mexican', name: 'Mexican', description: 'Bold, vibrant Mexican flavours.', order: 4 },
];

const menuItems: Array<{ id: string } & FirestoreMenuItem> = [
  // Italian
  {
    id: 'it-01',
    name: 'Spaghetti Carbonara',
    description: 'Creamy egg and pancetta sauce with pecorino romano.',
    price: 1800,
    imageUrl: 'https://www.themealdb.com/images/media/meals/llcbn01574260722.jpg',
    categoryId: 'italian',
    dietaryTags: [],
    allergens: ['Eggs', 'Dairy', 'Gluten'],
    isAvailable: true,
    customizations: { sizes: ['Regular', 'Large'], addOns: ['Extra Pancetta', 'Extra Cheese'] },
  },
  {
    id: 'it-02',
    name: 'Margherita Pizza',
    description: 'San Marzano tomato, fresh mozzarella, and basil.',
    price: 1600,
    imageUrl: 'https://www.themealdb.com/images/media/meals/x0lk931587671540.jpg',
    categoryId: 'italian',
    dietaryTags: ['Vegetarian'],
    allergens: ['Dairy', 'Gluten'],
    isAvailable: true,
    customizations: { sizes: ['10"', '14"'], addOns: ['Extra Mozzarella', 'Olives', 'Mushrooms'] },
  },
  {
    id: 'it-03',
    name: 'Penne Arrabbiata',
    description: 'Penne in spicy tomato and garlic sauce.',
    price: 1500,
    imageUrl: 'https://www.themealdb.com/images/media/meals/ustsqw1468250014.jpg',
    categoryId: 'italian',
    dietaryTags: ['Vegan', 'Vegetarian'],
    allergens: ['Gluten'],
    isAvailable: true,
    customizations: { sizes: ['Regular', 'Large'], addOns: ['Parmesan', 'Chili Flakes'] },
  },
  {
    id: 'it-04',
    name: 'Risotto ai Funghi',
    description: 'Arborio rice with wild mushrooms and truffle oil.',
    price: 2000,
    imageUrl: 'https://www.themealdb.com/images/media/meals/xxrxux1503070723.jpg',
    categoryId: 'italian',
    dietaryTags: ['Vegetarian', 'GlutenFree'],
    allergens: ['Dairy'],
    isAvailable: false,
    customizations: { sizes: ['Regular'], addOns: ['Extra Truffle Oil', 'Parmesan'] },
  },
  {
    id: 'it-05',
    name: 'Tiramisu',
    description: 'Espresso-soaked ladyfingers with mascarpone cream.',
    price: 900,
    imageUrl: 'https://www.themealdb.com/images/media/meals/swttys1511385853.jpg',
    categoryId: 'italian',
    dietaryTags: ['Vegetarian'],
    allergens: ['Eggs', 'Dairy', 'Gluten'],
    isAvailable: true,
    customizations: { sizes: ['Regular'], addOns: [] },
  },

  // Greek
  {
    id: 'gr-01',
    name: 'Souvlaki Plate',
    description: 'Grilled pork skewers with pita, tzatziki, and salad.',
    price: 1900,
    imageUrl: 'https://www.themealdb.com/images/media/meals/rjhf741585564676.jpg',
    categoryId: 'greek',
    dietaryTags: ['Halal'],
    allergens: ['Gluten', 'Dairy'],
    isAvailable: true,
    customizations: { sizes: ['Regular', 'Large'], addOns: ['Extra Tzatziki', 'Extra Pita'] },
  },
  {
    id: 'gr-02',
    name: 'Greek Salad',
    description: 'Tomatoes, cucumber, olives, red onion, and feta.',
    price: 1200,
    imageUrl: 'https://www.themealdb.com/images/media/meals/k29viq1585565980.jpg',
    categoryId: 'greek',
    dietaryTags: ['Vegetarian', 'GlutenFree'],
    allergens: ['Dairy'],
    isAvailable: true,
    customizations: { sizes: ['Regular', 'Large'], addOns: ['Extra Feta', 'Anchovies'] },
  },
  {
    id: 'gr-03',
    name: 'Moussaka',
    description: 'Layered eggplant, minced lamb, and béchamel.',
    price: 2100,
    imageUrl: 'https://www.themealdb.com/images/media/meals/ctg8jd1585563097.jpg',
    categoryId: 'greek',
    dietaryTags: [],
    allergens: ['Dairy', 'Eggs', 'Gluten'],
    isAvailable: true,
    customizations: { sizes: ['Regular'], addOns: [] },
  },
  {
    id: 'gr-04',
    name: 'Spanakopita',
    description: 'Flaky phyllo pastry filled with spinach and feta.',
    price: 1100,
    imageUrl: 'https://www.themealdb.com/images/media/meals/wspuvp1511303478.jpg',
    categoryId: 'greek',
    dietaryTags: ['Vegetarian'],
    allergens: ['Dairy', 'Gluten', 'Eggs'],
    isAvailable: false,
    customizations: { sizes: ['2 pieces', '4 pieces'], addOns: [] },
  },
  {
    id: 'gr-05',
    name: 'Baklava',
    description: 'Honey-drenched phyllo with walnuts and pistachios.',
    price: 800,
    imageUrl: 'https://www.themealdb.com/images/media/meals/ytme8t1764111401.jpg',
    categoryId: 'greek',
    dietaryTags: ['Vegetarian'],
    allergens: ['Gluten', 'TreeNuts'],
    isAvailable: true,
    customizations: { sizes: ['Regular'], addOns: [] },
  },

  // Japanese
  {
    id: 'jp-01',
    name: 'Salmon Sashimi',
    description: 'Eight slices of fresh Atlantic salmon.',
    price: 2200,
    imageUrl: 'https://www.themealdb.com/images/media/meals/ikizdm1763760862.jpg',
    categoryId: 'japanese',
    dietaryTags: ['GlutenFree'],
    allergens: [],
    isAvailable: true,
    customizations: { sizes: ['8 pcs', '12 pcs'], addOns: ['Wasabi', 'Pickled Ginger'] },
  },
  {
    id: 'jp-02',
    name: 'Chicken Ramen',
    description: 'Rich chicken broth, chashu chicken, soft-boiled egg, nori.',
    price: 1700,
    imageUrl: 'https://www.themealdb.com/images/media/meals/ip5xtp1769779958.jpg',
    categoryId: 'japanese',
    dietaryTags: [],
    allergens: ['Gluten', 'Eggs', 'Soy'],
    isAvailable: true,
    customizations: { sizes: ['Regular', 'Large'], addOns: ['Extra Chashu', 'Bamboo Shoots', 'Corn'] },
  },
  {
    id: 'jp-03',
    name: 'Vegetable Tempura',
    description: 'Assorted vegetables in light crispy batter, served with dipping sauce.',
    price: 1400,
    imageUrl: 'https://www.themealdb.com/images/media/meals/xnv4wf1763756529.jpg',
    categoryId: 'japanese',
    dietaryTags: ['Vegetarian'],
    allergens: ['Gluten', 'Eggs', 'Soy'],
    isAvailable: true,
    customizations: { sizes: ['Regular'], addOns: ['Extra Sauce'] },
  },
  {
    id: 'jp-04',
    name: 'Dragon Roll',
    description: 'Shrimp tempura, avocado, topped with thinly sliced avocado.',
    price: 1900,
    imageUrl: 'https://www.themealdb.com/images/media/meals/g046bb1663960946.jpg',
    categoryId: 'japanese',
    dietaryTags: [],
    allergens: ['Gluten', 'Shellfish', 'Soy', 'Eggs'],
    isAvailable: false,
    customizations: { sizes: ['8 pcs'], addOns: ['Spicy Mayo', 'Eel Sauce'] },
  },
  {
    id: 'jp-05',
    name: 'Miso Soup',
    description: 'Traditional white miso with tofu, wakame, and green onion.',
    price: 500,
    imageUrl: 'https://www.themealdb.com/images/media/meals/1529446137.jpg',
    categoryId: 'japanese',
    dietaryTags: ['Vegan', 'Vegetarian', 'GlutenFree'],
    allergens: ['Soy'],
    isAvailable: true,
    customizations: { sizes: ['Regular'], addOns: [] },
  },

  // Mexican
  {
    id: 'mx-01',
    name: 'Beef Tacos',
    description: 'Three corn tortillas with seasoned beef, onion, cilantro, and salsa verde.',
    price: 1500,
    imageUrl: 'https://www.themealdb.com/images/media/meals/uvuyxu1503067369.jpg',
    categoryId: 'mexican',
    dietaryTags: ['GlutenFree'],
    allergens: [],
    isAvailable: true,
    customizations: { sizes: ['3 tacos', '5 tacos'], addOns: ['Extra Salsa', 'Guacamole', 'Sour Cream'] },
  },
  {
    id: 'mx-02',
    name: 'Chicken Burrito',
    description: 'Flour tortilla stuffed with grilled chicken, rice, beans, and pico de gallo.',
    price: 1600,
    imageUrl: 'https://www.themealdb.com/images/media/meals/swo87v1763595282.jpg',
    categoryId: 'mexican',
    dietaryTags: [],
    allergens: ['Gluten'],
    isAvailable: true,
    customizations: { sizes: ['Regular', 'Bowl (no tortilla)'], addOns: ['Guacamole', 'Extra Cheese', 'Jalapeños'] },
  },
  {
    id: 'mx-03',
    name: 'Nachos',
    description: 'Tortilla chips with melted cheese, jalapeños, sour cream, and guacamole.',
    price: 1300,
    imageUrl: 'https://www.themealdb.com/images/media/meals/ypxvwv1505333929.jpg',
    categoryId: 'mexican',
    dietaryTags: ['Vegetarian', 'GlutenFree'],
    allergens: ['Dairy'],
    isAvailable: true,
    customizations: { sizes: ['Regular', 'Loaded'], addOns: ['Pulled Pork', 'Extra Guacamole'] },
  },
  {
    id: 'mx-04',
    name: 'Enchiladas Verdes',
    description: 'Corn tortillas filled with chicken, smothered in tomatillo sauce and cheese.',
    price: 1800,
    imageUrl: 'https://www.themealdb.com/images/media/meals/qtuwxu1468233098.jpg',
    categoryId: 'mexican',
    dietaryTags: [],
    allergens: ['Dairy', 'Gluten'],
    isAvailable: false,
    customizations: { sizes: ['Regular'], addOns: ['Extra Cheese', 'Sour Cream'] },
  },
  {
    id: 'mx-05',
    name: 'Churros',
    description: 'Crispy fried dough sticks dusted with cinnamon sugar, served with chocolate dip.',
    price: 800,
    imageUrl: 'https://www.themealdb.com/images/media/meals/nxnny61763250596.jpg',
    categoryId: 'mexican',
    dietaryTags: ['Vegetarian'],
    allergens: ['Gluten', 'Eggs', 'Dairy'],
    isAvailable: true,
    customizations: { sizes: ['4 pcs', '8 pcs'], addOns: ['Extra Chocolate Sauce', 'Caramel Dip'] },
  },
];

async function seed() {
  const batch = db.batch();

  for (const { id, ...data } of categories) {
    const ref = branchRef.collection('categories').doc(id);
    batch.set(ref, data, { merge: true });
  }

  for (const { id, ...data } of menuItems) {
    const ref = branchRef.collection('menuItems').doc(id);
    batch.set(ref, data, { merge: true });
  }

  await batch.commit();
  console.log(`Seeded ${categories.length} categories and ${menuItems.length} menu items.`);
  console.log(`Company: ${COMPANY_ID} / Branch: ${BRANCH_ID}`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
