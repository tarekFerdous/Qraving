import { test, expect } from '@playwright/test';

// Resolves any CSS color string to blended RGB on white via an offscreen canvas.
// Handles rgb(), rgba(), oklch(), color-mix(), etc.
function canvasRgb(css: string): { r: number; g: number; b: number } | null {
  try {
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 1;
    const ctx = cvs.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  } catch {
    return null;
  }
}

test.describe('/demo-table smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo-table');
    await page.waitForSelector('button:has-text("Add")', { timeout: 15000 });
  });

  test('renders menu sections and baskets button', async ({ page }) => {
    // At least one "Add" button confirms a menu section loaded with items
    await expect(page.getByRole('button', { name: 'Add' }).first()).toBeVisible();

    // Baskets button is present
    await expect(page.getByRole('button', { name: /baskets/i })).toBeVisible();
  });

  test('page background is pure white', async ({ page }) => {
    const c = await page.evaluate(() => {
      function canvasRgb(css: string) {
        const cvs = document.createElement('canvas');
        cvs.width = cvs.height = 1;
        const ctx = cvs.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return { r, g, b };
      }
      const el = document.querySelector<HTMLElement>('[class*="bg-qraving-bg"]') ?? document.body;
      return canvasRgb(getComputedStyle(el).backgroundColor);
    });
    expect(c).toEqual({ r: 255, g: 255, b: 255 });
  });

  test('category pill has warm yellow background (not lime green)', async ({ page }) => {
    const c = await page.evaluate(() => {
      function canvasRgb(css: string) {
        const cvs = document.createElement('canvas');
        cvs.width = cvs.height = 1;
        const ctx = cvs.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return { r, g, b };
      }
      const el = document.querySelector<HTMLElement>('[data-testid="category-pill"]');
      if (!el) return null;
      return canvasRgb(getComputedStyle(el).backgroundColor);
    });
    expect(c).not.toBeNull();
    // Warm yellow: R is the dominant channel (≥ G), R is notably above B.
    // Lime-green would have G > R.
    expect(c!.r).toBeGreaterThanOrEqual(c!.g);
    expect(c!.r).toBeGreaterThan(c!.b + 20);
  });

  test('primary "Add" button has warm yellow background', async ({ page }) => {
    const c = await page.evaluate(() => {
      function canvasRgb(css: string) {
        const cvs = document.createElement('canvas');
        cvs.width = cvs.height = 1;
        const ctx = cvs.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return { r, g, b };
      }
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => !b.disabled && b.textContent?.trim().includes('Add')
      );
      if (!btn) return null;
      return canvasRgb(getComputedStyle(btn).backgroundColor);
    });
    expect(c).not.toBeNull();
    // Warm yellow: high R, R notably above B
    expect(c!.r).toBeGreaterThan(200);
    expect(c!.r).toBeGreaterThan(c!.b + 50);
  });

  test('"Add" button label text is dark (not white)', async ({ page }) => {
    const c = await page.evaluate(() => {
      function canvasRgb(css: string) {
        const cvs = document.createElement('canvas');
        cvs.width = cvs.height = 1;
        const ctx = cvs.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return { r, g, b };
      }
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => !b.disabled && b.textContent?.trim().includes('Add')
      );
      if (!btn) return null;
      return canvasRgb(getComputedStyle(btn).color);
    });
    expect(c).not.toBeNull();
    // Dark text: perceived luminance well below the midpoint (128)
    const luma = c!.r * 0.299 + c!.g * 0.587 + c!.b * 0.114;
    expect(luma).toBeLessThan(128);
  });

  test('"Up Next" strip shows at least two thumbnail images with non-zero naturalWidth', async ({ page }) => {
    // Intercept external image requests so headless Chromium (which is blocked by
    // Wikipedia's CDN and similar hosts) still gets a valid image response, making
    // naturalWidth > 0 deterministic without depending on external network access.
    // Route must be set before navigation so it catches the initial image requests.
    const oneByOnePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.route(/themealdb\.com|firebasestorage\.googleapis\.com|storage\.googleapis\.com/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: oneByOnePng });
    });
    // Reload so images are re-requested with the intercept active.
    await page.reload();
    await page.waitForSelector('button:has-text("Add")', { timeout: 15000 });

    // Wait for the Up Next strip to appear
    const strip = page.locator('[aria-label^="Next category"]');
    await expect(strip).toBeVisible({ timeout: 15000 });

    // Give images inside the strip time to load
    const thumbnails = strip.locator('img');
    await expect(thumbnails.first()).toBeVisible({ timeout: 10000 });

    const loadedCount = await thumbnails.evaluateAll((imgs: HTMLImageElement[]) =>
      imgs.filter((img) => img.naturalWidth > 0).length
    );
    expect(loadedCount).toBeGreaterThanOrEqual(2);
  });
});
