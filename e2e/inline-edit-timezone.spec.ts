import { test, expect } from '@playwright/test';
import { setupLocal, mockParseAPI, submitText, waitForEvents } from './helpers';

/**
 * task-195: inline card edits must stay consistent with the event's timezone.
 *
 * Before the fix, EventCard.handleFieldEdit edited the displayed instant but never updated the raw
 * wall-clock fields, so a later timezone change re-derived the time from the STALE parsed raw and
 * silently reverted the edit. It also never moved the end when the start moved (start could pass
 * end). The browser zone is pinned to UTC so the wall-clock assertions are exact.
 */
test.describe('inline edit integrity (pinned UTC)', () => {
  test.use({ timezoneId: 'UTC' });

  async function seedNoonEvent(page: import('@playwright/test').Page) {
    await setupLocal(page);
    await mockParseAPI(page, [
      {
        title: 'Planning',
        startDate: '2026-03-13T12:00:00',
        endDate: '2026-03-13T13:00:00',
        confidence: 0.95,
        allDay: false,
        timezone: 'UTC',
      },
    ]);
    await submitText(page, 'Planning March 13 at noon UTC');
    await waitForEvents(page, 1);
    return page.getByTestId('event-card').first();
  }

  // Click the displayed noon start-time span to reveal the inline <input type="time">, set it,
  // and commit with Enter. (Both tests seed a noon event, so the span reads "12:00 PM" on entry.)
  async function editStartTimeFromNoon(card: import('@playwright/test').Locator, hhmm: string) {
    await card.getByText('12:00 PM').click();
    const input = card.getByTestId('event-card-time-input');
    await input.fill(hhmm);
    await input.press('Enter');
  }

  test('an edited start time survives a later timezone change (not reverted to the parsed time)', async ({ page }) => {
    const card = await seedNoonEvent(page);
    await expect(card).toContainText('12:00 PM');

    // Edit noon → 2:00 PM (browser is UTC, so 14:00 == 2:00 PM UTC).
    await editStartTimeFromNoon(card, '14:00');
    await expect(card).toContainText('2:00 PM');

    // Re-interpret the source zone as America/New_York. The EDITED time (14:00, resynced into
    // rawStartDate) becomes 2pm ET == 6pm UTC → "6:00 PM". The OLD bug kept raw at noon → 12pm ET
    // == 4pm UTC → "4:00 PM", reverting the edit.
    await card.locator('select[aria-label="Timezone"]').selectOption('America/New_York');
    await expect(card).toContainText('6:00 PM');
    await expect(card).not.toContainText('4:00 PM');
  });

  test('moving the start past the end preserves duration and keeps start <= end', async ({ page }) => {
    const card = await seedNoonEvent(page);

    // Move start noon → 5:00 PM, past the original 1:00 PM end.
    await editStartTimeFromNoon(card, '17:00');
    await expect(card).toContainText('5:00 PM');

    // Expand to reveal the end (only shown in the expanded editor). It must have shifted to 6:00 PM
    // — duration (1h) preserved — never left behind at 1:00 PM (which would make start > end).
    await card.getByRole('button', { name: 'Expand' }).click();
    await expect(card).toContainText('6:00 PM');
    await expect(card).not.toContainText('1:00 PM');
  });
});
