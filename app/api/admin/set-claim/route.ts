import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key');
  const authHeader = req.headers.get('authorization');

  const isAdminKey = adminKey === process.env.ADMIN_SECRET_KEY && !!process.env.ADMIN_SECRET_KEY;

  if (!isAdminKey) {
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    try {
      const decoded = await getAuth().verifyIdToken(token);
      if (decoded.role !== 'superadmin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
  }

  const body = await req.json() as {
    uid: string;
    role: 'superadmin' | 'manager';
    companyId?: string;
    branchId?: string;
    companySlug?: string;
  };

  const { uid, role, companyId, branchId, companySlug } = body;
  if (!uid || !role) {
    return NextResponse.json({ error: 'uid and role are required' }, { status: 400 });
  }

  await getAuth().setCustomUserClaims(uid, {
    role,
    ...(companyId && { companyId }),
    ...(branchId && { branchId }),
    ...(companySlug && { companySlug }),
  });

  const user = await getAuth().getUser(uid);
  await adminDb.doc(`users/${uid}`).set(
    {
      role,
      email: user.email ?? '',
      companyId: companyId ?? null,
      branchId: branchId ?? null,
      companySlug: companySlug ?? null,
      createdAt: Timestamp.now(),
    },
    { merge: true },
  );

  return NextResponse.json({ success: true });
}
