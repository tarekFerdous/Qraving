import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetCompanyBySlug, mockGetNodeByQRCode, mockResolveBranchNodeId, mockIsMenuPublished, mockGetMenu } = vi.hoisted(() => ({
  mockGetCompanyBySlug: vi.fn(),
  mockGetNodeByQRCode: vi.fn(),
  mockResolveBranchNodeId: vi.fn(),
  mockIsMenuPublished: vi.fn(),
  mockGetMenu: vi.fn(),
}));

vi.mock('@/lib/company', () => ({
  getCompanyBySlug: mockGetCompanyBySlug,
  getNodeByQRCode: mockGetNodeByQRCode,
  resolveBranchNodeId: mockResolveBranchNodeId,
}));

vi.mock('@/lib/menu', () => ({
  isMenuPublished: mockIsMenuPublished,
  getMenu: mockGetMenu,
}));

vi.mock('@/components/MenuPage', () => ({
  default: (props: unknown) => ({ __mockMenuPage: true, props }),
}));

vi.mock('@/components/MenuNotAvailable', () => ({
  default: () => ({ __mockMenuNotAvailable: true }),
}));

vi.mock('@/components/LocationNotFound', () => ({
  default: () => ({ __mockLocationNotFound: true }),
}));

vi.mock('@/components/CompanyLocked', () => ({
  default: () => ({ __mockCompanyLocked: true }),
}));

import CatchAllPage from './page';

const company = {
  id: 'company-1',
  name: 'Test Co',
  slug: 'test-co',
  layers: [],
  managerLayerIndex: 0,
  createdAt: null,
};

function makeParams(path: string[]) {
  return Promise.resolve({ path });
}

describe('CatchAllPage ([...path])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders LocationNotFound when the company slug does not resolve', async () => {
    mockGetCompanyBySlug.mockResolvedValue(null);

    const result: any = await CatchAllPage({ params: makeParams(['ghost-co', 'branch-1', 'QR123']) });
    const rendered = result.type(result.props);

    expect(rendered.__mockLocationNotFound).toBe(true);
    expect(mockGetNodeByQRCode).not.toHaveBeenCalled();
  });

  it('renders CompanyLocked before resolving the QR node when the company is locked', async () => {
    mockGetCompanyBySlug.mockResolvedValue({ ...company, locked: true });

    const result: any = await CatchAllPage({ params: makeParams(['test-co', 'branch-1', 'QR123']) });
    const rendered = result.type(result.props);

    expect(rendered.__mockCompanyLocked).toBe(true);
    expect(mockGetNodeByQRCode).not.toHaveBeenCalled();
    expect(mockIsMenuPublished).not.toHaveBeenCalled();
  });

  it('renders MenuPage as usual when the company is not locked', async () => {
    mockGetCompanyBySlug.mockResolvedValue(company);
    mockGetNodeByQRCode.mockResolvedValue({ id: 'node-1' });
    mockResolveBranchNodeId.mockResolvedValue('node-1');
    mockIsMenuPublished.mockResolvedValue(true);
    mockGetMenu.mockResolvedValue([]);

    const result: any = await CatchAllPage({ params: makeParams(['test-co', 'branch-1', 'QR123']) });
    const rendered = result.type(result.props);

    expect(rendered.__mockMenuPage).toBe(true);
    expect(rendered.props.companyName).toBe('Test Co');
    expect(rendered.props.table).toBe('node-1');
  });

  it('shows MenuNotAvailable when publish check fails using URL slugs instead of resolved ids (regression guard)', async () => {
    // Guards against the original bug: isMenuPublished/getMenu must be called
    // with the resolved branch node id + company.id, never the raw URL slugs.
    mockGetCompanyBySlug.mockResolvedValue(company);
    mockGetNodeByQRCode.mockResolvedValue({ id: 'node-1' });
    mockResolveBranchNodeId.mockResolvedValue('resolved-branch-id');
    mockIsMenuPublished.mockImplementation(
      async (companyId: string, branchId: string) => companyId === 'company-1' && branchId === 'resolved-branch-id',
    );
    mockGetMenu.mockResolvedValue([]);

    const result: any = await CatchAllPage({ params: makeParams(['test-co', 'branch-1', 'QR123']) });
    const rendered = result.type(result.props);

    expect(rendered.__mockMenuPage).toBe(true);
    expect(mockIsMenuPublished).toHaveBeenCalledWith('company-1', 'resolved-branch-id');
    expect(mockGetMenu).toHaveBeenCalledWith('company-1', 'resolved-branch-id');
  });

  it('resolves a multi-level hierarchy (Company -> Branch -> Area -> Table) up to the branch node and renders MenuPage', async () => {
    // Simulates a QR scan that lands on a deeply-nested leaf "Table" node
    // (e.g. under "Area" under "Branch"). getNodeByQRCode resolves the leaf;
    // resolveBranchNodeId must walk the parentId chain up through the
    // intermediate "Area" layer to the root "Branch" node id, and that
    // resolved id (not any URL slug or the leaf node id) must be what's used
    // to check publish status and load/render the menu.
    mockGetCompanyBySlug.mockResolvedValue(company);
    mockGetNodeByQRCode.mockResolvedValue({ id: 'table-node-99', parentId: 'area-node-5' });
    mockResolveBranchNodeId.mockImplementation(async (companyId: string, nodeId: string) => {
      expect(companyId).toBe('company-1');
      expect(nodeId).toBe('table-node-99');
      return 'branch-node-1';
    });
    mockIsMenuPublished.mockResolvedValue(true);
    mockGetMenu.mockResolvedValue([{ id: 'cat-1', name: 'Mains', description: '', items: [] }]);

    const result: any = await CatchAllPage({
      params: makeParams(['test-co', 'flaming-grill', 'area-5', 'table-99-QR']),
    });
    const rendered = result.type(result.props);

    expect(mockResolveBranchNodeId).toHaveBeenCalledWith('company-1', 'table-node-99');
    expect(mockIsMenuPublished).toHaveBeenCalledWith('company-1', 'branch-node-1');
    expect(mockGetMenu).toHaveBeenCalledWith('company-1', 'branch-node-1');
    expect(rendered.__mockMenuPage).toBe(true);
    expect(rendered.props.company).toBe('company-1');
    expect(rendered.props.branch).toBe('branch-node-1');
    expect(rendered.props.table).toBe('table-node-99');
  });

  it('renders MenuNotAvailable for a multi-level hierarchy when the resolved branch menu is unpublished', async () => {
    mockGetCompanyBySlug.mockResolvedValue(company);
    mockGetNodeByQRCode.mockResolvedValue({ id: 'table-node-99', parentId: 'area-node-5' });
    mockResolveBranchNodeId.mockResolvedValue('branch-node-1');
    mockIsMenuPublished.mockResolvedValue(false);

    const result: any = await CatchAllPage({
      params: makeParams(['test-co', 'flaming-grill', 'area-5', 'table-99-QR']),
    });
    const rendered = result.type(result.props);

    expect(rendered.__mockMenuNotAvailable).toBe(true);
    expect(mockGetMenu).not.toHaveBeenCalled();
  });
});
