import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRequireRole,
  mockGetCompanyBySlug,
  mockGetNodeChain,
  mockGetDescendantNodes,
  mockResolveBranchNode,
  mockRedirect,
  mockNotFound,
} = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockGetCompanyBySlug: vi.fn(),
  mockGetNodeChain: vi.fn(),
  mockGetDescendantNodes: vi.fn(),
  mockResolveBranchNode: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  mockNotFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

vi.mock('@/lib/auth-server', () => ({
  requireRole: mockRequireRole,
}));

vi.mock('@/lib/company', () => ({
  getCompanyBySlug: mockGetCompanyBySlug,
  getNodeChain: mockGetNodeChain,
  getDescendantNodes: mockGetDescendantNodes,
  resolveBranchNode: mockResolveBranchNode,
}));

vi.mock('./ManagerAdminPanel', () => ({
  default: (props: unknown) => ({ __mockPanel: true, props }),
}));

vi.mock('./AdminShell', () => ({
  default: (props: unknown) => ({ __mockShell: true, props }),
}));

import ManagerAdminPage from './page';

const company = {
  id: 'company-1',
  name: 'Test Co',
  slug: 'test-co',
  layers: [
    { index: 0, label: 'Branch', isLeafLayer: false },
    { index: 1, label: 'Table', isLeafLayer: true },
  ],
  managerLayerIndex: 0,
  createdAt: null,
};

function makeParams(companySlug: string, managerPath?: string[]) {
  return Promise.resolve({ companySlug, managerPath });
}

describe('ManagerAdminPage ([[...managerPath]])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCompanyBySlug.mockResolvedValue(company);
    mockGetDescendantNodes.mockResolvedValue([]);
  });

  it('redirects to login when neither superadmin nor manager role is present', async () => {
    mockRequireRole.mockResolvedValue(null);

    await expect(ManagerAdminPage({ params: makeParams('test-co', []) })).rejects.toThrow(
      'REDIRECT:/test-co/login',
    );
  });

  it('redirects to login when the company is locked, regardless of role, before any node resolution', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'superadmin') return { uid: 's1', email: 's@x.com' };
      return null;
    });
    mockGetCompanyBySlug.mockResolvedValue({ ...company, locked: true });

    await expect(ManagerAdminPage({ params: makeParams('test-co', []) })).rejects.toThrow(
      'REDIRECT:/test-co/login',
    );

    expect(mockGetNodeChain).not.toHaveBeenCalled();
    expect(mockResolveBranchNode).not.toHaveBeenCalled();
  });

  it('manager: zero path segments resolves own branch via resolveBranchNode and renders the AdminShell with resolved props', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'manager') {
        return { uid: 'm1', email: 'm@x.com', companyId: 'company-1', branchId: 'branch-1' };
      }
      return null;
    });
    mockResolveBranchNode.mockResolvedValue({
      status: 'ok',
      node: { id: 'branch-1', parentId: null, label: 'Downtown', slug: 'downtown', depth: 0, isLeaf: false, qrCode: null, fullPath: null, active: true, createdAt: null },
    });
    const descendants = [
      { id: 'leaf-1', parentId: 'branch-1', label: 'Table 1', slug: 'table-1', depth: 1, isLeaf: true, qrCode: null, fullPath: null, active: true, createdAt: null },
    ];
    mockGetDescendantNodes.mockResolvedValue(descendants);

    const result: any = await ManagerAdminPage({ params: makeParams('test-co', undefined) });

    expect(mockResolveBranchNode).toHaveBeenCalledWith('company-1', 'branch-1');
    expect(mockGetNodeChain).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();

    // Manager branch now renders the shared AdminShell (not ManagerAdminPanel directly),
    // with the resolved companyId/branchId/company fields/descendants passed down as props.
    expect(result.type).toBeInstanceOf(Function);
    expect(result.props.companyId).toBe('company-1');
    expect(result.props.branchId).toBe('branch-1');
    expect(result.props.companyName).toBe('Test Co');
    expect(result.props.branchName).toBe('Downtown');
    expect(result.props.layers).toEqual(company.layers);
    expect(result.props.managerNodeId).toBe('branch-1');
    expect(result.props.ancestorLabels).toEqual(['Downtown']);
    expect(result.props.initialDescendants).toEqual(
      descendants.map(({ createdAt, ...node }) => node),
    );
    expect(result.props.firstLeafLayerIndex).toBe(1);
    expect(result.props.companySlug).toBe('test-co');
  });

  it('manager: any extra path segment triggers notFound (not their own panel)', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'manager') {
        return { uid: 'm1', email: 'm@x.com', companyId: 'company-1', branchId: 'branch-1' };
      }
      return null;
    });

    await expect(
      ManagerAdminPage({ params: makeParams('test-co', ['some-branch']) }),
    ).rejects.toThrow('NOT_FOUND');

    expect(mockResolveBranchNode).not.toHaveBeenCalled();
  });

  it('manager: missing branchId claim renders inline error, not redirect/crash', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'manager') {
        return { uid: 'm1', email: 'm@x.com', companyId: 'company-1', branchId: undefined };
      }
      return null;
    });

    const result: any = await ManagerAdminPage({ params: makeParams('test-co', []) });

    expect(mockResolveBranchNode).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    // The rendered result is a plain React element tree (not the mocked panel),
    // so it should NOT match the mocked panel shape.
    expect(result.__mockPanel).toBeUndefined();
    expect(JSON.stringify(result)).toContain('Your assigned branch is not available');
  });

  it('manager: resolveBranchNode not_found renders inline error, not redirect/crash', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'manager') {
        return { uid: 'm1', email: 'm@x.com', companyId: 'company-1', branchId: 'branch-ghost' };
      }
      return null;
    });
    mockResolveBranchNode.mockResolvedValue({ status: 'not_found' });

    const result: any = await ManagerAdminPage({ params: makeParams('test-co', []) });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.__mockPanel).toBeUndefined();
    expect(JSON.stringify(result)).toContain('Your assigned branch is not available');
  });

  it('manager: resolveBranchNode inactive renders inline error, not redirect/crash', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'manager') {
        return { uid: 'm1', email: 'm@x.com', companyId: 'company-1', branchId: 'branch-1' };
      }
      return null;
    });
    mockResolveBranchNode.mockResolvedValue({ status: 'inactive' });

    const result: any = await ManagerAdminPage({ params: makeParams('test-co', []) });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.__mockPanel).toBeUndefined();
    expect(JSON.stringify(result)).toContain('Your assigned branch is not available');
  });

  it('two managers with different branchIds each see only their own branch data', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'manager') {
        return { uid: 'm1', email: 'm@x.com', companyId: 'company-1', branchId: 'branch-a' };
      }
      return null;
    });
    mockResolveBranchNode.mockImplementation(async (_companyId: string, branchId: string) => ({
      status: 'ok',
      node: { id: branchId, parentId: null, label: branchId, slug: branchId, depth: 0, isLeaf: false, qrCode: null, fullPath: null, active: true, createdAt: null },
    }));

    const resultA: any = await ManagerAdminPage({ params: makeParams('test-co', []) });
    expect(resultA.props.managerNodeId).toBe('branch-a');

    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'manager') {
        return { uid: 'm2', email: 'm2@x.com', companyId: 'company-1', branchId: 'branch-b' };
      }
      return null;
    });

    const resultB: any = await ManagerAdminPage({ params: makeParams('test-co', []) });
    expect(resultB.props.managerNodeId).toBe('branch-b');
  });

  it('superadmin: path-based navigation is unchanged — resolves via getNodeChain', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'superadmin') {
        return { uid: 's1', email: 's@x.com' };
      }
      return null;
    });
    const chain = [
      { id: 'branch-a', parentId: null, label: 'Branch A', slug: 'branch-a', depth: 0, isLeaf: false, qrCode: null, fullPath: null, active: true, createdAt: null },
    ];
    mockGetNodeChain.mockResolvedValue(chain);

    const result: any = await ManagerAdminPage({ params: makeParams('test-co', ['branch-a']) });

    expect(mockGetNodeChain).toHaveBeenCalledWith('company-1', ['branch-a']);
    expect(mockResolveBranchNode).not.toHaveBeenCalled();
    expect(result.props.managerNodeId).toBe('branch-a');
    expect(result.props.ancestorLabels).toEqual(['Branch A']);
  });

  it('superadmin: empty node chain redirects to login', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'superadmin') {
        return { uid: 's1', email: 's@x.com' };
      }
      return null;
    });
    mockGetNodeChain.mockResolvedValue([]);

    await expect(
      ManagerAdminPage({ params: makeParams('test-co', ['nonexistent']) }),
    ).rejects.toThrow('REDIRECT:/test-co/login');
  });

  it('superadmin precedence: superadmin auth wins over manager auth when both are present', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'superadmin') return { uid: 's1', email: 's@x.com' };
      if (role === 'manager') return { uid: 'm1', email: 'm@x.com', companyId: 'company-1', branchId: 'branch-1' };
      return null;
    });
    const chain = [
      { id: 'branch-x', parentId: null, label: 'Branch X', slug: 'branch-x', depth: 0, isLeaf: false, qrCode: null, fullPath: null, active: true, createdAt: null },
    ];
    mockGetNodeChain.mockResolvedValue(chain);

    await ManagerAdminPage({ params: makeParams('test-co', ['branch-x']) });

    expect(mockGetNodeChain).toHaveBeenCalled();
    expect(mockResolveBranchNode).not.toHaveBeenCalled();
  });
});
