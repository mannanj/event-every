/**
 * Validate the app the way production runs it, not the way tests mock it.
 *
 * Builds the Cloudflare Worker bundle (the same artifact `wrangler deploy`
 * ships), serves it locally with `wrangler dev` reading real provider secrets
 * from .dev.vars, then drives the real UI with Playwright: the Meet invite as
 * pasted text and as a screenshot. It asserts the card shows the event at the
 * right time and prints the per-scan log line the Worker emits.
 *
 *   node scripts/prod-like-check.mjs [--skip-build] [--port 8799]
 *
 * Exit code is non-zero when any expectation fails. Costs a few cents in
 * provider calls, the same as two real scans.
 */
import { spawn, execSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const port = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : 8799;
const skipBuild = args.includes('--skip-build');
const root = new URL('..', import.meta.url).pathname;
if (!existsSync(`${root}.dev.vars`)) { console.error('missing .dev.vars (provider secrets for wrangler dev)'); process.exit(2); }

const INVITE = `Google Meeting info:
Civic Signal
Tuesday, September 22 · 7:00 – 8:30pm
Time zone: America/New_York
Google Meet joining info
Video call link: https://meet.google.com/odi-xddv-kez
Or dial: (US) +1 254-218-5862 PIN: 199 901 399#
More phone numbers: https://tel.meet/odi-xddv-kez?pin=2308079664797`;

if (!skipBuild) {
  console.log('building worker bundle...');
  execSync('bun run build:cloudflare', { cwd: root, stdio: 'inherit' });
}

console.log(`starting wrangler dev on :${port}...`);
const dev = spawn('wrangler', ['dev', '--local', '--port', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const workerLogs = [];
const onLine = (chunk) => { for (const line of String(chunk).split('\n')) if (line.includes('"event":"scan"')) workerLogs.push(line.trim()); };
dev.stdout.on('data', onLine); dev.stderr.on('data', onLine);
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(base); if (r.status === 200) break; } catch {}
  await new Promise((r) => setTimeout(r, 2000));
}

const failures = [];
const expect = (label, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`); if (!ok) failures.push(label); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 900, height: 1400 }, timezoneId: 'America/New_York' });
const page = await context.newPage();
const scans = [];
page.on('response', async (r) => { if (r.url().includes('/api/scan')) { try { scans.push({ status: r.status(), body: await r.json() }); } catch { scans.push({ status: r.status() }); } } });

async function firstCard() {
  await page.getByTestId('event-card').first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(500);
  return (await page.getByTestId('event-card').first().innerText()).replace(/\s+/g, ' ');
}
async function discardAll() {
  const unselect = page.getByRole('button', { name: 'Unselect all' });
  if (await unselect.count()) await unselect.click();
  const discard = page.getByTestId('save-events-button');
  if (await discard.count()) await discard.click();
  await page.waitForTimeout(300);
}

// 1. The invite as pasted text.
await page.goto(base, { waitUntil: 'networkidle' });
const editor = page.getByTestId('smart-input-textarea');
await editor.waitFor({ state: 'visible' });
await editor.fill(INVITE);
await editor.press('Meta+Enter');
const textCard = await firstCard();
console.log('text card:', textCard.slice(0, 120));
expect('text scan returned 200', scans.at(-1)?.status === 200, `status ${scans.at(-1)?.status}`);
expect('text card is titled Civic Signal', /Civic Signal/.test(textCard));
expect('text card shows Sep 22 at 7:00 PM', /Sep 22 at 7:00 PM/.test(textCard), textCard.slice(0, 60));
expect('text card is not all-day', !/All-day/.test(textCard));
await discardAll();

// 2. The invite as a screenshot.
const render = await context.newPage();
await render.setViewportSize({ width: 440, height: 170 });
await render.setContent(`<html><body style="margin:0;background:#fff"><div style="padding:12px;font:13px/1.55 -apple-system,Helvetica,Arial;color:#222">${INVITE.replace(/\n/g, '<br>')}</div></body></html>`);
const png = await render.screenshot({ type: 'png' });
await render.close();
await page.locator('input[type="file"]').setInputFiles({ name: 'invite.png', mimeType: 'image/png', buffer: png });
await page.locator('img[alt="Uploaded 1"]').waitFor();
await page.getByRole('button', { name: /Scan it/ }).click();
const imageCard = await firstCard().catch(() => '');
console.log('image card:', imageCard.slice(0, 120));
const errors = await page.getByTestId('error-notification').allInnerTexts();
expect('image scan returned 200', scans.at(-1)?.status === 200, `status ${scans.at(-1)?.status}`);
expect('image scan showed no error', errors.length === 0, errors.join(' | '));
expect('image card is titled Civic Signal', /Civic Signal/.test(imageCard));
expect('image card shows Sep 22 at 7:00 PM', /Sep 22 at 7:00 PM/.test(imageCard), imageCard.slice(0, 60));
expect('no scanning shimmer left behind', (await page.getByTestId('cancel-job-button').count()) === 0);

console.log('\nworker scan log lines:');
for (const line of workerLogs) console.log(' ', line.slice(line.indexOf('{')));

await browser.close();
dev.kill('SIGTERM');
console.log(failures.length === 0 ? '\nALL PASS' : `\n${failures.length} FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
