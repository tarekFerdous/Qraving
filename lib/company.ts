import { adminDb } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { randomBytes } from 'crypto';

export interface LayerConfig {
  index: number;
  label: string;
  isLeafLayer: boolean;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  layers: LayerConfig[];
  managerLayerIndex: number;
  createdAt: Timestamp;
  logoUrl?: string;
  locked?: boolean;
}

export interface CompanyNode {
  id: string;
  parentId: string | null;
  label: string;
  slug: string;
  depth: number;
  isLeaf: boolean;
  qrCode: string | null;
  fullPath: string | null;
  active: boolean;
  createdAt: Timestamp;
}

export function generateSlug(displayName: string, suffix?: string): string {
  const base = displayName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return suffix ? `${base}-${suffix}` : base;
}

export async function ensureUniqueSlug(candidateSlug: string): Promise<string> {
  const snap = await adminDb.collection('companies').where('slug', '==', candidateSlug).limit(1).get();
  if (snap.empty) return candidateSlug;
  const snap2 = await adminDb.collection('companies').where('slug', '==', `${candidateSlug}-2`).limit(1).get();
  if (snap2.empty) return `${candidateSlug}-2`;
  return `${candidateSlug}-${Date.now()}`;
}

export async function createCompany(data: { name: string; slug: string; layers: LayerConfig[]; managerLayerIndex: number }): Promise<string> {
  const ref = adminDb.collection('companies').doc();
  await ref.set({
    name: data.name,
    slug: data.slug,
    layers: data.layers,
    managerLayerIndex: data.managerLayerIndex,
    createdAt: Timestamp.now(),
  });
  return ref.id;
}

export async function getCompany(companyId: string): Promise<Company | null> {
  const snap = await adminDb.doc(`companies/${companyId}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<Company, 'id'>) };
}

export async function getAllCompanies(): Promise<Company[]> {
  const snap = await adminDb.collection('companies').orderBy('createdAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Company, 'id'>) }));
}

export async function setCompanyLogo(companyId: string, logoUrl: string): Promise<void> {
  await adminDb.doc(`companies/${companyId}`).update({ logoUrl });
}

export async function clearCompanyLogo(companyId: string): Promise<void> {
  await adminDb.doc(`companies/${companyId}`).update({ logoUrl: FieldValue.delete() });
}

export async function lockCompany(companyId: string): Promise<void> {
  await adminDb.doc(`companies/${companyId}`).update({ locked: true });

  const usersSnap = await adminDb
    .collection('users')
    .where('companyId', '==', companyId)
    .where('role', '==', 'manager')
    .get();

  const auth = getAuth();

  await Promise.all(
    usersSnap.docs.map(async (userDoc) => {
      let disabled = false;
      try {
        const fbUser = await auth.getUser(userDoc.id);
        disabled = fbUser.disabled;
      } catch {
        // If we can't find/reach the Auth account, treat as already disabled/skip.
        disabled = true;
      }

      // Managers already individually deactivated are left untouched — no marker, no state change.
      if (disabled) return;

      await auth.updateUser(userDoc.id, { disabled: true });
      await userDoc.ref.update({ autoDisabledByCompanyLock: true });
    }),
  );
}

export async function restoreCompany(companyId: string): Promise<void> {
  await adminDb.doc(`companies/${companyId}`).update({ locked: false });

  const usersSnap = await adminDb
    .collection('users')
    .where('companyId', '==', companyId)
    .where('autoDisabledByCompanyLock', '==', true)
    .get();

  const auth = getAuth();

  await Promise.all(
    usersSnap.docs.map(async (userDoc) => {
      await auth.updateUser(userDoc.id, { disabled: false });
      await userDoc.ref.update({ autoDisabledByCompanyLock: FieldValue.delete() });
    }),
  );
}

/**
 * Irreversibly purge a company: every manager's Firebase Auth account and
 * `users` doc, every Storage object under `companies/{companyId}/` (logo +
 * menu item images), and the company document with all its Firestore
 * subcollections (nodes/branches, sessions, baskets, orders).
 */
export async function hardDeleteCompany(companyId: string): Promise<void> {
  const usersSnap = await adminDb
    .collection('users')
    .where('companyId', '==', companyId)
    .get();

  const auth = getAuth();

  await Promise.all(
    usersSnap.docs.map(async (userDoc) => {
      try {
        await auth.deleteUser(userDoc.id);
      } catch {
        // Auth account may already be gone — proceed with doc cleanup regardless.
      }
      await userDoc.ref.delete();
    }),
  );

  try {
    const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    await bucket.deleteFiles({ prefix: `companies/${companyId}/` });
  } catch {
    // Storage bucket may not be provisioned (e.g. project not yet upgraded to
    // Blaze) — don't let a missing/inaccessible bucket block the rest of the purge.
  }

  const companyRef = adminDb.doc(`companies/${companyId}`);
  await adminDb.recursiveDelete(companyRef);
}

export async function getNodes(companyId: string): Promise<CompanyNode[]> {
  const snap = await adminDb
    .collection(`companies/${companyId}/nodes`)
    .where('active', '==', true)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<CompanyNode, 'id'>) }))
    .sort((a, b) => a.depth - b.depth);
}

export async function buildFullPath(companyId: string, nodeId: string): Promise<string> {
  const company = await getCompany(companyId);
  if (!company) throw new Error('Company not found');

  const chain: string[] = [];
  let currentId: string | null = nodeId;

  while (currentId) {
    const snap = await adminDb.doc(`companies/${companyId}/nodes/${currentId}`).get();
    if (!snap.exists) break;
    const data = snap.data() as CompanyNode;
    chain.unshift(data.slug);
    currentId = data.parentId;
  }

  return `/${company.slug}/${chain.join('/')}`;
}

export async function createNode(
  companyId: string,
  data: { parentId: string | null; label: string; depth: number; isLeaf: boolean },
): Promise<string> {
  const slug = generateSlug(data.label);
  const ref = adminDb.collection(`companies/${companyId}/nodes`).doc();

  const batch = adminDb.batch();
  batch.set(ref, {
    parentId: data.parentId,
    label: data.label,
    slug,
    depth: data.depth,
    isLeaf: data.isLeaf,
    qrCode: null,
    fullPath: null,
    active: true,
    createdAt: Timestamp.now(),
  });

  // When adding a child to a parent, mark parent as non-leaf
  if (data.parentId) {
    batch.update(adminDb.doc(`companies/${companyId}/nodes/${data.parentId}`), { isLeaf: false });
  }

  await batch.commit();
  return ref.id;
}

export async function generateQRCode(companyId: string, nodeId: string): Promise<string> {
  const code = randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
  const fullPath = await buildFullPath(companyId, nodeId);
  const fullPathWithCode = `${fullPath}/${code}`;

  await adminDb.doc(`companies/${companyId}/nodes/${nodeId}`).update({
    qrCode: code,
    fullPath: fullPathWithCode,
  });

  return fullPathWithCode;
}

export async function deactivateNode(companyId: string, nodeId: string): Promise<void> {
  await adminDb.doc(`companies/${companyId}/nodes/${nodeId}`).update({ active: false });
}


export async function getNodeChain(companyId: string, slugs: string[]): Promise<CompanyNode[]> {
  let parentId: string | null = null;
  const chain: CompanyNode[] = [];

  for (const slug of slugs) {
    const snap: FirebaseFirestore.QuerySnapshot = await adminDb
      .collection(`companies/${companyId}/nodes`)
      .where('slug', '==', slug)
      .where('parentId', '==', parentId)
      .where('active', '==', true)
      .limit(1)
      .get();
    if (snap.empty) return [];
    const node = { id: snap.docs[0].id, ...(snap.docs[0].data() as Omit<CompanyNode, 'id'>) };
    chain.push(node);
    parentId = node.id;
  }

  return chain;
}

export async function getDescendantNodes(companyId: string, nodeId: string): Promise<CompanyNode[]> {
  const allNodes = await getNodes(companyId);
  const result: CompanyNode[] = [];
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = allNodes.filter((n) => n.parentId === current);
    for (const child of children) {
      result.push(child);
      queue.push(child.id);
    }
  }

  return result;
}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  const snap = await adminDb.collection('companies').where('slug', '==', slug).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<Company, 'id'>) };
}

export async function getNodeByQRCode(companyId: string, qrCode: string): Promise<CompanyNode | null> {
  const snap = await adminDb
    .collection(`companies/${companyId}/nodes`)
    .where('qrCode', '==', qrCode)
    .where('active', '==', true)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<CompanyNode, 'id'>) };
}

export async function isNodeInBranch(companyId: string, nodeId: string, branchId: string): Promise<boolean> {
  let currentId: string | null = nodeId;

  while (currentId) {
    if (currentId === branchId) return true;
    const snap = await adminDb.doc(`companies/${companyId}/nodes/${currentId}`).get();
    if (!snap.exists) return false;
    const data = snap.data() as CompanyNode;
    currentId = data.parentId;
  }

  return false;
}

export async function resolveBranchNode(
  companyId: string,
  branchId: string,
): Promise<{ status: 'ok'; node: CompanyNode } | { status: 'not_found' } | { status: 'inactive' }> {
  const snap = await adminDb.doc(`companies/${companyId}/nodes/${branchId}`).get();
  if (!snap.exists) return { status: 'not_found' };
  const node = { id: snap.id, ...(snap.data() as Omit<CompanyNode, 'id'>) };
  if (!node.active) return { status: 'inactive' };
  return { status: 'ok', node };
}
