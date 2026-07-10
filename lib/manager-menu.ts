import { db } from '@/lib/firebase-client';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MenuConfig {
  published: boolean;
  updatedAt: Timestamp;
}

export interface Category {
  id: string;
  name: string;
  order: number;
  createdAt: Timestamp;
}

export interface Customizations {
  sizes: Array<{ label: string; priceDelta: number }>;
  addOns: Array<{ label: string; priceDelta: number }>;
  specialInstructions: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number; // integer cents
  imageUrl: string | null;
  available: boolean;
  order: number;
  dietaryTags: string[]; // ["vegan","vegetarian","halal","gluten-free","nut-free","dairy-free"]
  allergenNote: string | null;
  customizations: Customizations;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function menuConfigPath(companyId: string, branchId: string): string {
  return `companies/${companyId}/branches/${branchId}/menu/config`;
}

function categoriesPath(companyId: string, branchId: string): string {
  return `companies/${companyId}/branches/${branchId}/categories`;
}

function itemsPath(companyId: string, branchId: string, categoryId: string): string {
  return `companies/${companyId}/branches/${branchId}/categories/${categoryId}/items`;
}

// ─── Menu config ──────────────────────────────────────────────────────────────

export async function getMenuConfig(companyId: string, branchId: string): Promise<MenuConfig | null> {
  const snap = await getDoc(doc(db, menuConfigPath(companyId, branchId)));
  if (!snap.exists()) return null;
  return snap.data() as MenuConfig;
}

export async function setMenuPublished(
  companyId: string,
  branchId: string,
  published: boolean,
): Promise<void> {
  await setDoc(
    doc(db, menuConfigPath(companyId, branchId)),
    { published, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

// ─── Categories ───────────────────────────────────────────────────────────────

export function subscribeCategories(
  companyId: string,
  branchId: string,
  cb: (cats: Category[]) => void,
): () => void {
  const q = query(collection(db, categoriesPath(companyId, branchId)), orderBy('order', 'asc'));
  return onSnapshot(q, (snap) => {
    const cats = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Category, 'id'>) }));
    cb(cats);
  });
}

export async function createCategory(
  companyId: string,
  branchId: string,
  name: string,
): Promise<string> {
  const colRef = collection(db, categoriesPath(companyId, branchId));
  const existingSnap = await getDocs(colRef);
  const order = existingSnap.size;

  const ref = await addDoc(colRef, {
    name,
    order,
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

export async function updateCategoryName(
  companyId: string,
  branchId: string,
  categoryId: string,
  name: string,
): Promise<void> {
  await updateDoc(doc(db, categoriesPath(companyId, branchId), categoryId), { name });
}

export async function reorderCategories(
  companyId: string,
  branchId: string,
  orderedIds: string[],
): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, categoriesPath(companyId, branchId), id), { order: index });
  });
  await batch.commit();
}

export async function deleteCategory(
  companyId: string,
  branchId: string,
  categoryId: string,
): Promise<void> {
  await deleteDoc(doc(db, categoriesPath(companyId, branchId), categoryId));
}

// ─── Items ────────────────────────────────────────────────────────────────────

export function subscribeItems(
  companyId: string,
  branchId: string,
  categoryId: string,
  cb: (items: MenuItem[]) => void,
): () => void {
  const q = query(
    collection(db, itemsPath(companyId, branchId, categoryId)),
    orderBy('order', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuItem, 'id'>) }));
    cb(items);
  });
}

export async function createItem(
  companyId: string,
  branchId: string,
  categoryId: string,
  data: Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const colRef = collection(db, itemsPath(companyId, branchId, categoryId));
  const existingSnap = await getDocs(colRef);
  const order = existingSnap.size;

  const ref = await addDoc(colRef, {
    ...data,
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function updateItem(
  companyId: string,
  branchId: string,
  categoryId: string,
  itemId: string,
  data: Partial<Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await updateDoc(doc(db, itemsPath(companyId, branchId, categoryId), itemId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteItem(
  companyId: string,
  branchId: string,
  categoryId: string,
  itemId: string,
): Promise<void> {
  await deleteDoc(doc(db, itemsPath(companyId, branchId, categoryId), itemId));
}

export async function reorderItems(
  companyId: string,
  branchId: string,
  categoryId: string,
  orderedIds: string[],
): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, itemsPath(companyId, branchId, categoryId), id), { order: index });
  });
  await batch.commit();
}
