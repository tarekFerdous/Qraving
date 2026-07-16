import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-server';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getCompany, getNodes } from '@/lib/company';

type Params = { params: Promise<{ companyId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireRole('superadmin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { companyId } = await params;

  const company = await getCompany(companyId);
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const usersSnap = await adminDb
    .collection('users')
    .where('companyId', '==', companyId)
    .get();

  const managers = await Promise.all(
    usersSnap.docs.filter((d) => d.data().role === 'manager').map(async (d) => {
      const data = d.data();
      let disabled = false;
      try {
        const fbUser = await getAuth().getUser(d.id);
        disabled = fbUser.disabled;
      } catch {
        disabled = true;
      }
      return { uid: d.id, email: data.email, branchId: data.branchId, active: !disabled };
    }),
  );

  const allNodes = await getNodes(companyId);
  const managerLayerIndex = company.managerLayerIndex ?? 0;
  const managerNodes = allNodes.filter((n) => n.depth === managerLayerIndex);
  const managerLayerLabel = company.layers[managerLayerIndex]?.label ?? 'Branch';

  return NextResponse.json({ managers, branches: managerNodes, managerLayerLabel });
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRole('superadmin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { companyId } = await params;
  const company = await getCompany(companyId);
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const body = await req.json() as {
    email: string;
    password: string;
    branchId: string;
  };

  const { email, password, branchId } = body;
  if (!email || !password || !branchId) {
    return NextResponse.json({ error: 'email, password, and branchId are required' }, { status: 400 });
  }

  const adminAuth = getAuth();

  let uid: string;
  try {
    const existing = await adminAuth.getUserByEmail(email);
    uid = existing.uid;
  } catch {
    const user = await adminAuth.createUser({ email, password });
    uid = user.uid;
  }

  await adminAuth.setCustomUserClaims(uid, {
    role: 'manager',
    companyId,
    branchId,
    companySlug: company.slug,
  });

  await adminDb.doc(`users/${uid}`).set(
    {
      role: 'manager',
      email,
      companyId,
      branchId,
      companySlug: company.slug,
      createdAt: Timestamp.now(),
    },
    { merge: true },
  );

  return NextResponse.json({ uid }, { status: 201 });
}
