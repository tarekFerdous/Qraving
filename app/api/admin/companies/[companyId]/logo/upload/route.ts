import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireRole } from '@/lib/auth-server';

const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const auth = await requireRole('superadmin');
        if (!auth) throw new Error('Unauthorized');

        return {
          allowedContentTypes: ['image/png'],
          maximumSizeInBytes: MAX_LOGO_SIZE_BYTES,
          allowOverwrite: true,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
