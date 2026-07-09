import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-server';
import { getCompany, getNodes } from '@/lib/company';

export async function GET(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const auth = await requireRole('superadmin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { companyId } = await params;
  const [company, nodes] = await Promise.all([getCompany(companyId), getNodes(companyId)]);

  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ company, nodes });
}
