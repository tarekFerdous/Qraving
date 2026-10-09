/**
 * Firestore-emulator-backed integration test for the #174 fix: the public
 * QR-scanned menu page (app/[...path]/page.tsx) must resolve a scanned QR
 * node's real branch ancestor — regardless of how many intermediate
 * hierarchy layers (e.g. "Area") sit between it and the top-level branch —
 * and use that resolved node's real id (together with the company's real
 * id) to check publish status and load the menu.
 *
 * This exercises the REAL `lib/company.ts` (`resolveBranchNodeId`) and
 * `lib/menu.ts` (`isMenuPublished`, `getMenu`) functions, which use
 * `firebase-admin`'s `adminDb`, against a local Firestore emulator — not
 * mocks. It mirrors the pattern in tests/firestore-rules.test.ts (project id
 * `demo-qraving`, emulator host `127.0.0.1:8080`) but drives the Admin SDK
 * instead of the client SDK + rules-unit-testing harness, since
 * `resolveBranchNodeId`/`isMenuPublished`/`getMenu` are server-only code.
 *
 * Like tests/firestore-rules.test.ts, this file is excluded from the
 * default `vitest run` (see vitest.config.ts) because it needs a real local
 * Firestore emulator running (`firebase emulators:start --only firestore`,
 * or equivalent). Run it directly via `npm run test:menu-resolution`.
 */

// Must be set BEFORE any import that touches `@/lib/firebase-admin`
// (directly or transitively, e.g. via `@/lib/company` or `@/lib/menu`) —
// that module reads `FIREBASE_SERVICE_ACCOUNT_JSON` at its own
// module-load time and throws if it's missing. The Admin SDK never actually
// signs/sends a real auth request when `FIRESTORE_EMULATOR_HOST` is set (the
// emulator accepts unauthenticated Admin SDK connections), but newer
// `firebase-admin` versions fully DER-parse the private key up front, so it
// must be a well-formed PKCS8 key. A freshly generated throwaway key is used;
// no real credentials are needed or used.
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'crypto';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: 'demo-qraving',
  private_key: generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey,
  client_email: 'fake@demo-qraving.iam.gserviceaccount.com',
});

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

describe('Branch resolution + publish status across a multi-level node hierarchy', () => {
  let adminDb: typeof import('@/lib/firebase-admin').adminDb;
  let Timestamp: typeof import('firebase-admin/firestore').Timestamp;
  let resolveBranchNodeId: typeof import('@/lib/company').resolveBranchNodeId;
  let isMenuPublished: typeof import('@/lib/menu').isMenuPublished;
  let getMenu: typeof import('@/lib/menu').getMenu;

  let companyId: string;
  let branchNodeId: string;
  let areaNodeId: string;
  let tableNodeId: string;
  const qrCode = uniqueId('QR');

  beforeAll(async () => {
    // Dynamic imports so the env vars above are guaranteed to be set before
    // `@/lib/firebase-admin` (and anything importing it) is ever evaluated.
    ({ adminDb } = await import('@/lib/firebase-admin'));
    ({ Timestamp } = await import('firebase-admin/firestore'));
    ({ resolveBranchNodeId } = await import('@/lib/company'));
    ({ isMenuPublished, getMenu } = await import('@/lib/menu'));

    companyId = uniqueId('company');
    const companyRef = adminDb.doc(`companies/${companyId}`);
    await companyRef.set({
      name: 'Flaming Grill Test Co',
      slug: uniqueId('flaming-grill'),
      layers: [
        { index: 0, label: 'Branch', isLeafLayer: false },
        { index: 1, label: 'Area', isLeafLayer: false },
        { index: 2, label: 'Table', isLeafLayer: true },
      ],
      managerLayerIndex: 0,
      createdAt: Timestamp.now(),
    });

    // Branch (root, parentId: null)
    const branchRef = adminDb.collection(`companies/${companyId}/nodes`).doc();
    branchNodeId = branchRef.id;
    await branchRef.set({
      parentId: null,
      label: 'Flaming Grill',
      slug: 'flaming-grill',
      depth: 0,
      isLeaf: false,
      qrCode: null,
      fullPath: null,
      active: true,
      createdAt: Timestamp.now(),
    });

    // Area (intermediate layer, parentId: branch)
    const areaRef = adminDb.collection(`companies/${companyId}/nodes`).doc();
    areaNodeId = areaRef.id;
    await areaRef.set({
      parentId: branchNodeId,
      label: 'Patio',
      slug: 'patio',
      depth: 1,
      isLeaf: false,
      qrCode: null,
      fullPath: null,
      active: true,
      createdAt: Timestamp.now(),
    });

    // Table (leaf, parentId: area) — this is the node the QR code resolves to
    const tableRef = adminDb.collection(`companies/${companyId}/nodes`).doc();
    tableNodeId = tableRef.id;
    await tableRef.set({
      parentId: areaNodeId,
      label: 'Table 7',
      slug: 'table-7',
      depth: 2,
      isLeaf: true,
      qrCode,
      fullPath: `/flaming-grill/patio/table-7/${qrCode}`,
      active: true,
      createdAt: Timestamp.now(),
    });

    // Menu config + a category, keyed by the BRANCH node id (never the leaf
    // table id or the area id) — matching how companies/{id}/branches/{id}/...
    // is used everywhere else in the app.
    await adminDb
      .doc(`companies/${companyId}/branches/${branchNodeId}/menu/config`)
      .set({ published: true });

    await adminDb
      .collection(`companies/${companyId}/branches/${branchNodeId}/categories`)
      .doc('mains')
      .set({ name: 'Mains', description: 'Grilled favourites', order: 1 });

    // Seed a real admin-shape item under the category's nested `items`
    // subcollection (companies/{c}/branches/{b}/categories/{categoryId}/items),
    // matching exactly what `lib/manager-menu.ts` writes: `available`
    // (not `isAvailable`), lowercase-hyphen `dietaryTags`, a free-form
    // `allergens` tag list, and rich `customizations` with cents-based
    // `priceDelta`s.
    await adminDb
      .collection(`companies/${companyId}/branches/${branchNodeId}/categories/mains/items`)
      .doc('ribeye')
      .set({
        name: 'Ribeye Steak',
        description: 'Charcoal-grilled ribeye',
        price: 3200,
        imageUrl: 'https://img.example.com/ribeye.jpg',
        available: true,
        order: 0,
        dietaryTags: ['halal', 'gluten-free', 'dairy-free'],
        allergens: ['Dairy', 'Custom Spice Rub'],
        customizations: {
          sizes: [
            { label: '8oz', priceDelta: 0 },
            { label: '12oz', priceDelta: 500 },
          ],
          addOns: [
            { label: 'Peppercorn Sauce', priceDelta: 150 },
          ],
          specialInstructions: true,
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
  });

  afterAll(async () => {
    await adminDb.recursiveDelete(adminDb.doc(`companies/${companyId}`));
  });

  it('walks the parentId chain from a leaf Table node, through an Area layer, up to the root Branch node id', async () => {
    const resolved = await resolveBranchNodeId(companyId, tableNodeId);
    expect(resolved).toBe(branchNodeId);
  });

  it('returns the node itself when it is already the root (parentId: null)', async () => {
    const resolved = await resolveBranchNodeId(companyId, branchNodeId);
    expect(resolved).toBe(branchNodeId);
  });

  it('reads publish status as true for the resolved branch id when the menu is published', async () => {
    const published = await isMenuPublished(companyId, branchNodeId);
    expect(published).toBe(true);
  });

  it('loads the seeded menu category for the resolved branch id', async () => {
    const sections = await getMenu(companyId, branchNodeId);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: 'mains', name: 'Mains', description: 'Grilled favourites' });
  });

  it('reads the seeded admin-shape item from the nested categories/{categoryId}/items subcollection, correctly mapping availability, dietary tags, allergens, and customizations', async () => {
    const sections = await getMenu(companyId, branchNodeId);
    expect(sections).toHaveLength(1);
    expect(sections[0].items).toHaveLength(1);

    const item = sections[0].items[0];
    expect(item).toMatchObject({
      id: 'ribeye',
      name: 'Ribeye Steak',
      description: 'Charcoal-grilled ribeye',
      imageUrl: 'https://img.example.com/ribeye.jpg',
      price: 32, // 3200 cents -> dollars
      isAvailable: true, // mapped from admin's `available` field
    });

    // Lowercase-hyphen admin tags mapped to the PascalCase public enum.
    expect(item.dietaryTags).toEqual(
      expect.arrayContaining(['Halal', 'GlutenFree', 'DairyFree']),
    );
    expect(item.dietaryTags).toHaveLength(3);

    // Free-form allergen tags passed through unchanged.
    expect(item.allergens).toEqual(['Dairy', 'Custom Spice Rub']);

    // Customizations converted from admin cents to dollars.
    expect(item.customizations).toEqual({
      sizes: [
        { label: '8oz', priceDelta: 0 },
        { label: '12oz', priceDelta: 5 },
      ],
      addOns: [
        { label: 'Peppercorn Sauce', priceDelta: 1.5 },
      ],
      specialInstructions: true,
    });
  });

  it('flips back to unpublished immediately (next request, no cache) once the menu is unpublished', async () => {
    await adminDb
      .doc(`companies/${companyId}/branches/${branchNodeId}/menu/config`)
      .set({ published: false });

    const published = await isMenuPublished(companyId, branchNodeId);
    expect(published).toBe(false);

    // restore for isolation from any other assertions that might run after
    await adminDb
      .doc(`companies/${companyId}/branches/${branchNodeId}/menu/config`)
      .set({ published: true });
  });

  it('reads publish status as false for a branch with no menu config doc at all', async () => {
    const unpublishedBranchId = uniqueId('unpublished-branch');
    const published = await isMenuPublished(companyId, unpublishedBranchId);
    expect(published).toBe(false);
  });
});
