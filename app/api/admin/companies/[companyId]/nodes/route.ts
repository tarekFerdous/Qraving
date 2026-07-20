import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-server';
import { createNode, getCompany, isNodeInBranch } from '@/lib/company';

export async function POST(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const superadminAuth = await requireRole('superadmin');
  const managerAuth = await requireRole('manager');

  if (!superadminAuth && !managerAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = superadminAuth ? 'superadmin' : 'manager';

  const { companyId } = await params;
  const company = await getCompany(companyId);
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const body = await req.json() as {
    parentId: string | null;
    label: string;
    depth: number;
    isLeaf: boolean;
  };

  if (role === 'manager') {
    const branchId = managerAuth!.branchId;
    if (!branchId || body.parentId === null || !(await isNodeInBranch(companyId, body.parentId, branchId))) {
      return NextResponse.json(
        { error: 'Cannot create a node outside your assigned branch.' },
        { status: 403 },
      );
    }
  }

  const firstLeafLayerIndex = company.layers.findIndex((l) => l.isLeafLayer);

  if (firstLeafLayerIndex !== -1) {
    if (body.depth >= firstLeafLayerIndex && role !== 'manager') {
      return NextResponse.json(
        { error: 'Only manager admins can create leaf-layer nodes.' },
        { status: 403 },
      );
    }
    if (body.depth < firstLeafLayerIndex && role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Only super admins can create non-leaf nodes.' },
        { status: 403 },
      );
    }
  }

  const nodeId = await createNode(companyId, body);
  return NextResponse.json({ nodeId }, { status: 201 });
}
