import { expect, test, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { parseICSContent } from '../src/services/icsParser';
import { mockAuth, mockSummarize, mockURLDetection } from './helpers';

interface StoredCalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location?: string;
  description?: string;
  allDay: boolean;
  timezone: string;
  rawStartDate?: string;
  rawEndDate?: string;
  rawTimezone?: string;
  timezoneStatus: 'resolved';
  timezoneSource: 'extracted';
  created: string;
  source: 'text';
}

const SAVED_SENTINEL = event({
  id: 'saved-branch-sentinel',
  title: 'Saved branch sentinel',
  startDate: '2027-01-05T15:00:00.000Z',
  endDate: '2027-01-05T16:00:00.000Z',
  timezone: 'UTC',
  rawStartDate: '2027-01-05T15:00:00',
  rawEndDate: '2027-01-05T16:00:00',
});

function event(overrides: Partial<StoredCalendarEvent> & Pick<StoredCalendarEvent, 'id' | 'title' | 'startDate' | 'endDate'>): StoredCalendarEvent {
  return {
    allDay: false,
    timezone: 'UTC',
    timezoneStatus: 'resolved',
    timezoneSource: 'extracted',
    created: '2026-08-01T00:00:00.000Z',
    source: 'text',
    ...overrides,
  };
}

async function openSeededPage(
  page: Page,
  temporary: StoredCalendarEvent[],
  saved: StoredCalendarEvent[] = [],
): Promise<void> {
  await mockAuth(page);
  await mockURLDetection(page);
  await mockSummarize(page);
  await page.addInitScript(({ temporaryEvents, savedEvents }) => {
    localStorage.clear();
    if (temporaryEvents.length > 0) {
      localStorage.setItem('event_every_temp_unsaved', JSON.stringify(temporaryEvents));
    }
    if (savedEvents.length > 0) {
      localStorage.setItem('event_every_history', JSON.stringify(savedEvents));
    }
  }, { temporaryEvents: temporary, savedEvents: saved });
  await page.goto('/');
  await page.waitForSelector('[data-testid="smart-input-textarea"]', {
    state: 'visible',
    timeout: 20000,
  });
}

function calendarFile(events: Array<{ uid: string; title: string; start: string; end: string }>): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Event Every E1//CalendarEvent regression//EN',
    ...events.flatMap(({ uid, title, start, end }) => [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:20260801T000000Z`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${title}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

async function uploadCalendar(page: Page, contents: string, filename: string): Promise<void> {
  await expect(page.getByText(SAVED_SENTINEL.title, { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Scanner review drafts' })).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: 'text/calendar',
    buffer: Buffer.from(contents),
  });
  await page.getByRole('button', { name: 'Transform content to events' }).click();
}

async function downloadSelectedEvents(page: Page): Promise<import('@playwright/test').Download> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('save-events-button').click(),
  ]);
  return download;
}

test.use({ timezoneId: 'UTC', locale: 'en-US' });

test.describe('CalendarEvent regressions', () => {
  test.describe('America/New_York viewer', () => {
    test.use({ timezoneId: 'America/New_York' });

    test('legacy CalendarEvent renders exact America/New_York wall-clock date', async ({ page }) => {
      await openSeededPage(page, [event({
        id: 'ce01-wall-clock',
        title: 'Dinner at Luigi’s',
        startDate: '2026-03-13T23:00:00.000Z',
        endDate: '2026-03-14T00:00:00.000Z',
        location: 'Luigi’s Restaurant',
        timezone: 'America/New_York',
        rawStartDate: '2026-03-13T19:00:00',
        rawEndDate: '2026-03-13T20:00:00',
        rawTimezone: 'America/New_York',
      })]);

      const card = page.getByTestId('event-card').filter({ hasText: 'Dinner at Luigi’s' });
      await expect(card).toContainText('Mar 13');
      await expect(card).toContainText('7:00 PM');
      await expect(card).toContainText('Luigi’s Restaurant');
    });
  });

  test('legacy CalendarEvent renders UTC timezone chip', async ({ page }) => {
    await openSeededPage(page, [event({
      id: 'ce02-timezone-chip',
      title: 'Team Sync',
      startDate: '2026-03-15T15:00:00.000Z',
      endDate: '2026-03-15T16:00:00.000Z',
      timezone: 'UTC',
      rawStartDate: '2026-03-15T15:00:00',
      rawEndDate: '2026-03-15T16:00:00',
      rawTimezone: 'UTC',
    })]);

    const card = page.getByTestId('event-card').filter({ hasText: 'Team Sync' });
    await expect(card.getByTestId('tz-chip')).toHaveText('UTC');
  });

  test('legacy CalendarEvent reveals description only after expansion', async ({ page }) => {
    await openSeededPage(page, [event({
      id: 'ce03-description',
      title: 'Test Event',
      startDate: '2026-04-01T14:00:00.000Z',
      endDate: '2026-04-01T15:00:00.000Z',
      location: 'Room 42',
      description: 'A test event with details',
    })]);

    const card = page.getByTestId('event-card').filter({ hasText: 'Test Event' });
    const description = page.getByText('A test event with details', { exact: true });
    await expect(description).toBeHidden();
    await card.getByRole('button', { name: 'Expand' }).click();
    await expect(description).toBeVisible();
  });

  test('legacy CalendarEvent single export writes one timed UTC VEVENT', async ({ page }) => {
    await openSeededPage(page, [], [SAVED_SENTINEL]);
    await uploadCalendar(page, calendarFile([{
      uid: 'ce04-single@example.test',
      title: 'Imported dinner',
      start: '20260313T190000Z',
      end: '20260313T200000Z',
    }]), 'single-event.ics');
    await expect(page.getByTestId('event-card-title')).toHaveCount(1);

    const download = await downloadSelectedEvents(page);
    const calendarText = await fs.readFile((await download.path())!, 'utf8');
    expect((calendarText.match(/BEGIN:VEVENT/g) ?? [])).toHaveLength(1);
    expect(calendarText).toContain('SUMMARY:Imported dinner');
    expect(calendarText).toMatch(/DTSTART(;[^:]*)?:20260313T190000Z/);
    expect(parseICSContent(calendarText)).toHaveLength(1);
  });

  test('legacy CalendarEvent batch export writes three VEVENTs and batch-events-3.ics', async ({ page }) => {
    await openSeededPage(page, [], [SAVED_SENTINEL]);
    await uploadCalendar(page, calendarFile([
      { uid: 'ce05-standup@example.test', title: 'Standup', start: '20260309T090000Z', end: '20260309T093000Z' },
      { uid: 'ce05-design@example.test', title: 'Design Review', start: '20260310T140000Z', end: '20260310T150000Z' },
      { uid: 'ce05-retro@example.test', title: 'Retro', start: '20260311T110000Z', end: '20260311T120000Z' },
    ]), 'three-events.ics');
    await expect(page.getByTestId('event-card-title')).toHaveCount(3);

    const download = await downloadSelectedEvents(page);
    const calendarText = await fs.readFile((await download.path())!, 'utf8');
    expect((calendarText.match(/BEGIN:VEVENT/g) ?? [])).toHaveLength(3);
    expect(parseICSContent(calendarText)).toHaveLength(3);
    expect(download.suggestedFilename()).toBe('batch-events-3.ics');
  });

  test('legacy CalendarEvent batch export omits the deselected event', async ({ page }) => {
    await openSeededPage(page, [], [SAVED_SENTINEL]);
    await uploadCalendar(page, calendarFile([
      { uid: 'ce06-standup@example.test', title: 'Standup', start: '20260309T090000Z', end: '20260309T093000Z' },
      { uid: 'ce06-design@example.test', title: 'Design Review', start: '20260310T140000Z', end: '20260310T150000Z' },
      { uid: 'ce06-retro@example.test', title: 'Retro', start: '20260311T110000Z', end: '20260311T120000Z' },
    ]), 'selected-subset.ics');
    await expect(page.getByTestId('event-card-title')).toHaveCount(3);
    await page.locator('input[aria-label="Select Design Review"]').uncheck();

    const download = await downloadSelectedEvents(page);
    const calendarText = await fs.readFile((await download.path())!, 'utf8');
    expect((calendarText.match(/BEGIN:VEVENT/g) ?? [])).toHaveLength(2);
    expect(calendarText).not.toContain('SUMMARY:Design Review');
    expect(parseICSContent(calendarText).map(({ title }) => title)).toEqual(['Standup', 'Retro']);
  });

  test('legacy CalendarEvent edited start survives timezone change', async ({ page }) => {
    await openSeededPage(page, [event({
      id: 'ce07-edit-timezone',
      title: 'Planning',
      startDate: '2026-03-13T12:00:00.000Z',
      endDate: '2026-03-13T13:00:00.000Z',
      timezone: 'UTC',
      rawStartDate: '2026-03-13T12:00:00',
      rawEndDate: '2026-03-13T13:00:00',
      rawTimezone: 'UTC',
    })]);
    const card = page.getByTestId('event-card').filter({ hasText: 'Planning' });

    await card.getByText('12:00 PM').click();
    await card.getByTestId('event-card-time-input').fill('14:00');
    await card.getByTestId('event-card-time-input').press('Enter');
    await expect(card).toContainText('2:00 PM');
    await card.locator('select[aria-label="Timezone"]').selectOption('America/New_York');
    await expect(card).toContainText('6:00 PM');
    await expect(card).not.toContainText('4:00 PM');
  });

  test('legacy CalendarEvent moving start past end preserves duration', async ({ page }) => {
    await openSeededPage(page, [event({
      id: 'ce08-duration',
      title: 'Planning',
      startDate: '2026-03-13T12:00:00.000Z',
      endDate: '2026-03-13T13:00:00.000Z',
      timezone: 'UTC',
      rawStartDate: '2026-03-13T12:00:00',
      rawEndDate: '2026-03-13T13:00:00',
      rawTimezone: 'UTC',
    })]);
    const card = page.getByTestId('event-card').filter({ hasText: 'Planning' });

    await card.getByText('12:00 PM').click();
    await card.getByTestId('event-card-time-input').fill('17:00');
    await card.getByTestId('event-card-time-input').press('Enter');
    await expect(card).toContainText('5:00 PM');
    await card.getByRole('button', { name: 'Expand' }).click();
    await expect(card).toContainText('6:00 PM');
    await expect(card).not.toContainText('1:00 PM');
  });
});
