# Plan 009: Turn the Playwright suite into a real refactor safety net (test the .ics export, stable testid hooks, parse-correctness, URL-scrape and pattern-unlock flows)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 400bf32..HEAD -- e2e playwright.config.ts src/components/BatchEventList.tsx src/components/SmartInput.tsx src/components/PatternLock.tsx src/components/AuthWrapper.tsx src/components/CommunityLimitScreen.tsx src/services/exporter.ts src/services/icsParser.ts src/app/page.tsx src/app/api/detect-urls/route.ts src/app/api/scrape-url/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (touches the production event-card markup to add `data-testid`s — additive only, no behavior change — plus rewrites/extends e2e specs)
- **Depends on**: none. **Complements** plans/003 (unit tests — a *different* layer; 003 tests `.ics` strings at the function level offline, 009 tests the real browser download click). **Must land BEFORE plans/014 and plans/015** (the component refactors) and before any `src/app/page.tsx` decomposition, so those refactors are guarded by this net rather than silently breaking it.
- **Category**: tests
- **Planned at**: commit `400bf32`, 2026-06-13

## Why this matters

The Playwright suite *looks* like a safety net but has four holes that let the upcoming refactors (plans 014/015 and a future `page.tsx` split) ship a broken product while the suite stays green:

1. **The core product output — the `.ics` file download — is completely untested.** The Save button → `handleExport` → `exportMultipleToICS` → `downloadICS` (a real `<a download>` DOM click) path is never exercised by any spec. `grep -rE "waitForEvent\('download'\)|BEGIN:VCALENDAR|DTSTART|SUMMARY:" e2e/` returns nothing. A refactor could wire the Save button to emit an empty or malformed `.ics` and every test would still pass. **The .ics file IS the product**; an invalid one is a silent product failure.
2. **The event-card hook is a brittle, over-broad CSS selector.** ~17 spec usages plus `helpers.ts` locate the event card via `page.locator('h3.font-bold')`. That class is shared by non-event-card headings (the Processing Queue panel, history-modal day headers, the inline editor title — see Current state), so the selector is both refactor-fragile *and* over-broad. A refactor that renames the title element or restyles a heading breaks ~20 tests or makes them match the wrong node.
3. **Parse specs assert the title only.** Every extraction scenario asserts `toContainText(title)` and nothing about the rendered date, time, location, or all-day state. A refactor that drops the time, mangles the date, or loses the location passes untouched.
4. **Two whole flows are untested.** The URL-paste → scrape path is *actively suppressed* — every test mocks `/api/detect-urls` to force `hasUrls:false`, so the scrape branch and the URL pill never run. And the pattern-unlock test only asserts the canvas appears; it never draws a pattern or verifies the unlock transition.

Plus a config landmine: `reuseExistingServer: true` is unconditional, so CI can silently validate a stale dev server.

When this lands, a refactor that breaks the download, the card structure, the parsed fields, the scrape flow, or the unlock is caught by a failing test instead of shipping.

## Current state

Repo conventions: Next.js 15 App Router, React 19, TS strict, package manager **bun**, path alias `@/*`→`src/*`. Playwright specs live in `e2e/`; shared mock helpers in `e2e/helpers.ts`. The established locator convention is **`page.getByTestId('...')`** (equivalently `page.locator('[data-testid="..."]')`) — match it; see `src/components/SmartInput.tsx` (`data-testid="smart-input-textarea"` at line 562, `data-testid="input-history-button"` at line 531) and `src/components/CommunityLimitScreen.tsx` (`data-testid="community-limit-screen"`, `"community-limit-message"`, `"waitlist-email"`, `"enter-pattern-link"`). Mocks are registered with `page.route('**/api/...', ...)` BEFORE `page.goto('/')`; the most-recently-added matching route wins (so per-test mocks override `setupLocal`'s defaults).

### The export path (the untested product output)

`src/components/BatchEventList.tsx`:

- **Event-card title** (problem #2's real target), line 316–324:
  ```tsx
  <h3
    className="font-bold text-base truncate cursor-pointer hover:bg-gray-200 px-1 rounded"
    onClick={(e) => { e.stopPropagation(); setEditingField({ eventId: event.id, field: 'title' }); }}
  >
    {event.title}
  </h3>
  ```
- **Title edit `<input>`** (shown when that field is being edited), line 301–314: `<input type="text" value={event.title} ... className="font-bold text-base border border-black ..." autoFocus .../>`
- **Date edit `<input type="date">`**, line 336–350 (value via `formatDateForInput`).
- **Time edit `<input type="time">`**, line 368–381 (value via `formatTimeForInput`).
- **Checkbox**, line 284–294: `aria-label={`Select ${event.title}`}` — already a usable per-event hook (used today in `draft-and-history.spec.ts`).
- **Save / Discard button**, line 543–553:
  ```tsx
  <button
    onClick={handleExport}
    className={`w-full py-3 px-6 border-2 ...`}
    aria-label={selectedCount === 0 ? 'Discard all events' : `Save ${selectedCount} event${selectedCount !== 1 ? 's' : ''}`}
  >
    {selectedCount === 0 ? 'Discard all' : `Save (${selectedCount})`}
  </button>
  ```
  **The visible label and the aria-label both change with selection count** — so the test MUST select by a stable `data-testid`, never by text/aria.
- **`handleExport`**, line 233–247: if `selectedCount === 0` calls `onCancel()` and returns (no file); otherwise filters to selected events, calls `exportMultipleToICS(selectedEvents)`, and on success calls `onExportComplete(selectedEvents)`.

`src/services/exporter.ts`:

- `exportMultipleToICS(events, filename?)`, line 200–268: validates, builds `EventAttributes[]` via `dateToArray`, calls `createEvents` from the `ics` package, then `downloadICS(icsContent, exportFilename)` where `exportFilename = filename || `batch-events-${events.length}``  (line 259). **The multi-event filename is `batch-events-N.ics`** (N = number of events), after `sanitizeFilename` (which leaves `batch-events-3` unchanged).
- `dateToArray(date, allDay)`, line 114–130: **all-day → `[getFullYear, getMonth+1, getDate]` (3-tuple, local)**; **timed → `[getUTCFullYear, getUTCMonth+1, getUTCDate, getUTCHours, getUTCMinutes]` (5-tuple, UTC)**. Timed events use `startInputType/startOutputType: 'utc'`; all-day use `'local'`. So in the emitted ICS, an all-day event yields `DTSTART;VALUE=DATE:YYYYMMDD` (8 digits, no `T`/time) and a timed event yields `DTSTART:YYYYMMDDTHHMMSSZ` (UTC, `Z`-suffixed).
- `downloadICS(content, eventTitle)`, line 132–146: creates a Blob (`text/calendar`), `URL.createObjectURL`, `document.createElement('a')`, sets `link.download = `${sanitizeFilename(eventTitle)}.ics``, appends to body, **`link.click()`**, removes it, revokes the URL. This real anchor click is what `page.waitForEvent('download')` intercepts.

`src/services/icsParser.ts` — **reuse this to assert downloaded files; do not hand-parse ICS**:

- `parseICSContent(icsText: string): CalendarEvent[]`, line 25 — exported. Parses VEVENTs; `SUMMARY`→`title`, `DTSTART`/`DTEND` via `parseICSDate`, `VALUE=DATE` sets `allDay: true`.
- (Note: `parseICSDate` at line 142 has known date quirks — that's plans/008's territory. For 009 you assert against the **raw ICS text** for date format/`Z`/`VALUE=DATE`, and use `parseICSContent` to assert title/count/all-day flag — not to re-derive exact instants.)

### Where the event card list actually renders

`<BatchEventList>` is **not** rendered directly in `page.tsx`. It is imported and rendered in `src/components/UnsavedEventsSection.tsx` (import line 5, JSX usage line 194, gated by `events.length > 0` at line 193). `UnsavedEventsSection` is rendered in `src/app/page.tsx:1095`. The event cards appear below the input hero after a parse streams events in. (You do not need to touch `UnsavedEventsSection.tsx` — testids go on the elements inside `BatchEventList.tsx`.)

### The brittle / over-broad selector

`e2e/helpers.ts:110`:
```ts
export async function waitForEvents(page: Page, count = 1) {
  await expect(page.locator('h3.font-bold')).toHaveCount(count, { timeout: 20000 });
}
```
`e2e/event-extraction.spec.ts:114` has a duplicate local `waitForEvents` using the same selector, plus direct `page.locator('h3.font-bold')` at lines 135, 154, 180, 181, 216, 254, 255, 274, 292, 293, 334, 377. `e2e/draft-and-history.spec.ts:230` uses `toHaveCount(0)`. **17 total `h3.font-bold` occurrences across `e2e/`** (`grep -rn "h3\.font-bold" e2e/ | wc -l` → 17). The same class renders OUTSIDE the event card:
- `src/components/ProcessingQueuePanel.tsx:84` — `<h3 className="font-bold text-black">Processing Queue</h3>` (a fixed bottom-right overlay; can be present while events stream).
- `src/components/InputHistoryModal.tsx:182` — `<h3 className="text-sm font-bold uppercase ...">` day headers (already has `data-testid="input-history-day"`).
- `src/components/InlineEventEditor.tsx:226` — `<h3 className="font-bold text-base ...">{event.title}</h3>` (the expanded editor title).
This is why the selector is both fragile and over-broad; the testid migration (Step 2) fixes both.

### The error-notification selector

`e2e/event-extraction.spec.ts:352`:
```ts
const errorNotification = page.locator('div.border-2.border-black[role="alert"]');
```
This is the dismissible error toast (distinct from the textarea's inline `aria-invalid` alert at `SmartInput.tsx:632`, which is `<p ... role="alert">`). Replace with a `data-testid`.

### The URL-paste → scrape flow (suppressed today)

`src/services/urlDetector.ts:9` `detectURLs(text)` → POSTs `/api/detect-urls`, returns `{ urls, remainingText, hasUrls }`.
`src/services/webScraper.ts` `scrapeURLsBatch(urls)` (line 54) → for each URL POSTs **`/api/scrape-url`** (line 17), expecting a JSON body `{ url, text, title, status: 'success' }` (the route at `src/app/api/scrape-url/route.ts:46` returns exactly this shape; `status:'error'` on failure).
`src/app/page.tsx` `handleTextSubmit` (line 573): calls `detectURLs(inputText)` (line 590); if `hasUrls && urls.length > 0` (line 594) it calls `scrapeURLsBatch` (line 603), builds `combinedText` from `remainingText` + each scraped `title\n\ntext\n\n---\nOriginal Event: url` (lines 607–619), then POSTs `/api/parse` with `{ text: combinedText, batch: true, clientContext }` (line 658–663) and streams the SSE result.
`src/components/SmartInput.tsx`: a client-side `URL_REGEX` (line 29) drives a local `detectedUrls` state (line 131–139) that renders one `<URLPill>` per detected URL (line 583–594). **The pill renders purely from the typed text — it does NOT require the `/api/detect-urls` mock.** `URLPill` (`src/components/URLPill.tsx`) renders a `role="button"` with `aria-label="Copy URL to clipboard"` and a truncated-URL `<span>`; there is currently **no `data-testid` on the pill** (Step 6 adds one).
Every current test suppresses scraping: `helpers.ts:39` (`mockURLDetection` → `hasUrls:false`), `event-extraction.spec.ts:58`, and `community-limit.spec.ts:161`.

### The pattern-unlock flow

`src/components/AuthWrapper.tsx` (wraps the whole app; `useAuth()` from `@/hooks/useAuth` drives state). State machine (`type Screen = 'app' | 'limit' | 'pattern'`):
- Visiting `/?unlock` sets `screen='pattern'` (line 26–28).
- `screen === 'pattern' && !isAuthenticated` renders `<PatternLock onSubmit={handleVerify} .../>` (line 91–94).
- `handleVerify` (line 69) calls `verifyPattern(input)` from `useAuth`; `useAuth` POSTs the pattern to `/api/auth/verify` (the real route is `src/app/api/auth/verify/route.ts`). On success the auth cookie is set and `/api/auth/check` returns `authenticated:true`.
- When `isAuthenticated` becomes true, `screen` is forced to `'app'` (line 62–67) → the app body (children, including the `input-box`) renders (line 126–128).
`src/components/PatternLock.tsx`: a single `<canvas width={300} height={300}>` (line 213–225) with mouse/touch handlers. Dots are a 3×3 grid; `getDotPosition(index, size)` (line 43) computes each dot at `spacing*(col+1), spacing*(row+1)` where `spacing = size/(gridSize+1) = 300/4 = 75`. So node centers (canvas-local px) are at x,y ∈ {75,150,225}: index 0→(75,75), 1→(150,75), 2→(225,75), 3→(75,150), … 8→(225,225). `handleStart` picks the closest dot within `activeDotRadius*2 = 36px`; `handleMove` appends new dots; `handleEnd` (line 153) submits if `pattern.length >= 2`. **There is currently no per-dot DOM element and no `data-testid`** — the grid is canvas-drawn (Step 7 addresses this).
`src/app/page.tsx:1070`: `data-testid="input-box"` is the idle input container `<div>` wrapping `<SmartInput>`. `community-limit.spec.ts:102` already asserts `getByTestId('input-box')` becomes visible — reuse that as the "unlocked" assertion.

### Commands you will need

| Purpose         | Command                                             | Expected on success |
|-----------------|-----------------------------------------------------|---------------------|
| Install         | `bun install`                                       | exit 0              |
| Typecheck       | `bun run type-check`                                | exit 0, no errors   |
| Full e2e suite  | `bun run test:e2e`                                  | all specs pass      |
| One e2e file    | `bunx playwright test e2e/export-ics.spec.ts`       | that file passes    |
| One e2e file    | `bunx playwright test e2e/event-extraction.spec.ts` | that file passes    |
| Build           | `bun run build`                                     | exit 0              |

Notes:
- `bun run test:e2e` is `bunx playwright test` and auto-starts the dev server on `:3777` per `playwright.config.ts` (`webServer.command: 'bun run dev'`).
- **Do NOT use `bun run lint`** — broken until plans/004.
- `bun run test` (bun unit tests) only exists if plans/003 has landed; this plan does not depend on it. If `bun run test` is absent, that is expected — ignore it.
- If a dev server is already running on :3777 from a prior session, Playwright reuses it (see Step 8 — after that step, set `CI=` unset locally so reuse still works for you).

## Suggested executor toolkit

- Playwright download assertions: `const download = await page.waitForEvent('download')` resolves on the anchor click; `await download.path()` returns a local temp file path; read it with `fs.readFile(path, 'utf-8')`. See https://playwright.dev/docs/downloads. Wrap the click + wait in `Promise.all([page.waitForEvent('download'), button.click()])` to avoid the race.
- `page.getByTestId(id)` maps to the `data-testid` attribute by default in Playwright — no config needed.

## Scope

**In scope** (the only files you may modify or create):

Source (additive `data-testid` attributes ONLY — no logic/behavior/markup-structure changes):
- `src/components/BatchEventList.tsx` — add testids to the card container, title, title-edit input, date-edit input, time-edit input, and the Save/Discard button.
- `src/components/ErrorNotification.tsx` — add a `data-testid="error-notification"` to the bordered alert `<div>` (line 21). This is the verified owner of the dismissible error toast (the `aria-label="Dismiss error"` button is at line 36); the `border-2 border-black` class and `role="alert"` sit on adjacent lines (21 and 24), which is exactly the `div.border-2.border-black[role="alert"]` selector the spec matches today. (It is NOT `SmartInput.tsx:632`'s borderless `<p role="alert">` field-validation message.)
- `src/components/URLPill.tsx` — add a `data-testid="url-pill"` to the pill root.
- `src/components/PatternLock.tsx` — ONLY if Step 7 determines canvas-pointer simulation is unreliable: add invisible per-node `data-testid="pattern-node-<i>"` hit targets. See Step 7; this may instead become a STOP.

Config:
- `playwright.config.ts` — one line: `reuseExistingServer: true` → `reuseExistingServer: !process.env.CI`.

Tests:
- `e2e/export-ics.spec.ts` (create)
- `e2e/url-scrape.spec.ts` (create)
- `e2e/pattern-unlock.spec.ts` (create — unless Step 7 STOPs)
- `e2e/helpers.ts` (edit: migrate `waitForEvents` selector; optionally add a `mockScrape` helper)
- `e2e/event-extraction.spec.ts` (edit: migrate selectors; strengthen assertions)
- `e2e/draft-and-history.spec.ts` (edit: migrate the one `h3.font-bold` usage at line 230 to the testid)

**Out of scope** (do NOT touch):
- `e2e/prod.spec.ts` — runs against live prod with real auth; its two `h3.font-bold` usages (lines 25, 48) hit the *deployed* build which will NOT have your new testids until this ships. Leave it exactly as-is. (Note in your report that prod.spec can be migrated in a follow-up once deployed.)
- Any change to `src/services/exporter.ts`, `src/services/icsParser.ts`, `parseICSDate` behavior, or any date math — date *correctness* is plans/008. This plan asserts the *current* emitted format, not "correct" dates.
- `src/components/UnsavedEventsSection.tsx`, `src/app/api/scrape-url/route.ts`, `src/app/api/detect-urls/route.ts`, `src/lib/**` — no edits; you only mock the routes from tests.
- Adding any new dependency or test framework.
- Any refactor of `page.tsx` or `BatchEventList.tsx` structure (that is plans/014/015 — this plan exists to guard them).

## Git workflow

- Branch: `advisor/009-e2e-refactor-safety-net`
- One commit, message e.g. `Plan 009: e2e safety net — .ics download, stable testids, parse-correctness, scrape & unlock specs`, ending with the repo's trailer:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```
- Do NOT push or open a PR unless the operator instructed it.

## Steps

Order matters: add hooks first (Step 1), migrate to them (Step 2) so the suite still passes on the new hooks, THEN add new coverage (Steps 3–7), then the config fix (Step 8).

### Step 1: Add stable `data-testid` hooks to the surfaces the refactor will move

In `src/components/BatchEventList.tsx`, add these attributes (additive only — keep all existing classes/handlers/markup exactly):

- **Card container**: on the outer per-card `<div key={event.id} ...>` (currently line 270–275), add `data-testid="event-card"`.
- **Title heading**: on the `<h3 className="font-bold text-base truncate ...">` (line 316), add `data-testid="event-card-title"`.
- **Title edit input**: on the `<input type="text" value={event.title} ...>` (line 302), add `data-testid="event-card-title-input"`.
- **Date edit input**: on the `<input type="date" ...>` (line 337), add `data-testid="event-card-date-input"`.
- **Time edit input**: on the `<input type="time" ...>` (line 368), add `data-testid="event-card-time-input"`.
- **Save/Discard button**: on the `<button onClick={handleExport} ...>` (line 543), add `data-testid="save-events-button"`. (Select by THIS testid in tests, never by the label — the label toggles between `Save (N)` and `Discard all`.)

Error notification: add `data-testid="error-notification"` to the bordered alert `<div>` in `src/components/ErrorNotification.tsx` (line 21–24):
```tsx
<div
  key={error.id}
  className="border-2 border-black bg-white p-4 flex items-start gap-3"
  role="alert"
>
```
This is the dismissible toast that `event-extraction.spec.ts:352` matches via `div.border-2.border-black[role="alert"]` (border and `role` on adjacent lines) and whose dismiss button (`aria-label="Dismiss error"`) is at line 33–37. It is NOT the borderless `SmartInput.tsx:632` `<p role="alert">` field-validation message — leave that one untouched.

**Verify**:
```
grep -rE 'data-testid="(event-card|event-card-title|event-card-title-input|event-card-date-input|event-card-time-input|save-events-button|error-notification)"' src/ | wc -l
```
→ **≥ 7** (seven distinct testids present). And `bun run type-check` → exit 0.

### Step 2: Migrate every `h3.font-bold` event-card locator to `getByTestId('event-card-title')`

- In `e2e/helpers.ts`, change `waitForEvents` (line 109–111) to:
  ```ts
  export async function waitForEvents(page: Page, count = 1) {
    await expect(page.getByTestId('event-card-title')).toHaveCount(count, { timeout: 20000 });
  }
  ```
- In `e2e/event-extraction.spec.ts`: replace the duplicate local `waitForEvents` (line 113–115) selector the same way, and replace EVERY `page.locator('h3.font-bold')` (lines 135, 154, 180, 181, 216, 254, 255, 274, 292, 293, 334, 377) with `page.getByTestId('event-card-title')`. (The `.first()` / `.nth(n)` / `.toHaveCount(n)` calls stay — only the locator changes.)
- In `e2e/event-extraction.spec.ts:352`, replace `page.locator('div.border-2.border-black[role="alert"]')` with `page.getByTestId('error-notification')`.
- In `e2e/draft-and-history.spec.ts:230`, replace `page.locator('h3.font-bold')` with `page.getByTestId('event-card-title')`.
- Do NOT touch `e2e/prod.spec.ts` (out of scope).

**Verify**:
```
grep -rn "h3\.font-bold" e2e/ | grep -v prod.spec.ts | wc -l    # → 0
grep -rn "border-2.border-black\[role" e2e/ | wc -l             # → 0
bunx playwright test e2e/event-extraction.spec.ts e2e/draft-and-history.spec.ts
```
→ both spec files pass (same assertions as before, now on stable hooks).

### Step 3: New spec `e2e/export-ics.spec.ts` — exercise the real .ics download

Create `e2e/export-ics.spec.ts`. Import the shared helpers (`setupLocal`, `mockParseAPI`, `submitText`, `waitForEvents`) from `./helpers`, and import the parser: `import { parseICSContent } from '../src/services/icsParser';` (verify this relative import type-checks from `e2e/`; the tsconfig `@/*` alias may also work as `@/services/icsParser` — use whichever `bun run type-check` accepts).

Pattern for reading a download:
```ts
import { promises as fs } from 'fs';
// ...
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByTestId('save-events-button').click(),
]);
const path = await download.path();
const ics = await fs.readFile(path!, 'utf-8');
```

Write these cases (all start with `await setupLocal(page)` then a per-test `await mockParseAPI(page, [...])` BEFORE `submitText`):

1. **Timed single event** — mock one event `{ title: 'Dinner at Luigi\'s', startDate: '2026-03-13T19:00:00', endDate: '2026-03-13T20:00:00', location: "Luigi's Restaurant", confidence: 0.92, allDay: false, timezone: null }`; submit; `await waitForEvents(page, 1)`; trigger download. Assert:
   - `ics` contains `BEGIN:VCALENDAR` and exactly one `BEGIN:VEVENT`.
   - `ics` contains `SUMMARY:Dinner at Luigi` (the title; `ics` escapes commas, so match a prefix substring, not the apostrophe-and-comma-laden full string).
   - `ics` contains a timed, UTC `DTSTART` ending in `T190000Z` — assert with a regex `/DTSTART(;[^:]*)?:\d{8}T190000Z/`. (19:00 local-as-UTC per `dateToArray`'s UTC getters; the mocked startDate has no `Z`, and the app constructs the Date such that 19:00 is emitted — assert `T190000Z` is present.)
   - `parseICSContent(ics)` returns an array of length 1 whose `[0].title` starts with `Dinner at Luigi` and `[0].allDay === false`.
2. **All-day event** — mock `{ title: 'Company offsite', startDate: '2026-03-20', allDay: true, location: 'Napa Valley', confidence: 0.85, timezone: null }`; submit; `waitForEvents(1)`; download. Assert:
   - `ics` contains a `DATE`-valued DTSTART with **8 digits and no time**: regex `/DTSTART;VALUE=DATE:\d{8}(\r?\n|$)/` matches, AND there is no `T` in that DTSTART line.
   - `parseICSContent(ics)[0].allDay === true`.
3. **Multi-event + filename** — mock three distinct events (e.g. Standup / Design Review / Retro, mirroring `event-extraction.spec.ts:184` Scenario 4); submit; `waitForEvents(3)`; download. Assert:
   - `ics` contains exactly **3** `BEGIN:VEVENT` occurrences (count matches via `(ics.match(/BEGIN:VEVENT/g) ?? []).length === 3`).
   - `parseICSContent(ics)` has length 3.
   - **Filename is `batch-events-3.ics`**: `expect(download.suggestedFilename()).toBe('batch-events-3.ics')`.
4. **Selection → export emits only selected** — mock three events; `waitForEvents(3)`; **deselect one** via its checkbox `page.locator('input[aria-label="Select <that title>"]').uncheck()` (the checkbox aria-label is `Select ${event.title}`, see `BatchEventList.tsx:293`); confirm the Save button now reads/uses the `save-events-button` testid (do not assert its text); download. Assert:
   - `ics` contains exactly **2** `BEGIN:VEVENT`.
   - `parseICSContent(ics)` has length 2 and does NOT include the deselected title (`.every(e => e.title !== '<deselected title>')`).

**Verify**: `bunx playwright test e2e/export-ics.spec.ts` → all 4 cases pass. And `grep -rE "waitForEvent\('download'\)|DTSTART" e2e/` returns hits (≥ 1).

### Step 4: Strengthen the existing parse specs to assert rendered date/time/location and all-day

In `e2e/event-extraction.spec.ts`, beyond the migrated title assertions, add rendered-field assertions (the card always shows date + time on one line — see `BatchEventList.tsx:333–395` using `Intl.DateTimeFormat`; location after a `•` when present):

- **Scenario 1 (timed, line ~118)**: after `waitForEvents(1)`, assert the card text contains the rendered month/day and the time. Scope to the card: `const card = page.getByTestId('event-card').first();` then `await expect(card).toContainText('Mar 13')` and `await expect(card).toContainText(/7:00\s?PM/)`. Since `timezone` may shift the wall-clock display, prefer asserting the date token `Mar 13` (robust) and the presence of a `:00` time token; if a specific `7:00 PM` proves locale/timezone-flaky on the runner, assert the date + that a `<time-ish>` token matching `/\d{1,2}:\d{2}\s?[AP]M/` is present and tag it with an inline comment. Also click the card and assert the location: the card expands on click (`toggleExpand`), and Scenario "Event card expands" (line 315) already proves location becomes visible — add `await expect(card).toContainText("Luigi's Restaurant")` after expanding, OR assert the always-visible inline location `await expect(card).toContainText("Luigi's Restaurant")` (location renders inline at line 453–484 when present, even collapsed).
- **Scenario 2 (all-day, line ~138)**: the all-day card still renders a date; assert `await expect(card).toContainText('Mar 20')` and that `Napa Valley` is present.
- **Scenario 7 (timezone, line ~258)**: assert the timezone abbreviation chip renders — the card shows `getTimezoneAbbreviation(...)` (line 400) for non-all-day events; assert the card contains a short tz token (e.g. matches `/[A-Z]{2,5}T|UTC|GMT/`). Keep this loose (it depends on the runner's browser timezone) — the point is the chip exists, not its exact value.

Keep each new assertion scoped to `page.getByTestId('event-card').nth(i)` so multi-event scenarios don't cross-match.

**Verify**: `bunx playwright test e2e/event-extraction.spec.ts` → all scenarios pass with the added assertions.

### Step 5: Add a `mockScrape` helper

In `e2e/helpers.ts`, add (mirroring the existing `mockURLDetection` style):
```ts
// Forces the URL-paste→scrape branch ON: detect-urls reports a URL, scrape-url
// returns canned page content. Register AFTER setupLocal so it overrides the
// hasUrls:false default.
export async function mockURLDetectionWithUrls(page: Page, url: string, remainingText = '') {
  await page.route('**/api/detect-urls', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hasUrls: true, urls: [url], remainingText }),
    });
  });
}

export async function mockScrape(page: Page, url: string, title: string, text: string) {
  await page.route('**/api/scrape-url', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, text, title, status: 'success' }),
    });
  });
}
```
(The `Route` type is already imported in `helpers.ts`.)

**Verify**: `bun run type-check` → exit 0.

### Step 6: New spec `e2e/url-scrape.spec.ts` — URL paste → pill → scrape → parsed card

First, add a stable hook to the pill: in `src/components/URLPill.tsx`, add `data-testid="url-pill"` to the outer `<div className="relative inline-block">` (line 92).

Create `e2e/url-scrape.spec.ts`. Use a non-meetup URL like `https://example.com/my-event`. The pill renders from the typed text alone (client-side `URL_REGEX`), so:

1. **Pill renders on paste/type** — `await setupLocal(page)`; type a string containing the URL into `[data-testid="smart-input-textarea"]` (use `.fill(...)`); assert `await expect(page.getByTestId('url-pill')).toHaveCount(1)`.
2. **Scrape branch produces a parsed card** — `await setupLocal(page)`; then register the overrides: `await mockURLDetectionWithUrls(page, 'https://example.com/my-event', '')`, `await mockScrape(page, 'https://example.com/my-event', 'Launch Party', 'Join us June 30 2026 at 6pm at HQ')`, and `await mockParseAPI(page, [{ title: 'Launch Party', startDate: '2026-06-30T18:00:00', endDate: '2026-06-30T19:00:00', location: 'HQ', confidence: 0.9, allDay: false, timezone: null }])`. Then `await submitText(page, 'See https://example.com/my-event for details')`; `await waitForEvents(page, 1)`; assert `await expect(page.getByTestId('event-card-title').first()).toContainText('Launch Party')`. This proves detect→scrape→parse end-to-end (the parse mock stands in for the LLM, but the scrape branch in `page.tsx:594–624` actually executes and feeds `combinedText`). Optionally assert the parse request carried the scraped text by intercepting `/api/parse` and checking `route.request().postDataJSON().text` contains `Launch Party` — include this only if it's not flaky.

**Verify**: `bunx playwright test e2e/url-scrape.spec.ts` → both cases pass. `grep -rn 'data-testid="url-pill"' src/` → 1 hit.

### Step 7: Pattern-unlock behavior test (canvas pointer first; per-node testids only if needed)

Goal: prove that drawing a valid pattern transitions from the PatternLock canvas to the unlocked app (`input-box` visible). Create `e2e/pattern-unlock.spec.ts`.

Mocks: the unlock succeeds when `/api/auth/verify` returns ok AND `/api/auth/check` then reports authenticated. Register both before navigating:
```ts
await page.route('**/api/auth/verify', (route) => route.fulfill({ json: { success: true } }));
let authed = false;
await page.route('**/api/auth/verify', (route) => { authed = true; return route.fulfill({ json: { success: true } }); });
await page.route('**/api/auth/check', (route) => route.fulfill({ json: { authenticated: authed } }));
```
(Read `src/hooks/useAuth.ts` to confirm the exact success shape `verifyPattern` expects from `/api/auth/verify` — match it. The two-step `authed` flip models "check returns false until verify succeeds, true after".) Navigate to `/?unlock` so `AuthWrapper` shows `screen='pattern'` (line 26–28). Assert `await expect(page.locator('canvas')).toBeVisible()`.

**Attempt A — canvas pointer simulation (preferred, no source change):** The canvas is 300×300 with node centers at canvas-local px {75,150,225} (see Current state). Draw the simplest valid 2-node line (indices 0→1, i.e. (75,75)→(150,75)) using bounding-box-relative coordinates:
```ts
const box = (await page.locator('canvas').boundingBox())!;
await page.mouse.move(box.x + 75, box.y + 75);
await page.mouse.down();
await page.mouse.move(box.x + 150, box.y + 75, { steps: 10 });
await page.mouse.up();
```
Then assert the unlock transition: `await expect(page.getByTestId('input-box')).toBeVisible({ timeout: 10000 })`. (`handleEnd` submits when `pattern.length >= 2`; on a mocked-ok verify, `isAuthenticated` flips and `AuthWrapper` renders children → `input-box`.) Run it 3× to gauge flakiness:
```
bunx playwright test e2e/pattern-unlock.spec.ts --repeat-each=3
```

**Attempt B — only if A is flaky/unreliable after a genuine try:** Add invisible hit-target overlays to `PatternLock.tsx` so the test can `.click()` discrete nodes instead of simulating pointer drift. Inside the `<div className="relative touch-none">` wrapper (line 212), after the `<canvas>`, add an absolutely-positioned layer of 9 elements positioned at the same grid centers, each `data-testid={`pattern-node-${i}`}`, `aria-hidden`, with `pointer-events` enabled, sized ~36px and centered on each node — and wire `onMouseDown`/`onMouseEnter` (or a combined pointer handler) on each to call the existing `handleStart`/`handleMove` with that node's center coordinates (reuse `getDotPosition(i, canvas.width)` + the canvas rect). This must be purely additive and must NOT change how real users draw on the canvas. The test then does: mousedown on `pattern-node-0`, move/enter `pattern-node-1`, mouseup; assert `input-box` visible. Run `--repeat-each=3` again.

**STOP if neither A nor B yields a non-flaky test** (3/3 passes, twice): do not commit a flaky unlock test. Instead, leave `pattern-unlock.spec.ts` containing ONLY the deterministic part that already works today (navigate `/?unlock`, assert the canvas is visible — equivalent to `community-limit.spec.ts:87` but standalone), mark the draw-and-unlock assertion `test.fixme(...)` with a comment explaining canvas-drive flakiness, and report this in your summary as a known gap. (See STOP conditions.)

**Verify**: `bunx playwright test e2e/pattern-unlock.spec.ts --repeat-each=3` → all repetitions pass (or, if STOPped to the canvas-visible-only test, that passes 3/3 and the draw assertion is `fixme`, not failing).

### Step 8: Fix `reuseExistingServer` so CI never validates a stale server

In `playwright.config.ts`, change line 36:
```ts
reuseExistingServer: true,
```
to:
```ts
reuseExistingServer: !process.env.CI,
```
(Locally `CI` is unset → reuse stays on, so your iteration is unaffected. In CI `CI=1` → Playwright always boots a fresh server.)

**Verify**: `grep -n "reuseExistingServer" playwright.config.ts` → `reuseExistingServer: !process.env.CI,`. Then a full run still works locally: `bun run test:e2e` → all non-prod specs pass.

## Test plan

New specs and the cases each must contain:
- `e2e/export-ics.spec.ts` (Step 3): timed-event ICS (SUMMARY + `T190000Z` DTSTART + 1 VEVENT), all-day ICS (`DTSTART;VALUE=DATE:` 8-digit, no time), multi-event (3 VEVENTs + `batch-events-3.ics` filename), selection→export (deselect 1 of 3 → 2 VEVENTs, deselected title absent). Uses `page.waitForEvent('download')` + `parseICSContent` from `src/services/icsParser.ts`.
- `e2e/url-scrape.spec.ts` (Step 6): pill-renders-on-type; detect→scrape→parse produces a card titled from the scraped/parsed content.
- `e2e/pattern-unlock.spec.ts` (Step 7): canvas visible on `/?unlock`; draw a 2-node pattern → `input-box` visible (or `fixme` per STOP).
- Strengthened in `e2e/event-extraction.spec.ts` (Step 4): rendered date/time/location + all-day assertions, scoped per `event-card`.
- Migrated to stable hooks (Step 2): `helpers.ts`, `event-extraction.spec.ts`, `draft-and-history.spec.ts`.

Structural patterns to mirror: `e2e/draft-and-history.spec.ts` (uses `setupLocal`, `mockParseAPI`, `submitText`, `waitForEvents`, per-event checkbox `aria-label`) and `e2e/community-limit.spec.ts` (route-mock + `getByTestId` assertions, `/?unlock` canvas).

Final verification: `bun run test:e2e` → all non-prod specs pass; `bun run type-check` → exit 0; `bun run build` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rE 'data-testid="(event-card|event-card-title|event-card-title-input|event-card-date-input|event-card-time-input|save-events-button|error-notification)"' src/ | wc -l` → ≥ 7
- [ ] `grep -rn 'data-testid="url-pill"' src/` → ≥ 1
- [ ] `grep -rn "h3\.font-bold" e2e/ | grep -v prod.spec.ts | wc -l` → 0 (the only remaining `h3.font-bold` usages are in the out-of-scope `prod.spec.ts`)
- [ ] `grep -rE "waitForEvent\('download'\)|DTSTART" e2e/ | wc -l` → ≥ 1
- [ ] `ls e2e/export-ics.spec.ts e2e/url-scrape.spec.ts e2e/pattern-unlock.spec.ts` → all three exist
- [ ] `grep -n "reuseExistingServer" playwright.config.ts` → `reuseExistingServer: !process.env.CI,`
- [ ] `bun run test:e2e` → all non-prod specs pass (the new export-ics, url-scrape, and pattern-unlock specs included; pattern-unlock may have a single `test.fixme` only if Step 7 STOPped on flakiness)
- [ ] `bun run type-check` → exit 0
- [ ] `bun run build` → exit 0
- [ ] `git status` shows only the in-scope files changed (no edits to `e2e/prod.spec.ts`, `src/services/exporter.ts`, `src/services/icsParser.ts`, `UnsavedEventsSection.tsx`, the API routes, or `src/lib/**`)
- [ ] `plans/README.md` status row for 009 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any in-scope file changed since `400bf32` and the "Current state" excerpt no longer matches the live code (especially `BatchEventList.tsx` line numbers for the title/inputs/Save button, `exporter.ts`'s `batch-events-${events.length}` filename, or `AuthWrapper.tsx`'s screen state machine).
- After Step 1, the error-notification toast cannot be uniquely identified (the `div.border-2.border-black[role="alert"]` + `button[aria-label="Dismiss error"]` pair grep finds zero or multiple ambiguous owners) — report what you found rather than tagging the wrong element.
- `page.waitForEvent('download')` never fires after clicking `save-events-button` (e.g. the click path no longer reaches `downloadICS`) — this is itself a finding (the product export is broken); report it with the observed behavior, do not paper over it by asserting something weaker.
- The emitted ICS does NOT match the asserted format (no `T190000Z` for the timed case, or no `DTSTART;VALUE=DATE:` 8-digit for all-day) — report the actual `DTSTART` lines you observed; this may mean `dateToArray` changed (coordinate with plans/008) — do not loosen the assertion to make it pass.
- The pattern-unlock draw cannot be made non-flaky via Attempt A or Attempt B (per Step 7) — degrade `pattern-unlock.spec.ts` to the canvas-visible-only assertion with the draw step `test.fixme`, and report the gap. Do NOT commit a test that fails intermittently.
- `parseICSContent` cannot be imported into a spec under `e2e/` (neither the relative path nor the `@/` alias type-checks there) — report; you may inline a tiny VEVENT-count + SUMMARY regex check instead, but say so.
- Any step's verification fails twice after a reasonable fix attempt.
- A fix appears to require touching an out-of-scope file (other than the single error-notification testid, which may legitimately land in `page.tsx` if that's where the toast lives).

## Maintenance notes

For whoever owns this after it lands:

- **This plan MUST land before plans/014 and plans/015** (the BatchEventList / component refactors) and before any `src/app/page.tsx` decomposition. Those refactors are the reason this net exists: with stable `data-testid` hooks (not `h3.font-bold`) and a real download assertion, a refactor that moves the card markup or breaks the `.ics` emission will fail a test instead of shipping silently. If 014/015 rename or relocate the tagged elements, they must carry the `data-testid`s along — that is the contract.
- **Complements plans/003, doesn't overlap.** 003 unit-tests `.ics` string generation/parsing at the function level, offline, fast. 009 tests the *browser*: the Save-button click, the real `<a download>`, the file the user actually receives, and the cross-component flows (scrape, unlock). Keep both; they catch different breakages.
- **`e2e/prod.spec.ts` still uses `h3.font-bold`** (lines 25, 48) because it runs against the deployed build, which won't have the new testids until this ships. After deploy, a follow-up can migrate prod.spec to `getByTestId('event-card-title')` and delete the last `h3.font-bold` usages.
- **Date assertions here pin current behavior, not correctness.** When plans/008 fixes the date math, the `T190000Z` / `VALUE=DATE` assertions in `export-ics.spec.ts` may need updating in lockstep — that's expected and is 008's job to do deliberately.
- **Reviewer focus**: confirm the new source changes are *only* `data-testid` attributes (no logic/markup-structure change) via the diff; confirm the download assertions read the real file (not just that a download event fired); confirm `pattern-unlock.spec.ts` either truly drives the unlock or honestly `fixme`s it (no false-green); confirm `e2e/prod.spec.ts` is untouched.
- If a future change makes the Processing Queue panel or history-modal day headers stop using `font-bold`, that's harmless now — nothing keys off `h3.font-bold` anymore once Step 2 lands.
