import { test, expect } from '@playwright/test';

// The unlock pattern lives only in .env.local (gitignored) as TEST_AUTH_PATTERN
// (comma-separated grid indices) — never committed. Without it, prod tests skip.
const RAW = process.env.TEST_AUTH_PATTERN;
const PATTERN = RAW ? RAW.split(',').map(n => parseInt(n.trim(), 10)) : null;

test.describe('Production (summonit.app) — real stack', () => {
  test.skip(!PATTERN, 'Set TEST_AUTH_PATTERN in .env.local to run the prod suite');

  test.beforeEach(async ({ page }) => {
    // Real auth: POST the pattern to get the httpOnly cookie, then load the app.
    const res = await page.request.post('/api/auth/verify', { data: { pattern: PATTERN } });
    if (res.status() === 429) test.skip(true, 'Prod auth rate-limited — try again later');
    expect(res.ok(), 'auth verify should succeed with TEST_AUTH_PATTERN').toBeTruthy();
    await page.goto('/');
    await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible', timeout: 30000 });
  });

  test('real text parse produces an event end-to-end', async ({ page }) => {
    const ta = page.locator('[data-testid="smart-input-textarea"]');
    await ta.fill('Dinner with Sam on June 15 2026 at 7pm');
    await ta.press('Meta+Enter');

    const title = page.locator('h3.font-bold').first();
    const rateLimited = page.getByText(/daily limit/i).first();
    await expect(title.or(rateLimited)).toBeVisible({ timeout: 60000 });
    if (await rateLimited.isVisible()) test.skip(true, 'Prod daily rate limit reached');
    await expect(title).not.toHaveText('');
  });

  test('draft persists across reload', async ({ page }) => {
    const ta = page.locator('[data-testid="smart-input-textarea"]');
    await ta.fill('Prod draft persistence check');
    await page.waitForTimeout(1000);
    await page.reload();
    await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible' });
    await expect(page.locator('[data-testid="smart-input-textarea"]')).toHaveText('Prod draft persistence check', {
      timeout: 10000,
    });
  });

  test('transformed input is saved to history', async ({ page }) => {
    const ta = page.locator('[data-testid="smart-input-textarea"]');
    await ta.fill('Prod history check on June 20 2026 at 3pm');
    await ta.press('Meta+Enter');

    const title = page.locator('h3.font-bold').first();
    const rateLimited = page.getByText(/daily limit/i).first();
    await expect(title.or(rateLimited)).toBeVisible({ timeout: 60000 });
    if (await rateLimited.isVisible()) test.skip(true, 'Prod daily rate limit reached');

    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-history-card"]').first()).toContainText('Prod history check');
    await expect(page.locator('[data-testid="input-history-search"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="input-history-modal"]')).toBeHidden();
  });
});
