// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const { mockPut } = vi.hoisted(() => ({
  mockPut: vi.fn(),
}));

vi.mock('@vercel/blob/client', () => ({
  put: mockPut,
}));

import { CompanyLogoSection } from './CompanyLogoSection';

const COMPANY_ID = 'company-1';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function selectFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

function pngFile(name = 'logo.png') {
  return new File(['x'], name, { type: 'image/png' });
}

describe('CompanyLogoSection local pre-checks', () => {
  it('rejects a non-PNG file without hitting the network', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<CompanyLogoSection companyId={COMPANY_ID} logoUrl={undefined} onLogoChange={vi.fn()} />);
    selectFile(new File(['x'], 'logo.jpg', { type: 'image/jpeg' }));

    expect(screen.getByText('Only PNG files are allowed.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('rejects a file over 5MB without hitting the network', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'logo.png', {
      type: 'image/png',
    });

    render(<CompanyLogoSection companyId={COMPANY_ID} logoUrl={undefined} onLogoChange={vi.fn()} />);
    selectFile(oversized);

    expect(screen.getByText('File is too large. Maximum size is 5MB.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });
});

describe('CompanyLogoSection network-classified errors', () => {
  it('shows the session-expired message when the token request returns not_authenticated', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'nope', reason: 'not_authenticated' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CompanyLogoSection companyId={COMPANY_ID} logoUrl={undefined} onLogoChange={vi.fn()} />);
    selectFile(pngFile());

    await waitFor(() => {
      expect(screen.getByText('Your session has expired. Please log in again.')).toBeTruthy();
    });
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('shows the permission message when the token request returns not_authorized', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'nope', reason: 'not_authorized' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CompanyLogoSection companyId={COMPANY_ID} logoUrl={undefined} onLogoChange={vi.fn()} />);
    selectFile(pngFile());

    await waitFor(() => {
      expect(screen.getByText("You don't have permission to upload here.")).toBeTruthy();
    });
  });

  it('shows the temporarily-unavailable message when the token request returns service_unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'nope', reason: 'service_unavailable' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CompanyLogoSection companyId={COMPANY_ID} logoUrl={undefined} onLogoChange={vi.fn()} />);
    selectFile(pngFile());

    await waitFor(() => {
      expect(
        screen.getByText('Upload service is temporarily unavailable. Please try again later.'),
      ).toBeTruthy();
    });
  });

  it('shows the generic fallback message when the token request succeeds but put() rejects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ clientToken: 'tok' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    mockPut.mockRejectedValue(new Error('network blip'));

    render(<CompanyLogoSection companyId={COMPANY_ID} logoUrl={undefined} onLogoChange={vi.fn()} />);
    selectFile(pngFile());

    await waitFor(() => {
      expect(screen.getByText('Upload failed. Please try again.')).toBeTruthy();
    });
  });
});
