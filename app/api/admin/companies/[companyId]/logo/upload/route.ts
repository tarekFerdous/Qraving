import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getSessionUser } from '@/lib/auth-server';
import type { UploadErrorReason } from '@/lib/upload-client';

const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export class UploadError extends Error {
  constructor(public reason: UploadErrorReason, message: string) {
    super(message);
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const user = await getSessionUser();
        if (!user) throw new UploadError('not_authenticated', 'Not authenticated');
        if (user.role !== 'superadmin') throw new UploadError('not_authorized', 'Not authorized');

        return {
          allowedContentTypes: ['image/png'],
          maximumSizeInBytes: MAX_LOGO_SIZE_BYTES,
          allowOverwrite: true,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Logo upload error:', error);
    const reason: UploadErrorReason = error instanceof UploadError ? error.reason : 'service_unavailable';
    return NextResponse.json({ error: (error as Error).message, reason }, { status: 400 });
  }
}
