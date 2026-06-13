# Plan 015: Consolidate the event-card / list / selection / shimmer / timezone-picker primitives into single-responsibility homes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index. (A reviewer maintains the index for this plan; do not
> edit `plans/README.md`.)
>
> **Drift check (run first)**:
> `git diff --stat 400bf32..HEAD -- src/components/BatchEventList.tsx src/components/UnsavedEventsSection.tsx src/app/page.tsx src/hooks e2e/draft-and-history.spec.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (`InlineEventEditor.tsx` is **not**
> listed: plan 014 deletes it — this plan never touches it. After 014 lands,
> confirm 014's outputs exist instead:
> `ls src/components/EventFields.tsx src/components/TimezonePicker.tsx` → both
> present; if either is missing, STOP.)

## Status

- **Priority**: P2
- **Effort**: M–L
- **Risk**: MED — the #1 risk is regressing the **streaming event-selection semantics** (preserve manual deselects, default new arrivals to selected, drop deleted) when that state is lifted out of `BatchEventList` into a hook mounted in `page.tsx`. The guard is the existing e2e test `e2e/draft-and-history.spec.ts:234-274` ("Streaming selection") **plus** the new `useEventSelection` reducer unit tests added in Step 1.
- **Depends on**:
  - **plans/009** — REQUIRED. It turns the Playwright suite into a real refactor net and adds stable `data-testid` hooks to the event card. This plan relies on that net (especially the streaming-selection spec) to catch regressions. plans/009 itself states it "Must land BEFORE plans/014 and plans/015". **If 009 is not landed, STOP.**
  - **plans/010** — RECOMMENDED, not strictly required. It deletes the orphaned `ProcessingSection.tsx` (the *other*, now-unused copy of the `FUN_MESSAGES`/shimmer block) and creates `src/types/processing.ts`. Deleting the shimmer primitives from `ProcessingSection.tsx` is plan 010's job, not this plan's — this plan only removes the copy in `UnsavedEventsSection.tsx`. If 010 has landed, that file is already gone, and Step 2's new component should consume `src/types/processing.ts` if the status types are useful. If 010 has NOT landed, Step 2 still proceeds (it only touches `UnsavedEventsSection.tsx`), and you must additionally update the orphaned `ProcessingSection.tsx` copy ONLY IF it imports the extracted shimmer — it does not today (it has its own copy and zero importers), so leave it alone and note it in your report.
  - **plans/014** — **HARD dependency**. 014 (a) replaces `InlineEventEditor` with a shared `<EventFields>` and **deletes `InlineEventEditor.tsx` / `EventEditor.tsx` / `EventConfirmation.tsx`**, and (b) creates the single shared `<TimezonePicker>` (+ `COMMON_TIMEZONES`) at `src/components/TimezonePicker.tsx`. This plan **consumes both**: `<EventCard>`'s expanded body renders `<EventFields>` (created by 014 — see Step 3), and the collapsed card's tz control **imports** the `<TimezonePicker>` 014 created at `src/components/TimezonePicker.tsx` — it does **NOT** build a second one. **If 014 is not landed, STOP** (its `<EventFields>` and `<TimezonePicker>` are prerequisites; `grep -l "export default" src/components/EventFields.tsx src/components/TimezonePicker.tsx` must succeed before this plan can run). This is the model the index `plans/README.md` states: "015 renders `<EventFields>` from 014, reuses the `<TimezonePicker>` 014 extracts."
- **Category**: tech-debt
- **Planned at**: commit `400bf32`, 2026-06-13

## Why this matters

`src/components/BatchEventList.tsx` is a 578-line god-component welding four
unrelated responsibilities into one file: a timezone-picker widget, per-card
inline field editing, selection+expand state with subtle streaming logic, and
the export/footer. Worse, several of those concerns are **duplicated**:
`COMMON_TIMEZONES` and a tz `<select>` exist verbatim in both `BatchEventList.tsx`
and the editor family — which plan **014** collapses into the single shared
`src/components/TimezonePicker.tsx` (this plan imports that picker rather than
re-deriving the `<select>`); the `FUN_MESSAGES` shimmer block in
`UnsavedEventsSection.tsx` is a byte-for-byte fork of the one in the orphaned
`ProcessingSection.tsx` (see plans/010); and the card edits each field **twice
over** — the collapsed row hand-rolls title/date/time/location editing while the
expanded view delegates the same fields to the editor (`<EventFields>`, created
by 014).

The cost is concrete: every render builds `new Intl.DateTimeFormat(...)` per card
(twice — `BatchEventList.tsx:359` and `:390`) and the tz `<select>` formats ~17
timezone labels per card (`BatchEventList.tsx:409-416`); the list map
(`BatchEventList.tsx:265`) is unmemoized and the parent re-renders on a 6–9 s
message-rotation timer (`UnsavedEventsSection.tsx:130-144`), so a 10-event batch
re-formats ~190 `Intl` objects every few seconds while idle.

When this lands: one `React.memo`'d `<EventCard>`, one `<EventCardList>` shell,
one `useEventSelection` hook (selection owned at the page level, ready to share
with a future header/footer), one `<ProcessingShimmer>`, and one
`<TimezonePicker>` — each with a single home. `BatchEventList.tsx` shrinks to a
thin wrapper or is deleted. Estimated net reduction ~495 lines, plus the per-card
`Intl` churn is hoisted to module scope and memoized.

## Current state

Repo conventions: Next.js 15 App Router, **React 19**, TS strict, package
manager **bun**, path alias `@/*`→`src/*`. Components are `'use client'` where
they use hooks. The established e2e locator convention is
`page.getByTestId('...')`; the only `data-testid` in the current card/section
files is `cancel-job-button` (`UnsavedEventsSection.tsx:174`) — plans/009 adds
more to the card, which is why 009 must land first.

### `src/components/BatchEventList.tsx` (578 lines) — the god-component

Four welded responsibilities (verified line ranges at `400bf32`):

**(a) Timezone widget** — `COMMON_TIMEZONES` literal at `:9-27`;
`handleTimezoneChange` at `:93-113`; `getTzInfoLines` at `:115-133`; the
`<select>` overlay + info popover at `:396-452`. The `<select>` rebuilds ~17
formatted labels per card per render:

```tsx
// src/components/BatchEventList.tsx:409-416
{COMMON_TIMEZONES.map(tz => (
  <option key={tz.value} value={tz.value}>
    {(() => {
      const abbr = getTimezoneAbbreviation(event.startDate, tz.value);
      return abbr === tz.label ? tz.label : `${tz.label} (${abbr})`;
    })()}
  </option>
))}
```

**(b) Per-card inline editing** — module-scope helpers `formatDateForInput`
(`:54-59`) and `formatTimeForInput` (`:61-65`); `handleFieldEdit` (`:186-206`);
the collapsed-row edit/display blocks for title (`:300-325`), date (`:335-364`),
time (`:366-395`), location (`:456-484`). The date/time *display* spans build
`Intl.DateTimeFormat` inline on every render:

```tsx
// src/components/BatchEventList.tsx:359-363  (date display)
{new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
}).format(event.startDate)}
// ...and again at :390-393 for the time.
```

**(c) Selection + expand state** — two `Set<string>` (`expandedEventIds`
`:83`, `selectedEventIds` `:84`), `seenIdsRef` (`:87`), the streaming
auto-select effect (`:135-151`), and the toggles `toggleExpand` (`:153-163`),
`toggleSelection` (`:165-175`), `toggleSelectAll` (`:177-184`). **The
streaming-reconcile effect is the load-bearing, subtle piece — copy it
verbatim into the hook in Step 1:**

```tsx
// src/components/BatchEventList.tsx:135-151
useEffect(() => {
  const currentIds = events.map((e) => e.id);
  const currentIdSet = new Set(currentIds);
  const newlyArrived = currentIds.filter((id) => !seenIdsRef.current.has(id));
  newlyArrived.forEach((id) => seenIdsRef.current.add(id));

  setSelectedEventIds((prev) => {
    // Preserve the user's existing choices; only default newly-arrived events to selected.
    const next = new Set(prev);
    newlyArrived.forEach((id) => next.add(id));
    // Drop selections for events that no longer exist (e.g. deleted).
    for (const id of next) {
      if (!currentIdSet.has(id)) next.delete(id);
    }
    return next;
  });
}, [events]);
```

`toggleSelectAll` semantics (`:177-184`): if **more than half** are selected,
clear all; else select all. The footer label flips between "Select all" /
"Unselect all" on the same `selectedCount > events.length / 2` predicate
(`:251-252`).

**(d) Export / footer** — `handleExport` (`:233-247`, calls
`exportMultipleToICS` then `onExportComplete`, or `onCancel` when nothing is
selected), and the Save/Discard button + "N events will be lost" warning +
select-all toggle (`:540-574`).

The actual **list shell** is small: the scroll container + `events.map` opens at
`:264-265`, each card is a `<div>` frame with the collapsed header and an
expand chevron (`:489-513`), and the expanded body today delegates to
`InlineEventEditor` (`:518-534`). **This plan swaps that body to `<EventFields>`
(created by 014), which accepts the full superset of the old
`InlineEventEditorProps` plus `mode` — so the same props carry over verbatim:**

```tsx
// src/components/event-card/EventCard.tsx  (expanded body — render <EventFields> from plan 014)
{isExpanded && (
  <div className="border-t-2 border-black p-4 bg-gray-50">
    <EventFields
      mode="inline"
      event={event}
      onChange={(updatedEvent) => { onEdit(updatedEvent); }}
      showAttachments={true}
      hideTitle={true}
      hideTimezoneInfo={true}
      tzSuggestion={tzSuggestions?.[event.id]}
      onTzSuggestionApply={onTzSuggestionApply ? (tz) => onTzSuggestionApply(event.id, tz) : undefined}
      onTzSuggestionDismiss={onTzSuggestionDismiss ? () => onTzSuggestionDismiss(event.id) : undefined}
      onTimezoneUserChange={onTimezoneUserChange ? () => onTimezoneUserChange(event.id) : undefined}
    />
  </div>
)}
```

The selection checkbox — its `aria-label` is **load-bearing for the e2e
guard** and must be preserved verbatim:

```tsx
// src/components/BatchEventList.tsx:284-294
<input
  type="checkbox"
  checked={selectedEventIds.has(event.id)}
  onClick={(e) => e.stopPropagation()}
  onChange={(e) => { e.stopPropagation(); toggleSelection(event.id); }}
  className="w-5 h-5 border-2 border-black cursor-pointer focus:ring-2 focus:ring-black flex-shrink-0"
  aria-label={`Select ${event.title}`}
/>
```

`BatchEventList`'s props interface is at `:37-52`. Its only caller is
`UnsavedEventsSection.tsx:194-208`.

### `src/components/UnsavedEventsSection.tsx` (213 lines)

Wraps `BatchEventList` and owns the processing shimmer. The shimmer primitives —
`FUN_MESSAGES` (`:38-55`), `AnimatedEllipsis` (`:57-82`), `RainbowText`
(`:84-102`), `SkeletonLoader` (`:104-111`) — and the message-rotation effect
(`:130-144`) are **the parent re-render driver** (a `setTimeout` every 6–9 s
bumps `currentMessageIndex`, re-rendering the whole subtree including every card):

```tsx
// src/components/UnsavedEventsSection.tsx:130-144
const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
useEffect(() => {
  const getRandomInterval = () => Math.floor(Math.random() * 3000) + 6000;
  const scheduleNextMessage = () => {
    const timeout = setTimeout(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % FUN_MESSAGES.length);
      scheduleNextMessage();
    }, getRandomInterval());
    return timeout;
  };
  const timeout = scheduleNextMessage();
  return () => clearTimeout(timeout);
}, []);
```

The shimmer is rendered at `:168-190` (the `hasActiveProcessing` block:
cancel button → `RainbowText`/`AnimatedEllipsis` heading → `processingCount`
`SkeletonLoader`s). `processingCount` is computed at `:157-160`. These four
primitives + this effect are a **byte-for-byte fork** of the same code in the
orphaned `ProcessingSection.tsx` (see plans/010).

### `<EventFields>` + `<TimezonePicker>` (created by plan 014 — consumed here)

Plan 014 deletes the old editor family (`InlineEventEditor.tsx`,
`EventEditor.tsx`, `EventConfirmation.tsx`) and replaces it with the shared
`<EventFields>` editor body **and** a single `<TimezonePicker>` (the canonical
home for the tz `<select>` + abbreviation label + resolving spinner +
info-popover), exporting `COMMON_TIMEZONES` from
`src/components/TimezonePicker.tsx` as the **single source of truth** for the 17
zones. After 014 lands, `grep -rln "COMMON_TIMEZONES" src/` →
`TimezonePicker.tsx` **and** `BatchEventList.tsx` (this plan deletes
`BatchEventList`'s copy in Step 6, leaving `TimezonePicker.tsx` as the sole
home). This plan **imports** both: `<EventCard>`'s expanded body renders
`<EventFields>` (Step 3) and the collapsed card's tz control renders the shared
`<TimezonePicker>` (Step 5) — it builds **neither**.

### `src/app/page.tsx` (1596 lines) — the wiring + selection's true owner

`unsavedEvents` state is declared at `:65`
(`const [unsavedEvents, setUnsavedEvents] = useState<CalendarEvent[]>([])`);
every mutation lives here (appends at `:534`, `:717`, `:843`; edit
`handleBatchEventEdit` `:908-912`; delete `handleBatchEventDelete` `:914-916`;
clear `handleCancelBatch` `:922-926`). `<UnsavedEventsSection>` is rendered at
`:1095-1134` and receives `events={unsavedEvents}` (`:1096`) and the
`onExportComplete` that saves+clears (`:1104-1108`). **Selection is currently
NOT here — it lives inside `BatchEventList`.** Lifting it here (Step 4) is the
risky move; the reconcile effect's `[events]` dependency becomes `[unsavedEvents]`.

### The e2e guard — `e2e/draft-and-history.spec.ts:234-274`

The "Streaming selection" test is the behavioral contract this refactor must not
break. It mocks events titled `Alpha event`/`Beta event`, deselects Alpha via
`input[aria-label="Select Alpha event"]`, streams in `Gamma event`, then asserts
Alpha stays unchecked and Gamma is checked:

```ts
// e2e/draft-and-history.spec.ts:259-273  (the assertions you must keep green)
// Deselect one event mid-session.
const alpha = page.locator('input[aria-label="Select Alpha event"]');
await alpha.uncheck();
await expect(alpha).not.toBeChecked();
// A new event streams in (appends to the batch).
nextBatch = [ { title: 'Gamma event', /* ... */ } ];
await submitText(page, 'second batch streams in');
await waitForEvents(page, 3);
// Manual deselection must persist; the newly-arrived event defaults to selected.
await expect(page.locator('input[aria-label="Select Alpha event"]')).not.toBeChecked();
await expect(page.locator('input[aria-label="Select Gamma event"]')).toBeChecked();
```

This is exactly why the checkbox `aria-label={`Select ${event.title}`}` must be
preserved character-for-character, and why the reconcile logic must move
verbatim.

## Commands you will need

| Purpose       | Command                          | Expected on success                                  |
|---------------|----------------------------------|------------------------------------------------------|
| Install       | `bun install`                    | exit 0                                                |
| Typecheck     | `bun run type-check`             | exit 0, no errors (verified passing at `400bf32`)     |
| Build         | `bun run build`                  | exit 0 (verified passing at `400bf32`)                |
| Unit tests    | `bun test src`                   | all pass (see note ⚠ below)                           |
| E2e (full)    | `bun run test:e2e`               | all pass (the behavioral guard)                       |
| Targeted e2e  | `bunx playwright test e2e/draft-and-history.spec.ts` | all pass; "Streaming selection" green |

⚠ **`bun test` note**: this repo has **no `test` npm script** and **no
`*.test.ts(x)` files exist yet at `400bf32`** (plans/003, the unit-test baseline,
is not landed). `bun test` is bun's *built-in* runner and works without a script
or config — it discovers `*.test.ts` by convention. The reducer test you add in
Step 1 is therefore the first `src` unit test; `bun test src` will report just
your new cases. **Do not add vitest or jest** (the repo standard is `bun test`,
per plans/003; e2e is Playwright). Do not add a `test` script to `package.json`
(out of scope — plans/003 owns that).

## Suggested executor toolkit

- This is a **React 19** codebase. Use `React.memo`, `useCallback`, and
  `useMemo` correctly so the new `<EventCard>` memo is actually effective: every
  prop passed to a memo'd child that is a function or object must be stable
  (wrap handlers in `useCallback` in `<EventCardList>`; never create inline
  closures per card in the `.map` that defeat the memo). React 19 does NOT
  auto-memoize here (no React Compiler is configured — verify: there is no
  `babel-plugin-react-compiler` / `reactCompiler` in `package.json` or
  `next.config.*`; if one IS present, the manual memo is belt-and-suspenders and
  still correct).
- If a `vercel-plugin react-best-practices` skill is available in your
  environment, invoke it before writing the memoization in Steps 3–4.

## Scope

**In scope** (create unless noted):
- `src/hooks/useEventSelection.ts` (create) — Step 1
- `src/hooks/useEventSelection.test.ts` (create) — Step 1 (pure reducer unit tests)
- `src/components/ProcessingShimmer.tsx` (create) — Step 2
- `src/hooks/useRotatingMessage.ts` (create) — Step 2
- `src/components/event-card/EventCard.tsx` (create) — Step 3
- `src/components/event-card/EventCardList.tsx` (create) — Steps 4–5
- `src/components/UnsavedEventsSection.tsx` (modify) — Steps 2 & 6
- `src/app/page.tsx` (modify) — Step 4 (mount `useEventSelection`; thread props)
- `src/components/BatchEventList.tsx` (modify → thin wrapper, then delete) — Step 6

> The `<TimezonePicker>` is **not** created here — plan 014 owns it at
> `src/components/TimezonePicker.tsx`. This plan **imports** it (Steps 3 & 5).
> Likewise `<EventFields>` is 014's; this plan imports it (Step 3).

**Out of scope** (do NOT touch):
- `src/components/EventFields.tsx` and `src/components/TimezonePicker.tsx` — these
  are **created and owned by plan 014**. Import them here; do not redefine,
  fork, or modify them. (`InlineEventEditor.tsx` / `EventEditor.tsx` /
  `EventConfirmation.tsx` are **deleted by 014** — this plan never references
  them.)
- `src/components/ProcessingSection.tsx` — it is orphaned (zero importers) and is
  plans/010's deletion target. Do not edit or import it. If 010 already deleted
  it, ignore this line.
- `src/types/event.ts`, `src/types/input.ts` — no type changes to `CalendarEvent`.
- `src/services/exporter.ts` — `exportMultipleToICS`/`exportToICS` are called as-is.
- `src/utils/timeConversion.ts`, `src/utils/timezone.ts` — call
  `getTimezoneAbbreviation`, `getBrowserTimezone`, `convertRawToDate` as today;
  do not modify them.
- `e2e/**` — the specs are the guard; they must pass **unchanged**. (plans/009
  owns e2e edits.) If a spec needs changing to pass, that is a STOP condition.
- `package.json` — no new deps, no new scripts.

## Git workflow

- Branch: `advisor/015-consolidate-event-card-list-components`
- **One commit** for the whole plan. Message style matches the repo's
  `Plan NNN: <title>` convention (see `git log` and plans/008's header), ending
  with the repo trailer:
  `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

Order is chosen so the tree builds and the e2e net stays green between steps:
extract leaf primitives first (Steps 1–3 add new files, change no behavior),
then swap the wiring (Steps 4–5), then delete the old component (Step 6).

### Step 1: Extract `useEventSelection` (+ a pure reducer with unit tests)

Create `src/hooks/useEventSelection.ts`. It owns selection (NOT expand — expand
stays card-local in Step 3). Lift the reconcile logic **verbatim** from
`BatchEventList.tsx:135-151`, including the `seenIdsRef` + "preserve manual,
default-new-selected, drop-deleted" comments.

Factor the reconcile into a **pure function** so it is unit-testable without
React:

```ts
// src/hooks/useEventSelection.ts
import { useState, useRef, useEffect, useCallback } from 'react';

// Pure reducer — given the previous selection, the set of ids we've already
// seen, and the current event ids, return the next selection. New ids default
// to selected; manual choices on existing ids are preserved; deleted ids drop.
export function reconcileSelection(
  prev: Set<string>,
  seen: Set<string>,
  currentIds: string[],
): Set<string> {
  const currentIdSet = new Set(currentIds);
  const next = new Set(prev);
  for (const id of currentIds) {
    if (!seen.has(id)) next.add(id); // newly-arrived → selected
  }
  for (const id of next) {
    if (!currentIdSet.has(id)) next.delete(id); // deleted → dropped
  }
  return next;
}

export function useEventSelection(events: { id: string }[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = events.map((e) => e.id);
    setSelectedIds((prev) => reconcileSelection(prev, seenIdsRef.current, currentIds));
    currentIds.forEach((id) => seenIdsRef.current.add(id));
  }, [events]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const moreThanHalf = prev.size > events.length / 2;
      return moreThanHalf ? new Set() : new Set(events.map((e) => e.id));
    });
  }, [events]);

  return { selectedIds, selectedCount: selectedIds.size, toggle, toggleAll };
}
```

> **Subtle-equivalence requirement**: the original effect (a) computes
> `newlyArrived`, (b) **adds them to `seenIdsRef` immediately**, then (c)
> updates state. The version above marks `seen` *after* computing `next` inside
> the functional updater — but because `reconcileSelection` reads `seen`
> **before** the `forEach(...seen.add)` runs, and React's functional updater is
> the only place `prev` is read, the observable result is identical:
> a newly-arrived id is "new" exactly once. Confirm this with the unit tests
> below; if any test fails, fall back to inlining the exact `:135-151` body
> (compute `newlyArrived`, `seenIdsRef.current.add` each, then
> `setSelectedIds`) and keep `reconcileSelection` only as a tested helper the
> effect calls. **Do not ship a version that fails the reducer tests.**

Create `src/hooks/useEventSelection.test.ts` using **`bun:test`** (matches the
repo's chosen runner; do NOT import vitest/jest):

```ts
import { describe, it, expect } from 'bun:test';
import { reconcileSelection } from './useEventSelection';
```

Cover, at minimum:
1. **new-arrivals-selected**: `reconcileSelection(new Set(), new Set(), ['a','b'])`
   → `{a,b}`.
2. **manual-deselect-preserved**: prev `{a}` (b was deselected), seen `{a,b}`,
   current `['a','b','c']` → `{a,c}` (b stays out; c, unseen, joins).
3. **deleted-dropped**: prev `{a,b}`, seen `{a,b}`, current `['a']` → `{a}`.
4. **combined stream step mirroring the e2e**: start `{}`/seen `{}`/`['Alpha','Beta']`
   → `{Alpha,Beta}`; user deselects Alpha → prev `{Beta}`; next stream
   seen `{Alpha,Beta}` current `['Alpha','Beta','Gamma']` → `{Beta,Gamma}`
   (Alpha stays out, Gamma defaults in). This is the unit-level twin of
   `draft-and-history.spec.ts:259-273`.
5. **idempotent re-render**: prev `{a,b}`, seen `{a,b}`, current `['a','b']`
   → `{a,b}` (no churn).

**Verify**: `bun test src/hooks/useEventSelection.test.ts` → all pass (≥5 cases).
`bun run type-check` → exit 0.

### Step 2: Extract the processing shimmer

Create `src/components/ProcessingShimmer.tsx` containing `FUN_MESSAGES`
(verbatim from `UnsavedEventsSection.tsx:38-55`), `AnimatedEllipsis`
(`:57-82`), `RainbowText` (`:84-102`), `SkeletonLoader` (`:104-111`), and the
rendered shimmer block (the JSX at `UnsavedEventsSection.tsx:168-190`: heading
with `RainbowText`+`AnimatedEllipsis` and `count` `SkeletonLoader`s). Give it
props it needs from the parent:

```tsx
// src/components/ProcessingShimmer.tsx
'use client';
interface ProcessingShimmerProps {
  message: string;          // current rotating message
  skeletonCount: number;    // = processingCount from the parent
  onCancel: () => void;     // wire to the existing cancel button (keep data-testid="cancel-job-button")
}
```

Keep `data-testid="cancel-job-button"` on the cancel button **exactly** (an e2e
hook). Create `src/hooks/useRotatingMessage.ts` wrapping the rotation effect
from `UnsavedEventsSection.tsx:130-144`:

```ts
// src/hooks/useRotatingMessage.ts — returns the current message string
export function useRotatingMessage(messages: string[]): string { /* setTimeout 6000–9000ms loop */ }
```

`useRotatingMessage` lives in the **shimmer's own subtree** (call it inside
`ProcessingShimmer`, fed `FUN_MESSAGES`), NOT in `UnsavedEventsSection` — that
is the perf win: the 6–9 s timer must re-render only the shimmer, not the card
list. (When processing ends and the shimmer unmounts, the timer stops; the card
list never subscribes to it.)

In `UnsavedEventsSection.tsx`: delete the four primitives (`:38-111`), the
`currentMessageIndex` state + rotation effect (`:128-144`), and the inline
shimmer JSX (`:168-190`); import and render `<ProcessingShimmer message=... />`
— except `message` now comes from inside `ProcessingShimmer` via the hook, so
the parent passes only `skeletonCount={processingCount}` and `onCancel={onCancelAll}`,
wrapped in the same `hasActiveProcessing &&` guard. Keep `processingCount`'s
computation (`:157-160`) in the parent (it depends on
`imageProcessingStatuses`/`urlProcessingStatus`).

If plans/010 has landed and exposes useful status types in
`src/types/processing.ts`, you MAY type the parent's status props from there,
but it is not required for this plan.

**Verify**: `bun run type-check` → exit 0. `bun run build` → exit 0.
`grep -n "FUN_MESSAGES\|AnimatedEllipsis\|RainbowText\|SkeletonLoader" src/components/UnsavedEventsSection.tsx`
→ no matches (all moved). The app still shows the animated processing heading
(confirmed by the e2e net in Step 7; visually it is unchanged).

### Step 3: Extract a memoized `<EventCard>`

Create `src/components/event-card/EventCard.tsx`: ONE `React.memo`'d card =
checkbox + collapsed summary (title/date/time/tz/location, inline-editable) +
expand chevron + expanded body. **The expanded body renders `<EventFields>`
(created by plan 014)** with the same props the old `InlineEventEditor` took
(see the excerpt in Current state) — `import EventFields from
'@/components/EventFields';`. The tz widget in the collapsed summary renders the
shared `<TimezonePicker>` from plan 014 (`import TimezonePicker, {
COMMON_TIMEZONES } from '@/components/TimezonePicker';`) — Step 5 covers the
wiring; do NOT build a second picker.

Move into this file (from `BatchEventList.tsx`): the collapsed-row editing JSX
(`:300-484`), `handleFieldEdit` (`:186-206`), `formatDateForInput`/
`formatTimeForInput` (`:54-65` — or import the canonical copies plan 014 added
to `src/utils/timeConversion.ts`), plus the per-card `expanded` toggle (card
owns its own `isExpanded` via local `useState<boolean>`; do NOT lift expand to
the page — only selection is lifted). The tz `<select>` overlay, abbreviation
label, resolving spinner, info-popover, `getTzInfoLines` (`:115-133`) and
`handleTimezoneChange` (`:93-113`) all live **inside 014's `<TimezonePicker>`**
— render it and pass `event` + `onChange`; do not re-host that logic in the card.

**Perf requirements (the point of the memo):**
- **Hoist the formatters to module scope.** Replace the per-render
  `new Intl.DateTimeFormat('en-US', {...})` at `BatchEventList.tsx:359-363`
  and `:390-393` with module-level singletons, e.g.:
  ```tsx
  const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
  ```
  and call `DATE_FMT.format(event.startDate)` / `TIME_FMT.format(event.startDate)`.
- The tz-option label list (~17 entries) is memoized inside `<TimezonePicker>`
  (Step 5), so each card no longer rebuilds it per render.
- `React.memo(EventCard)` with a props contract where **every** prop is either a
  primitive or a `useCallback`-stabilized handler (provided by `<EventCardList>`
  in Step 4). Suggested props:
  ```tsx
  interface EventCardProps {
    event: CalendarEvent;
    selected: boolean;
    isNew: boolean;                 // index === last && isProcessing (was BatchEventList:267)
    onToggleSelect: (id: string) => void;
    onEdit: (event: CalendarEvent) => void;
    tzSuggestion?: { timezone: string; confidence: number };
    onTzSuggestionApply?: (eventId: string, timezone: string) => void;
    onTzSuggestionDismiss?: (eventId: string) => void;
    onTimezoneUserChange?: (eventId: string) => void;
  }
  ```
  Note `onToggleSelect`/`onEdit` take the **id/event** (stable identity across
  cards) rather than pre-bound-per-card closures, so one `useCallback` serves
  every card without breaking memo.

**Preserve verbatim**: the checkbox `aria-label={`Select ${event.title}`}`
(`:293`), the `NEW` badge (`:326-330`), the `bg-green-50` new-card highlight
(`:272-274`), all `e.stopPropagation()` calls on inner controls, and any
`data-testid` plans/009 added to the card (grep the current file for
`data-testid` before you start; carry every one over).

**Verify**: `bun run type-check` → exit 0. (Behavior verified end-to-end in
Step 7.)

### Step 4: Extract `<EventCardList>` and lift selection to `page.tsx`

Create `src/components/event-card/EventCardList.tsx`: the scroll-container +
`events.map(...)` shell (from `BatchEventList.tsx:264-538`) rendering
`<EventCard>` per event, plus the footer (Save/Discard button, select-all
toggle, "N events will be lost" warning) from `:540-574`, and `handleExport`
(`:233-247`). It **consumes selection from props** (provided by the page's
`useEventSelection`), it does NOT own selection.

In `src/app/page.tsx`:
- Mount the hook near the `unsavedEvents` state (`:65`):
  `const selection = useEventSelection(unsavedEvents);`
- Thread `selection` down. Two acceptable shapes — pick the smaller diff:
  - (A) Pass `selection` through `<UnsavedEventsSection>` to `<EventCardList>`; or
  - (B) Render `<EventCardList>` from `<UnsavedEventsSection>` (as today
    `BatchEventList` is) and pass `selection` as a prop from page → section →
    list. Keep `<UnsavedEventsSection>` as the component that decides
    shimmer-vs-list (its `hasActiveProcessing`/`events.length` logic at
    `:146-209` stays).
- In `<EventCardList>`, wrap the handlers passed to each `<EventCard>` in
  `useCallback` (`onToggleSelect={selection.toggle}` is already stable from the
  hook; `onEdit` is the page's `handleBatchEventEdit`, already stable as a
  component-scope function — but if you pass an inline arrow, wrap it).
- `handleExport` reads `selection.selectedIds` to filter
  `events.filter(e => selection.selectedIds.has(e.id))`, then calls
  `exportMultipleToICS` and `onExportComplete` (preserve the
  `selectedCount === 0 → onCancel()` early return from `:234-237`).
- The footer's select-all uses `selection.toggleAll`; the label/"will be lost"
  count use `selection.selectedCount` with the **same** `> events.length / 2`
  predicate (`:251-252`) and the same red-warning copy (`:564-571`).

> **STREAMING-ORDER INVARIANT (the headline risk).** Lifting selection to the
> page must NOT change *the order in which a streamed event is (a) appended to
> `unsavedEvents` vs. (b) seen by the reconcile effect*. Today the effect is
> keyed on `[events]` inside `BatchEventList`, fed `unsavedEvents` via props;
> after the move it is keyed on `[unsavedEvents]` inside the hook in `page.tsx`.
> Both fire on the **same** `unsavedEvents` reference change, in the same React
> commit, so a newly-appended event is reconciled in the very next effect pass —
> identical timing. **If, while wiring this, you find the hook's effect runs on a
> *different* `events` reference than the list renders (e.g. you accidentally
> pass a filtered/sorted copy, or memoize `unsavedEvents` into a new array), or
> the e2e "Streaming selection" test goes red, STOP** (see STOP conditions). Do
> not "fix" it by mutating the test.

**Verify**: `bun run type-check` → exit 0. `bun run build` → exit 0.
`bunx playwright test e2e/draft-and-history.spec.ts` → all pass, **including
"Streaming selection"**.

### Step 5: Import the shared `<TimezonePicker>` (created by plan 014)

Do **not** build a timezone picker. Plan 014 already created the single shared
`<TimezonePicker>` at `src/components/TimezonePicker.tsx` (the `<select>` overlay
+ abbreviation label + resolving spinner + info-popover, with `COMMON_TIMEZONES`
exported from that module and `handleTimezoneChange`'s raw-date recompute logic
inside it). Wherever the collapsed card needs the tz control, **import and render
it**:

```tsx
import TimezonePicker, { COMMON_TIMEZONES } from '@/components/TimezonePicker';
```

- Render `<TimezonePicker event={event} timezone={...} onChange={...} />` (use
  014's prop shape) in `<EventCard>`'s collapsed summary in place of
  `BatchEventList`'s old inline `<select>` overlay (`:396-452`). The
  `!event.allDay` guard, the memoized ~17-entry option-label list, the
  info-popover hover/click state, and the raw-date recompute on tz change all
  live **inside 014's picker** — this plan does not re-host any of it.
- `COMMON_TIMEZONES` has exactly **one** definition (014's, in
  `TimezonePicker.tsx`); never re-declare it here.

> **Coordination with plan 014 (hard dependency)**: 014 is the authority for both
> `<EventFields>` and `<TimezonePicker>`. If 014 is not landed, **STOP** — there
> is no picker to import (see STOP conditions). If the picker's prop shape and the
> tz data this card has on `event` don't line up, STOP and report rather than
> forking a second picker.

**Verify**: `bun run type-check` → exit 0.
`grep -rn "new Intl.DateTimeFormat" src/components/event-card/` → the only
matches are the module-scope date/time singletons from Step 3, none inside a
render body or `.map` callback that runs per render (the tz-option label list is
memoized inside 014's `TimezonePicker.tsx`, not here).
`grep -rn "COMMON_TIMEZONES" src/components/event-card/` → at most an **import**
from `@/components/TimezonePicker`; **no `const COMMON_TIMEZONES =`** definition
in this directory.

### Step 6: Reduce `BatchEventList` to a wrapper, then delete it

Now that `<EventCardList>` does everything `BatchEventList` did, update its sole
caller `UnsavedEventsSection.tsx:194-208` to render `<EventCardList>` directly
(passing the lifted `selection` per Step 4) and **delete
`src/components/BatchEventList.tsx`**. Remove the now-dead
`import BatchEventList from './BatchEventList'` (`UnsavedEventsSection.tsx:5`).

(If you prefer a two-stage safety move: first make `BatchEventList` a thin
re-export wrapper of `<EventCardList>`, verify green, then delete it and rewire
the import. Either way the end state is: no `BatchEventList.tsx`.)

**Verify**:
- `test ! -f src/components/BatchEventList.tsx` → file is gone (exit 0).
- `grep -rn "BatchEventList" src/ e2e/` → **no matches** (no dangling import or
  spec reference).
- `grep -rln "COMMON_TIMEZONES" src/` → **`src/components/TimezonePicker.tsx`
  only** (BatchEventList's copy is gone; the old editor copies were deleted by
  plan 014 along with `InlineEventEditor.tsx`). Any other hit must be an
  `import { COMMON_TIMEZONES } from '@/components/TimezonePicker'`, never a second
  `const`/`export const COMMON_TIMEZONES =` definition.
- `bun run type-check` → exit 0. `bun run build` → exit 0.

### Step 7: Full gate

Run the complete verification set:
- `bun run type-check` → exit 0
- `bun run build` → exit 0
- `bun test src` → all pass (the `useEventSelection` reducer cases)
- `bun run test:e2e` → all pass (the behavioral guard, **including the
  "Streaming selection" test and the .ics-download tests plans/009 added**)

## Test plan

- **New unit tests** — `src/hooks/useEventSelection.test.ts` (`bun:test`),
  covering the five `reconcileSelection` cases in Step 1, including the
  combined-stream case that mirrors `draft-and-history.spec.ts:259-273`
  (deselect-then-stream). An off-by-one in the reconcile (e.g. treating an
  already-seen id as new) fails case 2 or 4. This is the unit-level twin of the
  e2e guard.
- **Structural pattern**: there is no existing `src` unit test to copy; use
  `bun:test`'s `describe`/`it`/`expect` (the runner is bun's built-in — see the
  ⚠ note under "Commands you will need"). Keep tests pure: import only
  `reconcileSelection`, never mount React.
- **Existing e2e — must pass unchanged**: `e2e/draft-and-history.spec.ts`
  ("Streaming selection" + history/draft flows) and whatever .ics-download /
  card-field assertions plans/009 added. These prove the lifted selection,
  the memo'd card, the extracted shimmer, and the picker behave identically.
- **Manual spot-check (optional but recommended)**: `bun dev` (port 3777),
  paste text that yields ≥3 events, confirm: cards render; the processing
  heading animates while parsing; deselect one, paste again, the deselected one
  stays unchecked and the new one is checked; the tz `<select>` still changes
  the displayed time; Save downloads a `.ics`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run type-check` exits 0
- [ ] `bun run build` exits 0
- [ ] `bun test src` exits 0; `src/hooks/useEventSelection.test.ts` exists with
      ≥5 passing `reconcileSelection` cases
- [ ] `bun run test:e2e` exits 0 (the "Streaming selection" test in
      `e2e/draft-and-history.spec.ts` is green and **unmodified**)
- [ ] `test ! -f src/components/BatchEventList.tsx` (the god-component is deleted)
- [ ] `grep -rn "BatchEventList" src/ e2e/` returns no matches
- [ ] These files exist (created by this plan): `src/hooks/useEventSelection.ts`,
      `src/components/ProcessingShimmer.tsx`, `src/hooks/useRotatingMessage.ts`,
      `src/components/event-card/EventCard.tsx`,
      `src/components/event-card/EventCardList.tsx`
- [ ] `<EventFields>` and `<TimezonePicker>` are **imported from plan 014's
      modules** (not created here): `grep -rn "from '@/components/EventFields'" src/components/event-card/`
      → ≥1, and `grep -rn "from '@/components/TimezonePicker'" src/components/event-card/`
      → ≥1; and `ls src/components/event-card/TimezonePicker.tsx 2>&1` → "No such
      file" (this plan does **not** create a picker)
- [ ] `grep -n "FUN_MESSAGES\|AnimatedEllipsis\|RainbowText\|SkeletonLoader" src/components/UnsavedEventsSection.tsx`
      returns no matches (shimmer fully extracted)
- [ ] `grep -rln "COMMON_TIMEZONES" src/` lists **only
      `src/components/TimezonePicker.tsx`** (plan 014's single home; this plan
      may only `import` it, never re-declare it)
- [ ] No `*.test.*` imports vitest or jest:
      `grep -rn "from 'vitest'\|from \"vitest\"\|from 'jest'\|require('jest')" src/` → no matches
- [ ] No files outside the in-scope list are modified (`git status`); `e2e/**`
      unchanged
- [ ] `plans/README.md` status row updated (by the reviewer — do not edit it)

## STOP conditions

Stop and report back (do not improvise) if:

- **plans/014 is not landed** — its outputs are prerequisites:
  `ls src/components/EventFields.tsx src/components/TimezonePicker.tsx` shows
  either missing, or `src/components/InlineEventEditor.tsx` still exists (014
  deletes it). Without 014 there is no `<EventFields>` body and no shared
  `<TimezonePicker>` to import. Report and wait for 014.
- **plans/009 is not landed** — `e2e/draft-and-history.spec.ts` lacks the
  "Streaming selection" describe block (`grep -n "Streaming selection"
  e2e/draft-and-history.spec.ts` → no match), or the .ics-download specs 009
  promised are absent. This plan depends on that net.
- The "Current state" excerpts don't match the live files at their cited lines
  (the codebase drifted since `400bf32` — the drift-check `git diff --stat`
  flagged a change, or a quoted block isn't where stated).
- The e2e "Streaming selection" test goes red after Step 4 and the cause is the
  selection-lift changing *when* a streamed event is selected relative to its
  append (i.e. the streaming-order invariant in Step 4 is violated) — report the
  failing trace; do NOT modify the spec to make it pass.
- The `<EventFields>` or `<TimezonePicker>` **prop shapes 014 shipped don't fit**
  what `<EventCard>` needs (e.g. `<TimezonePicker>` expects fields not present on
  this card's `event`, or `<EventFields>` no longer accepts the full superset of
  the old `InlineEventEditorProps` + `mode`). Do NOT fork a second component to
  work around it — STOP and report the mismatch (it is a 014/015 contract gap to
  resolve, not to paper over).
- Making the e2e pass appears to require editing any file under `e2e/` or adding
  a `package.json` script/dependency.
- A verification step fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **plan 014 coordination**: 014 is this plan's **hard predecessor**, not a
  follow-up. It created `<EventFields>` and the shared `<TimezonePicker>` (+
  `COMMON_TIMEZONES`) at `src/components/TimezonePicker.tsx`, and deleted the old
  editor family (`InlineEventEditor.tsx` / `EventEditor.tsx` /
  `EventConfirmation.tsx`). This plan **imports both**: `<EventCard>`'s expanded
  body renders `<EventFields>`, and its collapsed tz control renders
  `<TimezonePicker>`. End state: `grep -rln "COMMON_TIMEZONES" src/` lists only
  `src/components/TimezonePicker.tsx`. There is no tolerated duplication left to
  clean up — if a second `COMMON_TIMEZONES` or tz `<select>` reappears, that is a
  regression.
- **plan 010 coordination**: 010 deletes the orphaned `ProcessingSection.tsx`
  (the other shimmer fork). If 010 lands after this plan, no action is needed
  here — `ProcessingSection.tsx` was already not imported by anything this plan
  produced. If a future change resurrects a second shimmer, it should import
  `<ProcessingShimmer>` rather than re-fork it.
- **What a reviewer should scrutinize**: (1) the `reconcileSelection` equivalence
  — read the Step 1 "subtle-equivalence requirement" and confirm the
  seen-set timing matches the original `:135-151`; (2) the `React.memo` is
  actually effective — no inline closures created per card in `<EventCardList>`'s
  `.map` (each would be a fresh function identity, defeating the memo); (3) the
  checkbox `aria-label` is character-identical (`Select ${event.title}`), or the
  e2e selection locators break.
- **Deferred out of this plan (and why)**: the editor body + shared tz picker are
  **plan 014's** deliverables (this plan consumes them, it does not build them);
  splitting `page.tsx` further (a separate future plan that plans/009 also
  anticipates); typing the processing-status props from `src/types/processing.ts`
  (optional, gated on plans/010).
