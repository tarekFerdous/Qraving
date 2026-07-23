import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  seedAdminTestFixture,
  teardownAdminTestFixture,
  gotoAuthenticatedAdmin,
  type AdminTestFixture,
} from './helpers/admin-auth';

// Regression test for issue #155 (child of PRD #154): the manager admin
// shell at /[companySlug]/admin used to render as an ordinary
// `min-h-screen` document with a `sticky top-0` header and no dedicated
// scroll container for its tab content. That relied on normal
// document/window scroll to reveal overflow — but `app/globals.css` sets a
// global `html, body { position: fixed; overflow: hidden }` (intentional,
// for iOS rubber-band suppression on the customer ordering flow). The net
// effect: whenever a tab's content was taller than the viewport, the extra
// content was simply unreachable — nothing on the page could scroll at all.
//
// The fix makes AdminShell a fixed-height flex column with a non-scrolling
// header and three independently-scrollable tab panels (one per
// Dashboard/Menu/Structure), so each panel scrolls on its own and keeps its
// own scroll position when the manager switches tabs and back.
//
// This spec asserts only observable scroll behavior — never Tailwind
// classes or DOM structure — so it stays valid across any future
// implementation of the same contract:
//   1. each tab's overflowing content can actually be scrolled into view,
//   2. the header/tab bar never moves while a tab's content scrolls
//      beneath it,
//   3. scrolling one tab, switching away, and switching back preserves that
//      tab's scroll offset instead of resetting it to the top.
//
// Run at both a desktop viewport (1440x900) and an iPhone 12/13-sized
// viewport (390x844) since the underlying bug (global document-scroll
// suppression) and its fix (per-panel scroll containers) apply identically
// regardless of viewport size.

const TABS = ['dashboard', 'menu', 'structure'] as const;
type Tab = (typeof TABS)[number];

/** Number of `sessions` docs written by `seedDashboardOverflowData` — see its
 *  doc comment for why this (and not `orders`) is what makes Dashboard
 *  overflow. Comfortably overflows both the 1440x900 and 390x844 viewports
 *  under test (measured ~5000px of content against a ~730-790px panel). */
const DASHBOARD_OVERFLOW_SESSION_COUNT = 60;

/**
 * `seedAdminTestFixture()` (from #156) seeds enough Structure nodes/QR codes
 * and Menu categories/items to overflow one viewport in the Menu and
 * Structure tabs by default, but the Dashboard tab's content (Active
 * Sessions / Incoming Orders widgets in DashboardTab.tsx) comes from live
 * Firestore collections that the shared fixture never populates — with none
 * seeded, Dashboard renders just three short summary cards, which fit inside
 * any viewport under test and would never exercise the scroll fix at all.
 *
 * Rather than modifying the shared `tests/helpers/admin-auth.ts` fixture
 * (out of scope here — it's relied on by other specs too), this writes extra
 * `sessions` docs directly, scoped to this fixture's `companyId`/`branchId`,
 * in the shape DashboardTab.tsx's `SessionDoc` reads. They live under
 * `companies/{companyId}/...`, so `teardownAdminTestFixture`'s
 * `recursiveDelete` on the company doc cleans them up along with everything
 * else — no separate teardown needed here.
 *
 * Deliberately `sessions`, not `orders`: DashboardTab's Incoming Orders
 * widget reads `companies/{companyId}/branches/{branchId}/orders`, which
 * `firestore.rules` gates to an authenticated manager
 * (`isManagerFor(companyId)`). `gotoAuthenticatedAdmin` (#156) only injects
 * the `firebase-token` cookie the *server* reads for the page-load role gate
 * (`requireRole`, lib/auth-server.ts) — it never signs the *client* Firebase
 * Auth SDK in, which is what the browser's `onSnapshot` calls actually check
 * against. So any client-side read gated on `request.auth` (like `orders`)
 * silently fails with `permission-denied` and never renders in this test
 * setup, no matter what's seeded — confirmed by inspecting the browser
 * console while developing this spec. `sessions`, however, is
 * `allow read, write: if true` (world-readable, used by the anonymous
 * customer ordering flow), so it renders with no auth at all and is a
 * reliable way to make Dashboard overflow.
 */
async function seedDashboardOverflowData(fixture: AdminTestFixture): Promise<void> {
  // Dynamic import (not a static top-level import) so this only runs at test
  // time, well after admin-auth.ts's module-level `dotenv.config()` has
  // already populated `process.env.FIREBASE_SERVICE_ACCOUNT_JSON` — matching
  // the lazy-load pattern admin-auth.ts itself uses for the same reason.
  const { adminDb } = await import('@/lib/firebase-admin');
  const { Timestamp } = await import('firebase-admin/firestore');

  const branchRef = adminDb.doc(`companies/${fixture.companyId}/branches/${fixture.branchId}`);
  const now = Timestamp.now();

  const sessionsBatch = adminDb.batch();
  for (let i = 0; i < DASHBOARD_OVERFLOW_SESSION_COUNT; i++) {
    const ref = branchRef.collection('sessions').doc();
    sessionsBatch.set(ref, {
      orderStatus: i % 5 === 0 ? 'payment_pending' : 'building',
      userCounter: (i % 4) + 1,
      lastActivity: now,
    });
  }
  await sessionsBatch.commit();
}

function panelLocator(page: Page, tab: Tab): Locator {
  return page.locator(`[data-tab-panel="${tab}"]`);
}

function tabButtonLocator(page: Page, tab: Tab): Locator {
  const label = tab[0].toUpperCase() + tab.slice(1);
  return page.getByRole('tab', { name: label });
}

/**
 * Both DashboardTab (Active Sessions widget) and MenuTab (`subscribeCategories`
 * in lib/manager-menu.ts) populate their overflowing content from a live
 * Firestore `onSnapshot` listener (a real network round-trip against the
 * live project, no emulator) rather than data present at first render — so a
 * tab can look empty for a brief moment right after navigation even though
 * the fix under test has nothing to do with it. (Structure, by contrast,
 * receives its node tree as an `initialDescendants` prop from the server
 * component, so it's already fully rendered on first paint and this simply
 * resolves immediately for it.) Callers must wait for actual overflow before
 * trusting `scrollHeight` — otherwise the panel gets measured mid-load,
 * while it still shows an empty/partial state and doesn't yet overflow.
 * Polls the overflow condition itself (scrollHeight > clientHeight) rather
 * than any specific count/text, so it works for all three tabs uniformly
 * and tolerates data arriving across more than one snapshot.
 */
async function waitForTabOverflow(page: Page, tab: Tab): Promise<void> {
  const panel = panelLocator(page, tab);
  await expect
    .poll(async () => panel.evaluate((el) => el.scrollHeight > el.clientHeight), {
      timeout: 45000,
      message: `tab=${tab} panel never received enough content to overflow`,
    })
    .toBe(true);
}

/** Scrolls a tab panel as far down as it will go and returns the resulting
 *  scrollTop. Uses the panel's own scrollTop rather than mouse-wheel
 *  simulation so the assertion is about whether the panel *can* scroll at
 *  all (the exact regression) rather than about wheel-event plumbing. */
async function scrollPanelToBottom(panel: Locator): Promise<number> {
  return panel.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
}

async function getScrollMetrics(panel: Locator): Promise<{ scrollTop: number; scrollHeight: number; clientHeight: number }> {
  return panel.evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
}

async function forEachTab(
  page: Page,
  fixture: AdminTestFixture,
  fn: (tab: Tab) => Promise<void>,
) {
  for (const tab of TABS) {
    await gotoAuthenticatedAdmin(page, fixture, { tab });
    await waitForTabOverflow(page, tab);
    await fn(tab);
  }
}

function registerScrollSuite(viewportLabel: string, viewport: { width: number; height: number }) {
  test.describe(`AdminShell scroll fix (#155) — ${viewportLabel}`, () => {
    test.use({ viewport });
    // Generous timeout: each test drives real navigations against a live
    // Firestore project (no emulator) across up to three tabs, including a
    // wait for a live `onSnapshot` listener to deliver enough seeded
    // Dashboard data to overflow — comfortably beyond the config default
    // (30s) is needed to avoid flaking under normal network latency.
    test.describe.configure({ timeout: 90_000 });

    let fixture: AdminTestFixture;

    test.beforeAll(async () => {
      fixture = await seedAdminTestFixture();
      await seedDashboardOverflowData(fixture);
    });

    test.afterAll(async () => {
      await teardownAdminTestFixture(fixture);
    });

    test('each tab has overflowing content that can be scrolled into view', async ({ page }) => {
      await forEachTab(page, fixture, async (tab) => {
        const panel = panelLocator(page, tab);
        await expect(panel).toBeVisible();

        const before = await getScrollMetrics(panel);
        // The fixture seeds enough Areas/Tables (with QR codes) and menu
        // categories/items to overflow one viewport in every tab — this is
        // a sanity check on the fixture, not the fix itself.
        expect(before.scrollHeight, `tab=${tab} before=${JSON.stringify(before)}`).toBeGreaterThan(
          before.clientHeight,
        );
        expect(before.scrollTop, `tab=${tab}`).toBe(0);

        const afterScrollTop = await scrollPanelToBottom(panel);
        // Pre-fix, the panel has no scroll container of its own and the
        // document itself cannot scroll (global overflow: hidden), so
        // scrollTop stays pinned at 0 no matter what we set it to. Post-fix,
        // the panel is its own `overflow-y-auto` region and actually moves.
        expect(afterScrollTop, `tab=${tab}`).toBeGreaterThan(0);

        const after = await getScrollMetrics(panel);
        // Scrolled all the way to (or effectively touching) the bottom —
        // the last of the overflowing content is now reachable.
        expect(after.scrollTop + after.clientHeight, `tab=${tab} after=${JSON.stringify(after)}`).toBeGreaterThanOrEqual(
          after.scrollHeight - 1,
        );
      });
    });

    test('header/tab bar stays fixed in place while tab content scrolls beneath it', async ({ page }) => {
      await forEachTab(page, fixture, async (tab) => {
        const tablist = page.getByRole('tablist');
        await expect(tablist).toBeVisible();

        const boxBefore = await tablist.boundingBox();
        expect(boxBefore).not.toBeNull();

        const panel = panelLocator(page, tab);
        await scrollPanelToBottom(panel);

        // Give layout a tick to settle, then confirm the tab bar has not
        // moved even a pixel — it must stay outside the scrolling region.
        const boxAfter = await tablist.boundingBox();
        expect(boxAfter).not.toBeNull();
        expect(boxAfter).toEqual(boxBefore);
        await expect(tablist).toBeVisible();
      });
    });

    test('switching tabs and back preserves each tab scroll position', async ({ page }) => {
      // Scroll Dashboard partway down, then Menu partway down (a different
      // offset), then Structure fully to the bottom — three distinct
      // offsets across the three panels, all mounted simultaneously.
      const targetScrollTops: Partial<Record<Tab, number>> = {};

      await gotoAuthenticatedAdmin(page, fixture, { tab: 'dashboard' });
      await waitForTabOverflow(page, 'dashboard');
      const dashboardPanel = panelLocator(page, 'dashboard');
      const dashboardMetrics = await getScrollMetrics(dashboardPanel);
      const dashboardTarget = Math.floor((dashboardMetrics.scrollHeight - dashboardMetrics.clientHeight) / 2);
      await dashboardPanel.evaluate((el, top) => {
        el.scrollTop = top;
      }, dashboardTarget);
      targetScrollTops.dashboard = await dashboardPanel.evaluate((el) => el.scrollTop);
      expect(targetScrollTops.dashboard).toBeGreaterThan(0);

      // Switch to Menu (still on the same page — a tab click, not a fresh
      // navigation) and scroll it to the very bottom.
      await tabButtonLocator(page, 'menu').click();
      const menuPanel = panelLocator(page, 'menu');
      await expect(menuPanel).toBeVisible();
      await waitForTabOverflow(page, 'menu');
      targetScrollTops.menu = await scrollPanelToBottom(menuPanel);
      expect(targetScrollTops.menu).toBeGreaterThan(0);

      // Switch to Structure and scroll it partway too.
      await tabButtonLocator(page, 'structure').click();
      const structurePanel = panelLocator(page, 'structure');
      await expect(structurePanel).toBeVisible();
      await waitForTabOverflow(page, 'structure');
      const structureMetrics = await getScrollMetrics(structurePanel);
      const structureTarget = Math.floor((structureMetrics.scrollHeight - structureMetrics.clientHeight) / 3);
      await structurePanel.evaluate((el, top) => {
        el.scrollTop = top;
      }, structureTarget);
      targetScrollTops.structure = await structurePanel.evaluate((el) => el.scrollTop);
      expect(targetScrollTops.structure).toBeGreaterThan(0);

      // Now hop back to Dashboard (via tab click, not reload) and confirm
      // its scroll offset is exactly where it was left — not reset to 0.
      await tabButtonLocator(page, 'dashboard').click();
      await expect(dashboardPanel).toBeVisible();
      const dashboardAfter = await dashboardPanel.evaluate((el) => el.scrollTop);
      expect(dashboardAfter).toBe(targetScrollTops.dashboard);

      // Menu, still scrolled to the bottom from before.
      await tabButtonLocator(page, 'menu').click();
      await expect(menuPanel).toBeVisible();
      const menuAfter = await menuPanel.evaluate((el) => el.scrollTop);
      expect(menuAfter).toBe(targetScrollTops.menu);

      // Structure, likewise unchanged.
      await tabButtonLocator(page, 'structure').click();
      await expect(structurePanel).toBeVisible();
      const structureAfter = await structurePanel.evaluate((el) => el.scrollTop);
      expect(structureAfter).toBe(targetScrollTops.structure);
    });
  });
}

registerScrollSuite('desktop 1440x900', { width: 1440, height: 900 });
registerScrollSuite('mobile 390x844 (iPhone 12/13-sized)', { width: 390, height: 844 });
