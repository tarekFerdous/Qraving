import { test, expect } from '@playwright/test';

// Regression test for issue #138 (child of PRD #136): every MenuCard set up
// an unconditional perspective + transform-style:preserve-3d 3D rendering
// context (plus the backfaceVisibility opacity-toggle workaround) at ALL
// times, even though it exists solely to support the "Allergies & More"
// flip-to-back-face interaction. Most cards are never flipped, so they paid
// for an always-on 3D compositing context for no visual benefit — and
// WebKit is fragile at recompositing z-indexed, overflow:hidden children of
// a preserve-3d/perspective context while an ancestor (the category/card
// swiper) is mid-transform.
//
// The fix: the perspective/preserve-3d wrapper and the backfaceVisibility
// workaround are only applied while a card is flipped or actively
// transitioning between faces — never at rest.

test.describe('MenuCard flip — conditional 3D context (#138)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo-table');
    await page.waitForSelector('button:has-text("Allergies & More")', { timeout: 15000 });
  });

  test('a never-flipped card has no active perspective/preserve-3d context', async ({ page }) => {
    const active = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Allergies & More')
      );
      if (!btn) return null;
      let node: HTMLElement | null = btn;
      while (node) {
        const style = getComputedStyle(node);
        if (style.transformStyle === 'preserve-3d' || style.perspective !== 'none') {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    });

    expect(active).toBe(false);
  });

  test('tapping Allergies & More flips to the back face and activates the 3D context', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Allergies & More' }).first().tap();

    // Back face content (unique to the flipped state) becomes visible.
    await expect(page.locator('h3', { hasText: 'Description' }).first()).toBeVisible({
      timeout: 1000,
    });

    const active = await page.evaluate(() => {
      const heading = [...document.querySelectorAll('h3')].find(
        (h) => h.textContent?.trim() === 'Description'
      );
      if (!heading) return null;
      let node: HTMLElement | null = heading;
      while (node) {
        const style = getComputedStyle(node);
        if (style.transformStyle === 'preserve-3d' || style.perspective !== 'none') {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    });

    expect(active).toBe(true);
  });

  test('flipping back to the front face still works and eventually tears the context back down', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Allergies & More' }).first().tap();
    await expect(page.locator('h3', { hasText: 'Description' }).first()).toBeVisible({
      timeout: 1000,
    });

    await page.getByRole('button', { name: 'Back to item' }).first().tap();

    // Front face is interactive again.
    await expect(page.getByRole('button', { name: 'Allergies & More' }).first()).toBeVisible({
      timeout: 1000,
    });

    // The 3D context lingers through the closing transition, then tears down.
    // (Transition is 450ms; give it a generous buffer.)
    await page.waitForTimeout(700);

    const stillActive = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Allergies & More')
      );
      if (!btn) return null;
      let node: HTMLElement | null = btn;
      while (node) {
        const style = getComputedStyle(node);
        if (style.transformStyle === 'preserve-3d' || style.perspective !== 'none') {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    });

    expect(stillActive).toBe(false);
  });
});
