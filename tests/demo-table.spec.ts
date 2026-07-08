import { test, expect } from '@playwright/test';

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
});
