import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import { setupLocal, mockParseAPI, submitText, waitForEvents } from './helpers';
import { parseICSContent } from '../src/services/icsParser';

// These tests exercise the REAL product output: the Save button → handleExport →
// exportMultipleToICS → downloadICS path that fires an <a download> click. We
// intercept the download, read the actual .ics bytes, and assert both the raw
// ICS text (DTSTART format / Z-suffix / VALUE=DATE) and the round-tripped events
// via the app's own parseICSContent. Date *format* here pins current behavior
// (plans/008 owns date correctness), not "correct" instants.

// Pin the browser timezone to UTC. The mocked events carry timezone:null, so the
// app resolves the source tz to the BROWSER tz (convertRawToDate ← page.tsx:173/186);
// pinning UTC makes the emitted UTC wall-clock deterministic (19:00 local → T190000Z)
// regardless of the machine/CI runner's timezone — otherwise the hour shifts.
test.use({ timezoneId: 'UTC', locale: 'en-US' });

test.describe('ICS export download', () => {
  test('timed single event produces a UTC DTSTART and one VEVENT', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPI(page, [
      {
        title: "Dinner at Luigi's",
        startDate: '2026-03-13T19:00:00',
        endDate: '2026-03-13T20:00:00',
        location: "Luigi's Restaurant",
        confidence: 0.92,
        allDay: false,
        timezone: null,
      },
    ]);

    await submitText(page, "Dinner at Luigi's, Friday March 13 at 7pm");
    await waitForEvents(page, 1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('save-events-button').click(),
    ]);
    const path = await download.path();
    const ics = await fs.readFile(path!, 'utf-8');

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    // ics escapes commas in SUMMARY, so match a prefix substring.
    expect(ics).toContain('SUMMARY:Dinner at Luigi');
    // 19:00 emitted as local-as-UTC per dateToArray's UTC getters → ...T190000Z.
    expect(ics).toMatch(/DTSTART(;[^:]*)?:\d{8}T190000Z/);

    const parsed = parseICSContent(ics);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toMatch(/^Dinner at Luigi/);
    expect(parsed[0].allDay).toBe(false);
  });

  test('all-day event produces a DATE-valued DTSTART with no time', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPI(page, [
      {
        title: 'Company offsite',
        startDate: '2026-03-20',
        allDay: true,
        location: 'Napa Valley',
        confidence: 0.85,
        timezone: null,
      },
    ]);

    await submitText(page, 'Company offsite March 20, Napa Valley');
    await waitForEvents(page, 1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('save-events-button').click(),
    ]);
    const ics = await fs.readFile((await download.path())!, 'utf-8');

    // DTSTART;VALUE=DATE:YYYYMMDD — 8 digits, no T/time component in the value.
    expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}(\r?\n|$)/);
    const dtstartLine = ics.split(/\r?\n/).find((l) => l.startsWith('DTSTART'))!;
    const dtstartValue = dtstartLine.slice(dtstartLine.indexOf(':') + 1);
    // The value is a pure date (no 'T' separator / no time) — distinct from a
    // timed DTSTART like 20260313T190000Z.
    expect(dtstartValue).toMatch(/^\d{8}$/);
    expect(dtstartValue).not.toContain('T');

    const parsed = parseICSContent(ics);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].allDay).toBe(true);
  });

  test('multi-event export writes all VEVENTs and the batch-events-N filename', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPI(page, [
      {
        title: 'Standup',
        startDate: '2026-03-09T09:00:00',
        endDate: '2026-03-09T09:30:00',
        confidence: 0.88,
        allDay: false,
        timezone: null,
      },
      {
        title: 'Design Review',
        startDate: '2026-03-10T14:00:00',
        endDate: '2026-03-10T15:00:00',
        confidence: 0.88,
        allDay: false,
        timezone: null,
      },
      {
        title: 'Retro',
        startDate: '2026-03-11T11:00:00',
        endDate: '2026-03-11T12:00:00',
        confidence: 0.85,
        allDay: false,
        timezone: null,
      },
    ]);

    await submitText(page, 'Monday 9am standup, Tuesday 2pm design review, Wednesday 11am retro');
    await waitForEvents(page, 3);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('save-events-button').click(),
    ]);
    const ics = await fs.readFile((await download.path())!, 'utf-8');

    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(3);
    expect(parseICSContent(ics)).toHaveLength(3);
    expect(download.suggestedFilename()).toBe('batch-events-3.ics');
  });

  test('deselecting one event exports only the remaining selected events', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPI(page, [
      {
        title: 'Standup',
        startDate: '2026-03-09T09:00:00',
        endDate: '2026-03-09T09:30:00',
        confidence: 0.88,
        allDay: false,
        timezone: null,
      },
      {
        title: 'Design Review',
        startDate: '2026-03-10T14:00:00',
        endDate: '2026-03-10T15:00:00',
        confidence: 0.88,
        allDay: false,
        timezone: null,
      },
      {
        title: 'Retro',
        startDate: '2026-03-11T11:00:00',
        endDate: '2026-03-11T12:00:00',
        confidence: 0.85,
        allDay: false,
        timezone: null,
      },
    ]);

    await submitText(page, 'standup, design review, retro');
    await waitForEvents(page, 3);

    // Deselect "Design Review" via its per-event checkbox (aria-label = `Select ${title}`).
    await page.locator('input[aria-label="Select Design Review"]').uncheck();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('save-events-button').click(),
    ]);
    const ics = await fs.readFile((await download.path())!, 'utf-8');

    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    const parsed = parseICSContent(ics);
    expect(parsed).toHaveLength(2);
    expect(parsed.every((e) => e.title !== 'Design Review')).toBe(true);
  });
});

// These pin the three bugs that plan 014 fixed by construction in the consolidated editor
// (EventFields, built on the fixed EditableField). Each drives the REAL edit→Save→.ics loop
// through the expanded editor and asserts on the downloaded bytes — so a regression to any of
// the old hand-rolled-editor mechanisms (lost-keystroke isNaN guard, missing all-day toggle,
// per-keystroke double-fire) would flip these red.
test.describe('Editor edit→export loop (plan 014 bug fixes)', () => {
  // Expand the (only) event card via its chevron so the EventFields editor mounts.
  // (Clicking the title enters title-edit mode; it does NOT expand.)
  async function expandCard(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Expand' }).first().click();
    // The all-day checkbox only exists inside the expanded EventFields editor.
    await expect(page.getByLabel('All-day event')).toBeVisible({ timeout: 5000 });
  }

  test('Bug 1 (lost keystroke): a time typed in the editor then immediately Saved survives into the .ics', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPI(page, [
      {
        title: 'Edited Meeting',
        startDate: '2026-03-13T19:00:00',
        endDate: '2026-03-13T20:00:00',
        confidence: 0.9,
        allDay: false,
        timezone: null,
      },
    ]);

    await submitText(page, 'Edited Meeting March 13 at 7pm');
    await waitForEvents(page, 1);

    // The collapsed card header mirrors the COMMITTED event state (its date/time spans read
    // event.startDate). We use it as a probe: under the old double-fire editor, onChange fired
    // on every keystroke, so the header would update mid-edit; under the buffered editor the
    // header must stay stale until the edit is committed on Enter/blur.
    const card = page.getByTestId('event-card').first();
    const header = card.locator('p.text-sm.text-gray-600').first();
    await expect(header).toContainText('7:00 PM');

    await expandCard(page);

    // Open the start-time input and type a new time WITHOUT committing yet.
    await page.getByRole('button', { name: /^Start time:/ }).first().click();
    const timeInput = page.getByLabel('Start time', { exact: true });
    // 19:45 keeps the event valid (start < end 20:00) so export still fires.
    await timeInput.fill('19:45');

    // Bug 1/3 discriminator: the committed state (header) must NOT have moved to 7:45 PM yet —
    // the keystroke lives only in the field buffer. (Old per-keystroke onChange would already
    // show 7:45 PM here.)
    await expect(header).toContainText('7:00 PM');
    await expect(header).not.toContainText('7:45 PM');

    // Commit the edit; now the committed state catches up.
    await timeInput.press('Enter');
    await expect(header).toContainText('7:45 PM');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('save-events-button').click(),
    ]);
    const ics = await fs.readFile((await download.path())!, 'utf-8');

    // 19:45 local, browser tz pinned to UTC → DTSTART ...T194500Z. (Old bug: stays 190000Z.)
    expect(ics).toMatch(/DTSTART(;[^:]*)?:\d{8}T194500Z/);
  });

  test('Bug 2 (all-day): toggling the editor all-day checkbox then Saving emits a VALUE=DATE DTSTART', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPI(page, [
      {
        title: 'Toggle To AllDay',
        startDate: '2026-03-13T19:00:00',
        endDate: '2026-03-13T20:00:00',
        confidence: 0.9,
        allDay: false,
        timezone: null,
      },
    ]);

    await submitText(page, 'Toggle To AllDay March 13 at 7pm');
    await waitForEvents(page, 1);
    await expandCard(page);

    // The old editor had NO all-day toggle at all — this control only exists post-014.
    await page.getByLabel('All-day event').check();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('save-events-button').click(),
    ]);
    const ics = await fs.readFile((await download.path())!, 'utf-8');

    // All-day → DATE-valued DTSTART (8 digits, no time/Z). Old bug: still a timed DTSTART.
    expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}(\r?\n|$)/);
    const dtstartLine = ics.split(/\r?\n/).find((l) => l.startsWith('DTSTART'))!;
    const dtstartValue = dtstartLine.slice(dtstartLine.indexOf(':') + 1);
    expect(dtstartValue).toMatch(/^\d{8}$/);
    expect(dtstartValue).not.toContain('T');
    expect(parseICSContent(ics)[0].allDay).toBe(true);
  });
});
