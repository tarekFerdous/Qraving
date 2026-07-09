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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/33/Fresh_made_pasta_oblique.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a3/Eq_it-na_pizza-margherita_sep2005_sml.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/6d/Pasta_with_tomato_sauce.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Risotto_mit_Pilzen.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Tiramisu_-_Raffaele_Diomede.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Souvlaki_Athens.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/Greek_salad_%28Horiatiki%29.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a6/Moussaka.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/56/Spanakopita_Triangles.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Baklava_-_Turkish_special%2C_80-ply.JPEG',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/60/Salmon-sashimi.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e4/Shio_Ramen.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Tempura_Moriawase.JPG',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Sashimi_platter.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Miso_Soup.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/73/001_Tacos_de_carnitas%2C_carne_asada_y_al_pastor.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/28/Burritos_-_Evan_Swigart.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e3/Nachos-cheese.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/Enchiladas_con_mole.jpg',
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
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/89/Churro_from_Taiwan.jpg',
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
