import { expect, test } from '@playwright/test';

/**
 * The smoke test that runs after a deploy.
 *
 * WHY THIS FILE HAD TO EXIST BEFORE ANY OF IT MEANT ANYTHING. `playwright.config.ts`
 * narrows to `/prod\.spec\.ts/` when E2E_TARGET=prod, and this file was not
 * there. Playwright matched nothing, found no tests, and exited 0 - so
 * `test:e2e:prod` reported green having run not one assertion, against a
 * PROD_URL that pointed at a domain the app is no longer deployed to.
 *
 * A green test that runs nothing is worse than no test. It answers the question
 * "did the deploy work" with a yes it did not earn.
 *
 * WHAT BELONGS HERE. Only things that are true of a healthy deployment and that
 * cost a stranger nothing: no sign-in, no scan, no provider call. The owner
 * budget is $1/day shared by everyone, so a smoke test that scanned would spend
 * real money on every run and could itself exhaust the day.
 */

test.describe('a healthy deployment', () => {
  test('serves the app', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/event every/i);
  });

  test('the header is there, which means the bundle ran', async ({ page }) => {
    // A blank 200 is the failure this catches: the HTML arrives and the app
    // never boots. Something React rendered has to be visible.
    await page.goto('/');
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('the way in is reachable', async ({ page }) => {
    const response = await page.goto('/signin');
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('signin-email')).toBeVisible();
  });

  test('sign-in config answers, which means D1 and the bindings are up', async ({ request }) => {
    // `/api/auth/config` is the cheapest endpoint that proves the Worker is
    // running with its accounts bindings rather than just serving assets.
    const response = await request.get('/api/auth/config');
    expect(response.status()).toBe(200);
    expect(await response.json()).toHaveProperty('turnstile');
  });

  test('an unauthenticated sync pull is refused, not served', async ({ request }) => {
    // The one authorization assertion worth making from outside: the endpoint
    // that returns somebody's events must not answer a request with no cookie.
    const response = await request.get('/api/sync/pull');
    expect([401, 503]).toContain(response.status());
  });

  test('an unauthenticated MCP read is refused', async ({ request }) => {
    // Same, for the surface this branch adds. No actor token, no events.
    const response = await request.get('/api/mcp/events?from=2026-01-01');
    expect([401, 503]).toContain(response.status());
  });

  test('the route manifest is enforced at the edge', async ({ request }) => {
    // A GET at a POST-only route must be refused by admission before it
    // reaches any handler, with the Allow header naming the one method.
    const response = await request.get('/api/scan');
    expect(response.status()).toBe(405);
    expect(response.headers().allow).toBe('POST');
  });
});
