import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getSessionUser } from '@/lib/auth-server';
import type { UploadErrorReason } from '@/lib/upload-client';

type Params = { params: Promise<{ companyId: string }> };

export class UploadError extends Error {
  constructor(public reason: UploadErrorReason, message: string) {
    super(message);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { companyId } = await params;
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getSessionUser();
        if (!user) throw new UploadError('not_authenticated', 'Not authenticated');

        if (user.role !== 'superadmin' && user.role !== 'manager') {
          throw new UploadError('not_authorized', 'Not authorized');
        }

        if (!pathname.startsWith(`companies/${companyId}/branches/`)) {
          throw new UploadError('not_authorized', 'Invalid upload path');
        }

        if (user.role === 'manager') {
          const branchMatch = pathname.match(/^companies\/[^/]+\/branches\/([^/]+)\//);
          const pathBranchId = branchMatch?.[1];
          if (!pathBranchId || pathBranchId !== user.branchId) {
            throw new UploadError('not_authorized', 'Not authorized for this branch');
          }
        }

        return {
          allowedContentTypes: ['image/*'],
          allowOverwrite: true,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Item image upload error:', error);
    const reason: UploadErrorReason = error instanceof UploadError ? error.reason : 'service_unavailable';
    return NextResponse.json({ error: (error as Error).message, reason }, { status: 400 });
  }
}
