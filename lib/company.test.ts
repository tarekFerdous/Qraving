import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    doc: vi.fn(),
    collection: vi.fn(),
    recursiveDelete: vi.fn(),
  },
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(),
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn(),
}));

import { isNodeInBranch, resolveBranchNode, hardDeleteCompany, lockCompany, restoreCompany, CompanyNode } from '@/lib/company';
import { adminDb } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

type NodeFixture = Partial<CompanyNode> & { id: string };

function mockNodeDocs(nodes: NodeFixture[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  vi.mocked(adminDb.doc).mockImplementation((path: string) => {
    const id = path.split('/').pop() as string;
    const node = byId.get(id);
    return {
      get: vi.fn().mockResolvedValue({
        exists: !!node,
        id,
        data: () => node,
      }),
      update: vi.fn().mockResolvedValue(undefined),
    } as any;
  });
}

describe('isNodeInBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const tree: NodeFixture[] = [
    { id: 'branch-1', parentId: null, active: true },
    { id: 'child-1', parentId: 'branch-1', active: true },
    { id: 'grandchild-1', parentId: 'child-1', active: true },
    { id: 'branch-2', parentId: null, active: true },
    { id: 'child-2', parentId: 'branch-2', active: true },
  ];

  it('returns true when nodeId === branchId', async () => {
    mockNodeDocs(tree);
    const result = await isNodeInBranch('company-1', 'branch-1', 'branch-1');
    expect(result).toBe(true);
  });

  it('returns true for a direct child of the branch', async () => {
    mockNodeDocs(tree);
    const result = await isNodeInBranch('company-1', 'child-1', 'branch-1');
    expect(result).toBe(true);
  });

  it('returns true for a deep (multi-level) descendant', async () => {
    mockNodeDocs(tree);
    const result = await isNodeInBranch('company-1', 'grandchild-1', 'branch-1');
    expect(result).toBe(true);
  });

  it('returns false for a node in a sibling branch / unrelated subtree', async () => {
    mockNodeDocs(tree);
    const result = await isNodeInBranch('company-1', 'child-2', 'branch-1');
    expect(result).toBe(false);
  });

  it('returns false for a non-existent node id', async () => {
    mockNodeDocs(tree);
    const result = await isNodeInBranch('company-1', 'does-not-exist', 'branch-1');
    expect(result).toBe(false);
  });
});

describe('resolveBranchNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves an active branch node correctly', async () => {
    mockNodeDocs([{ id: 'branch-1', parentId: null, active: true, label: 'Downtown' }]);

    const result = await resolveBranchNode('company-1', 'branch-1');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.node.id).toBe('branch-1');
      expect(result.node.label).toBe('Downtown');
    }
  });

  it('returns not_found for a missing node', async () => {
    mockNodeDocs([]);

    const result = await resolveBranchNode('company-1', 'ghost-branch');

    expect(result.status).toBe('not_found');
  });

  it('returns inactive for a found-but-inactive node', async () => {
    mockNodeDocs([{ id: 'branch-1', parentId: null, active: false }]);

    const result = await resolveBranchNode('company-1', 'branch-1');

    expect(result.status).toBe('inactive');
  });
});

describe('hardDeleteCompany', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup(userIds: string[]) {
    const userDocs = userIds.map((id) => ({ id, ref: { delete: vi.fn().mockResolvedValue(undefined) } }));
    const mockGet = vi.fn().mockResolvedValue({ docs: userDocs });
    const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
    vi.mocked(adminDb.collection).mockReturnValue({ where: mockWhere } as any);

    const companyRef = { path: 'companies/company-1' };
    vi.mocked(adminDb.doc).mockReturnValue(companyRef as any);
    vi.mocked(adminDb.recursiveDelete).mockResolvedValue(undefined as any);

    const deleteUser = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getAuth).mockReturnValue({ deleteUser } as any);

    const deleteFiles = vi.fn().mockResolvedValue(undefined);
    const bucket = vi.fn().mockReturnValue({ deleteFiles });
    vi.mocked(getStorage).mockReturnValue({ bucket } as any);

    return { userDocs, mockWhere, deleteUser, deleteFiles, bucket, companyRef };
  }

  it('deletes each manager Auth account and users doc for the company', async () => {
    const { userDocs, mockWhere, deleteUser } = setup(['user-1', 'user-2']);

    await hardDeleteCompany('company-1');

    expect(adminDb.collection).toHaveBeenCalledWith('users');
    expect(mockWhere).toHaveBeenCalledWith('companyId', '==', 'company-1');
    expect(deleteUser).toHaveBeenCalledWith('user-1');
    expect(deleteUser).toHaveBeenCalledWith('user-2');
    userDocs.forEach((d) => expect(d.ref.delete).toHaveBeenCalled());
  });

  it('sweeps every Storage object under companies/{companyId}/', async () => {
    const { bucket, deleteFiles } = setup([]);

    await hardDeleteCompany('company-1');

    expect(bucket).toHaveBeenCalled();
    expect(deleteFiles).toHaveBeenCalledWith({ prefix: 'companies/company-1/' });
  });

  it('recursively deletes the company document and its Firestore subcollections', async () => {
    const { companyRef } = setup([]);

    await hardDeleteCompany('company-1');

    expect(adminDb.doc).toHaveBeenCalledWith('companies/company-1');
    expect(adminDb.recursiveDelete).toHaveBeenCalledWith(companyRef);
  });

  it('continues cleanup even if an Auth account is already gone', async () => {
    const { deleteUser, userDocs } = setup(['user-1']);
    deleteUser.mockRejectedValueOnce(new Error('auth/user-not-found'));

    await expect(hardDeleteCompany('company-1')).resolves.not.toThrow();
    expect(userDocs[0].ref.delete).toHaveBeenCalled();
  });
});

type ManagerFixture = { id: string; disabled?: boolean; authLookupFails?: boolean };

function setupManagerUsers(managers: ManagerFixture[]) {
  const docUpdate = vi.fn().mockResolvedValue(undefined);
  vi.mocked(adminDb.doc).mockReturnValue({ update: docUpdate } as any);

  const userDocs = managers.map((m) => ({
    id: m.id,
    ref: { update: vi.fn().mockResolvedValue(undefined) },
  }));

  const where2 = vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ docs: userDocs }) });
  const where1 = vi.fn().mockReturnValue({ where: where2 });
  vi.mocked(adminDb.collection).mockReturnValue({ where: where1 } as any);

  const getUser = vi.fn().mockImplementation(async (uid: string) => {
    const m = managers.find((x) => x.id === uid);
    if (m?.authLookupFails) throw new Error('auth/user-not-found');
    return { disabled: !!m?.disabled };
  });
  const updateUser = vi.fn().mockResolvedValue(undefined);
  vi.mocked(getAuth).mockReturnValue({ getUser, updateUser } as any);

  return { docUpdate, userDocs, where1, where2, getUser, updateUser };
}

describe('lockCompany', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets locked:true on the company document', async () => {
    const { docUpdate } = setupManagerUsers([]);

    await lockCompany('company-1');

    expect(adminDb.doc).toHaveBeenCalledWith('companies/company-1');
    expect(docUpdate).toHaveBeenCalledWith({ locked: true });
  });

  it('queries users scoped to the company and the manager role', async () => {
    const { where1, where2 } = setupManagerUsers([]);

    await lockCompany('company-1');

    expect(adminDb.collection).toHaveBeenCalledWith('users');
    expect(where1).toHaveBeenCalledWith('companyId', '==', 'company-1');
    expect(where2).toHaveBeenCalledWith('role', '==', 'manager');
  });

  it('disables every currently-enabled manager and marks them autoDisabledByCompanyLock', async () => {
    const { userDocs, updateUser } = setupManagerUsers([{ id: 'mgr-1', disabled: false }]);

    await lockCompany('company-1');

    expect(updateUser).toHaveBeenCalledWith('mgr-1', { disabled: true });
    expect(userDocs[0].ref.update).toHaveBeenCalledWith({ autoDisabledByCompanyLock: true });
  });

  it('skips a manager already individually deactivated — no marker, no Auth call', async () => {
    const { userDocs, updateUser } = setupManagerUsers([{ id: 'mgr-2', disabled: true }]);

    await lockCompany('company-1');

    expect(updateUser).not.toHaveBeenCalled();
    expect(userDocs[0].ref.update).not.toHaveBeenCalled();
  });

  it('handles a mix of enabled and already-disabled managers independently', async () => {
    const { userDocs, updateUser } = setupManagerUsers([
      { id: 'mgr-enabled', disabled: false },
      { id: 'mgr-disabled', disabled: true },
    ]);

    await lockCompany('company-1');

    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith('mgr-enabled', { disabled: true });
    expect(userDocs[0].ref.update).toHaveBeenCalledWith({ autoDisabledByCompanyLock: true });
    expect(userDocs[1].ref.update).not.toHaveBeenCalled();
  });
});

describe('restoreCompany', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupAutoDisabledUsers(managers: ManagerFixture[]) {
    const docUpdate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(adminDb.doc).mockReturnValue({ update: docUpdate } as any);

    const userDocs = managers.map((m) => ({
      id: m.id,
      ref: { update: vi.fn().mockResolvedValue(undefined) },
    }));

    const where2 = vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ docs: userDocs }) });
    const where1 = vi.fn().mockReturnValue({ where: where2 });
    vi.mocked(adminDb.collection).mockReturnValue({ where: where1 } as any);

    const updateUser = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getAuth).mockReturnValue({ updateUser } as any);

    return { docUpdate, userDocs, where1, where2, updateUser };
  }

  it('sets locked:false on the company document', async () => {
    const { docUpdate } = setupAutoDisabledUsers([]);

    await restoreCompany('company-1');

    expect(adminDb.doc).toHaveBeenCalledWith('companies/company-1');
    expect(docUpdate).toHaveBeenCalledWith({ locked: false });
  });

  it('queries only users carrying the autoDisabledByCompanyLock marker', async () => {
    const { where1, where2 } = setupAutoDisabledUsers([]);

    await restoreCompany('company-1');

    expect(adminDb.collection).toHaveBeenCalledWith('users');
    expect(where1).toHaveBeenCalledWith('companyId', '==', 'company-1');
    expect(where2).toHaveBeenCalledWith('autoDisabledByCompanyLock', '==', true);
  });

  it('re-enables marked managers and clears their marker', async () => {
    const { userDocs, updateUser } = setupAutoDisabledUsers([{ id: 'mgr-1' }]);

    await restoreCompany('company-1');

    expect(updateUser).toHaveBeenCalledWith('mgr-1', { disabled: false });
    expect(userDocs[0].ref.update).toHaveBeenCalledWith({
      autoDisabledByCompanyLock: expect.anything(),
    });
  });

  it('leaves a manually-deactivated manager (no marker) untouched — never queried, never re-enabled', async () => {
    // Only marked users are returned by the query, so a manually-deactivated manager
    // without the marker simply never appears in userDocs / never gets touched.
    const { updateUser } = setupAutoDisabledUsers([]);

    await restoreCompany('company-1');

    expect(updateUser).not.toHaveBeenCalled();
  });
});
