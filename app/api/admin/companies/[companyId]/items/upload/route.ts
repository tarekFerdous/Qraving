import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireRole } from '@/lib/auth-server';

type Params = { params: Promise<{ companyId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { companyId } = await params;
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const superadminAuth = await requireRole('superadmin');
        const managerAuth = await requireRole('manager');
        if (!superadminAuth && !managerAuth) throw new Error('Unauthorized');

        if (!pathname.startsWith(`companies/${companyId}/branches/`)) {
          throw new Error('Invalid upload path');
        }

        return {
          allowedContentTypes: ['image/*'],
          allowOverwrite: true,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
