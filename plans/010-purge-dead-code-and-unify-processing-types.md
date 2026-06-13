# Plan 010: Delete the two orphaned processing components and unify the scattered processing-state types

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 400bf32..HEAD -- src/components/ProcessingSection.tsx src/components/ProcessingQueuePanel.tsx src/app/page.tsx src/components/UnsavedEventsSection.tsx src/services/processingQueue.ts src/hooks/useProcessingQueue.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW (deletions are build-gated; type unification is compiler-gated — `tsc --noEmit` proves every interface still resolves identically)
- **Depends on**: none. (plans/003 — the unit-test baseline — is *recommended* as a net but is **not** required: no `test` script exists yet, see "Commands you will need".)
- **Category**: tech-debt
- **Planned at**: commit `400bf32`, 2026-06-13

## Why this matters

Two React components — `ProcessingSection.tsx` (157 lines) and
`ProcessingQueuePanel.tsx` (177 lines) — have **zero importers** anywhere in
`src/` or `e2e/`. They are superseded UI: the live progress UI is now rendered
inline by `UnsavedEventsSection.tsx` (note its skeleton/`FUN_MESSAGES` block is
a byte-for-byte fork of `ProcessingSection`), and the bottom-right queue panel
was dropped in the post-`f53bf0e` rebrand. They still get type-checked, read by
every future agent session, and matched by every search — exactly the dead-code
tax plan 006 set out to remove, for the two files 006 missed.

Separately, the "processing status" concept is fragmented into **four
incompatible vocabularies** and the **same two interfaces are duplicated
verbatim** across `page.tsx` and `UnsavedEventsSection.tsx`. A reader cannot
tell that `queued` (the queue), `pending` (the image list), and `processing`
(everywhere) describe one lifecycle, or that `complete` and `success` are the
same terminal state. Centralizing these into one `src/types/processing.ts` with
a single `ProcessingStatus` union and `isActive`/`isDone` predicates removes the
duplication, makes the vocabulary legible, and lets the `as string` casts in
`processingQueue.ts` be deleted cleanly — all under the type-checker's guarantee
that behavior is unchanged.

## How this plan relates to the other plans (read this)

This plan **extends plan 006** (`plans/006-delete-dead-code-and-stale-deps.md`).

- Plan 006 deletes `EventEditor.tsx`, `EventConfirmation.tsx`, `TextInput.tsx`,
  `ExportOptions.tsx`. This plan deletes the **two processing components 006 did
  not list** (they were orphaned by the rebrand after 006 was written at
  `f53bf0e`). **The two plans touch disjoint files and converge in any order.**
  Do **NOT** re-delete 006's four files here, and do not be alarmed if they are
  still present (006 may not have run yet) or already gone (006 ran first) —
  either is fine.
- **`EditableField.tsx` is NOT dead and is NOT deleted by this plan.** The
  audit lead that called it "dead-as-imported" is **incorrect**: Plan 014
  (event-editing consolidation) promotes `EditableField` into the reusable field
  primitive; this plan therefore leaves `EditableField` untouched. `EditableField`
  is actively imported by `src/components/BatchEventList.tsx:29` (which is live —
  `BatchEventList` is imported by `UnsavedEventsSection.tsx:5`). The only real `EditableField`
  finding is the duplicated date-format helpers noted in `plans/README.md`
  (the "NOT planned" findings list), which is a *helper-extraction* refactor for
  a later editor-area wave — out of scope here. Leave `EditableField.tsx`
  untouched.
- **Deferred — do NOT do here**: After `ProcessingQueuePanel` is deleted, the
  `processingQueue` service is still alive (`page.tsx` calls `addToQueue` /
  `updateProgress` — see "Current state"), but the panel was the *only* consumer
  of the queue's rich status-rendering surface (the `complete` / `cancelled`
  icon + label switches). The deeper "dual-queue consolidation" — `page.tsx`
  drives **both** `imageProcessingStatuses`/`urlProcessingStatus` **and** the
  `processingQueue`, which is redundant — belongs to the **page.tsx
  decomposition wave** flagged in `plans/README.md`. Mention it in Maintenance
  notes; do not attempt it here.

## Current state

All claims verified at `400bf32` by grep/read — re-verify in Step 1 before acting.

### Dead components (zero importers)

`grep -rnE "\bProcessingSection\b|\bProcessingQueuePanel\b" src e2e` returns
**only their own definition lines** — no import sites, in `src/` or `e2e/`:

- `src/components/ProcessingSection.tsx` (157 lines) — superseded inline-progress UI.
- `src/components/ProcessingQueuePanel.tsx` (177 lines) — superseded bottom-right queue panel; the only file that consumed `QueueItem`'s full status surface (`getStatusIcon`/`getStatusText` switches over `queued|processing|complete|error|cancelled`).

The `processingQueue` **service is still live** (do not delete it). Its importers/callers:

- `src/app/page.tsx:16` `import { useProcessingQueue } from '@/hooks/useProcessingQueue';`
- `src/app/page.tsx:20` `import { QueueItem } from '@/services/processingQueue';`
- `src/app/page.tsx:73` `const { addToQueue, updateProgress } = useProcessingQueue();`
- `addToQueue(` called at `page.tsx:412` and `:574`; `updateProgress(` at `:448, :601, :635, :682`; `QueueItem` used as the processor param type at `:416` and `:578`.

### Four scattered / duplicated state interfaces

`page.tsx:31-60` defines four interfaces; two of them are **byte-identical
duplicates** of blocks in `UnsavedEventsSection.tsx:7-19`.

`src/app/page.tsx:31-60`:

```ts
interface ProcessingEvent {
  id: string;
  type: 'image' | 'text';
  status: 'processing' | 'success' | 'error';
  event?: CalendarEvent;
  error?: string;
}

interface ImageProcessingStatus {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
  eventCount?: number;
}

interface BatchProcessing {
  id: string;
  events: CalendarEvent[];
  isProcessing: boolean;
  totalExpected?: number;
  source: 'image' | 'text';
}

interface URLProcessingStatus {
  phase: 'detecting' | 'fetching' | 'extracting' | 'complete';
  urlCount?: number;
  fetchedCount?: number;
  message: string;
}
```

`src/components/UnsavedEventsSection.tsx:7-20` (duplicate of two of the above):

```ts
interface ImageProcessingStatus {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
  eventCount?: number;
}

interface URLProcessingStatus {
  phase: 'detecting' | 'fetching' | 'extracting' | 'complete';
  urlCount?: number;
  fetchedCount?: number;
  message: string;
}
```

`UnsavedEventsSection.tsx` then *uses* both via its props interface
(`UnsavedEventsSectionProps`, line ~22: `imageProcessingStatuses: ImageProcessingStatus[]`,
`urlProcessingStatus: URLProcessingStatus | null`). The deleted
`ProcessingSection.tsx:5-18` held a third identical copy of these two — it goes
away with the file in Step 1, so only `page.tsx` and `UnsavedEventsSection.tsx`
remain to deduplicate.

`grep -rnE "ProcessingEvent|BatchProcessing|ImageProcessingStatus|URLProcessingStatus" src`
returns hits **only** in `page.tsx`, `UnsavedEventsSection.tsx`, and
`ProcessingSection.tsx` (the last is deleted in Step 1). No other file
references these names — so moving them to `@/types/processing` and importing is
safe.

### The four status vocabularies to reconcile

| Source | Location | Values |
|---|---|---|
| Queue item status | `processingQueue.ts:6` | `'queued' \| 'processing' \| 'complete' \| 'error' \| 'cancelled'` |
| `ProcessingEvent.status` | `page.tsx:34` | `'processing' \| 'success' \| 'error'` |
| `ImageProcessingStatus.status` | `page.tsx:42`, `UnsavedEventsSection.tsx:10` | `'pending' \| 'processing' \| 'complete' \| 'error'` |
| `URLProcessingStatus.phase` | `page.tsx:56`, `UnsavedEventsSection.tsx:16` | `'detecting' \| 'fetching' \| 'extracting' \| 'complete'` |

Reconciliation rules this plan adopts (document them in the types file):
`queued ≈ pending` (not-yet-started), `complete ≈ success` (terminal OK),
`error` and `cancelled` are terminal. **`phase` is a *sub-state* of a single
URL job, not a job status** — keep it as its own separate type (`URLPhase`), do
NOT fold it into `ProcessingStatus`.

### The `as string` casts that the unified type must keep valid

`src/services/processingQueue.ts:129-149` — the cancel-after-`await` guard. After
the long-running `processor(item)` resolves/throws, `item.status` may have been
flipped to `'cancelled'` by a concurrent `remove()` (line 74). TypeScript narrows
`item.status` to exclude `'cancelled'` at these points, so the code casts to
`string` to compare:

```ts
    try {
      const result = await processor(item);

      if ((item.status as string) === 'cancelled') {   // :132
        return;
      }

      item.status = 'complete';
      item.result = result;
      item.progress = 100;
      item.completedAt = new Date();
      this.notify();
    } catch (err) {
      if ((item.status as string) === 'cancelled') {   // :142
        return;
      }
      ...
```

**CRITICAL**: the unified `ProcessingStatus` union **must keep `'cancelled'`** as
a member so this guard stays valid and the `as string` casts can be removed
cleanly (replaced with the `isCancelled` predicate from the types module — see
Step 3). `remove()` at `processingQueue.ts:73-75` also writes
`item.status = 'cancelled'`, so removing `'cancelled'` from the union would break
the build.

### Repo conventions

- Shared types live in `src/types/` (e.g. `src/types/event.ts`,
  `src/types/input.ts`) and are imported via the `@/*` → `src/*` alias
  (`tsconfig.json`). Match that: the new file is `src/types/processing.ts`,
  imported as `@/types/processing`.
- `src/types/*` files are **type-only** modules (interfaces + unions + small pure
  predicate functions are fine; no React, no side effects).
- TypeScript strict mode is on; no `any`.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Install   | `bun install`        | exit 0 |
| Typecheck | `bun run type-check` | exit 0, no errors (verified passing at `400bf32`) |
| Build     | `bun run build`      | exit 0 (verified passing at `400bf32`) |

There is **no `test` script** in `package.json` at `400bf32` (only
`type-check`, `build`, `lint`, and `test:e2e*`). Do **NOT** run `bun run test`
(it does not exist) and do **NOT** run `bun run lint` (broken at `400bf32` —
plans/004 owns it). The gate for this plan is **type-check + build**. If plans/003
has landed and a `test` script now exists, also run `bun run test` → exit 0.

## Scope

**In scope** (the only files you should modify/create/delete):
- Delete: `src/components/ProcessingSection.tsx`
- Delete: `src/components/ProcessingQueuePanel.tsx`
- Create: `src/types/processing.ts`
- Modify: `src/app/page.tsx` (remove local interface block lines 31-60; add import)
- Modify: `src/components/UnsavedEventsSection.tsx` (remove local interface block lines 7-20; add import)
- Modify: `src/services/processingQueue.ts` (point `QueueItem.status` at the unified type; replace the two `as string` casts with the predicate)
- Modify: `src/hooks/useProcessingQueue.ts` (optional, Step 3 — swap the inline `status === 'processing' || status === 'queued'` for the predicate)
- Modify: `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/components/EditableField.tsx` — **alive** (imported by `BatchEventList.tsx:29`); the audit lead calling it dead is wrong. Do not delete or move it.
- Plan 006's four files (`EventEditor.tsx`, `EventConfirmation.tsx`, `TextInput.tsx`, `ExportOptions.tsx`) — owned by plan 006; do not delete them here.
- The **dual-queue consolidation** (collapsing `imageProcessingStatuses`/`urlProcessingStatus` and the `processingQueue` into one source of truth) — deferred to the page.tsx-decomposition wave. This plan only *centralizes the types*, it does not change the runtime queue topology.
- The duplicated date-format helpers in `InlineEventEditor.tsx`/`EditableField.tsx` (separate finding, separate wave).
- Any change to how `page.tsx` actually drives progress (the `setImageProcessingStatuses` / `setUrlProcessingStatus` / `addToQueue` call sites) — you are renaming/relocating types, not rewiring logic.

## Git workflow

- Branch: `advisor/010-purge-dead-code-and-unify-processing-types`
- **One commit** (this plan is a single logical unit). Message style matches the
  repo, e.g.:
  `Plan 010: delete orphaned processing components; unify processing-state types`
  ending with the repo's trailer:
  `Co-Authored-By: Claude <noreply@anthropic.com>`
- Do **NOT** push or open a PR unless the operator instructed it.

## Steps

### Step 1 — Verify-then-delete the two orphaned components

Run both grep forms and require **empty** results except the files' own
definition lines:

```
grep -rnE "\bProcessingSection\b|\bProcessingQueuePanel\b" src e2e
grep -rnE "components/ProcessingSection|components/ProcessingQueuePanel" src e2e
```

The first must return only `src/components/ProcessingSection.tsx` and
`src/components/ProcessingQueuePanel.tsx`'s own `export default function …` lines;
the second must return **nothing**. If so, delete both:

```
git rm src/components/ProcessingSection.tsx src/components/ProcessingQueuePanel.tsx
```

**Verify**: `bun run type-check` → exit 0; `bun run build` → exit 0.
(The production build is the real gate that nothing imported them.)

### Step 2 — Create `src/types/processing.ts` and dedupe the four interfaces

Create `src/types/processing.ts`. Move the four interfaces out of `page.tsx`
verbatim (preserve every field and union exactly as in "Current state"), and add
a re-export of `CalendarEvent` dependency via import (do not redefine it):

```ts
import { CalendarEvent } from '@/types/event';

export interface ProcessingEvent {
  id: string;
  type: 'image' | 'text';
  status: 'processing' | 'success' | 'error';
  event?: CalendarEvent;
  error?: string;
}

export interface ImageProcessingStatus {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
  eventCount?: number;
}

export interface BatchProcessing {
  id: string;
  events: CalendarEvent[];
  isProcessing: boolean;
  totalExpected?: number;
  source: 'image' | 'text';
}

/** Sub-phase of a single URL-scrape job — NOT a job status. */
export type URLPhase = 'detecting' | 'fetching' | 'extracting' | 'complete';

export interface URLProcessingStatus {
  phase: URLPhase;
  urlCount?: number;
  fetchedCount?: number;
  message: string;
}
```

> Note: at this point the `ProcessingEvent`, `ImageProcessingStatus`, and
> `BatchProcessing` `status`/field literals are still hand-written. Step 3
> introduces the unified `ProcessingStatus` union and the predicates and wires
> `processingQueue.ts` to it. Keeping Step 2 a pure "move + dedupe" (no behavior
> or literal changes) is what makes the type-check in this step a clean
> equivalence proof.

Then:

- In `src/app/page.tsx`: **delete** the four `interface` blocks at lines 31-60,
  and add `ProcessingEvent`, `ImageProcessingStatus`, `BatchProcessing`,
  `URLProcessingStatus` to the imports. Prefer adding to the existing
  type-import grouping near the top (lines 11-12 already import from
  `@/types/event` and `@/types/input`); add a new line:
  `import { ProcessingEvent, ImageProcessingStatus, BatchProcessing, URLProcessingStatus } from '@/types/processing';`
- In `src/components/UnsavedEventsSection.tsx`: **delete** the two `interface`
  blocks at lines 7-20 and add
  `import { ImageProcessingStatus, URLProcessingStatus } from '@/types/processing';`
  (place it after the existing `import { CalendarEvent } from '@/types/event';`
  on line 4). Its `UnsavedEventsSectionProps` keeps referencing
  `ImageProcessingStatus`/`URLProcessingStatus` by the same names — now resolved
  via the import.

**Verify**: `bun run type-check` → exit 0 (this proves the moved interfaces are
structurally identical — any field/union drift surfaces as a type error);
`bun run build` → exit 0.

### Step 3 — Add the unified `ProcessingStatus` union + predicates; wire the queue to it; drop the `as string` casts

In `src/types/processing.ts`, add the union and predicates **below** the
interfaces:

```ts
/**
 * The single processing lifecycle, reconciled from the previously divergent
 * vocabularies:
 *   - 'queued'    ≈ the old 'pending' (accepted, not yet started)
 *   - 'complete'  ≈ the old 'success' (terminal, ok)
 *   - 'error', 'cancelled' are terminal.
 * NOTE: keep 'cancelled' — processingQueue.ts sets it from remove() and guards
 * on it after await; removing it breaks that guard.
 */
export type ProcessingStatus =
  | 'queued'
  | 'processing'
  | 'complete'
  | 'error'
  | 'cancelled';

/** Active = not yet in a terminal state. */
export function isActive(status: ProcessingStatus): boolean {
  return status === 'queued' || status === 'processing';
}

/** Done = terminal, regardless of outcome. */
export function isDone(status: ProcessingStatus): boolean {
  return status === 'complete' || status === 'error' || status === 'cancelled';
}

export function isCancelled(status: ProcessingStatus): boolean {
  return status === 'cancelled';
}
```

Then wire `processingQueue.ts` onto it:

- Change `QueueItem.status` (`processingQueue.ts:6`) from the inline union to
  `status: ProcessingStatus;`, and add
  `import { ProcessingStatus, isActive, isCancelled } from '@/types/processing';`
  at the top of `processingQueue.ts` (alongside the existing
  `import { CalendarEvent } from '@/types/event';`).
- Replace the two cancel guards at `:132` and `:142` —
  `if ((item.status as string) === 'cancelled') {` — with
  `if (isCancelled(item.status)) {`. The cast is no longer needed because
  `isCancelled` accepts the full `ProcessingStatus` (the compiler will not
  narrow away `'cancelled'` across a function-call boundary).
  **Confirm `grep -n "as string" src/services/processingQueue.ts` → no matches** after this.
- Replace the `getActive()` filter at `processingQueue.ts:97`
  (`i.status === 'processing' || i.status === 'queued'`) with
  `isActive(i.status)`. (Leave the single-status checks at `:73`, `:101`, `:106`
  as-is — they test one specific status each, where the literal is clearer than
  a predicate.)

Then, in `src/hooks/useProcessingQueue.ts`, replace the inline active/done
filters with the predicates (import them):

- Add `import { isActive, isDone } from '@/types/processing';`.
- `activeItems` (line 41-43): `queue.filter(item => isActive(item.status))`.
- `completedItems` (line 45-47): `queue.filter(item => isDone(item.status))`.

> Scope guard: do **not** retrofit `ProcessingStatus` onto `ProcessingEvent`,
> `ImageProcessingStatus`, or `URLProcessingStatus` — their `status` literals are
> *subsets* used by distinct UI state machines (e.g. `ImageProcessingStatus` has
> `'pending'`, not `'queued'`), and rewriting their call sites in `page.tsx`
> would pull in the dual-queue consolidation that is explicitly deferred.
> `ProcessingStatus` unifies the **queue service** only; the union's docstring
> records the cross-vocabulary mapping for the future consolidation.

**Verify**: `bun run type-check` → exit 0; `bun run build` → exit 0;
`grep -n "as string" src/services/processingQueue.ts` → no matches.

## Test plan

No new unit tests (no `test` script exists at `400bf32`; the type-unification is
proven by the compiler and the deletions by the production build). If plans/003
has landed and added a `bun test` suite, run it (`bun run test` → all pass) as an
extra gate — none of its existing assertions should change, since this plan is
behavior-preserving.

Behavioral safety argument (why no test is needed): Step 1 removes only
zero-importer files (build-gated). Steps 2-3 are type-level moves plus predicate
extractions whose bodies are identical boolean expressions to the code they
replace (`isActive` === the old `processing || queued` check; `isCancelled` ===
the old `=== 'cancelled'` compare). `tsc --noEmit` plus a green `next build`
together prove no structural or resolution drift.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `ls src/components/ProcessingSection.tsx src/components/ProcessingQueuePanel.tsx 2>&1` → both "No such file"
- [ ] `test -f src/types/processing.ts` → exit 0 (file exists)
- [ ] `grep -rnE "\bProcessingSection\b|\bProcessingQueuePanel\b" src e2e` → no matches
- [ ] `grep -cE "^interface (ProcessingEvent|ImageProcessingStatus|BatchProcessing|URLProcessingStatus)" src/app/page.tsx` → `0` (local defs removed)
- [ ] `grep -cE "^interface (ImageProcessingStatus|URLProcessingStatus)" src/components/UnsavedEventsSection.tsx` → `0`
- [ ] `grep -n "as string" src/services/processingQueue.ts` → no matches
- [ ] `grep -q "export type ProcessingStatus" src/types/processing.ts` → exit 0
- [ ] `src/components/EditableField.tsx` still exists and is unmodified (`git status` shows it untouched)
- [ ] `bun run type-check` exits 0; `bun run build` exits 0 (and `bun run test` if that script now exists)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for plan 010 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Either Step 1 grep returns a hit beyond the file's own definition line — that
  component is **not** dead; do not delete it, report the importer.
- `bun run build` fails after Step 1 — something imports a deleted file
  dynamically; restore it and report.
- `bun run type-check` fails after Step 2 with a *structural* error on one of the
  moved interfaces (e.g. "Property X is missing") — the live code drifted from
  the excerpts in "Current state"; do not paper over it, report the diff.
- Removing the `as string` casts forces `'cancelled'` out of any union, or the
  type-checker now flags `item.status = 'cancelled'` in `remove()`
  (`processingQueue.ts:74`) as not assignable — the `ProcessingStatus` union is
  missing `'cancelled'`; fix the union, do not re-add the cast.
- You find that `EditableField.tsx` (or any plan-006 file) appears to need
  deletion to make things compile — it does not; this is a sign of a wrong turn,
  report it.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **The dual-queue redundancy is still here, by design of this plan.** `page.tsx`
  drives `imageProcessingStatuses` + `urlProcessingStatus` for the inline UI
  **and** feeds the `processingQueue` service (`addToQueue` at `:412`/`:574`),
  which now has no UI consumer for its rich status surface after
  `ProcessingQueuePanel` was deleted. The **page.tsx-decomposition wave**
  (flagged in `plans/README.md`'s "NOT planned" list) should decide whether to
  (a) surface the queue again, or (b) collapse onto a single
  `ProcessingStatus`-typed source of truth and retire the parallel
  `ImageProcessingStatus`/`URLProcessingStatus` state. The
  `ProcessingStatus` union's docstring already records the
  `queued≈pending` / `complete≈success` mapping that consolidation will need.
- A reviewer should scrutinize: that Step 2 was a *pure move* (diff the moved
  interface bodies against the "Current state" excerpts — no field added/dropped),
  and that the predicate bodies in Step 3 are logically identical to the
  expressions they replaced.
- `EditableField.tsx`'s real outstanding finding is the duplicated date-format
  helpers shared with `InlineEventEditor.tsx` (see `plans/README.md`) — an
  editor-area refactor, not addressed here.
- Index housekeeping: `plans/README.md`'s table currently lists 001–008; this
  plan adds a **010** row (Priority P2, Effort S–M, Depends on —, Status). Plan
  009 (e2e safety net) exists; land it before the component refactors. This plan
  (010) is independent of 009.
