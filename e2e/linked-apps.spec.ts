import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { E2E_ORIGIN, writeE2eWranglerConfig, E2E_STATE, E2E_WRANGLER } from './utils/linked-apps-env';
import { startFakeCalendar, type FakeCalendar } from './utils/fake-calendar';

/**
 * The connector panel's "Add other MCPs" section, signing in to Calendar for
 * real against a local fake of its OAuth server. Event Every's own routes, the
 * sealing, PKCE and the code exchange all run; only Calendar's origin is
 * swapped (playwright.linked-apps.config.ts).
 */
let calendar: FakeCalendar;

function d1(args: string[]) {
  return execFileSync('bunx', ['wrangler', 'd1', 'execute', 'ACCOUNTS_DB', '--local', '--config', E2E_WRANGLER, '--persist-to', E2E_STATE, ...args], { encoding: 'utf8' });
}

test.beforeAll(async () => {
  writeE2eWranglerConfig();
  calendar = await startFakeCalendar();
  // The local database starts empty: apply the real migrations once.
  const tables = d1(['--command', "select name from sqlite_master where type='table'", '--json']);
  const have = (name: string) => tables.includes(`"${name}"`);
  for (const file of readdirSync('migrations/accounts').sort()) {
    if (file < '0006' && have('account')) continue;
    if (file >= '0006' && have('linked_app')) continue;
    d1(['--file', `migrations/accounts/${file}`]);
  }
});
test.afterAll(async () => {
  await calendar.close();
});

/** Signed in, the connector lives in the account menu (AccountBar). */
async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'e2e@example.com' }).click();
  await page.getByTestId('menu-mcp').click();
}

const SESSION = 'e2e-linked-apps-session';

test.beforeEach(async ({ context }) => {
  // A signed-in person: an account and a live session row, and the cookie for it.
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 86_400_000).toISOString();
  d1([
    '--command',
    `INSERT OR IGNORE INTO account (id, email, created_at) VALUES ('acct-e2e', 'e2e@example.com', '${now}');
     DELETE FROM linked_app WHERE account_id = 'acct-e2e';
     INSERT OR REPLACE INTO session (id, account_id, created_at, expires_at) VALUES ('${SESSION}', 'acct-e2e', '${now}', '${later}');`,
  ]);
  await context.addCookies([{ name: 'ee_session', value: SESSION, url: E2E_ORIGIN }]);
});

test('Calendar signs in through a consent popup, shows Sign out, and signs in again', async ({ page }) => {
  await page.goto('/');
  await openPanel(page);

  const row = page.getByTestId('mcp-app-calendar');
  await expect(page.getByText('Add other MCPs')).toBeVisible();
  await expect(row).toContainText('Calendar');
  await expect(row.getByRole('button', { name: 'Sign in' })).toBeVisible();

  const signIn = async () => {
    const [popup] = await Promise.all([page.waitForEvent('popup'), row.getByRole('button', { name: 'Sign in' }).click()]);
    await expect(popup.getByRole('heading', { name: 'Connect an assistant?' })).toBeVisible();
    await popup.getByRole('link', { name: 'Continue' }).click();
    // Lands on our done page, tells the opener, and closes itself.
    await popup.waitForEvent('close', { timeout: 15_000 });
  };

  await signIn();
  expect(calendar.registered.at(-1)).toBe('Event Every');
  await expect(row.getByRole('button', { name: 'Sign out of Calendar' })).toBeVisible();

  await row.getByRole('button', { name: 'Sign out of Calendar' }).click();
  await row.getByRole('menu').getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(row.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(calendar.revoked.length).toBeGreaterThanOrEqual(1);

  await signIn();
  await expect(row.getByRole('button', { name: 'Sign out of Calendar' })).toBeVisible();
});

test('a cancelled consent leaves it signed out', async ({ page }) => {
  await page.goto('/');
  await openPanel(page);
  const row = page.getByTestId('mcp-app-calendar');
  const [popup] = await Promise.all([page.waitForEvent('popup'), row.getByRole('button', { name: 'Sign in' }).click()]);
  await popup.getByRole('link', { name: 'Cancel' }).click();
  await expect(popup.getByTestId('linked-app-done')).toContainText('Not signed in');
  await popup.close();
  await expect(row.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('signed out of Event Every, the section is not offered', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect your assistant' }).click();
  await expect(page.getByTestId('mcp-panel')).toBeVisible();
  await expect(page.getByText('Add other MCPs')).toHaveCount(0);
});
