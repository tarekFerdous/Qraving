import { NextRequest, NextResponse } from 'next/server';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
// Imported for its side effect only: initializes the shared firebase-admin
// app (see lib/firebase-admin.ts) so getAuth() below resolves the default
// app, exactly like lib/auth-server.ts does.
import '@/lib/firebase-admin';

// Middleware needs the Firebase Admin SDK (Node.js-only) to verify ID token
// signature + expiry server-side, so it must run in the Node.js runtime
// rather than the default Edge runtime. Node.js Middleware is fully
// supported on Vercel (Fluid Compute/Node.js is the platform default).
export const runtime = 'nodejs';

const ADMIN_ROOT = '/qraving-admin-panel';
const ADMIN_LOGIN = '/qraving-admin-panel/login';
const ACCESS_DENIED = '/access-denied';

function isManagerRoute(pathname: string): boolean {
  if (pathname.startsWith('/qraving-admin-panel')) return false;
  if (pathname.startsWith('/api/')) return false;
  const parts = pathname.split('/').filter(Boolean);
  return parts.length >= 2 && parts[1] === 'admin';
}

/**
 * Verifies the `firebase-token` cookie's signature and expiry server-side via
 * the Firebase Admin SDK — the same pattern `requireRole`/`getSessionUser`
 * use in lib/auth-server.ts. Returns `null` for a missing, expired, or
 * tampered token (never throws).
 */
async function verifyFirebaseToken(
  token: string | undefined,
): Promise<DecodedIdToken | null> {
  if (!token) return null;
  try {
    return await getAuth().verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('firebase-token')?.value;
  const claims = await verifyFirebaseToken(token);

  const isSuperadmin = claims?.role === 'superadmin';
  const isManager = claims?.role === 'manager';

  if (pathname.startsWith(ADMIN_ROOT) && !pathname.startsWith(ADMIN_LOGIN)) {
    if (!isSuperadmin) {
      return NextResponse.redirect(new URL(ADMIN_LOGIN, req.url));
    }
  }

  if (pathname === ADMIN_LOGIN && isSuperadmin) {
    return NextResponse.redirect(new URL(ADMIN_ROOT, req.url));
  }

  if (isManagerRoute(pathname)) {
    const parts = pathname.split('/').filter(Boolean);
    const companySlug = parts[0];
    const loginPath = `/${companySlug}/login`;

    // Missing, expired, or tampered token: bounce to this branch's login,
    // never a "Forbidden" response.
    if (!claims) {
      return NextResponse.redirect(new URL(loginPath, req.url));
    }
    // Matches app/[companySlug]/admin/[[...managerPath]]/page.tsx, which
    // authorizes via `requireRole('superadmin') || requireRole('manager')`
    // — both roles pass the route gate; the page itself further scopes a
    // manager to their own branch and a superadmin to the requested node.
    if (!isManager && !isSuperadmin) {
      return NextResponse.redirect(new URL(ACCESS_DENIED, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/qraving-admin-panel/:path*',
    '/:companySlug/:branchSlug',
    '/:companySlug/:branchSlug/menu',
    '/:companySlug/admin/:path*',
  ],
};
