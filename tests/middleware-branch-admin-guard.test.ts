/**
 * Integration test for #185: the branch-admin route guard in middleware.ts
 * used to (a) decode the `firebase-token` cookie with a bare `atob`/
 * `JSON.parse` — no signature or expiry check at all, so any base64 blob
 * shaped like a JWT would be trusted — and (b) block superadmins from a
 * branch's `/[companySlug]/admin` panel because it only ever checked
 * `claims.role === 'manager'`, and (c) return a raw `text/plain` "Forbidden"
 * response for anyone else, instead of an in-app page.
 *
 * This exercises the REAL `middleware()` function from `middleware.ts`
 * directly (not a mocked stand-in), which in turn calls the REAL Firebase
 * Admin SDK's `getAuth().verifyIdToken()` — the same verification
 * `lib/auth-server.ts`'s `requireRole`/`getSessionUser` use, and the same
 * real, shared Firebase project (`qraving-db`) that
 * `tests/helpers/admin-auth.ts` already uses for the Playwright admin
 * specs (see that file's module doc for the "no emulator" caveat). Calling
 * `middleware()` directly with a hand-built `NextRequest` is faster and
 * more direct than driving a real browser through `next dev` + Playwright
 * for something that's really about a single function's redirect decision,
 * while still verifying tokens for real (no `verifyIdToken` mocking).
 *
 * Like tests/firestore-rules.test.ts and tests/menu-publish-resolution.test.ts,
 * this file needs real credentials/network and is excluded from the default
 * `vitest run` (see vitest.config.ts) — run it via `npm run test:middleware-guard`.
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Must run before any import (including transitive ones, e.g. middleware.ts
// importing '@/lib/firebase-admin') that reads
// `process.env.FIREBASE_SERVICE_ACCOUNT_JSON` at module-load time. Vitest's
// test process, like Playwright's, does not get `.env.local` for free the
// way `next dev` does.
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import {
  seedAdminTestFixture,
  teardownAdminTestFixture,
  seedSuperadminTestFixture,
  seedUnprivilegedTestFixture,
  teardownRoleTestFixture,
  mintIdToken,
  type AdminTestFixture,
  type RoleTestFixture,
} from './helpers/admin-auth';

/** Builds a NextRequest for `path` carrying `token` (if any) as the
 *  `firebase-token` cookie, matching exactly what the browser sends per
 *  lib/auth.ts's `setFirebaseTokenCookie`. */
function makeRequest(path: string, token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set('cookie', `firebase-token=${token}`);
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers });
}

/** Dynamically imports the real middleware — dynamic, not static, so this
 *  module only evaluates (and reads FIREBASE_SERVICE_ACCOUNT_JSON) after the
 *  dotenv.config() call above has definitely run, mirroring the lazy-import
 *  rationale documented at the top of tests/helpers/admin-auth.ts. */
async function loadMiddleware() {
  const mod = await import('@/middleware');
  return mod.middleware;
}

describe('branch-admin route guard (middleware.ts) — #185', () => {
  let managerFixture: AdminTestFixture;
  let superadminFixture: RoleTestFixture;
  let unprivilegedFixture: RoleTestFixture;

  beforeAll(async () => {
    [managerFixture, superadminFixture, unprivilegedFixture] = await Promise.all([
      // No Structure/Menu data needed — middleware only inspects the token,
      // it never reads Firestore. Zeroed out purely to keep setup fast.
      seedAdminTestFixture({
        areaCount: 0,
        tablesPerArea: 0,
        generateQrCodes: false,
        categoryCount: 0,
        itemsPerCategory: 0,
      }),
      seedSuperadminTestFixture(),
      seedUnprivilegedTestFixture(),
    ]);
  }, 60_000);

  afterAll(async () => {
    await Promise.allSettled([
      teardownAdminTestFixture(managerFixture),
      teardownRoleTestFixture(superadminFixture),
      teardownRoleTestFixture(unprivilegedFixture),
    ]);
  });

  it('lets a valid manager session through to their own branch admin panel', async () => {
    const middleware = await loadMiddleware();
    const token = await mintIdToken(managerFixture.uid);

    const res = await middleware(makeRequest(`/${managerFixture.companySlug}/admin`, token));

    expect(res.status).not.toBe(403);
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets a valid superadmin session through any branch admin panel, not just their own', async () => {
    const middleware = await loadMiddleware();
    const token = await mintIdToken(superadminFixture.uid);

    // superadminFixture has no companyId/branchId of its own — this proves
    // the route gate itself doesn't block on that, matching how
    // app/[companySlug]/admin/[[...managerPath]]/page.tsx authorizes a
    // superadmin for any company.
    const res = await middleware(makeRequest(`/${managerFixture.companySlug}/admin`, token));

    expect(res.status).not.toBe(403);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects an expired/invalid/tampered token to that branch login, never a 403', async () => {
    const middleware = await loadMiddleware();

    const res = await middleware(
      makeRequest(`/${managerFixture.companySlug}/admin`, 'not-a-real-jwt.at.all'),
    );

    expect(res.status).not.toBe(403);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location!).pathname).toBe(`/${managerFixture.companySlug}/login`);
  });

  it('sends a legitimately-denied role to the styled Access Denied page, never raw "Forbidden" text', async () => {
    const middleware = await loadMiddleware();
    const token = await mintIdToken(unprivilegedFixture.uid);

    const res = await middleware(makeRequest(`/${managerFixture.companySlug}/admin`, token));

    expect(res.status).not.toBe(403);
    const body = await res.text();
    expect(body).not.toContain('Forbidden');
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location!).pathname).toBe('/access-denied');
  });
});
