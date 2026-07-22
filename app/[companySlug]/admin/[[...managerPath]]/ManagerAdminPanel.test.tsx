// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { LayerConfig, CompanyNode } from '@/lib/company';
import ManagerAdminPanel, { STRUCTURE_EXPANDED_STORAGE_PREFIX } from './ManagerAdminPanel';

const layers: LayerConfig[] = [
  { index: 0, label: 'Branch', isLeafLayer: false },
  { index: 1, label: 'Area', isLeafLayer: false },
  { index: 2, label: 'Table', isLeafLayer: true },
];

function makeDescendants(overrides?: Partial<Omit<CompanyNode, 'createdAt'>>): Omit<CompanyNode, 'createdAt'>[] {
  return [
    {
      id: 'area-1',
      parentId: 'branch-1',
      label: 'Area 1',
      slug: 'area-1',
      depth: 1,
      isLeaf: false,
      qrCode: null,
      fullPath: null,
      active: true,
    },
    {
      id: 'table-1',
      parentId: 'area-1',
      label: 'Table 1',
      slug: 'table-1',
      depth: 2,
      isLeaf: true,
      qrCode: null,
      fullPath: null,
      active: true,
      ...overrides,
    },
  ];
}

const baseProps = {
  companyId: 'company-1',
  companyName: 'Test Co',
  layers,
  managerNodeId: 'branch-1',
  ancestorLabels: ['Test Co'],
  firstLeafLayerIndex: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function areaHeaderIcon() {
  return screen.getByText('Area 1').parentElement?.querySelector('svg') ?? null;
}

function tableHeaderIcon() {
  return screen.getByText('Table 1').parentElement?.querySelector('svg') ?? null;
}

describe('ManagerAdminPanel — Structure tab collapse/expand', () => {
  it('defaults a non-leaf node to expanded with no saved localStorage entry, showing its children', () => {
    render(<ManagerAdminPanel {...baseProps} initialDescendants={makeDescendants()} />);

    expect(screen.getByText('Area 1')).toBeTruthy();
    expect(screen.getByText('Table 1')).toBeTruthy();
    expect(areaHeaderIcon()).not.toBeNull();
  });

  it('clicking a non-leaf header collapses it, hiding children and the Add {layer} button', () => {
    render(<ManagerAdminPanel {...baseProps} initialDescendants={makeDescendants()} />);

    fireEvent.click(screen.getByText('Area 1').closest('div')!.parentElement!);

    expect(screen.queryByText('Table 1')).toBeNull();
    expect(screen.queryByText('Add Table')).toBeNull();
  });

  it('clicking a collapsed non-leaf header re-expands it', () => {
    render(<ManagerAdminPanel {...baseProps} initialDescendants={makeDescendants()} />);

    const header = screen.getByText('Area 1').closest('div')!.parentElement!;
    fireEvent.click(header);
    expect(screen.queryByText('Table 1')).toBeNull();

    fireEvent.click(header);
    expect(screen.getByText('Table 1')).toBeTruthy();
  });

  it('clicking Deactivate on a non-leaf card does not toggle its expanded state, and still deactivates it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    render(<ManagerAdminPanel {...baseProps} initialDescendants={makeDescendants()} />);

    const areaDeactivateButton = screen.getByText('Area 1').closest('div')!.parentElement!.parentElement!.querySelector(
      'button[title="Deactivate"]',
    ) as HTMLElement;
    fireEvent.click(areaDeactivateButton);

    // Synchronously after the click (before the deactivate fetch resolves), the
    // card's children are still visible — proving the click did not toggle collapse.
    expect(screen.getByText('Table 1')).toBeTruthy();

    await waitFor(() => {
      expect(screen.queryByText('Area 1')).toBeNull();
    });
  });

  it('a leaf (Table) node never renders a chevron/toggle in its header', () => {
    render(<ManagerAdminPanel {...baseProps} initialDescendants={makeDescendants()} />);

    expect(tableHeaderIcon()).toBeNull();
  });

  it("a leaf node's QR block remains visible regardless of ancestor toggling, as long as ancestors are expanded", () => {
    render(
      <ManagerAdminPanel
        {...baseProps}
        initialDescendants={makeDescendants({
          qrCode: 'generated',
          qrDataUrl: 'data:image/png;base64,abc',
          publicUrl: 'https://example.com/t/table-1',
        } as never)}
      />,
    );

    expect(screen.getByAltText('QR code')).toBeTruthy();
    expect(screen.getByText('Download PNG')).toBeTruthy();
  });

  it('generating a QR code on a leaf node immediately shows the QR image/Download/Regenerate controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fullPath: '/test-co/t/table-1',
          publicUrl: 'https://example.com/t/table-1',
          qrDataUrl: 'data:image/png;base64,xyz',
        }),
      }),
    );

    render(<ManagerAdminPanel {...baseProps} initialDescendants={makeDescendants()} />);

    fireEvent.click(screen.getByText('Generate QR Code'));

    await waitFor(() => {
      expect(screen.getByAltText('QR code')).toBeTruthy();
      expect(screen.getByText('Download PNG')).toBeTruthy();
    });
  });

  it('a newly added non-leaf node renders expanded by default', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nodeId: 'area-2' }) }),
    );

    render(<ManagerAdminPanel {...baseProps} initialDescendants={[]} />);

    fireEvent.click(screen.getByText('Add Area'));
    fireEvent.change(screen.getByPlaceholderText('Area name'), { target: { value: 'Area 2' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Area 2')).toBeTruthy();
    });
    expect(screen.getByText('Add Table')).toBeTruthy();
  });

  it('writes collapse state to localStorage on toggle, scoped by companyId', () => {
    render(<ManagerAdminPanel {...baseProps} initialDescendants={makeDescendants()} />);

    fireEvent.click(screen.getByText('Area 1').closest('div')!.parentElement!);

    const raw = window.localStorage.getItem(`${STRUCTURE_EXPANDED_STORAGE_PREFIX}company-1`);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ 'area-1': false });
  });

  it('hydrates saved collapse state from localStorage on mount', () => {
    window.localStorage.setItem(
      `${STRUCTURE_EXPANDED_STORAGE_PREFIX}company-1`,
      JSON.stringify({ 'area-1': false }),
    );

    render(<ManagerAdminPanel {...baseProps} initialDescendants={makeDescendants()} />);

    expect(screen.queryByText('Table 1')).toBeNull();
  });

  it('does not read or apply another company\'s saved collapse state', () => {
    window.localStorage.setItem(
      `${STRUCTURE_EXPANDED_STORAGE_PREFIX}company-1`,
      JSON.stringify({ 'area-1': false }),
    );

    render(
      <ManagerAdminPanel {...baseProps} companyId="company-2" initialDescendants={makeDescendants()} />,
    );

    expect(screen.getByText('Table 1')).toBeTruthy();
  });
});

describe('ManagerAdminPanel — auto-computed QR card for already-provisioned tables', () => {
  it('a leaf node with a persisted qrCode/fullPath but no qrDataUrl in state renders the full QR card without any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ManagerAdminPanel
        {...baseProps}
        initialDescendants={makeDescendants({
          qrCode: 'abc123',
          fullPath: '/test-co/area-1/table-1/abc123',
        })}
      />,
    );

    // Starts (briefly) as the transient pill, then resolves to the full card once the
    // client-side QRCode.toDataURL computation finishes.
    await waitFor(() => {
      expect(screen.getByAltText('QR code')).toBeTruthy();
    });

    expect(screen.getByText('Download PNG')).toBeTruthy();
    expect(screen.getByText('Regenerate')).toBeTruthy();
    expect(screen.getByText(/test-co\/area-1\/table-1\/abc123/)).toBeTruthy();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a leaf node with no qrCode still shows Generate QR Code, unaffected', () => {
    vi.stubGlobal('fetch', vi.fn());

    render(<ManagerAdminPanel {...baseProps} initialDescendants={makeDescendants()} />);

    expect(screen.getByText('Generate QR Code')).toBeTruthy();
    expect(screen.queryByAltText('QR code')).toBeNull();
  });

  it('Regenerate still shows its confirm dialog and still calls the mutating generate-qr fetch, unaffected', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fullPath: '/test-co/area-1/table-1/def456',
        publicUrl: 'https://example.com/test-co/area-1/table-1/def456',
        qrDataUrl: 'data:image/png;base64,regenerated',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ManagerAdminPanel
        {...baseProps}
        initialDescendants={makeDescendants({
          qrCode: 'abc123',
          fullPath: '/test-co/area-1/table-1/abc123',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByAltText('QR code')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Regenerate'));
    expect(screen.getByText(/Are you sure\?/)).toBeTruthy();

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/companies/company-1/nodes/table-1',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'generate-qr' }),
        }),
      );
    });

    await waitFor(() => {
      expect((screen.getByAltText('QR code') as HTMLImageElement).src).toContain('regenerated');
    });
  });
});
