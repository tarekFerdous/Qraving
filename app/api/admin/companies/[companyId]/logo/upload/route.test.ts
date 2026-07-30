import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { getSessionUser } from '@/lib/auth-server';
import { handleUpload } from '@vercel/blob/client';

vi.mock('@/lib/auth-server', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('@vercel/blob/client', () => ({
  handleUpload: vi.fn(),
}));

const mockGetSessionUser = vi.mocked(getSessionUser);
const mockHandleUpload = vi.mocked(handleUpload);

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/companies/company-1/logo/upload', {
    method: 'POST',
    body: JSON.stringify({ type: 'blob.generate-client-token', payload: {} }),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/admin/companies/[companyId]/logo/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rejects token generation when there is no session user', async () => {
    mockGetSessionUser.mockResolvedValue(null);
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken('companies/company-1/logo/a.png', null, false);
      return {} as never;
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(body.reason).toBe('not_authenticated');
    expect(console.error).toHaveBeenCalled();
  });

  it('rejects token generation for a non-superadmin', async () => {
    mockGetSessionUser.mockResolvedValue({
      uid: 'manager-1',
      email: 'm@test.com',
      role: 'manager',
    });
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken('companies/company-1/logo/a.png', null, false);
      return {} as never;
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(body.reason).toBe('not_authorized');
    expect(console.error).toHaveBeenCalled();
  });

  it('generates a PNG-only, 5MB-max, overwrite-allowed token for a superadmin', async () => {
    mockGetSessionUser.mockResolvedValue({
      uid: 'admin-1',
      email: 'admin@test.com',
      role: 'superadmin',
    });
    let capturedOptions: unknown;
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      capturedOptions = await onBeforeGenerateToken('companies/company-1/logo/a.png', null, false);
      return { type: 'blob.generate-client-token', clientToken: 'token' } as never;
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockGetSessionUser).toHaveBeenCalled();
    expect(capturedOptions).toEqual({
      allowedContentTypes: ['image/png'],
      maximumSizeInBytes: 5 * 1024 * 1024,
      allowOverwrite: true,
    });
  });
});
