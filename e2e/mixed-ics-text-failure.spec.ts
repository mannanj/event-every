import { test, expect } from '@playwright/test';
import { setupLocal } from './helpers';

/**
 * Regression for the production wedge reported on eventevery.com:
 *
 *   Attach a .ics AND type text -> Transform. The .ics parses locally and its
 *   event card appears, but the text half hits /api/parse and fails. The user
 *   sees a generic error, the "Working my magic.." shimmer never goes away, and
 *   the Save button never renders. Only a reload recovers.
 *
 * Root cause: handleTextSubmit's processor set batchProcessing.isProcessing=true
 * before the fetch, but the ONLY isProcessing:false assignment lived inside the
 * stream's `chunk.isComplete` branch. There was no `finally`, so every failure
 * path left the flag true forever. EventCardList gates the Save button on
 * `!isProcessing`, so the button stayed unmounted.
 *
 * The .ics fixture is the exact file from the bug report (a round-tripped
 * event-every export, PRODID:event-every/ics).
 */

const REPORTED_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'CALSCALE:GREGORIAN',
  'PRODID:event-every/ics',
  'METHOD:PUBLISH',
  'X-PUBLISHED-TTL:PT1H',
  'BEGIN:VEVENT',
  'UID:wD4zSzjjsl4-Y12jumMGf',
  'SUMMARY:Interview with Obviant',
  'DTSTAMP:20260903T171606Z',
  'DTSTART:20260909T190000Z',
  'DTEND:20260909T193000Z',
  'DESCRIPTION:Nate wants to chat about my background and have a deeper look a',
  '\tt Obviant and the role + questions I have.',
  'LOCATION:See attached Google Meet link\\; https://meet.google.com/vjq-oamt-v',
  '\ttb',
  'STATUS:CONFIRMED',
  'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

async function attachIcsAndText(page: import('@playwright/test').Page, text: string) {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'batch-events-1-68.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(REPORTED_ICS, 'utf8'),
  });
  await expect(page.locator('button[aria-label="Remove calendar file 1"]')).toBeVisible({ timeout: 8000 });
  await page.locator('[data-testid="smart-input-textarea"]').fill(text);
  await page.locator('button[aria-label="Transform content to events"]').click();
}

test.describe('mixed .ics + text: a failing text parse must not wedge the UI', () => {
  test('Save button still renders after /api/parse returns a non-OK response', async ({ page }) => {
    await setupLocal(page);

    // The reported production failure: /api/parse errors with a body the client
    // cannot read as JSON, so it throws the generic 'Failed to process batch'.
    await page.route('**/api/parse', async route => {
      await route.fulfill({ status: 500, contentType: 'text/plain', body: 'upstream failure' });
    });

    await attachIcsAndText(page, 'Also add a coffee chat with Priya Thursday at 9am');

    // The .ics half succeeds: the event card lands. This is the state in the
    // user's screenshot.
    await expect(page.getByTestId('event-card-title')).toHaveCount(1, { timeout: 20000 });
    await expect(page.getByTestId('event-card-title')).toHaveText('Interview with Obviant');

    // ...and the failed text half must still settle the batch.
    await expect(page.getByTestId('save-events-button')).toBeVisible({ timeout: 20000 });

    // The shimmer must be gone. cancel-job-button only renders inside it.
    await expect(page.getByTestId('cancel-job-button')).toHaveCount(0);

    // The card must not still be flagged as freshly-arriving.
    await expect(page.getByText('NEW', { exact: true })).toHaveCount(0);
  });

  test('Save button still renders when the parse stream dies mid-flight', async ({ page }) => {
    await setupLocal(page);

    // A 200 that opens an SSE stream and then drops without ever sending
    // isComplete — the other way the old code never reached its reset.
    await page.route('**/api/parse', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: `data: ${JSON.stringify({ error: 'Model overloaded' })}\n\n`,
      });
    });

    await attachIcsAndText(page, 'Also add a coffee chat with Priya Thursday at 9am');

    await expect(page.getByTestId('event-card-title')).toHaveCount(1, { timeout: 20000 });
    await expect(page.getByTestId('save-events-button')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('cancel-job-button')).toHaveCount(0);
  });
});
