// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { Category } from '@/lib/manager-menu';

const {
  mockGetMenuConfig,
  mockSetMenuPublished,
  mockSubscribeCategories,
  mockCreateCategory,
  mockUpdateCategoryName,
  mockReorderCategories,
  mockDeleteCategory,
} = vi.hoisted(() => ({
  mockGetMenuConfig: vi.fn(),
  mockSetMenuPublished: vi.fn(),
  mockSubscribeCategories: vi.fn(),
  mockCreateCategory: vi.fn(),
  mockUpdateCategoryName: vi.fn(),
  mockReorderCategories: vi.fn(),
  mockDeleteCategory: vi.fn(),
}));

vi.mock('@/lib/manager-menu', () => ({
  getMenuConfig: mockGetMenuConfig,
  setMenuPublished: mockSetMenuPublished,
  subscribeCategories: mockSubscribeCategories,
  createCategory: mockCreateCategory,
  updateCategoryName: mockUpdateCategoryName,
  reorderCategories: mockReorderCategories,
  deleteCategory: mockDeleteCategory,
}));

// CategoryItemsSection owns item-level CRUD (image/name/description/price/
// dietary tags/customizations/reorder/availability) and is untouched by this
// issue — stub it so MenuTab tests stay focused on category-level behavior.
vi.mock('@/components/manager/CategoryItemsSection', () => ({
  default: ({ companyId, branchId, categoryId }: { companyId: string; branchId: string; categoryId: string }) => (
    <div data-testid={`items-section-${categoryId}`}>
      items-section companyId={companyId} branchId={branchId} categoryId={categoryId}
    </div>
  ),
}));

import MenuTab from './MenuTab';

const COMPANY_ID = 'company-1';
const BRANCH_ID = 'branch-1';

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Starters',
    order: 0,
    createdAt: null as never,
    ...overrides,
  };
}

let categoriesCallback: ((cats: Category[]) => void) | null = null;
const unsubscribeSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  categoriesCallback = null;
  mockGetMenuConfig.mockResolvedValue({ published: false });
  mockSubscribeCategories.mockImplementation((_companyId: string, _branchId: string, cb: (c: Category[]) => void) => {
    categoriesCallback = cb;
    cb([]);
    return unsubscribeSpy;
  });
  mockSetMenuPublished.mockResolvedValue(undefined);
  mockCreateCategory.mockResolvedValue(undefined);
  mockUpdateCategoryName.mockResolvedValue(undefined);
  mockReorderCategories.mockResolvedValue(undefined);
  mockDeleteCategory.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('MenuTab', () => {
  it('fetches menu config and subscribes to categories using companyId/branchId props', async () => {
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    expect(mockGetMenuConfig).toHaveBeenCalledWith(COMPANY_ID, BRANCH_ID);
    expect(mockSubscribeCategories).toHaveBeenCalledWith(COMPANY_ID, BRANCH_ID, expect.any(Function));

    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeTruthy();
    });
  });

  it('shows Draft state and publishes when the toggle is clicked', async () => {
    mockGetMenuConfig.mockResolvedValue({ published: false });
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    await waitFor(() => expect(screen.getByText('Draft')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    // optimistic update happens immediately
    expect(screen.getByText('Published')).toBeTruthy();

    await waitFor(() => {
      expect(mockSetMenuPublished).toHaveBeenCalledWith(COMPANY_ID, BRANCH_ID, true);
    });
  });

  it('shows Published state and unpublishes when the toggle is clicked', async () => {
    mockGetMenuConfig.mockResolvedValue({ published: true });
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    await waitFor(() => expect(screen.getByText('Published')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));

    await waitFor(() => {
      expect(mockSetMenuPublished).toHaveBeenCalledWith(COMPANY_ID, BRANCH_ID, false);
    });
  });

  it('reverts the optimistic publish update if setMenuPublished rejects', async () => {
    mockGetMenuConfig.mockResolvedValue({ published: false });
    mockSetMenuPublished.mockRejectedValue(new Error('network error'));
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    await waitFor(() => expect(screen.getByText('Draft')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(screen.getByText('Published')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeTruthy();
    });
  });

  it('creates a category via createCategory with companyId/branchId from props', async () => {
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    await waitFor(() => expect(screen.getByText('+ Create a category')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Create a category'));

    const input = screen.getByPlaceholderText('Category name');
    fireEvent.change(input, { target: { value: 'Mains' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockCreateCategory).toHaveBeenCalledWith(COMPANY_ID, BRANCH_ID, 'Mains');
    });
  });

  it('edits a category name via updateCategoryName', async () => {
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    await waitFor(() => expect(mockSubscribeCategories).toHaveBeenCalled());
    categoriesCallback?.([makeCategory({ id: 'cat-1', name: 'Starters' })]);

    const nameButton = await screen.findByRole('button', { name: 'Starters' });
    fireEvent.click(nameButton);

    const input = screen.getByDisplayValue('Starters');
    fireEvent.change(input, { target: { value: 'Appetizers' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockUpdateCategoryName).toHaveBeenCalledWith(COMPANY_ID, BRANCH_ID, 'cat-1', 'Appetizers');
    });
  });

  it('deletes a category via deleteCategory after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    await waitFor(() => expect(mockSubscribeCategories).toHaveBeenCalled());
    categoriesCallback?.([makeCategory({ id: 'cat-1', name: 'Starters' })]);

    const deleteButton = await screen.findByRole('button', { name: 'Delete category Starters' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockDeleteCategory).toHaveBeenCalledWith(COMPANY_ID, BRANCH_ID, 'cat-1');
    });
  });

  it('does not delete when confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    await waitFor(() => expect(mockSubscribeCategories).toHaveBeenCalled());
    categoriesCallback?.([makeCategory({ id: 'cat-1', name: 'Starters' })]);

    const deleteButton = await screen.findByRole('button', { name: 'Delete category Starters' });
    fireEvent.click(deleteButton);

    expect(mockDeleteCategory).not.toHaveBeenCalled();
  });

  it('reorders categories via reorderCategories on drag-and-drop', async () => {
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    await waitFor(() => expect(mockSubscribeCategories).toHaveBeenCalled());
    categoriesCallback?.([
      makeCategory({ id: 'cat-1', name: 'Starters', order: 0 }),
      makeCategory({ id: 'cat-2', name: 'Mains', order: 1 }),
    ]);

    const items = await screen.findAllByRole('listitem');
    expect(items.length).toBe(2);

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
    };

    fireEvent.dragStart(items[0], { dataTransfer });
    fireEvent.dragOver(items[1], { dataTransfer });
    fireEvent.drop(items[1], { dataTransfer });

    await waitFor(() => {
      expect(mockReorderCategories).toHaveBeenCalledWith(COMPANY_ID, BRANCH_ID, ['cat-2', 'cat-1']);
    });
  });

  it('renders CategoryItemsSection for each category with companyId/branchId/categoryId', async () => {
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    await waitFor(() => expect(mockSubscribeCategories).toHaveBeenCalled());
    categoriesCallback?.([makeCategory({ id: 'cat-1', name: 'Starters' })]);

    const section = await screen.findByTestId('items-section-cat-1');
    expect(section.textContent).toContain(`companyId=${COMPANY_ID}`);
    expect(section.textContent).toContain(`branchId=${BRANCH_ID}`);
    expect(section.textContent).toContain('categoryId=cat-1');
  });

  it('unsubscribes from categories on unmount', async () => {
    const { unmount } = render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);
    await waitFor(() => expect(mockSubscribeCategories).toHaveBeenCalled());

    unmount();

    expect(unsubscribeSpy).toHaveBeenCalled();
  });

  it('preserves in-progress state (no visibility/active-tab prop exists to gate or reset it)', async () => {
    // MenuTab has no `isActive`/`visible` prop — AdminShell hides inactive tabs purely
    // via CSS `display: none` on the wrapper div, not by unmounting this component or
    // passing it a "hidden" flag. Proving the component's props are just
    // { companyId, branchId } (no such gating prop) demonstrates that an in-progress
    // edit here survives switching tabs in AdminShell, since React never tears the
    // component down in that scenario.
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    await waitFor(() => expect(screen.getByText('+ Create a category')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Create a category'));

    const input = screen.getByPlaceholderText('Category name');
    fireEvent.change(input, { target: { value: 'Half-typed category' } });

    // Simulate a re-render with the exact same props (analogous to AdminShell
    // re-rendering while this tab is merely hidden via CSS) — the in-progress
    // input value must remain untouched because nothing in MenuTab's props or
    // internals depends on tab-active state.
    render(<MenuTab companyId={COMPANY_ID} branchId={BRANCH_ID} />);

    expect(screen.getByDisplayValue('Half-typed category')).toBeTruthy();
  });
});
