// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { Timestamp } from 'firebase-admin/firestore';
import type { Company } from '@/lib/company';
import { CompaniesList } from './CompaniesList';

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'company-1',
    name: 'Test Co',
    slug: 'test-co',
    layers: [],
    managerLayerIndex: 0,
    createdAt: null as unknown as Timestamp,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('CompaniesList', () => {
  it('renders no Locked badge or Restore button for an active company', () => {
    render(<CompaniesList initialCompanies={[makeCompany({ locked: false })]} />);

    expect(screen.queryByText('Locked')).toBeNull();
    expect(screen.queryByText('Restore')).toBeNull();
    expect(screen.getByText('Managers')).toBeTruthy();
    expect(screen.getByText('View')).toBeTruthy();
  });

  it('renders a Locked badge and Restore button for a locked company', () => {
    render(<CompaniesList initialCompanies={[makeCompany({ locked: true })]} />);

    expect(screen.getByText('Locked')).toBeTruthy();
    expect(screen.getByText('Restore')).toBeTruthy();
  });

  it('does nothing if the confirm dialog is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<CompaniesList initialCompanies={[makeCompany({ locked: true })]} />);
    fireEvent.click(screen.getByText('Restore'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Locked')).toBeTruthy();
  });

  it('confirms, calls PATCH restore, and updates the row in place on success', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<CompaniesList initialCompanies={[makeCompany({ id: 'company-9', locked: true })]} />);
    fireEvent.click(screen.getByText('Restore'));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/companies/company-9',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'restore' }),
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText('Locked')).toBeNull();
    });
    expect(screen.queryByText('Restore')).toBeNull();
    expect(screen.getByText('Managers')).toBeTruthy();
  });

  it('leaves the row locked if the restore request fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<CompaniesList initialCompanies={[makeCompany({ locked: true })]} />);
    fireEvent.click(screen.getByText('Restore'));

    await waitFor(() => {
      expect((screen.getByText('Restore') as HTMLButtonElement).disabled).toBe(false);
    });
    expect(screen.getByText('Locked')).toBeTruthy();
  });

  it('does not affect other rows when one company is restored', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CompaniesList
        initialCompanies={[
          makeCompany({ id: 'company-locked', name: 'Locked Co', locked: true }),
          makeCompany({ id: 'company-active', name: 'Active Co', locked: false }),
        ]}
      />,
    );

    fireEvent.click(screen.getByText('Restore'));

    await waitFor(() => {
      expect(screen.queryByText('Locked')).toBeNull();
    });

    // Both rows still render their standard actions; the previously-active row
    // was never touched.
    expect(screen.getByText('Locked Co')).toBeTruthy();
    expect(screen.getByText('Active Co')).toBeTruthy();
  });
});
