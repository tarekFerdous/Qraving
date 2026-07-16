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

  const body = await req.json() as { name: string; slug: string; layers: LayerConfig[]; managerLayerIndex: number };
  const { name, slug, layers, managerLayerIndex } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug are required' }, { status: 400 });
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'Slug must be lowercase alphanumeric with hyphens only' }, { status: 400 });
  }

  const firstLeafLayerIndex = layers.findIndex((l) => l.isLeafLayer);
  if (firstLeafLayerIndex === -1) {
    return NextResponse.json({ error: 'At least one leaf layer must be defined.' }, { status: 400 });
  }

  if (managerLayerIndex == null || managerLayerIndex >= firstLeafLayerIndex) {
    return NextResponse.json(
      { error: 'managerLayerIndex must be less than the first leaf layer index.' },
      { status: 400 },
    );
  }

  const uniqueSlug = await ensureUniqueSlug(slug);
  if (uniqueSlug !== slug) {
    return NextResponse.json({ error: `Slug "${slug}" is already taken. Try "${uniqueSlug}".` }, { status: 409 });
  }

  const companyId = await createCompany({ name, slug, layers, managerLayerIndex });
  return NextResponse.json({ companyId }, { status: 201 });
}
