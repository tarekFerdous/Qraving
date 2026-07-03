import { test, expect, type Locator, type Page } from '@playwright/test';

// Validates the close-and-reopen step transitions in AddToCartSheet.
// Flow: customise → [close+reopen] → identity → [close+reopen] → actions
//
// Note: "close" here means transform:translateY(100%) — the dialog stays in
// the DOM, so we verify transitions via content/aria-label changes, not DOM
// presence. Actual removal only happens when onClose fires (Add more, PASS,
// Finish, backdrop-click on identity/actions).

test.describe('AddToCartSheet step transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('button:has-text("Add")', { timeout: 15000 });
  });

  async function openSheet(page: Page) {
    await page.getByRole('button', { name: 'Add' }).first().tap();
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
  }

  // Panel 1: aria-label="Add {item name} to basket"
  // Panel 2: aria-label="Add to basket" (exact, disabled until phone complete)
  function panel1Btn(dialog: Locator) {
    return dialog.getByRole('button', { name: /^add .+ to basket$/i });
  }
  function panel2Btn(dialog: Locator) {
    return dialog.getByRole('button', { name: 'Add to basket', exact: true });
  }

  test('customise panel shows initially', async ({ page }) => {
    await openSheet(page);
    const dialog = page.locator('[role="dialog"]');

    await expect(panel1Btn(dialog)).toBeVisible();
    await expect(panel1Btn(dialog)).toBeEnabled();
    await expect(dialog.getByText("Who's ordering?")).not.toBeVisible();
  });

  test('tapping Add to basket transitions to identity panel', async ({ page }) => {
    await openSheet(page);
    const dialog = page.locator('[role="dialog"]');

    await panel1Btn(dialog).tap();

    // New content appears — identity panel loaded
    await expect(dialog.getByText("Who's ordering?")).toBeVisible({ timeout: 800 });
    await expect(dialog.getByLabel('Area code')).toBeVisible();
    // aria-label reflects the new step
    await expect(dialog).toHaveAttribute('aria-label', "Who's ordering?");
  });

  test('identity backdrop-click closes sheet without showing actions', async ({ page }) => {
    await openSheet(page);
    const dialog = page.locator('[role="dialog"]');

    // Transition to identity
    await panel1Btn(dialog).tap();
    await expect(dialog.getByText("Who's ordering?")).toBeVisible({ timeout: 800 });

    // Get basket count before dismissal
    const badge = page.locator('button', { hasText: 'Baskets' }).locator('span');
    const countBefore = (await badge.isVisible()) ? parseInt((await badge.textContent()) ?? '0') : 0;

    // Click the backdrop (has onClick — works in headless)
    await page.mouse.click(10, 10);

    // After onClose fires (~300ms), item → null → dialog removed from DOM
    await expect(dialog).not.toBeAttached({ timeout: 1000 });

    // Actions panel must NOT have appeared (item was not committed)
    const countAfter = (await badge.isVisible()) ? parseInt((await badge.textContent()) ?? '0') : 0;
    expect(countAfter).toBe(countBefore);
  });

  test('completing identity transitions to actions panel', async ({ page }) => {
    await openSheet(page);
    const dialog = page.locator('[role="dialog"]');

    // Step 1 → step 2
    await panel1Btn(dialog).tap();
    await expect(dialog.getByText("Who's ordering?")).toBeVisible({ timeout: 800 });

    // Fill phone
    await dialog.getByLabel('Area code').fill('416');
    await dialog.getByLabel('Exchange').fill('555');
    await dialog.getByLabel('Subscriber number').fill('1234');
    await expect(panel2Btn(dialog)).toBeEnabled();

    // Step 2 → step 3
    await panel2Btn(dialog).tap();

    // Actions panel appears
    await expect(dialog.getByRole('button', { name: 'Add more' })).toBeVisible({ timeout: 800 });
    await expect(dialog.getByRole('button', { name: 'PASS' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Finish' })).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-label', 'What would you like to do?');
  });

  test('Add more closes sheet and removes it from DOM', async ({ page }) => {
    await openSheet(page);
    const dialog = page.locator('[role="dialog"]');

    // Full flow to actions
    await panel1Btn(dialog).tap();
    await expect(dialog.getByText("Who's ordering?")).toBeVisible({ timeout: 800 });
    await dialog.getByLabel('Area code').fill('416');
    await dialog.getByLabel('Exchange').fill('555');
    await dialog.getByLabel('Subscriber number').fill('1234');
    await expect(panel2Btn(dialog)).toBeEnabled();
    await panel2Btn(dialog).tap();
    await expect(dialog.getByRole('button', { name: 'Add more' })).toBeVisible({ timeout: 800 });

    // Tap Add more — onClose fires → selectedItem null → dialog removed
    await dialog.getByRole('button', { name: 'Add more' }).tap();
    await expect(dialog).not.toBeAttached({ timeout: 1000 });
  });
});
