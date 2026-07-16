import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-server';
import { generateQRCode, deactivateNode } from '@/lib/company';
import QRCode from 'qrcode';

type Params = { params: Promise<{ companyId: string; nodeId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const superadminAuth = await requireRole('superadmin');
  const managerAuth = await requireRole('manager');

  if (!superadminAuth && !managerAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { companyId, nodeId } = await params;
  const body = await req.json() as { action: 'generate-qr' | 'deactivate' };

  if (body.action === 'generate-qr') {
    const fullPath = await generateQRCode(companyId, nodeId);
    const origin = req.headers.get('origin') ?? req.nextUrl.origin;
    const publicUrl = `${origin}${fullPath}`;
    const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 400, margin: 2 });
    return NextResponse.json({ fullPath, publicUrl, qrDataUrl });
  }

  if (body.action === 'deactivate') {
    await deactivateNode(companyId, nodeId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
