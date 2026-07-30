// @vitest-environment jsdom
//
// Regression coverage for issue #167 (child of PRD #164): the public menu
// header used to hardcode "Gordon's Kitchen" branding. It now renders the
// resolved company's real `name` and `logoUrl` (built in issue #165), with
// the Qraving/venue separator changed from "-" to "×".
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => vi.fn()),
}));

vi.mock('@/lib/firebase-client', () => ({
  db: {},
}));

vi.mock('@/lib/session-context', () => ({
  useSession: () => ({
    session: { id: 'demo-table-1', userCounter: 0, baskets: [], orderStatus: 'building', paymentDeadline: null, paymentPlan: null },
    updateSession: vi.fn(),
    isExpired: false,
    resetSession: vi.fn(),
    itemsRemovedExternally: false,
    clearItemsRemovedExternally: vi.fn(),
  }),
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/RemovedItemsToast', () => ({
  useRemovedItemsToast: () => ({ trigger: vi.fn(), Toast: null }),
}));

// The rest of the page body isn't relevant to header rendering — stub it out
// so this test only exercises the header logic.
vi.mock('@/components/SectionNavigator', () => ({ default: () => null }));
vi.mock('@/components/AddToCartSheet', () => ({ default: () => null }));
vi.mock('@/components/BasketsSheet', () => ({ default: () => null }));
vi.mock('@/components/CheckoutSheet', () => ({ default: () => null }));

import MenuPage from './MenuPage';

const baseProps = {
  sections: [],
  company: 'test-co',
  branch: 'branch-1',
  table: 'table-1',
};

afterEach(() => {
  cleanup();
});

describe('MenuPage header branding (#167)', () => {
  it('renders the company logo image alongside the "×" separator when logoUrl is set', () => {
    render(
      <MenuPage {...baseProps} companyName="Gourmet Diner" logoUrl="https://cdn.example.com/logo.png" />
    );

    expect(screen.getByText('×')).toBeTruthy();

    const img = screen.getByAltText('Gourmet Diner') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toContain(encodeURIComponent('https://cdn.example.com/logo.png'));

    // No plain-text fallback name rendered while the image is showing.
    expect(screen.queryByText('Gourmet Diner')).toBeNull();
  });

  it('renders the plain-text company name (bold, text-xl, gray-800) and attempts no image request when logoUrl is absent', () => {
    render(<MenuPage {...baseProps} companyName="No Logo Bistro" />);

    expect(screen.getByText('×')).toBeTruthy();

    const nameEl = screen.getByText('No Logo Bistro');
    expect(nameEl.tagName).toBe('SPAN');
    expect(nameEl.className).toContain('font-bold');
    expect(nameEl.className).toContain('text-xl');
    expect(nameEl.className).toContain('text-gray-800');

    // No <img> was rendered at all for the header branding.
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('falls back to the plain-text name if the logo image fails to load', () => {
    render(
      <MenuPage {...baseProps} companyName="Broken Logo Cafe" logoUrl="https://cdn.example.com/broken.png" />
    );

    const img = screen.getByAltText('Broken Logo Cafe');
    fireEvent.error(img);

    const nameEl = screen.getByText('Broken Logo Cafe');
    expect(nameEl.tagName).toBe('SPAN');
    expect(nameEl.className).toContain('font-bold');
    expect(nameEl.className).toContain('text-xl');
    expect(nameEl.className).toContain('text-gray-800');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows the "×" separator (not a hyphen) next to the Qraving wordmark', () => {
    render(<MenuPage {...baseProps} companyName="Any Co" />);

    expect(screen.getByText('Qraving')).toBeTruthy();
    expect(screen.getByText('×')).toBeTruthy();
    expect(screen.queryByText('-')).toBeNull();
  });
});
