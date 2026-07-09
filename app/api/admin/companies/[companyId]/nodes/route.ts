import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-server';
import { createNode, getCompany } from '@/lib/company';

export async function POST(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const auth = await requireRole('superadmin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { companyId } = await params;
  const company = await getCompany(companyId);
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const body = await req.json() as {
    parentId: string | null;
    label: string;
    depth: number;
    isLeaf: boolean;
  };

  const nodeId = await createNode(companyId, body);
  return NextResponse.json({ nodeId }, { status: 201 });
}
