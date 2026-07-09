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

  return NextResponse.next();
}

export const config = {
  matcher: ['/qraving-admin-panel/:path*'],
};
