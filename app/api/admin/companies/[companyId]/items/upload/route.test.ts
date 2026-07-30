import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { requireRole } from '@/lib/auth-server';
import { handleUpload } from '@vercel/blob/client';

vi.mock('@/lib/auth-server', () => ({
  requireRole: vi.fn(),
}));

vi.mock('@vercel/blob/client', () => ({
  handleUpload: vi.fn(),
}));

const mockRequireRole = vi.mocked(requireRole);
const mockHandleUpload = vi.mocked(handleUpload);

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/companies/company-1/items/upload', {
    method: 'POST',
    body: JSON.stringify({ type: 'blob.generate-client-token', payload: {} }),
    headers: { 'Content-Type': 'application/json' },
  });
}

function callPost() {
  return POST(makeRequest(), { params: Promise.resolve({ companyId: 'company-1' }) });
}

describe('POST /api/admin/companies/[companyId]/items/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects token generation when neither superadmin nor manager', async () => {
    mockRequireRole.mockResolvedValue(null);
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken('companies/company-1/branches/b1/items/i1/a.png', null, false);
      return {} as never;
    });

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('rejects a pathname outside the URL-scoped company', async () => {
    mockRequireRole.mockResolvedValue({ uid: 'manager-1', email: 'm@test.com', companyId: 'company-1', branchId: 'b1' });
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken('companies/other-company/branches/b1/items/i1/a.png', null, false);
      return {} as never;
    });

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('allows a manager to generate a token for their own company path', async () => {
    mockRequireRole.mockImplementation(async (role) =>
      role === 'manager' ? { uid: 'manager-1', email: 'm@test.com', companyId: 'company-1', branchId: 'b1' } : null,
    );
    let capturedOptions: unknown;
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      capturedOptions = await onBeforeGenerateToken('companies/company-1/branches/b1/items/i1/a.png', null, false);
      return { type: 'blob.generate-client-token', clientToken: 'token' } as never;
    });

    const res = await callPost();

    expect(res.status).toBe(200);
    expect(capturedOptions).toEqual({
      allowedContentTypes: ['image/*'],
      allowOverwrite: true,
    });
  });

  it('allows a superadmin to generate a token for any company path', async () => {
    mockRequireRole.mockImplementation(async (role) =>
      role === 'superadmin' ? { uid: 'admin-1', email: 'a@test.com' } : null,
    );
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken('companies/company-1/branches/b1/items/i1/a.png', null, false);
      return { type: 'blob.generate-client-token', clientToken: 'token' } as never;
    });

    const res = await callPost();

    expect(res.status).toBe(200);
  });
});
