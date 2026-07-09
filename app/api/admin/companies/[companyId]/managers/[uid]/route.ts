import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-server';
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '@/lib/firebase-admin';

type Params = { params: Promise<{ companyId: string; uid: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRole('superadmin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { uid } = await params;
  const body = await req.json() as { active: boolean };

  await getAuth().updateUser(uid, { disabled: !body.active });
  await adminDb.doc(`users/${uid}`).update({ active: body.active });

  return NextResponse.json({ success: true });
}
