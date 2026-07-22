// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { LayerConfig, CompanyNode } from '@/lib/company';

const { mockReplace, mockPush, mockUseSearchParams, mockSignOut, mockClearCookie } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockPush: vi.fn(),
  mockUseSearchParams: vi.fn(),
  mockSignOut: vi.fn(),
  mockClearCookie: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: mockUseSearchParams,
}));

vi.mock('firebase/auth', () => ({
  signOut: mockSignOut,
}));

vi.mock('@/lib/firebase-client', () => ({
  auth: {},
}));

vi.mock('@/lib/auth', () => ({
  clearFirebaseTokenCookie: mockClearCookie,
}));

// The Structure tab renders the real ManagerAdminPanel; stub it so these tests stay
// focused on the shell's tab-switching/mount-persistence mechanics, matching the
// mocking pattern already used in page.test.ts.
vi.mock('./ManagerAdminPanel', () => ({
  default: () => <div data-testid="structure-panel-content">Structure Panel Content</div>,
}));

// The Menu tab's full category/item editor behavior (publish toggle, category
// CRUD/reorder, etc.) is covered independently in MenuTab.test.tsx; stub it here
// too so these shell-mechanics tests don't depend on Firestore/manager-menu wiring.
vi.mock('./MenuTab', () => ({
  default: () => <div data-testid="menu-panel-content">Menu Panel Content</div>,
}));

// The Dashboard tab's session/order widgets and their Firestore onSnapshot wiring
// are covered independently in DashboardTab.test.tsx; stub it here too so these
// shell-mechanics tests don't depend on live Firestore listeners.
vi.mock('./DashboardTab', () => ({
  default: () => <div data-testid="dashboard-panel-content">Dashboard Panel Content</div>,
}));

import AdminShell from './AdminShell';

const layers: LayerConfig[] = [
  { index: 0, label: 'Branch', isLeafLayer: false },
  { index: 1, label: 'Table', isLeafLayer: true },
];

const initialDescendants: Omit<CompanyNode, 'createdAt'>[] = [];

const baseProps = {
  companySlug: 'test-co',
  companyId: 'company-1',
  branchId: 'branch-1',
  companyName: 'Test Co',
  branchName: 'Downtown',
  layers,
  managerNodeId: 'branch-1',
  ancestorLabels: ['Downtown'],
  initialDescendants,
  firstLeafLayerIndex: 1,
};

function setSearch(search: string) {
  mockUseSearchParams.mockReturnValue(new URLSearchParams(search));
}

function getPanel(tab: 'dashboard' | 'menu' | 'structure') {
  return document.querySelector(`[data-tab-panel="${tab}"]`) as HTMLElement | null;
}

beforeEach(() => {
  vi.clearAllMocks();
  setSearch('');
});

afterEach(() => {
  cleanup();
});

describe('AdminShell', () => {
  it('defaults to the Dashboard tab when no tab param is present', () => {
    render(<AdminShell {...baseProps} />);

    expect(getPanel('dashboard')?.style.display).toBe('block');
    expect(getPanel('menu')?.style.display).toBe('none');
    expect(getPanel('structure')?.style.display).toBe('none');
    expect(screen.getByRole('tab', { name: 'Dashboard' }).getAttribute('aria-selected')).toBe('true');
  });

  it('activates the tab named by the tab search param', () => {
    setSearch('tab=structure');
    render(<AdminShell {...baseProps} />);

    expect(getPanel('structure')?.style.display).toBe('block');
    expect(getPanel('dashboard')?.style.display).toBe('none');
    expect(getPanel('menu')?.style.display).toBe('none');
    expect(screen.getByRole('tab', { name: 'Structure' }).getAttribute('aria-selected')).toBe('true');
  });

  it('falls back to Dashboard when the tab param is not one of the three valid values', () => {
    setSearch('tab=bogus');
    render(<AdminShell {...baseProps} />);

    expect(getPanel('dashboard')?.style.display).toBe('block');
    expect(screen.getByRole('tab', { name: 'Dashboard' }).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps all three tab bodies mounted in the DOM regardless of which is active — hidden via CSS, not unmounted', () => {
    setSearch('tab=menu');
    render(<AdminShell {...baseProps} />);

    // All three panel containers exist in the DOM simultaneously...
    expect(getPanel('dashboard')).not.toBeNull();
    expect(getPanel('menu')).not.toBeNull();
    expect(getPanel('structure')).not.toBeNull();

    // ...and the inactive Structure tab's real content (ManagerAdminPanel) is present
    // in the DOM too, proving it's hidden rather than conditionally unmounted.
    expect(screen.getByTestId('structure-panel-content')).toBeTruthy();
    expect(getPanel('structure')?.style.display).toBe('none');
    expect(getPanel('menu')?.style.display).toBe('block');
  });

  it('switching tabs updates the tab query param via router.replace (not push), without scrolling', () => {
    render(<AdminShell {...baseProps} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Menu' }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/test-co/admin?tab=menu', { scroll: false });
  });

  it('switching to Structure updates the query param the same way', () => {
    render(<AdminShell {...baseProps} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Structure' }));

    expect(mockReplace).toHaveBeenCalledWith('/test-co/admin?tab=structure', { scroll: false });
  });

  it('sign-out works when the Dashboard tab is active', async () => {
    render(<AdminShell {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(mockClearCookie).toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalledWith({});
      expect(mockReplace).toHaveBeenCalledWith('/test-co/login');
    });
  });

  it('sign-out works when the Structure tab is active', async () => {
    setSearch('tab=structure');
    render(<AdminShell {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(mockClearCookie).toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalledWith({});
      expect(mockReplace).toHaveBeenCalledWith('/test-co/login');
    });
  });
});
