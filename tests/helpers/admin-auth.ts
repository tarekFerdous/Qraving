/**
 * Playwright test-infrastructure helper for reaching an authenticated
 * `/[companySlug]/admin` page (see #156).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `/[companySlug]/admin` is gated by `requireRole('manager')`
 * (lib/auth-server.ts), which verifies a real Firebase ID token stored in the
 * `firebase-token` cookie (see middleware.ts and lib/auth.ts). There is no
 * test-mode bypass for this route (unlike the public `/demo-table` route used
 * by tests/demo-table.spec.ts). To exercise this page in a Playwright test,
 * something has to:
 *   1. seed a real company + branch + Structure nodes + Menu categories/items
 *      in Firestore,
 *   2. create a real Firebase Auth user with `role: 'manager'` custom claims
 *      scoped to that company/branch,
 *   3. obtain a real Firebase ID token for that user and get it into the
 *      browser as the `firebase-token` cookie,
 *   4. clean all of it back up again.
 * This module does all four, using the same `firebase-admin` initialization
 * pattern as scripts/seed-superadmin.ts and scripts/seed-firestore.ts, and the
 * same Firestore shapes/paths as lib/company.ts and lib/manager-menu.ts.
 *
 * ── Auth strategy: out-of-band ID token, not the login UI ──────────────────
 * The `firebase-token` cookie is set by lib/auth.ts as a plain
 * `document.cookie` (not httpOnly), so it can be injected directly via
 * `context.addCookies(...)` instead of driving app/[companySlug]/login's
 * form. We mint it like this:
 *   - `adminAuth.createCustomToken(uid)` (Admin SDK) produces a *custom*
 *     token — NOT a Firebase ID token. `verifyIdToken` (used by
 *     `requireRole`) will reject a custom token outright.
 *   - To turn that into a real ID token without a browser, we call the
 *     Identity Toolkit REST API's `signInWithCustomToken` endpoint (the same
 *     endpoint the client SDK's `signInWithCustomToken` calls under the
 *     hood), using the project's public `NEXT_PUBLIC_FIREBASE_API_KEY`. That
 *     returns a real ID token, already carrying the custom claims we set,
 *     ready to drop straight into the cookie.
 * This is more reliable than driving the real login form: it has no
 * dependency on the client Firestore SDK's auth-state timing, no UI
 * selectors to keep in sync, and no email/password round trip through the
 * Auth UI.
 *
 * ── What gets seeded ─────────────────────────────────────────────────────────
 * `seedAdminTestFixture()` creates, in whatever Firebase project this repo's
 * `FIREBASE_SERVICE_ACCOUNT_JSON` / `NEXT_PUBLIC_FIREBASE_*` env vars point
 * to:
 *   - a `companies/{id}` doc (via `createCompany`, lib/company.ts) with a
 *     3-layer hierarchy: Branch (depth 0, manager layer) → Area (depth 1) →
 *     Table (depth 2, leaf),
 *   - one Branch node, N Area nodes under it, M Table nodes under each Area
 *     (via `createNode`), with a QR code generated for every Table (via
 *     `generateQRCode`) so the Structure tab renders full QR cards
 *     immediately — deep/wide enough by default to overflow one viewport,
 *   - K categories and L items per category at
 *     `companies/{id}/branches/{branchId}/categories[/{}/items]` — the exact
 *     paths and field shapes `lib/manager-menu.ts` (used by MenuTab /
 *     CategoryItemsSection) reads, so seeded items actually render in the
 *     admin Menu tab (this is deliberately NOT the flatter
 *     `FirestoreCategory`/`FirestoreMenuItem` shape from
 *     lib/firestore-types.ts that scripts/seed-firestore.ts writes for the
 *     customer-facing `/demo-table` route — that shape lives at a different
 *     path (`branches/{branchId}/menuItems`, flat) and the admin Menu tab
 *     does not read it),
 *   - a Firebase Auth user (`role: 'manager'`, custom claims
 *     `{ role, companyId, branchId, companySlug }`) plus a mirrored
 *     `users/{uid}` Firestore doc — matching exactly what
 *     app/api/admin/companies/[companyId]/managers/route.ts's POST handler
 *     does for a real manager account.
 *
 * Every seeded record is scoped under a per-call random slug/email
 * (`e2e-admin-<timestamp>-<random>`), so concurrent/retried test runs never
 * collide, and `teardownAdminTestFixture()` deletes exactly what a given
 * `seedAdminTestFixture()` call created (`Firestore#recursiveDelete` on the
 * company doc wipes the whole node/branch/category/item tree in one call).
 *
 * ── ⚠️ Real, shared Firebase project — no emulator ──────────────────────────
 * There is no Firestore/Auth emulator wired up in this repo (no
 * `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST`, no `emulators` key
 * in firebase.json). `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env.local` points
 * at the real `qraving-db` Firebase project — the same one local dev and (if
 * configured) production point at. Every call to `seedAdminTestFixture()`
 * creates a REAL Firebase Auth user and REAL Firestore documents in that
 * project. Always pair it with `teardownAdminTestFixture()` (e.g. in
 * `test.afterAll`) — do not skip cleanup, and do not run this against a
 * project you don't want extra test data in.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 * ```ts
 * import { test } from '@playwright/test';
 * import {
 *   seedAdminTestFixture,
 *   teardownAdminTestFixture,
 *   gotoAuthenticatedAdmin,
 *   type AdminTestFixture,
 * } from './helpers/admin-auth';
 *
 * let fixture: AdminTestFixture;
 *
 * test.beforeAll(async () => {
 *   fixture = await seedAdminTestFixture(); // defaults overflow both tabs
 * });
 *
 * test.afterAll(async () => {
 *   await teardownAdminTestFixture(fixture);
 * });
 *
 * test('structure tab scrolls to reveal the last table', async ({ page }) => {
 *   await gotoAuthenticatedAdmin(page, fixture, { tab: 'structure' });
 *   // ... assertions against AdminShell's structure tab ...
 * });
 * ```
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Must run before any import that touches `@/lib/firebase-admin` (directly or
// transitively, e.g. via `@/lib/company`) — that module reads
// `process.env.FIREBASE_SERVICE_ACCOUNT_JSON` at its own module-load time and
// throws if it's missing. Playwright's test process does not get `.env.local`
// for free the way `next dev` does, so we load it ourselves here, first,
// exactly like scripts/seed-superadmin.ts and scripts/seed-firestore.ts do.
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { randomBytes } from 'crypto';
import type { Page } from '@playwright/test';
import type { getAuth as GetAuthFn } from 'firebase-admin/auth';
import type { Timestamp as TimestampClass } from 'firebase-admin/firestore';
import type { adminDb as AdminDbInstance } from '@/lib/firebase-admin';
import type { createCompany as CreateCompanyFn, createNode as CreateNodeFn, generateQRCode as GenerateQRCodeFn, LayerConfig } from '@/lib/company';

// Playwright's TS transform evaluates static `import` bindings (including
// transitive ones) before this module's own top-level statements run — i.e.
// it does NOT preserve source order the way scripts/seed-*.ts rely on under
// ts-node. A plain `import { adminDb } from '@/lib/firebase-admin'` above the
// `dotenv.config()` call above would therefore throw before .env.local is
// ever loaded. Dynamic `import()` expressions, by spec, are never hoisted —
// they only evaluate when the call is actually reached — so every runtime
// (non-type-only) use of firebase-admin/@/lib/company is loaded lazily here,
// guaranteeing dotenv.config() has already run first.
interface FirebaseAdminModules {
  adminDb: typeof AdminDbInstance;
  getAuth: typeof GetAuthFn;
  Timestamp: typeof TimestampClass;
  createCompany: typeof CreateCompanyFn;
  createNode: typeof CreateNodeFn;
  generateQRCode: typeof GenerateQRCodeFn;
}

let modulesPromise: Promise<FirebaseAdminModules> | null = null;

function loadFirebaseAdminModules(): Promise<FirebaseAdminModules> {
  if (!modulesPromise) {
    modulesPromise = (async () => {
      const [{ adminDb }, { getAuth }, { Timestamp }, company] = await Promise.all([
        import('@/lib/firebase-admin'),
        import('firebase-admin/auth'),
        import('firebase-admin/firestore'),
        import('@/lib/company'),
      ]);
      return {
        adminDb,
        getAuth,
        Timestamp,
        createCompany: company.createCompany,
        createNode: company.createNode,
        generateQRCode: company.generateQRCode,
      };
    })();
  }
  return modulesPromise;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AdminTestFixture {
  companyId: string;
  companySlug: string;
  /** Node id of the Branch-layer node — also the Firestore path segment used
   *  by lib/manager-menu.ts (`companies/{companyId}/branches/{branchId}/...`)
   *  and the `branchId` custom claim / `users/{uid}` doc field. */
  branchId: string;
  uid: string;
  email: string;
  password: string;
}

export interface SeedAdminTestFixtureOptions {
  /** Number of Area nodes under the Branch. Default 3. */
  areaCount?: number;
  /** Number of Table nodes under each Area. Default 5. */
  tablesPerArea?: number;
  /** Whether to generate (and thus render as a full QR card) a QR code for
   *  every seeded Table. Default true — this is what makes the Structure tab
   *  overflow a single viewport without any user interaction. */
  generateQrCodes?: boolean;
  /** Number of menu categories. Default 4. */
  categoryCount?: number;
  /** Number of menu items per category. Default 5. */
  itemsPerCategory?: number;
  /** Prefix used in the seeded company's display name (cosmetic only). */
  namePrefix?: string;
}

// ─── Seeding ────────────────────────────────────────────────────────────────

const BRANCH_LAYER: LayerConfig = { index: 0, label: 'Branch', isLeafLayer: false };
const AREA_LAYER: LayerConfig = { index: 1, label: 'Area', isLeafLayer: false };
const TABLE_LAYER: LayerConfig = { index: 2, label: 'Table', isLeafLayer: true };
const MANAGER_LAYER_INDEX = 0; // Branch — a manager is scoped to one Branch node

function uniqueRunId(): string {
  return `${Date.now()}-${randomBytes(4).toString('hex')}`;
}

/**
 * Seeds a disposable company/branch, a Structure node tree, and Menu
 * categories/items, then creates a `role: 'manager'` Firebase Auth user
 * scoped to it. See the module-level doc comment for the full shape and the
 * real-project caveat.
 */
export async function seedAdminTestFixture(
  options: SeedAdminTestFixtureOptions = {},
): Promise<AdminTestFixture> {
  const { adminDb, getAuth, Timestamp, createCompany, createNode, generateQRCode } =
    await loadFirebaseAdminModules();

  const {
    areaCount = 3,
    tablesPerArea = 5,
    generateQrCodes = true,
    categoryCount = 4,
    itemsPerCategory = 5,
    namePrefix = 'E2E Admin Test',
  } = options;

  const runId = uniqueRunId();
  const companySlug = `e2e-admin-${runId}`;
  const email = `e2e-admin-${runId}@qraving-test.invalid`;
  const password = `Test-${randomBytes(9).toString('base64url')}`;

  // ── Company + Structure node tree ─────────────────────────────────────────

  const companyId = await createCompany({
    name: `${namePrefix} ${runId}`,
    slug: companySlug,
    layers: [BRANCH_LAYER, AREA_LAYER, TABLE_LAYER],
    managerLayerIndex: MANAGER_LAYER_INDEX,
  });

  const branchId = await createNode(companyId, {
    parentId: null,
    label: 'Main Branch',
    depth: 0,
    isLeaf: false,
  });

  for (let a = 0; a < areaCount; a++) {
    const areaId = await createNode(companyId, {
      parentId: branchId,
      label: `Area ${a + 1}`,
      depth: 1,
      isLeaf: false,
    });

    // Tables within one area are independent writes (each only touches its
    // own new doc plus a `isLeaf: false` update on the shared area doc,
    // which is idempotent) — safe to create concurrently for speed.
    const tableIds = await Promise.all(
      Array.from({ length: tablesPerArea }, (_, t) =>
        createNode(companyId, {
          parentId: areaId,
          label: `Table ${a + 1}-${t + 1}`,
          depth: 2,
          isLeaf: true,
        }),
      ),
    );

    if (generateQrCodes) {
      await Promise.all(tableIds.map((tableId) => generateQRCode(companyId, tableId)));
    }
  }

  // ── Menu categories/items ─────────────────────────────────────────────────
  // Written directly at the paths + field shapes lib/manager-menu.ts expects
  // (`companies/{companyId}/branches/{branchId}/categories[/{id}/items]`) so
  // they render in the admin Menu tab via subscribeCategories/subscribeItems.

  const branchRef = adminDb.doc(`companies/${companyId}/branches/${branchId}`);
  const now = Timestamp.now();

  for (let c = 0; c < categoryCount; c++) {
    const categoryRef = branchRef.collection('categories').doc();
    await categoryRef.set({
      name: `Category ${c + 1}`,
      order: c,
      createdAt: now,
    });

    const batch = adminDb.batch();
    for (let i = 0; i < itemsPerCategory; i++) {
      const itemRef = categoryRef.collection('items').doc();
      batch.set(itemRef, {
        name: `Item ${c + 1}-${i + 1}`,
        description: 'Seeded item for admin-auth test fixture (see tests/helpers/admin-auth.ts).',
        price: 1000 + i * 100, // cents
        imageUrl: null,
        available: true,
        order: i,
        dietaryTags: [],
        allergenNote: null,
        customizations: { sizes: [], addOns: [], specialInstructions: false },
        createdAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
  }

  // ── Manager Firebase Auth user ────────────────────────────────────────────
  // Mirrors app/api/admin/companies/[companyId]/managers/route.ts's POST handler.

  const adminAuth = getAuth();
  const user = await adminAuth.createUser({ email, password });
  const uid = user.uid;

  await adminAuth.setCustomUserClaims(uid, {
    role: 'manager',
    companyId,
    branchId,
    companySlug,
  });

  await adminDb.doc(`users/${uid}`).set({
    role: 'manager',
    email,
    companyId,
    branchId,
    companySlug,
    createdAt: now,
  });

  return { companyId, companySlug, branchId, uid, email, password };
}

/**
 * Deletes everything `seedAdminTestFixture()` created for this fixture: the
 * whole `companies/{companyId}` doc tree (nodes, branches, categories,
 * items — `recursiveDelete` handles all subcollections in one call), the
 * mirrored `users/{uid}` doc, and the Firebase Auth user itself. Safe to call
 * even if some pieces were already removed (e.g. a partially-failed previous
 * run) — each step is best-effort.
 */
export async function teardownAdminTestFixture(fixture: AdminTestFixture): Promise<void> {
  const { adminDb, getAuth } = await loadFirebaseAdminModules();
  const { companyId, uid } = fixture;

  await Promise.allSettled([
    adminDb.recursiveDelete(adminDb.doc(`companies/${companyId}`)),
    adminDb.doc(`users/${uid}`).delete(),
    getAuth().deleteUser(uid),
  ]);
}

// ─── Superadmin / unprivileged fixtures (#185) ─────────────────────────────
// Minimal disposable Firebase Auth users for exercising the branch-admin
// route guard's role checks in middleware.ts directly, without needing a
// seeded company (middleware only inspects the token's `role` claim — it
// doesn't scope a superadmin to a specific company/branch, that's the page
// component's job). Mirrors the manager fixture above as closely as
// possible: same run-id scoping, same best-effort teardown.

export interface RoleTestFixture {
  uid: string;
  email: string;
}

async function createRoleTestUser(
  role: 'superadmin' | null,
  namePrefix: string,
): Promise<RoleTestFixture> {
  const { adminDb, getAuth, Timestamp } = await loadFirebaseAdminModules();

  const runId = uniqueRunId();
  const email = `${namePrefix}-${runId}@qraving-test.invalid`;
  const password = `Test-${randomBytes(9).toString('base64url')}`;

  const adminAuth = getAuth();
  const user = await adminAuth.createUser({ email, password });
  const uid = user.uid;

  if (role) {
    await adminAuth.setCustomUserClaims(uid, { role });
  }

  await adminDb.doc(`users/${uid}`).set({
    role,
    email,
    companyId: null,
    branchId: null,
    companySlug: null,
    createdAt: Timestamp.now(),
  });

  return { uid, email };
}

/** Creates a disposable `role: 'superadmin'` Firebase Auth user (no
 *  company/branch scoping — superadmin isn't scoped to one). */
export async function seedSuperadminTestFixture(): Promise<RoleTestFixture> {
  return createRoleTestUser('superadmin', 'e2e-superadmin');
}

/** Creates a disposable, fully-authenticated Firebase Auth user with no
 *  `role` custom claim at all — a legitimately-denied user for the
 *  branch-admin route gate (real session, just not manager/superadmin). */
export async function seedUnprivilegedTestFixture(): Promise<RoleTestFixture> {
  return createRoleTestUser(null, 'e2e-norole');
}

/** Tears down a fixture created by `seedSuperadminTestFixture` or
 *  `seedUnprivilegedTestFixture`. Safe to call even if some pieces were
 *  already removed. */
export async function teardownRoleTestFixture(fixture: RoleTestFixture): Promise<void> {
  const { adminDb, getAuth } = await loadFirebaseAdminModules();
  await Promise.allSettled([
    adminDb.doc(`users/${fixture.uid}`).delete(),
    getAuth().deleteUser(fixture.uid),
  ]);
}

// ─── Auth: minting and injecting a real ID token ───────────────────────────

/**
 * Exchanges a Firebase Auth uid for a real ID token via the Identity Toolkit
 * REST API (`signInWithCustomToken`), out-of-band from any browser. The
 * returned token already carries whatever custom claims were set via
 * `setCustomUserClaims` (they're attached to the account, not the token
 * request) — safe to drop straight into the `firebase-token` cookie that
 * `requireRole()` (lib/auth-server.ts) verifies server-side.
 */
export async function mintIdToken(uid: string): Promise<string> {
  const { getAuth } = await loadFirebaseAdminModules();

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing env var: NEXT_PUBLIC_FIREBASE_API_KEY — see .env.local.example');
  }

  const customToken = await getAuth().createCustomToken(uid);

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`signInWithCustomToken failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { idToken: string };
  return data.idToken;
}

/**
 * Injects a real, authenticated `firebase-token` cookie for `fixture` into
 * `page`'s browser context, without touching the login UI. Call this before
 * navigating to any `/[companySlug]/admin` URL.
 */
export async function loginAsManager(
  page: Page,
  fixture: AdminTestFixture,
  baseURL = 'http://localhost:3000',
): Promise<void> {
  const idToken = await mintIdToken(fixture.uid);
  const domain = new URL(baseURL).hostname;

  await page.context().addCookies([
    {
      name: 'firebase-token',
      value: idToken,
      domain,
      path: '/',
      sameSite: 'Lax',
      // The app itself sets this cookie via a non-httpOnly `document.cookie`
      // write (lib/auth.ts) over plain http on localhost — matched here.
      httpOnly: false,
      secure: false,
    },
  ]);
}

/**
 * Convenience wrapper: injects the auth cookie (`loginAsManager`) and
 * navigates straight to `/[companySlug]/admin`, optionally on a given tab.
 * This is the one-call entry point most tests reusing this fixture want.
 */
export async function gotoAuthenticatedAdmin(
  page: Page,
  fixture: AdminTestFixture,
  options: { tab?: 'dashboard' | 'menu' | 'structure'; baseURL?: string } = {},
): Promise<void> {
  const baseURL = options.baseURL ?? 'http://localhost:3000';
  await loginAsManager(page, fixture, baseURL);

  const url = options.tab
    ? `/${fixture.companySlug}/admin?tab=${options.tab}`
    : `/${fixture.companySlug}/admin`;
  await page.goto(url);
}
