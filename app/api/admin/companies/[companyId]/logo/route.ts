import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-server';
import { getCompany, setCompanyLogo, clearCompanyLogo } from '@/lib/company';

type Params = { params: Promise<{ companyId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRole('superadmin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { companyId } = await params;
  const company = await getCompany(companyId);
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const body = await req.json() as { action: 'set' | 'remove'; logoUrl?: string };

  if (body.action === 'set') {
    if (!body.logoUrl || typeof body.logoUrl !== 'string') {
      return NextResponse.json({ error: 'logoUrl is required' }, { status: 400 });
    }

    const previousLogoUrl = company.logoUrl ?? null;
    await setCompanyLogo(companyId, body.logoUrl);
    return NextResponse.json({ logoUrl: body.logoUrl, previousLogoUrl }, { status: 200 });
  }

  if (body.action === 'remove') {
    const previousLogoUrl = company.logoUrl ?? null;
    await clearCompanyLogo(companyId);
    return NextResponse.json({ previousLogoUrl }, { status: 200 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
