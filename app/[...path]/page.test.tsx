import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetCompanyBySlug, mockGetNodeByQRCode, mockIsMenuPublished, mockGetMenu } = vi.hoisted(() => ({
  mockGetCompanyBySlug: vi.fn(),
  mockGetNodeByQRCode: vi.fn(),
  mockIsMenuPublished: vi.fn(),
  mockGetMenu: vi.fn(),
}));

vi.mock('@/lib/company', () => ({
  getCompanyBySlug: mockGetCompanyBySlug,
  getNodeByQRCode: mockGetNodeByQRCode,
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
    mockIsMenuPublished.mockResolvedValue(true);
    mockGetMenu.mockResolvedValue([]);

    const result: any = await CatchAllPage({ params: makeParams(['test-co', 'branch-1', 'QR123']) });
    const rendered = result.type(result.props);

    expect(rendered.__mockMenuPage).toBe(true);
    expect(rendered.props.companyName).toBe('Test Co');
  });
});
