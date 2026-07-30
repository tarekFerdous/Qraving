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
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rejects token generation when there is no session user', async () => {
    mockGetSessionUser.mockResolvedValue(null);
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken('companies/company-1/branches/b1/items/i1/a.png', null, false);
      return {} as never;
    });

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(body.reason).toBe('not_authenticated');
    expect(console.error).toHaveBeenCalled();
  });

  it('rejects token generation for a wrong/missing role', async () => {
    mockGetSessionUser.mockResolvedValue({
      uid: 'user-1',
      email: 'u@test.com',
      role: 'staff',
      companyId: 'company-1',
      branchId: 'b1',
    });
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken('companies/company-1/branches/b1/items/i1/a.png', null, false);
      return {} as never;
    });

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(body.reason).toBe('not_authorized');
    expect(console.error).toHaveBeenCalled();
  });

  it('rejects a pathname outside the URL-scoped company', async () => {
    mockGetSessionUser.mockResolvedValue({
      uid: 'manager-1',
      email: 'm@test.com',
      role: 'manager',
      companyId: 'company-1',
      branchId: 'b1',
    });
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken('companies/other-company/branches/b1/items/i1/a.png', null, false);
      return {} as never;
    });

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(body.reason).toBe('not_authorized');
    expect(console.error).toHaveBeenCalled();
  });

  it('allows a manager to generate a token for their own company path', async () => {
    mockGetSessionUser.mockResolvedValue({
      uid: 'manager-1',
      email: 'm@test.com',
      role: 'manager',
      companyId: 'company-1',
      branchId: 'b1',
    });
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

  it('rejects a manager uploading to a branch other than their own', async () => {
    mockGetSessionUser.mockResolvedValue({
      uid: 'manager-1',
      email: 'm@test.com',
      role: 'manager',
      companyId: 'company-1',
      branchId: 'b1',
    });
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken('companies/company-1/branches/b2/items/i1/a.png', null, false);
      return {} as never;
    });

    const res = await callPost();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(body.reason).toBe('not_authorized');
    expect(console.error).toHaveBeenCalled();
  });

  it('allows a superadmin to generate a token for any company path', async () => {
    mockGetSessionUser.mockResolvedValue({
      uid: 'admin-1',
      email: 'a@test.com',
      role: 'superadmin',
    });
    mockHandleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken('companies/company-1/branches/b1/items/i1/a.png', null, false);
      return { type: 'blob.generate-client-token', clientToken: 'token' } as never;
    });

    const res = await callPost();

    expect(res.status).toBe(200);
  });
});
