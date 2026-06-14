### Task 197: Harden the weak E2E assertions surfaced by mutation testing

**Severity: Medium (test quality)** · Discovered 2026-06-13 via a mutation-testing audit of
`e2e/event-extraction.spec.ts` (a worktree-isolated sub-agent injected faults and checked which tests
went red). 10/13 probed assertions are robust; the 4 below ESCAPED their mutation — they confirm the
code *runs*, not that it's *correct*. These are test improvements, not app bugs (cf. 194-196).

#### Weak tests + stronger assertions

1. **Scenario 1 ("specific time") — the hour is unpinned.** `toContainText(/\d{1,2}:\d{2}\s?[AP]M/)`
   matches any time-shaped string, so a +1h date-math regression escapes. (Worse: `TIME_FMT` emits no
   AM/PM — the `[AP]M` the regex matches actually comes from the TimezonePicker `<select>` option
   text, so the regex isn't even anchored to the displayed time element.)
   - [x] Pin the browser zone: `test.use({ timezoneId: 'America/New_York' })` on the describe.
   - [x] Give the mock event `timezone: 'America/New_York'`; assert exact `'7:00 PM'` and `'Mar 13'`.
   - [x] Mutation-prove: +1h in `convertRawToDate` → "8:00 PM" → red.

2. **Scenario 7 ("timezone preserved") — the timezone is unverified.** `toContainText(/[A-Z]{2,5}T|UTC|GMT/)`
   always passes because the card renders the whole `TimezonePicker` dropdown (COMMON_TIMEZONES
   includes `UTC` plus abbreviations ending in `T`), and `toContainText` reads hidden `<option>` text.
   Rendering the visible chip as "zzz" still stayed green.
   - [x] Add `data-testid="tz-chip"` to the visible chip span in `src/components/TimezonePicker.tsx`
         (~line 56, the `<select>`'s sibling).
   - [x] Pin `test.use({ timezoneId: 'UTC' })`; assert `card.getByTestId('tz-chip')` has text `'UTC'`.

3. **Scenario 8 ("low-confidence filtered out") — does not exercise any filter.** It streams one
   high-confidence (0.85) event and asserts count 1. IMPORTANT: low-confidence filtering IS
   implemented, but **server-side** in `src/services/parser.ts` (`event.confidence < CONFIDENCE_THRESHOLD`
   → dropped, ~line 218). The mocked E2E bypasses the server, so it can never test the filter. (The
   audit sub-agent initially reported the filter as missing; that was wrong — it only checked the
   client. Verified present in parser.ts.)
   - [x] Move the filtering assertion to a parser-level unit test: feed a mixed-confidence event set;
         assert sub-threshold events are dropped and supra-threshold survive.
   - [x] Rename the E2E to "renders an extracted event" (what it actually verifies), or stream two
         events and assert order/identity — but don't claim it tests filtering.

4. **UI "card expands on click" — verifies neither the click-to-expand nor the reveal.** It clicks the
   title (which enters title-EDIT mode, not expand) and asserts "Room 42", which is already in the
   collapsed summary. Disabling `toggleExpand` entirely stayed green.
   - [x] Assert on `description` ("A test event with details"), which renders ONLY in the expanded
         `EventFields`: first `toBeHidden()`, click `button[aria-label="Expand"]`, then `toBeVisible()`.

#### Coverage gap the audit could not reach
- Scenarios 3 & 6 ("…= 1 event") can't test the merge property: merging happens in the (mocked)
  LLM/parser, so the E2E only ever sees a pre-merged single event. Test merging at the parser level.

#### Method note
Every change above must be mutation-proven (break the code the assertion targets → confirm red →
revert) per the global "mutation testing" requirement.

- Location: `e2e/event-extraction.spec.ts`, `src/components/TimezonePicker.tsx`, `src/services/parser.ts` (server filter), `src/services/__tests__/` (new parser confidence test)
