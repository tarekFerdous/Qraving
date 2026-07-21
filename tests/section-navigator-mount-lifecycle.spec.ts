import { test, expect, type Page } from '@playwright/test';

// Regression test for issue #137 (child of PRD #136): on iOS/macOS Safari,
// swiping between menu categories caused MenuCard overlay content (text,
// buttons, gradient scrim) to visibly flicker. Root cause: SectionNavigator
// only kept the active category ± 1 neighbour mounted, so a category's
// entire CardSwiper (every card, every <Image>) unmounted and remounted as
// fresh DOM every time it re-entered that window — and WebKit visibly drops
// overlay content mid-animation when that happens in the same commit as the
// section-slide transform.
//
// The fix: once a category's CardSwiper has ever mounted, it stays mounted
// for the rest of the session, even after the category falls back outside
// the ±1 window. This test asserts DOM node identity is preserved across a
// leave-and-return navigation (WebKit project — this is a WebKit-specific
// bug), and that never-approached categories still don't preload upfront.

async function swipeVertical(page: Page, direction: 'up' | 'down') {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport size available');
  const x = viewport.width / 2;
  const startY = direction === 'up' ? viewport.height * 0.6 : viewport.height * 0.3;
  const endY = direction === 'up' ? viewport.height * 0.2 : viewport.height * 0.7;

  await page.mouse.move(x, startY);
  await page.mouse.down();
  await page.mouse.move(x, (startY + endY) / 2, { steps: 5 });
  await page.mouse.move(x, endY, { steps: 5 });
  await page.mouse.up();

  // Wait out the section-slide animation (SECTION_ANIMATION_DURATION = 250ms
  // in SectionNavigator.tsx) plus a buffer before firing the next gesture.
  await page.waitForTimeout(400);
}

test.describe('SectionNavigator mount-lifecycle (Safari overlay-flicker fix)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo-table');
    await page.waitForSelector('button:has-text("Add")', { timeout: 15000 });
  });

  test('a visited category is never unmounted, even after leaving the ±1 window', async ({ page }) => {
    // Category index 0 (Italian in the seeded demo menu). Tag its first card
    // <Image> DOM node directly on `window` so a later query can check
    // reference identity — an unmount+remount produces a fresh DOM node
    // object even though it would still match the same selector.
    const section0Image = page.locator('[data-testid="menu-section-0"] img').first();
    await expect(section0Image).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="menu-section-0"] img');
      (window as unknown as { __stableNode?: Element | null }).__stableNode = el;
    });

    // Swipe up twice: category 0 -> 1 -> 2. Once the active section is 2,
    // category 0 is 2 away from active — outside the old ±1 mount window,
    // which used to unmount its CardSwiper entirely.
    await swipeVertical(page, 'up');
    await swipeVertical(page, 'up');

    // Category 0's CardSwiper must still be in the DOM — same node, not a
    // fresh remount — while it is off-screen and out of the ±1 window.
    const identityWhileAway = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="menu-section-0"] img');
      const w = window as unknown as { __stableNode?: Element | null };
      return el !== null && el === w.__stableNode;
    });
    expect(identityWhileAway).toBe(true);

    // Swipe back down twice: category 2 -> 1 -> 0.
    await swipeVertical(page, 'down');
    await swipeVertical(page, 'down');

    // Sanity check the navigation actually returned to category 0,
    // independent of the mount-lifecycle assertion below.
    await expect(page.locator('[data-testid="menu-section-0"] [data-testid="category-pill"]')).toBeVisible();

    // Revisiting must not have remounted the CardSwiper or re-created the
    // card's <Image> node.
    const identityAfterReturn = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="menu-section-0"] img');
      const w = window as unknown as { __stableNode?: Element | null };
      return el !== null && el === w.__stableNode;
    });
    expect(identityAfterReturn).toBe(true);
  });

  test('a never-visited category does not preload upfront', async ({ page }) => {
    // Category index 3 (Mexican) is never within the ±1 window of the
    // initial active section (0), so its CardSwiper must not be in the DOM
    // at all until navigation brings it into range. This guards the other
    // half of the acceptance criteria — "visited" tracking must not become
    // a full-menu upfront preload.
    const section3Images = page.locator('[data-testid="menu-section-3"] img');
    await expect(section3Images).toHaveCount(0);
  });
});
