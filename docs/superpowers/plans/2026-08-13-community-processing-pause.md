# Community Processing Pause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace public owner-budget copy with approved community-supported pause copy, display a trustworthy local reset date and time when available, and keep Transform inside the paused input.

**Architecture:** `OwnerBudgetBoundary` continues to own the content-free usage lookup and fail-closed three-second timeout, but preserves the validated `resetAt` value for paused states. `OwnerBudgetScreen` alone formats the reset in the visitor's timezone and owns the known/unknown copy variants. The page and `SmartInput` share the fixed input height through a flex column so the pause notice subtracts from the editor instead of pushing Transform outside it.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Playwright

---

### Task 1: Pin the public copy and paused-input geometry

**Files:**
- Modify: `e2e/community-limit.spec.ts`

- [ ] **Step 1: Replace owner-budget copy assertions with the approved public contract**

Set the suite timezone and locale to UTC/en-US. For an exhausted response with `resetAt: '2026-08-14T00:00:00.000Z'`, assert the heading is `Event processing is paused` and the message is exactly `Event Every is powered by community support. New event processing is paused until August 14 12:00am, but your saved events are still available.` For a failed usage request, assert the same heading and the no-date fallback `Event Every is powered by community support. New event processing is temporarily paused, but your saved events are still available.` Assert no paused screen contains `/owner budget|request id|provider|waitlist/i`.

- [ ] **Step 2: Add the geometry regression assertion**

After selecting **View my events**, read the bounding boxes for `input-box` and `Transform content to events`. Assert the Transform button's right and bottom edges are less than or equal to the input's right and bottom edges.

- [ ] **Step 3: Run the focused Chromium test and verify RED**

Run:

```bash
E1_OFFLINE=1 E1_OFFLINE_PRELOAD="$PWD/scripts/e1-offline-preload.cjs" NODE_OPTIONS="--require=$PWD/scripts/e1-offline-preload.cjs" node --require "$PWD/scripts/e1-offline-preload.cjs" node_modules/@playwright/test/cli.js test e2e/community-limit.spec.ts --project=chromium
```

Expected: copy assertions fail because owner-budget text is still rendered, and the geometry assertion fails because Transform's bottom edge exceeds the input's bottom edge.

### Task 2: Preserve and present the trusted reset time

**Files:**
- Modify: `src/components/OwnerBudgetBoundary.tsx`
- Modify: `src/components/OwnerBudgetScreen.tsx`

- [ ] **Step 1: Carry a validated reset timestamp through the boundary**

Change the loaded boundary result from a bare state string to a discriminated result containing `state` and `resetAt`. Preserve `resetAt` only when it is a string representing a valid timestamp. Use `null` for non-success responses, malformed responses, fetch errors, and timeouts. Keep the three-second fail-closed behavior and the existing screen-to-events transition.

- [ ] **Step 2: Render the approved public copy**

Use `Event processing is paused` for every paused state. Format a valid reset timestamp in the browser's timezone with an English month/day and lowercase compact 12-hour time such as `August 14 12:00am`. Render the user's approved known-reset sentence. When reset time is `null`, render the approved neutral temporary-pause fallback. Keep the **View my events** action unchanged and remove public owner-budget terminology.

- [ ] **Step 3: Run the focused copy tests**

Run the Task 1 command. Expected: copy assertions pass; only the geometry assertion remains red.

### Task 3: Keep Transform inside the fixed-height input

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/SmartInput.tsx`

- [ ] **Step 1: Make the fixed-height input distribute its height**

Make `input-box` a flex column. Make `SmartInput` a `min-h-0 flex-1` child instead of a second `h-full` child. Add `min-h-0` to its relative editor container so overflow stays inside the remaining height. Do not change Transform's bottom-right positioning.

- [ ] **Step 2: Run the focused browser test and verify GREEN**

Run the Task 1 command. Expected: all community-limit Chromium tests pass, including the geometry assertion.

- [ ] **Step 3: Prove the geometry test catches the production defect**

Temporarily restore the pre-fix height classes, rerun the geometry test and confirm it fails, then restore the fixed classes and confirm it passes.

### Task 4: Verify and capture

**Files:**
- Modify if the gate exposes a stale prerequisite:
  - `scripts/assert-c1-a-e2e-inventory.ts`
  - `scripts/assert-c1-a-e2e-inventory.test.ts`
  - `scripts/run-c1-a-offline.ts`
  - `scripts/run-c1-a-offline.test.ts`

- [ ] **Step 1: Repair the stale exact browser inventory if the full gate proves it predates the current committed suite**

Keep the exact-title guard. Add the three already-committed Task 7 community-limit titles, replace its one stale renamed title, and advance the closed per-project total from 59 to 62 (59 ordinary plus three C1-A tests). Unit-test the new closed total before changing the guard.

- [ ] **Step 2: Run the complete Event Every verification gate**

Run `bun run verify:c1:a`. Expected: exit 0 with unit, type, lint, build, Chromium, WebKit, worker, and private-worker checks passing.

- [ ] **Step 3: Capture the corrected real-browser paused flow**

Capture the processing-pause screen and the post-click editable input. Confirm visually that the approved community copy is shown and Transform remains within the input's bottom-right corner.

- [ ] **Step 4: Check React and browser errors**

Record `pageerror` and console errors during the capture. Expected: no React or hydration errors; the deliberately mocked usage failure may emit only its expected network status error.

- [ ] **Step 5: Commit the implementation**

Stage only the two tests and production files listed in this plan, then commit with:

```bash
git commit -m "fix(event-every): present community processing pauses"
```
