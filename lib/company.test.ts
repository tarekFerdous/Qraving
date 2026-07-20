import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    doc: vi.fn(),
  },
}));

import { isNodeInBranch, resolveBranchNode, CompanyNode } from '@/lib/company';
import { adminDb } from '@/lib/firebase-admin';

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
