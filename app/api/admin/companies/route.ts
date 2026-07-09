import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-server';
import { createCompany, ensureUniqueSlug, getAllCompanies } from '@/lib/company';
import type { LayerConfig } from '@/lib/company';

export async function GET() {
  const auth = await requireRole('superadmin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const companies = await getAllCompanies();
  return NextResponse.json({ companies });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('superadmin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { name: string; slug: string; layers: LayerConfig[] };
  const { name, slug, layers } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug are required' }, { status: 400 });
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'Slug must be lowercase alphanumeric with hyphens only' }, { status: 400 });
  }

  const uniqueSlug = await ensureUniqueSlug(slug);
  if (uniqueSlug !== slug) {
    return NextResponse.json({ error: `Slug "${slug}" is already taken. Try "${uniqueSlug}".` }, { status: 409 });
  }

  const companyId = await createCompany({ name, slug, layers });
  return NextResponse.json({ companyId }, { status: 201 });
}
