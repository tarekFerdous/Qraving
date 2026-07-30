// Regression coverage for issue #167 (child of PRD #164): /demo-table has no
// real Company document behind it, so its header must always show the
// hardcoded "Demo Restaurant" label with no logoUrl — independent of
// whatever any real company's data looks like. This calls the async Server
// Component function directly and inspects the <MenuPage> element it
// produces, rather than rendering (which would require a live Firestore-backed
// getMenu call).
import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('@/lib/menu', () => ({
  getMenu: vi.fn().mockResolvedValue([]),
}));

// MenuPage transitively imports '@/lib/firebase-client', which calls
// getAuth()/getStorage() at module-load time and throws without real
// Firebase env vars. Stub it out since this test never renders MenuPage —
// it only checks the React element MenuPage-the-function produces.
vi.mock('@/lib/firebase-client', () => ({
  db: {},
  auth: {},
  storage: {},
}));

import DemoTablePage from './page';
import MenuPage from '@/components/MenuPage';

describe('/demo-table page (#167)', () => {
  it('always passes the hardcoded "Demo Restaurant" label with no logoUrl to MenuPage', async () => {
    const element = (await DemoTablePage()) as ReactElement<{
      companyName: string;
      logoUrl?: string;
      company: string;
      branch: string;
      table: string;
    }>;

    expect(element.type).toBe(MenuPage);
    expect(element.props.companyName).toBe('Demo Restaurant');
    expect(element.props.logoUrl).toBeUndefined();
    expect(element.props.company).toBe('demo-company');
    expect(element.props.branch).toBe('demo-branch');
    expect(element.props.table).toBe('demo-table-1');
  });
});
