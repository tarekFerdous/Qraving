// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { MenuItem } from '@/lib/manager-menu';

const { mockCreateItem, mockUpdateItem, mockPut, mockCompressImageFile } = vi.hoisted(() => ({
  mockCreateItem: vi.fn(),
  mockUpdateItem: vi.fn(),
  mockPut: vi.fn(),
  mockCompressImageFile: vi.fn(),
}));

vi.mock('@/lib/manager-menu', () => ({
  createItem: mockCreateItem,
  updateItem: mockUpdateItem,
}));

vi.mock('@vercel/blob/client', () => ({
  put: mockPut,
}));

vi.mock('@/lib/image-compression', () => ({
  compressImageFile: mockCompressImageFile,
}));

import ItemForm from './ItemForm';

const COMPANY_ID = 'company-1';
const BRANCH_ID = 'branch-1';
const CATEGORY_ID = 'cat-1';

function makeItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-1',
    name: 'Pad Thai',
    description: '',
    price: 1200,
    imageUrl: null,
    available: true,
    order: 0,
    dietaryTags: [],
    allergenNote: null,
    allergens: [],
    customizations: { sizes: [], addOns: [], specialInstructions: false },
    createdAt: null as never,
    updatedAt: null as never,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateItem.mockResolvedValue('new-item-id');
  mockUpdateItem.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function selectFile(file = new File(['x'], 'photo.png', { type: 'image/png' })) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('ItemForm allergen tags', () => {
  it('adds a tag via the text input + Add button, and clears the input', () => {
    render(
      <ItemForm
        companyId={COMPANY_ID}
        branchId={BRANCH_ID}
        categoryId={CATEGORY_ID}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('e.g. Peanuts') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Peanuts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Peanuts')).toBeTruthy();
    expect(input.value).toBe('');
  });

  it('removes a tag when its remove button is clicked', () => {
    render(
      <ItemForm
        companyId={COMPANY_ID}
        branchId={BRANCH_ID}
        categoryId={CATEGORY_ID}
        item={makeItem({ allergens: ['Peanuts', 'Shellfish'] })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Peanuts')).toBeTruthy();
    expect(screen.getByText('Shellfish')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Peanuts' }));

    expect(screen.queryByText('Peanuts')).toBeNull();
    expect(screen.getByText('Shellfish')).toBeTruthy();
  });

  it('is a no-op when adding a 51st tag past the 50-tag cap', () => {
    const fiftyTags = Array.from({ length: 50 }, (_, i) => `Allergen${i + 1}`);
    render(
      <ItemForm
        companyId={COMPANY_ID}
        branchId={BRANCH_ID}
        categoryId={CATEGORY_ID}
        item={makeItem({ allergens: fiftyTags })}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('e.g. Peanuts') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'OneTooMany' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.queryByText('OneTooMany')).toBeNull();
    // still exactly 50 chips (50 remove buttons)
    expect(screen.getAllByRole('button', { name: /^Remove / }).length).toBe(50);
  });

  it('auto-splits a legacy free-text allergen note into tags on load', () => {
    render(
      <ItemForm
        companyId={COMPANY_ID}
        branchId={BRANCH_ID}
        categoryId={CATEGORY_ID}
        item={makeItem({
          allergenNote: 'Peanuts, Shellfish,  Dairy ',
          allergens: [],
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Peanuts')).toBeTruthy();
    expect(screen.getByText('Shellfish')).toBeTruthy();
    expect(screen.getByText('Dairy')).toBeTruthy();
  });
});

describe('ItemForm image upload', () => {
  it('shows the session-expired message when the token request returns not_authenticated', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'nope', reason: 'not_authenticated' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ItemForm companyId={COMPANY_ID} branchId={BRANCH_ID} categoryId={CATEGORY_ID} onClose={vi.fn()} />,
    );
    selectFile();

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

    render(
      <ItemForm companyId={COMPANY_ID} branchId={BRANCH_ID} categoryId={CATEGORY_ID} onClose={vi.fn()} />,
    );
    selectFile();

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

    render(
      <ItemForm companyId={COMPANY_ID} branchId={BRANCH_ID} categoryId={CATEGORY_ID} onClose={vi.fn()} />,
    );
    selectFile();

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

    render(
      <ItemForm companyId={COMPANY_ID} branchId={BRANCH_ID} categoryId={CATEGORY_ID} onClose={vi.fn()} />,
    );
    selectFile();

    await waitFor(() => {
      expect(screen.getByText('Upload failed. Please try again.')).toBeTruthy();
    });
  });

  it('renders the image preview and no error on a successful upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ clientToken: 'tok' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    mockPut.mockResolvedValue({ url: 'https://blob.example/photo.png' });

    render(
      <ItemForm companyId={COMPANY_ID} branchId={BRANCH_ID} categoryId={CATEGORY_ID} onClose={vi.fn()} />,
    );
    selectFile();

    await waitFor(() => {
      expect(screen.getByAltText('Item preview')).toBeTruthy();
    });
    expect(screen.queryByText('Upload failed. Please try again.')).toBeNull();
  });

  it('does not compress a file at/under the 5MB cap and uploads it unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ clientToken: 'tok' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    mockPut.mockResolvedValue({ url: 'https://blob.example/small.png' });

    const smallFile = new File(['x'], 'small.png', { type: 'image/png' });
    Object.defineProperty(smallFile, 'size', { value: 5 * 1024 * 1024 });

    render(
      <ItemForm companyId={COMPANY_ID} branchId={BRANCH_ID} categoryId={CATEGORY_ID} onClose={vi.fn()} />,
    );
    selectFile(smallFile);

    await waitFor(() => {
      expect(screen.getByAltText('Item preview')).toBeTruthy();
    });
    expect(mockCompressImageFile).not.toHaveBeenCalled();
    expect(mockPut).toHaveBeenCalledWith(
      expect.any(String),
      smallFile,
      expect.objectContaining({ access: 'public', token: 'tok' }),
    );
  });

  it('compresses a file over 5MB and uploads the compressed result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ clientToken: 'tok' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    mockPut.mockResolvedValue({ url: 'https://blob.example/compressed.jpg' });

    const bigFile = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });

    const compressedFile = new File(['y'], 'big.png', { type: 'image/jpeg' });
    Object.defineProperty(compressedFile, 'size', { value: 2 * 1024 * 1024 });
    mockCompressImageFile.mockResolvedValue(compressedFile);

    render(
      <ItemForm companyId={COMPANY_ID} branchId={BRANCH_ID} categoryId={CATEGORY_ID} onClose={vi.fn()} />,
    );
    selectFile(bigFile);

    await waitFor(() => {
      expect(screen.getByAltText('Item preview')).toBeTruthy();
    });
    expect(mockCompressImageFile).toHaveBeenCalledWith(bigFile, 5 * 1024 * 1024);
    expect(mockPut).toHaveBeenCalledWith(
      expect.any(String),
      compressedFile,
      expect.objectContaining({ access: 'public', token: 'tok' }),
    );
  });

  it('shows the file-too-large message and skips the network path when compression cannot get under 5MB', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const bigFile = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(bigFile, 'size', { value: 20 * 1024 * 1024 });

    const stillTooBigFile = new File(['y'], 'huge.png', { type: 'image/jpeg' });
    Object.defineProperty(stillTooBigFile, 'size', { value: 6 * 1024 * 1024 });
    mockCompressImageFile.mockResolvedValue(stillTooBigFile);

    render(
      <ItemForm companyId={COMPANY_ID} branchId={BRANCH_ID} categoryId={CATEGORY_ID} onClose={vi.fn()} />,
    );
    selectFile(bigFile);

    await waitFor(() => {
      expect(screen.getByText('File is too large. Please choose a smaller image.')).toBeTruthy();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });
});
