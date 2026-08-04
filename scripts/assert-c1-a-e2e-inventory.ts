import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createCloudflareChildEnvironment, type C1AEnvironment } from './run-c1-a-cloudflare';

export const RETIRED_E1_TITLES = [
  '"Enter pattern lock" switches to the pattern screen as it looks today',
  'admins with a valid pattern session bypass the limit screen',
  '"Enter pattern lock" on /spent opens the pattern screen via /?unlock',
  'drawing a valid pattern unlocks the app',
] as const;

export const C1_A_TITLES = [
  'community exhaustion exposes no pattern or admin bypass',
  'corrupt Scanner review storage recovers and persists the next scan',
  'URL-only scan waits through resolver rollover and busy responses then succeeds',
] as const;

export const PRESERVED_E1_TITLES = [
  'CalendarEvent regressions › America/New_York viewer › legacy CalendarEvent renders exact America/New_York wall-clock date',
  'CalendarEvent regressions › legacy CalendarEvent renders UTC timezone chip',
  'CalendarEvent regressions › legacy CalendarEvent reveals description only after expansion',
  'CalendarEvent regressions › legacy CalendarEvent single export writes one timed UTC VEVENT',
  'CalendarEvent regressions › legacy CalendarEvent batch export writes three VEVENTs and batch-events-3.ics',
  'CalendarEvent regressions › legacy CalendarEvent batch export omits the deselected event',
  'CalendarEvent regressions › legacy CalendarEvent edited start survives timezone change',
  'CalendarEvent regressions › legacy CalendarEvent moving start past end preserves duration',
  'community limit screen › shows the community-sponsored message with reset time in the local timezone',
  'community limit screen › waitlist signup shows the on-screen confirmation',
  'community limit screen › already-joined emails get the already-on-the-list message',
  'community limit screen › app stays open (no pattern lock) when the budget is not exhausted',
  'community limit screen › /spent previews the limit screen without the budget being exhausted',
  'community limit screen › a mid-session community 402 flips the app to the limit screen',
  'Event Extraction Scenarios › Scenario 4: one strict Scanner response keeps every candidate as an ordered selectable review draft',
  'Event Extraction Scenarios › Scenario 5: zero Scanner candidates leave no review drafts or processing error',
  'UI Interaction Tests › Submit button is disabled with empty input',
  'UI Interaction Tests › Submit button enables with 3+ chars',
  'UI Interaction Tests › Error notification can be dismissed',
  'UI Interaction Tests › Cmd+Enter submits from textarea',
  'Input draft persistence › text draft survives a page reload',
  'Input draft persistence › an attached image survives a page reload',
  'Input draft persistence › a stored image renders (valid src, not empty) when loaded back from history',
  'Input history › the history button is hidden until there is history',
  'Input history › transforming saves the input to history',
  'Input history › loading an entry (without changing it) never duplicates it in history',
  'Input history › loading an entry, modifying it, then transforming saves a new entry',
  'Input history › clicking a history entry loads it back into the input',
  'Input history › applying history with an unsaved draft auto-saves the draft first',
  'Input history › the history modal locks background page scroll while open',
  'Input history › history groups entries into day sections',
  'Recent — summaries › a 2-3 word summary appears on the card after transform',
  'Recent — summaries › a shimmer shows while the summary is generating, then it resolves to the label',
  'Recent — search › search filters entries and clearing restores all',
  'Recent — search › search matches on the generated summary, not just the input text',
  'Scanner ReviewDraftFields buffers start-time edits until commit and exports the committed value',
  'image scan sends a strict data URL, reviews a vision candidate, exports Scanner bytes, and keeps review storage raw-free',
  'two named images scan strictly in order and retain both distinct Scanner candidates',
  'canceling after a held first image scan prevents the second request and creates no Scanner draft',
  'mixed text and image input stays drafted, reports the deferral, and makes no scan request',
  'multiple Scanner candidates export exactly the selected VEVENT subset in one calendar download',
  'partial Scanner export removes only the selected draft and reload recomputes retained readiness',
  'missing Scanner title stays visible as a warning and exports calendar bytes without SUMMARY',
  'missing Scanner start blocks export until a complete temporal edit supplies it',
  'evidence-free DST-fold edit stays blocked until clearing timezone makes it a floating warning',
  'narrow viewport keeps every Scanner review control keyboard reachable with stable accessible names',
  'reload restores raw-free Scanner drafts with recomputed readiness',
  'edited claims clear only their evidence and export fresh Scanner calendar bytes',
  'canceling a delayed first scan leaves the succeeding second scan as the only review draft',
  'malformed successful scan response creates no draft and reports a processing error',
  'Scanner all-day provider date — Asia/Tokyo viewer › preserves the calendar date through review editing and DATE export',
  'Scanner all-day provider date — America/Los_Angeles viewer › preserves the calendar date through review editing and DATE export',
  'Scanner temporal authority (viewer in America/Los_Angeles) › zoned provider point stays zoned in review and exports its explicit TZID',
  'Scanner temporal authority (viewer in America/Los_Angeles) › floating provider point remains a truthful floating-time warning without TZID',
  'URL paste → scrape → parse › a URL pill renders from the typed text alone',
  'URL paste → scrape → parse › the scrape branch sends host-enriched text to Scanner and renders its review candidate',
] as const;

type Project = 'chromium' | 'webkit';
export type ProjectInventory = Record<Project, string[]>;
export type InventoryListing = Readonly<{ ordinary: ProjectInventory; c1a: ProjectInventory }>;

function fail(kind: 'expected 57|58|59' | 'ordinary titles' | 'retired title' | 'C1-A titles' | 'playwright failed' | 'owned output collision'): never {
  throw new Error(`c1-a inventory: ${kind}`);
}

export function validateInventoryArgument(argv: readonly string[]): 57 | 58 | 59 {
  if (argv.length !== 1 || !['57', '58', '59'].includes(argv[0]!)) fail('expected 57|58|59');
  return Number(argv[0]) as 57 | 58 | 59;
}

export function parsePlaywrightList(output: string): ProjectInventory {
  const result: ProjectInventory = { chromium: [], webkit: [] };
  const record = /^\s*\[(chromium|webkit)\]\s+›\s+[^:\r\n]+\.spec\.ts:\d+:\d+\s+›\s+(.+)$/;
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(record);
    if (match) result[match[1] as Project].push(match[2]!);
  }
  return result;
}

function sameTitles(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && [...actual].sort().every((title, index) => title === [...expected].sort()[index]);
}

export function assertC1AE2EInventory(value: InventoryListing, expectedTotal: 57 | 58 | 59, ordinaryExpected: readonly string[] = PRESERVED_E1_TITLES): void {
  for (const project of ['chromium', 'webkit'] as const) {
    const ordinary = value.ordinary[project];
    if (ordinary.some((title) => RETIRED_E1_TITLES.some((retired) => title === retired || title.endsWith(`› ${retired}`)))) fail('retired title');
    if (!sameTitles(ordinary, ordinaryExpected)) fail('ordinary titles');
    const expectedC1A = C1_A_TITLES.slice(0, expectedTotal - 56);
    if (!sameTitles(value.c1a[project], expectedC1A)) fail('C1-A titles');
  }
}

export function createInventoryEnvironment(source: C1AEnvironment, root: string): C1AEnvironment {
  return { ...createCloudflareChildEnvironment(source, root), C1_A_OUTPUT_SUFFIX: '000000000000' };
}

function runListing(root: string, env: C1AEnvironment, config: string): ProjectInventory {
  const child = Bun.spawnSync(['node', 'node_modules/@playwright/test/cli.js', 'test', '--list', `--config=${config}`], {
    cwd: root, env, stdout: 'pipe', stderr: 'pipe',
  });
  if (child.exitCode !== 0) fail('playwright failed');
  return parsePlaywrightList(new TextDecoder().decode(child.stdout));
}

export function runInventory(root: string, expectedTotal: 57 | 58 | 59): void {
  const suffix = '000000000000';
  const outputs = [path.join(root, `test-results-c1-a-${suffix}`), path.join(root, `playwright-report-c1-a-${suffix}`)];
  if (outputs.some(existsSync)) fail('owned output collision');
  const env = createInventoryEnvironment(process.env, root);
  try {
    assertC1AE2EInventory({
      ordinary: runListing(root, env, 'playwright.config.ts'),
      c1a: runListing(root, env, 'playwright.c1-a.config.ts'),
    }, expectedTotal);
  } finally {
    for (const output of outputs) if (existsSync(output)) rmSync(output, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  runInventory(path.resolve(import.meta.dir, '..'), validateInventoryArgument(process.argv.slice(2)));
  console.log('c1-a inventory: accepted');
}
