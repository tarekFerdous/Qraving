import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-server';
import { getCompany, getNodes, lockCompany, restoreCompany, hardDeleteCompany } from '@/lib/company';

export async function GET(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const auth = await requireRole('superadmin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { companyId } = await params;
  const [company, nodes] = await Promise.all([getCompany(companyId), getNodes(companyId)]);

  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ company, nodes });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const auth = await requireRole('superadmin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { companyId } = await params;
  const company = await getCompany(companyId);
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const body = await req.json() as { action: 'lock' | 'restore' };

  if (body.action === 'lock') {
    await lockCompany(companyId);
    return NextResponse.json({ success: true });
  }

  if (body.action === 'restore') {
    await restoreCompany(companyId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const auth = await requireRole('superadmin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { companyId } = await params;
  const company = await getCompany(companyId);
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  await hardDeleteCompany(companyId);

  return NextResponse.json({ success: true });
}
