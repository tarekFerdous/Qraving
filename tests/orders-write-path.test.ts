/**
 * Firestore-emulator-backed integration test for #186: a paid order must be
 * written to the branch-scoped path `companies/{companyId}/branches/{branchId}/orders`
 * — the exact path the branch manager's Dashboard tab (DashboardTab.tsx)
 * subscribes to with `onSnapshot(query(collection(db,
 * \`companies/${companyId}/branches/${branchId}/orders\`), where('status',
 * '==', 'pending')))` — instead of the orphaned top-level `orders`
 * collection no UI ever reads.
 *
 * This drives the REAL `POST` handler from app/api/orders/route.ts against a
 * local Firestore emulator — not a mock of `@/lib/firebase-admin` — then
 * reads the result back the same way DashboardTab does (nested collection +
 * `status == 'pending'` query), and separately asserts nothing landed in the
 * old top-level `orders` collection. Mirrors the pattern established by
 * tests/menu-publish-resolution.test.ts (project id `demo-qraving`, emulator
 * host `127.0.0.1:8080`).
 *
 * Like that file, this is excluded from the default `vitest run` (see
 * vitest.config.ts) because it needs a local Firestore emulator running
 * (`firebase emulators:start --only firestore`, or equivalent). Run it
 * directly via `npm run test:orders-write-path`.
 */

// Must be set BEFORE any import that touches `@/lib/firebase-admin`
// (directly or transitively, e.g. via the orders route) — that module reads
// `FIREBASE_SERVICE_ACCOUNT_JSON` at its own module-load time and throws if
// it's missing. The Admin SDK never actually signs/sends a real auth request
// when `FIRESTORE_EMULATOR_HOST` is set (the emulator accepts unauthenticated
// Admin SDK connections), but newer `firebase-admin` versions do fully DER
// parse the private key up front, so this needs to be a well-formed PKCS8 key
// (not the real project's) rather than an arbitrary placeholder string.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: 'demo-qraving',
  private_key:
    '-----BEGIN PRIVATE KEY-----\n' +
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDk07tsKj3IIhUw\n' +
    'l3rcTh79JvhrK4a11JuQ5jJ5YWy/ZZsf6QIz4ro0tT9luRn8465N2L7hM0x/iy0k\n' +
    'g9Qfn81aPnVqTPcKnnC4EpGyo+CmhkIQ1HVxojo8HMjslK/xhbgqnyxp9tk0528G\n' +
    '6/N4QymMvcD7Td4mIMzaDUQ4xyZewbjB1lHWuZ5TtF07OJFlKnLEf4H5UAi7koJG\n' +
    'H921EP2Eq2hZvNjz6dwBZHCNjdviPosg59OxK8fXQYz4trlzForphe/UCxlwe7FR\n' +
    'IbQxqeT0CpnwqG+bKt7dLUGZJFR1s7Md+TMwGYfGLryqIVLtxmRbuWyBnez2jGdt\n' +
    '4PGmkUKfAgMBAAECggEBAM3nqJLgP8/Cu4aKCEgNE92AH7Fv7TvZIFL2kRygChb/\n' +
    '+uJv7Ud7EUs0fOOv+C6TQdlS3BAQ9Rkfx3NAHLSIO2SlJ0qMDxBDGfLI4sn4pMGz\n' +
    'tecnBrdF31kQHcykzt1qEhpoOLLxKOpuBn4X+3GQHedDKE/59Zghk7PylBzzNxez\n' +
    'Tj4zDKsapGzUkAzzGOm1lF9mrPEekjOj9qAZBzKHNEiF3yvOBdZlaCy3z/XEf1Lp\n' +
    'Lq+9PTQDKMgfH33kLbyUYDuCPhN80ravw99B9JY7vzWVHAjspfuKXylVyc+0cL1o\n' +
    'ZvNlebkIPw+DAMrM1BKxRCJEW+cSuJLVvZnpzOxODYECgYEA9ucgHLRZDVIru0Cg\n' +
    'KDpxkdbKhy+JRvdzMWfhDR7mKYcMmm1OZnT+L/TddZovfTkbqDP3IF7aGoYrK/E5\n' +
    'sgLtCxAr8mOvhGCI6DQ1uP0xp1/9opA+ZYO/40siewxxQdYSPEe5dl3Wjd2s34C9\n' +
    '3AhM9c0If8l1urLDLkpzlqGlhU8CgYEA7UIcGv3qWmpSfMc8X2Mpi7Nv2fQT38d2\n' +
    '1r7jHh6aw0C5N3SqYZk/ek8IOAftAv9vG7PP+3baCM/LULy8sA7uUZvWPbsdg17O\n' +
    'QfRZ5awtRey6ZITb0HEM225AGstJnkIaMhxCbJaFM+fWpt+Z43522YXQ3Yc2oKRf\n' +
    'dMS5vt8WubECgYAF8O/T4P8Xk/ebbOWtsiJTeRCsihdKjt/Fu5MtxqWRMD+8Y470\n' +
    'ZjJLox/FGa203K/urzluHPowkzPsvcQ+pVVg48W68m0hyVTiCYeVaPpN5cBrrf7i\n' +
    'YHY4mPE+dsEu7WDI9Izg7UchaMklI6rt5YE8lO90a7uaf3y023PGlyMtfwKBgHbe\n' +
    'r3wqiXcBXBCeNbZI1XDj1v9pFWgB5J2VB+94P+vhiqqpLhA2GqKp5CFGf04IMl+7\n' +
    'yFFh672Mdn4eAZ9n66lBnaZSEGhYYJiU11GF4SzufTiNhCA788ggxcdm4JyE2+EN\n' +
    'XY5QH66w0k/LKavcGanELLBA5XK4yAaV5cYmuZkRAoGAcix4Gtj6vtYHjyKb+YFj\n' +
    'qKnMUlkt4fDWHyLcrbuw/DdHHKq/jVwTgdJN45ChTETqg6hhpL1I0lw6uTKG8iPU\n' +
    'RCngnAbiCZgOd9ALg0H1OOlEduntlEixIXZCo/20eNex6DPI1APt4Sug5WtkbFXN\n' +
    'ya3KKYdfIeR2lwPPcQbVET4=\n' +
    '-----END PRIVATE KEY-----\n',
  client_email: 'fake@demo-qraving.iam.gserviceaccount.com',
});

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

function makeOrderRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/orders writes to the branch-scoped path DashboardTab reads from', () => {
  let adminDb: typeof import('@/lib/firebase-admin').adminDb;
  let POST: typeof import('@/app/api/orders/route').POST;

  let companyId: string;
  let branchId: string;

  beforeAll(async () => {
    // Dynamic imports so the env vars set above are guaranteed to be in place
    // before `@/lib/firebase-admin` (and anything importing it) is evaluated.
    ({ adminDb } = await import('@/lib/firebase-admin'));
    ({ POST } = await import('@/app/api/orders/route'));

    companyId = uniqueId('company');
    branchId = uniqueId('branch');
  });

  afterAll(async () => {
    await adminDb.recursiveDelete(adminDb.doc(`companies/${companyId}`));
  });

  it('writes the order under companies/{companyId}/branches/{branchId}/orders, readable back by id', async () => {
    const res = await POST(
      makeOrderRequest({
        companyId,
        branchId,
        sessionId: 'sess-1',
        items: [
          {
            itemId: 'item-1',
            name: 'Burger',
            quantity: 2,
            price: 1200,
            customizations: { size: 'Medium', addOns: [] },
          },
        ],
        totalCents: 2400,
        user: { name: 'Alice', phone: '+15551234567' },
      }),
    );

    expect(res.status).toBe(200);
    const { orderId } = (await res.json()) as { orderId: string };
    expect(orderId).toBeTruthy();

    const snap = await adminDb
      .doc(`companies/${companyId}/branches/${branchId}/orders/${orderId}`)
      .get();

    expect(snap.exists).toBe(true);
    expect(snap.data()).toMatchObject({
      companyId,
      branchId,
      sessionId: 'sess-1',
      tableNodeId: 'sess-1',
      totalCents: 2400,
      status: 'pending',
      user: { name: 'Alice', phone: '+15551234567' },
    });
  });

  it('is picked up by the exact query DashboardTab uses (nested collection, status == "pending")', async () => {
    const res = await POST(
      makeOrderRequest({
        companyId,
        branchId,
        sessionId: 'sess-2',
        items: [
          {
            itemId: 'item-2',
            name: 'Fries',
            quantity: 1,
            price: 500,
            customizations: { size: 'Small', addOns: [] },
          },
        ],
        totalCents: 500,
        user: { name: 'Bob', phone: '+15559876543' },
      }),
    );
    const { orderId } = (await res.json()) as { orderId: string };

    // Mirrors DashboardTab.tsx's real-time orders listener exactly:
    //   query(collection(db, `companies/${companyId}/branches/${branchId}/orders`),
    //         where('status', '==', 'pending'))
    const snap = await adminDb
      .collection(`companies/${companyId}/branches/${branchId}/orders`)
      .where('status', '==', 'pending')
      .get();

    const ids = snap.docs.map((d) => d.id);
    expect(ids).toContain(orderId);
  });

  it('does not write anything to the old top-level orders collection', async () => {
    const res = await POST(
      makeOrderRequest({
        companyId,
        branchId,
        sessionId: 'sess-3',
        items: [
          {
            itemId: 'item-3',
            name: 'Soda',
            quantity: 1,
            price: 300,
            customizations: { size: 'Small', addOns: [] },
          },
        ],
        totalCents: 300,
        user: { name: 'Cara', phone: '+15551112222' },
      }),
    );
    expect(res.status).toBe(200);

    const topLevelSnap = await adminDb
      .collection('orders')
      .where('companyId', '==', companyId)
      .get();

    expect(topLevelSnap.empty).toBe(true);
  });
});
