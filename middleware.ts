import { NextRequest, NextResponse } from 'next/server';

const ADMIN_ROOT = '/qraving-admin-panel';
const ADMIN_LOGIN = '/qraving-admin-panel/login';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '=='.slice(0, (4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isManagerRoute(pathname: string): boolean {
  if (pathname.startsWith('/qraving-admin-panel')) return false;
  if (pathname.startsWith('/api/')) return false;
  const parts = pathname.split('/').filter(Boolean);
  return parts.length >= 2 && parts[1] === 'admin';
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('firebase-token')?.value;
  const claims = token ? decodeJwtPayload(token) : null;

  const isSuperadmin = claims?.role === 'superadmin';

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

    if (!claims) {
      return NextResponse.redirect(new URL(loginPath, req.url));
    }
    if (claims.role !== 'manager') {
      return new NextResponse('Forbidden', { status: 403 });
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
