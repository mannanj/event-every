import { expect, test } from '@playwright/test';

test('community exhaustion exposes no pattern or admin bypass', async ({ page }) => {
  await page.goto('/spent');

  await expect(page.getByTestId('community-limit-screen')).toBeVisible();
  await expect(page.getByTestId('enter-pattern-link')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Draw Pattern to Unlock' })).toHaveCount(0);

  const verify = await page.request.post('/api/auth/verify', { data: { pattern: [0, 3, 6, 7, 8] } });
  expect(verify.status()).toBe(410);
  const check = await page.request.get('/api/auth/check');
  expect(await check.json()).toEqual({ authenticated: false });
  const logout = await page.request.post('/api/auth/logout');
  expect(logout.status()).toBe(200);
  expect(logout.headers()['set-cookie']).toBeUndefined();

  await page.goto('/?unlock');
  await expect(page.getByRole('heading', { name: 'Draw Pattern to Unlock' })).toHaveCount(0);
  await expect(page.getByTestId('input-box')).toBeVisible();
});
