import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifyIdToken = vi.fn();
const mockCookiesGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mockCookiesGet,
  })),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    doc: vi.fn(),
  },
}));

import { requireRole } from '@/lib/auth-server';

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when there is no token cookie', async () => {
    mockCookiesGet.mockReturnValue(undefined);

    const result = await requireRole('manager');

    expect(result).toBeNull();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('returns null when the decoded role does not match', async () => {
    mockCookiesGet.mockReturnValue({ value: 'token' });
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1', role: 'manager' });

    const result = await requireRole('superadmin');

    expect(result).toBeNull();
  });

  it('returns null when token verification throws', async () => {
    mockCookiesGet.mockReturnValue({ value: 'bad-token' });
    mockVerifyIdToken.mockRejectedValue(new Error('invalid token'));

    const result = await requireRole('manager');

    expect(result).toBeNull();
  });

  it('returns companyId and branchId for a manager token when present', async () => {
    mockCookiesGet.mockReturnValue({ value: 'token' });
    mockVerifyIdToken.mockResolvedValue({
      uid: 'manager-uid',
      email: 'manager@example.com',
      role: 'manager',
      companyId: 'company-1',
      branchId: 'branch-1',
    });

    const result = await requireRole('manager');

    expect(result).toEqual({
      uid: 'manager-uid',
      email: 'manager@example.com',
      companyId: 'company-1',
      branchId: 'branch-1',
    });
  });

  it('continues to work for superadmin tokens with no companyId/branchId', async () => {
    mockCookiesGet.mockReturnValue({ value: 'token' });
    mockVerifyIdToken.mockResolvedValue({
      uid: 'super-uid',
      email: 'super@example.com',
      role: 'superadmin',
    });

    const result = await requireRole('superadmin');

    expect(result).toEqual({
      uid: 'super-uid',
      email: 'super@example.com',
      companyId: undefined,
      branchId: undefined,
    });
  });

  it('defaults email to empty string when absent on the decoded token', async () => {
    mockCookiesGet.mockReturnValue({ value: 'token' });
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1', role: 'manager' });

    const result = await requireRole('manager');

    expect(result?.email).toBe('');
  });
});
