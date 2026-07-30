// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { MenuItem } from '@/lib/manager-menu';

const { mockCreateItem, mockUpdateItem, mockUpload } = vi.hoisted(() => ({
  mockCreateItem: vi.fn(),
  mockUpdateItem: vi.fn(),
  mockUpload: vi.fn(),
}));

vi.mock('@/lib/manager-menu', () => ({
  createItem: mockCreateItem,
  updateItem: mockUpdateItem,
}));

vi.mock('@vercel/blob/client', () => ({
  upload: mockUpload,
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
});

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
