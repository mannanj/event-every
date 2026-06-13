# Plan 014: Collapse the 4-file event-editing family into one correct, reusable primitive set (fix the lost-keystroke, all-day, and double-fire bugs by construction)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — **a reviewer maintains that index; if you were
> dispatched by one, leave `plans/README.md` to them.**
>
> **Drift check (run first)**:
> `git diff --stat 400bf32..HEAD -- src/components/EventEditor.tsx src/components/EventConfirmation.tsx src/components/InlineEventEditor.tsx src/components/EditableField.tsx src/components/BatchEventList.tsx src/app/page.tsx src/utils/timeConversion.ts src/types/event.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M–L
- **Risk**: MED (rewrites the core edit loop; the plans/009 e2e net + the new `validateEvent` unit tests are the guard)
- **Depends on**: **plans/009** (the e2e safety net — the render-site swap MUST be guarded by `bun run test:e2e`; 009 also adds the `data-testid` hooks the swap must preserve). Soft-related: plans/006 (see Reconciliation), plans/010 (deferred `EditableField` to this plan).
- **Category**: tech-debt (with three embedded bug fixes)
- **Planned at**: commit `400bf32`, 2026-06-13

## Why this matters

There are **four** components in the event-editing family and only **one** is alive. `InlineEventEditor.tsx` (485 lines) is the sole live editor, rendered at `src/app/page.tsx:1215` (saved-events list) and `src/components/BatchEventList.tsx:520` (expanded card). `EventEditor.tsx` (354) and `EventConfirmation.tsx` (140) have **zero importers** (verified — `grep -rn "components/EventEditor\|components/EventConfirmation" src/ e2e/` is empty). `EditableField.tsx` (206) is the right field-level primitive but is **imported and never rendered** (`src/components/BatchEventList.tsx:29` imports it; `<EditableField` matches nowhere in the repo).

Because the live editor was hand-rolled instead of built on the primitive, it carries three real bugs, and the only correct logic (validation, the all-day toggle) lives in the dead files where users never reach it:

1. **Lost keystrokes** (`InlineEventEditor.tsx:99-109,140-158`). The sync-effect only shields the *single* `editingField` from being overwritten by an incoming `event` prop; `handleFieldChange` fires `onChange` on *every* keystroke, but the `isNaN` guard at `:147` blocks `onChange` while a date is half-typed — so the parent never catches up, and any re-render from a sibling card or the 15s TZ-suggestion timer wipes the partially-typed value back to the stale prop.
2. **All-day renders `undefined`** (`InlineEventEditor.tsx:56-64` + `:251/:270/:364/:383`). `formatDateDisplay` always includes a time, and the display does `.split(' at ')[1]` — but `Intl.DateTimeFormat` joins date and time with a **comma**, not `" at "`, so `[1]` is `undefined` and the time slot renders literally nothing. There is **no all-day toggle in the live editor at all** — the only toggle is in the dead `EventEditor.tsx:165-176`.
3. **Double-fire defeats buffering** (`EditableField.tsx:58-62`). `handleChange` calls `onChange` on every keystroke *and* blur/Enter also commit (`:51-56,67-71`) — so the `localValue` buffer that should have prevented bug 1 is bypassed.

Validation (required title, required start/end, end < start) exists **only** in the dead `EventEditor.tsx:50-76`, so the live path validates nothing. And the attachment list is copy-pasted **three times** (`EventConfirmation.tsx:99-119`, `EventEditor.tsx:300-334`, `InlineEventEditor.tsx:462-482`) with identical type-label + KB formatting.

This plan collapses the family into one composition (`EventFields`) built on a fixed `EditableField`, harvesting the validation and all-day logic out of the dead files **before deleting them**, so the live edit path finally validates and the three bugs are fixed **by construction**. It also extracts the duplicated timezone `<select>` cluster into a single shared `TimezonePicker` (consumed by `EventFields`, imported by plan 015). Estimated net reduction **~730 lines** (delete 485 + 354 + 140 = 979; add ~170 EventFields + ~40 TimezonePicker + ~30 validation + ~20 AttachmentList — EventFields is smaller than the old editor because the tz cluster now lives in `TimezonePicker`).

## Reconciliation with other plans (read before starting)

- **This plan OWNS the deletion of `EventEditor.tsx` + `EventConfirmation.tsx`** because it must first HARVEST their validation (`EventEditor.tsx:50-76`) and all-day toggle (`EventEditor.tsx:165-176`) logic. **This SUPERSEDES plan 006's deletion of those two files.** Plan 006's *remaining* scope is unaffected and still stands: delete `TextInput.tsx` + `ExportOptions.tsx`, drop `@anthropic-ai/sdk` from deps, move `dotenv` to devDependencies, fix `run.sh` (pnpm→bun). If plan 006 already ran and deleted these two files, that is fine — Step 1 below will find them gone and you HARVEST from this plan's inlined excerpts instead (they are reproduced in "Current state"). If plan 006 has NOT run, this plan deletes them; 006's executor must then skip those two from its delete list (its Step 1 grep will already show them gone).
- **Plan 010 explicitly deferred `EditableField` to this plan.** `plans/010-purge-dead-code-and-unify-processing-types.md:58-65` says `EditableField.tsx` is alive (imported at `BatchEventList.tsx:29`), is NOT deleted by 010, and its real outstanding finding — duplicated date-format helpers + hardcoded `COMMON_TIMEZONES`, "a later editor-area wave" — is THIS plan. (Note: 010 also asserts "there is no plan 014"; that statement is now stale — this IS plan 014. No action needed beyond awareness.)
- **Plan 009 is a hard dependency and a guardrail.** 009 adds `data-testid` hooks to `BatchEventList.tsx`'s **card-header** controls (`event-card`, `event-card-title`, `event-card-title-input`, `event-card-date-input`, `event-card-time-input`, `save-events-button`) — all of which live OUTSIDE the `InlineEventEditor` (they're in the collapsed card header at `BatchEventList.tsx:265-515`, not the expanded `InlineEventEditor` at `:520`). This plan only swaps the **expanded** editor (`:520`) and the saved-events editor (`page.tsx:1215`), so those testids are untouched. **Do not remove or rename any `data-testid` 009 added.** Run `bun run test:e2e` after the swap — green is the proof the edit/export loop still works.
- **Plan 015 (event-card/list consolidation) EXISTS and depends on this plan:** it renders `<EventFields>` inside `<EventCard>` and imports the `<TimezonePicker>` created here. This plan is the single authority for both `<EventFields>` and `<TimezonePicker>`. The shared `TimezonePicker` is extracted in Step 4 below from the hardcoded `COMMON_TIMEZONES` + `<select>` cluster that both `InlineEventEditor.tsx:11-29,276-289,389-402` and `BatchEventList.tsx:9-27,403-417` duplicate; `EventFields` consumes it, and 015 imports it rather than building a second one. Plan 015 builds NO timezone widget of its own — it depends on this one.

## Current state

Files and roles:

- `src/components/InlineEventEditor.tsx` (485) — the ONLY live editor. Rendered at `page.tsx:1215` and `BatchEventList.tsx:520`. Owns the three bugs.
- `src/components/EventEditor.tsx` (354) — DEAD (zero importers). Source of the validation + all-day logic to harvest. Imports `normalizeUrl` from `@/utils/url` (`:6`).
- `src/components/EventConfirmation.tsx` (140) — DEAD (zero importers). Read-only preview; one of the three attachment-list copies.
- `src/components/EditableField.tsx` (206) — alive-as-imported, never-rendered (`BatchEventList.tsx:29`). The field-level primitive; has the double-fire bug.
- `src/components/BatchEventList.tsx` (579) — live; renders `InlineEventEditor` at `:520` and dead-imports `EditableField` at `:29`. Has its own COMMON_TIMEZONES (`:9-27`) and date helpers (`:54-65`) — **out of scope to dedupe here** (its card-header inline editors are a separate surface; touch only the `:29` import line and the `:520` render).
- `src/app/page.tsx` (1596) — live; renders `InlineEventEditor` at `:1215`. `updateEvent` comes from `useHistory()` at `:71`.
- `src/utils/timeConversion.ts` — exports `convertRawToDate` (`:11`), `formatTimeInTimezone` (`:75`), `getTimezoneAbbreviation` (`:107`). The date/time *input* formatters (`formatDateForInput`/`formatTimeForInput`) are NOT here today — they are duplicated inside the components (see below). This plan adds them here.
- `src/types/event.ts` — `CalendarEvent` (`:13-32`) has `allDay: boolean`, optional `timezone`, `rawStartDate`/`rawEndDate`, `timezoneStatus`/`timezoneSource`, `url`, `attachments`. `EventAttachment` (`:1-8`) has `type: 'original-image' | 'original-text' | 'llm-metadata'`, `filename`, `size`.

### The duplicated input formatters (byte-identical in two files — verified)

`src/components/EventEditor.tsx:37-48` and `src/components/InlineEventEditor.tsx:43-54` (and a third copy in `BatchEventList.tsx:54-65`, left alone):

```ts
function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeForInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
```

### Bug 1 — lost keystrokes (`InlineEventEditor.tsx:99-109` + `:140-158`)

```ts
useEffect(() => {
  setFormData(prev => ({
    title: editingField === 'title' ? prev.title : (event.title || ''),
    startDate: editingField === 'startDate' ? prev.startDate : formatDateForInput(event.startDate),
    // ...only the field === editingField is shielded; everything else snaps to props
  }));
}, [event, editingField]);

const handleFieldChange = (field: string, value: string) => {
  const updatedFormData = { ...formData, [field]: value };
  setFormData(updatedFormData);
  const startDateTime = new Date(`${updatedFormData.startDate}T${updatedFormData.startTime}`);
  const endDateTime = new Date(`${updatedFormData.endDate}T${updatedFormData.endTime}`);
  if (!isNaN(startDateTime.getTime()) && !isNaN(endDateTime.getTime())) {  // :147 — blocks onChange mid-edit
    onChange({ ...event, /* ... */ startDate: startDateTime, endDate: endDateTime, /* ... */ });
  }
};
```

### Bug 2 — all-day `undefined` time (`InlineEventEditor.tsx:56-64` + display `:251,:270,:364,:383`)

```ts
function formatDateDisplay(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',          // always includes time
  }).format(date);
}
// ...display:
{formatDateDisplay(event.startDate).split(' at ')[0]}   // Intl emits "Mar 14, 2026, 3:00 PM" — comma, not " at "
// ...
{formatDateDisplay(event.startDate).split(' at ')[1]}   // → undefined → empty time slot; no all-day branch anywhere
```

### Bug 3 — double-fire (`EditableField.tsx:51-62`)

```ts
const handleBlur = () => {
  setIsEditing(false);
  if (localValue !== value) {
    onChange(localValue);     // commit on blur — correct
  }
};

const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  const newValue = e.target.value;
  setLocalValue(newValue);
  onChange(newValue);         // ALSO fires every keystroke — defeats the localValue buffer
};
```

### Validation to harvest (DEAD `EventEditor.tsx:50-76`)

```ts
function validateForm(): boolean {
  const newErrors: ValidationErrors = {};
  if (!formData.title.trim()) newErrors.title = 'Title is required';
  if (!formData.startDate) newErrors.startDate = 'Start date is required';
  if (!formData.endDate) newErrors.endDate = 'End date is required';
  if (formData.startDate && formData.endDate) {
    const start = new Date(`${formData.startDate}T${formData.startTime || '00:00'}`);
    const end = new Date(`${formData.endDate}T${formData.endTime || '00:00'}`);
    if (end < start) newErrors.endDate = 'End date/time must be after start date/time';
  }
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
}
```

The `ValidationErrors` shape (`EventEditor.tsx:14-18`): `{ title?: string; startDate?: string; endDate?: string }`.

### All-day toggle + all-day date construction to harvest (DEAD `EventEditor.tsx:110-116,165-176`)

```ts
const startDateTime = formData.allDay
  ? new Date(formData.startDate)
  : new Date(`${formData.startDate}T${formData.startTime}`);
const endDateTime = formData.allDay
  ? new Date(formData.endDate)
  : new Date(`${formData.endDate}T${formData.endTime}`);
// ...
<input id="allDay" type="checkbox" checked={formData.allDay}
  onChange={(e) => handleChange('allDay', e.target.checked)} ... />
<label htmlFor="allDay" ...>All-day event</label>
// ...and start/end TIME inputs are conditionally rendered only when !formData.allDay (EventEditor.tsx:202-215, 242-255)
```

### Attachment-list block (triplicated; canonical copy — `InlineEventEditor.tsx:462-482`)

```tsx
{showAttachments && event.attachments && event.attachments.length > 0 && (
  <div>
    <p className="font-semibold text-gray-700">Attachments:</p>
    <div className="space-y-1">
      {event.attachments.map((attachment, index) => (
        <button key={attachment.id} onClick={() => downloadAttachment(attachment)}
          className="text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left block">
          [{ attachment.type === 'original-image' ? 'Image'
            : attachment.type === 'original-text' ? 'Text' : 'Metadata' } #{index + 1}] {attachment.filename} ({(attachment.size / 1024).toFixed(1)} KB)
        </button>
      ))}
    </div>
  </div>
)}
```

### The two LIVE render sites (props that must be preserved exactly)

`src/app/page.tsx:1215-1219` (saved-events list — minimal props):

```tsx
<InlineEventEditor
  event={event}
  onChange={(updatedEvent) => updateEvent(updatedEvent)}
  showAttachments={true}
/>
```

`src/components/BatchEventList.tsx:520-532` (expanded card — full props):

```tsx
<InlineEventEditor
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
```

So `EventFields` must accept the **full superset** of `InlineEventEditorProps` (`InlineEventEditor.tsx:31-41`): `event`, `onChange`, `showAttachments?`, `hideTitle?`, `tzSuggestion?`, `onTzSuggestionApply?`, `onTzSuggestionDismiss?`, `onTimezoneUserChange?`, `hideTimezoneInfo?` — plus the new `mode?: 'inline' | 'block'`.

### Exporter already handles all-day correctly (this is why all-day is safe to restore here)

`src/services/exporter.ts:74-87,114-130` — for all-day events `dateToArray` returns a 3-element `[Y,M,D]` using **local** getters and `startInputType/startOutputType/endInputType/endOutputType` are all `'local'`; for timed events it uses 4-5-element UTC arrays with `'utc'`. **Therefore an all-day `CalendarEvent` round-trips through export correctly today** — restoring the all-day toggle in the editor produces a correct `.ics` with **no exporter change**. (If you discover the all-day round-trip is in fact wrong and needs an exporter edit, that is plan 008's territory — STOP; see STOP conditions.)

### Conventions

- React 19, TS strict, no `any`. Path alias `@/*`→`src/*`.
- `'use client'` at the top of every interactive component (see `InlineEventEditor.tsx:1`).
- Tailwind only; black & white core UI, the editor uses `text-sm`, `border border-black`, `hover:bg-gray-200` etc. — match `InlineEventEditor.tsx` exactly so the visual result is unchanged.
- Unit tests: **bun's built-in runner** — `import { describe, expect, test } from 'bun:test'`, files under `src/**/__tests__/*.test.ts`, run with **`bun test src`** (NOT bare `bun test`, which picks up the Playwright specs — see plans/003). Do NOT add vitest/jest.

## Commands you will need

| Purpose        | Command                                   | Expected on success |
|----------------|-------------------------------------------|---------------------|
| Install        | `bun install`                             | exit 0              |
| Typecheck      | `bun run type-check`                       | exit 0, no errors   |
| Unit tests     | `bun test src`                            | all pass            |
| One test file  | `bun test src/utils/__tests__/validation.test.ts` | all pass    |
| Build          | `bun run build`                           | exit 0              |
| E2E safety net | `bun run test:e2e`                        | all pass (the behavioral guard) |

If a `"test"` script does not yet exist in `package.json` (plans/003 adds `"test": "bun test src"`), invoke the runner directly as `bun test src` — do not add the script in this plan unless 003 has not landed and you need it; if you add it, keep it exactly `"test": "bun test src"`. Do NOT use `bun run lint` unless plans/004 has landed (broken before it).

## Suggested executor toolkit

- When writing the new `.tsx` components, the repo has the `react-best-practices` reviewer skill available — invoke it after Steps 2-3 to sanity-check hook usage in `EditableField` and `EventFields`.
- Read `src/components/InlineEventEditor.tsx` in full before Step 3 — its timezone `<select>` cluster becomes the shared `TimezonePicker` (Step 4), and `EventFields` reproduces the tz-info tooltip and tz-suggestion pill verbatim (only the field rows change).

## Scope

**In scope** (create / modify / delete — nothing else):

- **Create** `src/utils/validation.ts` — `validateEvent` + `ValidationErrors`.
- **Create** `src/utils/__tests__/validation.test.ts` — bun unit tests.
- **Create** `src/components/EventFields.tsx` — the event-level composition (~200 lines).
- **Create** `src/components/TimezonePicker.tsx` — the single shared timezone widget: exports the picker component + `COMMON_TIMEZONES` (~40 lines). `EventFields` consumes it; plan 015 imports it (builds no second one).
- **Create** `src/components/AttachmentList.tsx` — extracted attachment list (~20 lines).
- **Modify** `src/components/EditableField.tsx` — fix double-fire; add `mode?: 'inline' | 'block'`.
- **Modify** `src/utils/timeConversion.ts` — add `formatDateForInput` + `formatTimeForInput` (single canonical copy).
- **Modify** `src/app/page.tsx` — swap the `:1215` render + its import at `:9`.
- **Modify** `src/components/BatchEventList.tsx` — swap the `:520` render + its import at `:28`; **delete the dead `EditableField` import at `:29`**.
- **Delete** `src/components/InlineEventEditor.tsx`, `src/components/EventEditor.tsx`, `src/components/EventConfirmation.tsx`.

**Out of scope** (do NOT touch):

- `BatchEventList.tsx`'s own card-header inline editors (`:265-515`), its `COMMON_TIMEZONES` (`:9-27`), its date helpers (`:54-65`), and **every `data-testid` plan 009 added** — leave all of it. Only the `:28-29` imports and the `:520` render block change.
- The `.ics` exporter (`src/services/exporter.ts`) — all-day already round-trips; touching it is plan 008's job.
- `BatchEventList.tsx`'s own card-header tz `<select>` cluster (`:403-417`) and its `COMMON_TIMEZONES` (`:9-27`) — left in place here (the card-header surface is plan 015's to migrate onto the shared `TimezonePicker`). This plan builds `TimezonePicker` and uses it inside `EventFields`, but does NOT rewire `BatchEventList`'s card-header `<select>`.
- `e2e/**`, `playwright.config.ts` — 009 owns the spec/testid changes; this plan must keep them green, not edit them.
- Any other component (`SmartInput`, `URLPill`, `RateLimitBanner`, `AuthWrapper`, `PatternLock`, etc.).

## Git workflow

- Branch: `advisor/014-consolidate-event-editing-components`
- **One commit** for the whole plan, message e.g. `Plan 014: consolidate event-editing into EventFields + EditableField; fix keystroke/all-day/double-fire bugs`, ending with the repo's trailer:

  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```
- Do NOT push or open a PR.

## Steps

Order matters: add the new correct pieces first (validation, formatters, fixed primitive, `TimezonePicker`, then EventFields which consumes it), switch the two callers, then delete the dead files last — so the tree never references a deleted module and typecheck/build pass at each gate.

### Step 1: Harvest validation into `src/utils/validation.ts`

Copy the checks out of the dead `EventEditor.tsx:50-76` (reproduced in Current state) into a **pure function** — no React, no state. Operate on the *string form-field* shape the editor holds (date + time as separate strings), so the end-before-start check matches today's semantics exactly:

```ts
export interface ValidationErrors {
  title?: string;
  startDate?: string;
  endDate?: string;
}

export interface EventFormValues {
  title: string;
  startDate: string;   // 'YYYY-MM-DD'
  startTime: string;   // 'HH:mm' (ignored when allDay)
  endDate: string;     // 'YYYY-MM-DD'
  endTime: string;     // 'HH:mm' (ignored when allDay)
  allDay: boolean;
}

export function validateEvent(form: EventFormValues): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!form.title.trim()) errors.title = 'Title is required';
  if (!form.startDate) errors.startDate = 'Start date is required';
  if (!form.endDate) errors.endDate = 'End date is required';
  if (form.startDate && form.endDate) {
    const start = new Date(`${form.startDate}T${form.allDay ? '00:00' : form.startTime || '00:00'}`);
    const end = new Date(`${form.endDate}T${form.allDay ? '00:00' : form.endTime || '00:00'}`);
    if (end < start) errors.endDate = 'End date/time must be after start date/time';
  }
  return errors;
}
```

**Verify**: `bun run type-check` → exit 0.

### Step 2: Add the canonical input formatters to `src/utils/timeConversion.ts`

Append `formatDateForInput` and `formatTimeForInput` (the byte-identical bodies from Current state) as named exports. This is the single copy `EventFields` and `EditableField` will import — `InlineEventEditor`'s and `EventEditor`'s copies vanish when those files are deleted in Step 6.

```ts
export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTimeForInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
```

**Verify**: `bun run type-check` → exit 0.

### Step 3: Fix `EditableField.tsx` (the double-fire that causes the lost-keystroke class) and add `mode`

In `src/components/EditableField.tsx`:

1. **Remove the per-keystroke `onChange`** in `handleChange` (`:58-62`) — buffer only:

   ```ts
   const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
     setLocalValue(e.target.value);   // buffer only; commit happens on blur / Enter
   };
   ```

   Leave `handleBlur` (`:51-56`) and the Enter branch in `handleKeyDown` (`:64-71`) committing `onChange(localValue)` as-is. The Escape branch (`:72-76`) already reverts to `value` — keep it. The `useEffect(() => setLocalValue(value), [value])` at `:32-34` is what now lets a prop update land *while not editing* without clobbering an in-progress edit — keep it.
2. **Add a `mode?: 'inline' | 'block'` prop** (default `'block'`) to `EditableFieldProps` (`:5-15`). `'block'` keeps today's stacked label-over-value layout. `'inline'` renders the value as an inline clickable `<span>` with `hover:bg-gray-200 px-1 rounded` and, when editing, an inline `<input>`/`<textarea>` sized like `InlineEventEditor`'s (e.g. date `width:140px`, time `width:100px`, via the existing `style` approach) — matching `InlineEventEditor.tsx:236-272` so the inline editor's appearance is unchanged. Keep all ARIA (`aria-label`, `aria-invalid`, `role="alert"` on errors) in both modes.

**Verify**: `bun run type-check` → exit 0. (No render-site uses `EditableField` yet — EventFields will, in Step 4.)

### Step 4: Build `src/components/TimezonePicker.tsx`, `src/components/AttachmentList.tsx`, and `src/components/EventFields.tsx`

**`TimezonePicker.tsx`** (`'use client'`) — the single shared timezone widget. This is a real deliverable of THIS plan (not a deferred marker): `EventFields` consumes it and plan 015 imports it. Extract it from the cluster duplicated across `InlineEventEditor.tsx` and `BatchEventList.tsx`:

- **Export `COMMON_TIMEZONES`** — the 17-entry `{ value; label }[]` list, byte-identical to `InlineEventEditor.tsx:11-29` (the same list is also at `BatchEventList.tsx:9-27`). After this plan, this is the single canonical definition; `EventFields` imports it from here.
- **Export the picker component** (default or named — pick one and use it consistently at both consumers). It reproduces the `<select>` cluster verbatim from `InlineEventEditor.tsx:276-289` / `:389-402`: the dotted-underline `<span>` wrapper with the `{tzAbbr}` label + caret `<svg>`, the absolutely-positioned transparent `<select>` whose options render `abbr === tz.label ? tz.label : \`${tz.label} (${abbr})\`` via `getTimezoneAbbreviation(date, tz.value)`. Props: at minimum `date: Date` (for the abbreviation), `value: string` (selected IANA tz), `onChange: (tz: string) => void`. Keep the exact Tailwind classes so the rendered widget is visually unchanged.
- The matching **`COMMON_TIMEZONES` in `BatchEventList.tsx:9-27` is left in place** (the card-header surface is plan 015's to migrate); this plan does not rewire that file's `<select>` at `:403-417`. The de-duplication that removes `BatchEventList`'s copy is plan 015's job, importing from this `TimezonePicker`.

**`AttachmentList.tsx`** — extract the canonical block (Current state). Props: `attachments: EventAttachment[]`. Reproduce the exact type-label (`Image`/`Text`/`Metadata`), `#{index+1}`, filename, and `(KB)` formatting and the `downloadAttachment(attachment)` button. `'use client'` at top.

**`EventFields.tsx`** (`'use client'`) — the event-level composition. It replaces `InlineEventEditor` 1:1. Requirements:

- **Props**: the full superset (Current state) plus `mode?: 'inline' | 'block'` (default `'inline'`). Same prop names/types as `InlineEventEditorProps` so both call sites compile with a near-identical prop list.
- **Local form state**, seeded from the event via `formatDateForInput`/`formatTimeForInput` (Step 2 imports), with the **same edit-shield effect** as `InlineEventEditor.tsx:99-109` — BUT since fields now commit only on blur/Enter (via `EditableField`), the lost-keystroke window is closed: a sibling re-render can no longer wipe an in-progress edit because the in-progress value lives in `EditableField`'s `localValue` until commit. (Keep the shield effect anyway for the title/location/description that may be edited via the inline span.)
- **Fields**, each through `EditableField` (or the inline span pattern): title (hidden when `hideTitle`), start date, start time, end date, end time, location, description, url. Use `mode` to pick inline vs block layout.
- **All-day toggle** (harvested from `EventEditor.tsx:165-176`): a checkbox + label. When `allDay` is true, **hide the start/end TIME fields** (mirror `EventEditor.tsx:202-215,242-255`) and construct dates as `new Date(form.startDate)` / `new Date(form.endDate)` (harvested `:110-116`); when false, construct `new Date(\`${date}T${time}\`)`. This branch is what makes bug 2 impossible — there is no `.split(' at ')` anywhere, and the time slot simply doesn't render in all-day mode. **Set `allDay` on the emitted `CalendarEvent`** so the exporter's all-day path engages.
- **Commit path**: on any field commit, build the updated `CalendarEvent` (spread `...event`, apply the changed fields, set `allDay`, `startDate`, `endDate`, trimmed `location`/`description`/`title`, `url` via `normalizeUrl` from `@/utils/url` — harvested from `EventEditor.tsx:125`) and call `onChange(updatedEvent)`. Run `validateEvent(form)` and surface any error string to the relevant `EditableField`'s `error` prop so the LIVE path finally shows validation. **Do not block `onChange` on validity** the way the old `isNaN` guard did — emit the event and show the error; the parent stays in sync (this is the fix for bug 1).
- **Timezone cluster**: render the shared **`<TimezonePicker>`** built above (one per start/end, replacing the inline `<select>` wrappers at `InlineEventEditor.tsx:273-291,386-404`) and import `COMMON_TIMEZONES` from `TimezonePicker.tsx`. Carry over the surrounding logic verbatim from `InlineEventEditor.tsx`: `handleTimezoneChange` (`:160-183`, which recomputes `startDate`/`endDate` via `convertRawToDate` when `rawStartDate`/`rawEndDate` exist and `!allDay`), `tzAbbr` (`:186`), the `isResolving` spinner (`:292-294`), the tz-info tooltip gated by `hideTimezoneInfo` (`:295-322`), and the tz-suggestion pill (`:324-344`). `EventFields` owns no `COMMON_TIMEZONES` of its own — `TimezonePicker.tsx` is the single source.
- **Attachments**: render `<AttachmentList attachments={event.attachments} />` when `showAttachments && event.attachments?.length`.
- **URL**: render the `URLPill` row (`InlineEventEditor.tsx:455-460`) when `event.url`.

Match `InlineEventEditor`'s Tailwind classes throughout so the rendered output is visually identical (the e2e net asserts behavior, not pixels, but keep it tight).

**Verify**: `bun run type-check` → exit 0. `bun run build` → exit 0.

### Step 5: Swap the two live render sites to `<EventFields>`

- `src/app/page.tsx`: change the import at `:9` from `InlineEventEditor` to `EventFields` (`import EventFields from '@/components/EventFields';`). Replace the `:1215-1219` block with `<EventFields mode="inline" event={event} onChange={(updatedEvent) => updateEvent(updatedEvent)} showAttachments={true} />`.
- `src/components/BatchEventList.tsx`: change the import at `:28` to `EventFields`; **delete the dead `EditableField` import at `:29`** (it was never rendered — its primitive is now used transitively through `EventFields`). Replace the `:520-532` block with `<EventFields mode="inline" ...>` carrying the **identical** prop set shown in Current state (`event`, `onChange`, `showAttachments`, `hideTitle`, `hideTimezoneInfo`, `tzSuggestion`, `onTzSuggestionApply`, `onTzSuggestionDismiss`, `onTimezoneUserChange`).
- **Carry over 009's `data-testid` hooks:** any `data-testid` that plan 009 placed on a `BatchEventList` card-header element (or on an element inside the swapped render block) must be carried onto the corresponding new `<EventFields>`/card element so the e2e selectors still resolve — do not drop a testid because the element moved into `EventFields`.

**Verify**: `bun run type-check` → exit 0; `bun run build` → exit 0; **`bun run test:e2e` → all pass** (this is the behavioral proof the edit + Save/export loop still works through the new component, and that 009's testids still resolve).

### Step 6: Delete the three dead editors

Now that nothing imports them:

```
git rm src/components/InlineEventEditor.tsx src/components/EventEditor.tsx src/components/EventConfirmation.tsx
```

**Verify**: `grep -rn "InlineEventEditor\|components/EventEditor\|components/EventConfirmation" src/ e2e/` → **no matches** (the only hits before were the files themselves + the two swapped imports). Then `bun run type-check` → exit 0; `bun run build` → exit 0.

### Step 7: Full gate

`bun run type-check && bun run build && bun test src && bun run test:e2e` → all exit 0 / all pass.

## Test plan

- **New unit tests** — `src/utils/__tests__/validation.test.ts` (pattern after `src/utils/__tests__/timezone.test.ts` from plans/003: `import { describe, expect, test } from 'bun:test'`). Cover:
  - **valid case** → `{}` (no keys).
  - **missing title** (`title: '   '`) → `errors.title === 'Title is required'`.
  - **missing start date** → `errors.startDate` set.
  - **missing end date** → `errors.endDate` set.
  - **end before start** (timed: end time earlier same day) → `errors.endDate === 'End date/time must be after start date/time'`.
  - **end before start ignored-time when allDay** → with `allDay: true` and equal dates but `endTime < startTime`, end is NOT before start (both clamp to `00:00`) → no `endDate` error (proves the all-day branch ignores time — the invariant that prevents bug 2's class from re-entering validation).
  - **equal start/end** (timed, same instant) → no `endDate` error (boundary: `end < start` is strict).
- These are pure-function tests — no DOM, no network, run under `bun test src` in milliseconds.
- **Behavioral coverage** for the three bugs and the edit/export loop is plans/009's Playwright suite — do not duplicate it here; just keep it green (Step 5/7).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `ls src/components/InlineEventEditor.tsx src/components/EventEditor.tsx src/components/EventConfirmation.tsx 2>&1` → all three "No such file".
- [ ] `ls src/components/EventFields.tsx src/components/TimezonePicker.tsx src/components/AttachmentList.tsx src/utils/validation.ts` → all exist.
- [ ] `grep -l "COMMON_TIMEZONES *:" src/components/*.tsx` → exactly `TimezonePicker.tsx` and `BatchEventList.tsx` (the only two definitions; `EventFields.tsx` imports from `TimezonePicker`, and the deleted editors' copies are gone — `BatchEventList`'s copy is intentionally left for plan 015).
- [ ] `grep -L "COMMON_TIMEZONES" src/components/EventFields.tsx` → matches `EventFields.tsx` (it defines none of its own; imports from `TimezonePicker`).
- [ ] `grep -rn "InlineEventEditor\|components/EventEditor\|components/EventConfirmation" src/ e2e/` → no matches.
- [ ] `grep -n "EditableField" src/components/BatchEventList.tsx` → no matches (dead import removed).
- [ ] `grep -c "split(' at ')" src/components/*.tsx` → 0 (the all-day bug's mechanism is gone).
- [ ] `grep -rn "formatDateForInput\|formatTimeForInput" src/utils/timeConversion.ts` → both present (single canonical copy).
- [ ] `bun run type-check` exits 0; `bun run build` exits 0.
- [ ] `bun test src` passes, including the ≥7 new `validateEvent` assertions.
- [ ] `bun run test:e2e` passes (edit/export loop intact; 009's testids resolve).
- [ ] `git status` shows only the in-scope files changed/created/deleted.
- [ ] `plans/README.md` status row updated — **unless a reviewer told you they maintain it**.

## STOP conditions

Stop and report back (do not improvise) if:

- The code at any "Current state" location does not match the excerpts (drift since `400bf32`) — especially if the two live render-site prop lists (`page.tsx:1215`, `BatchEventList.tsx:520`) differ from what's reproduced here.
- **plans/009 has NOT landed** (no `data-testid="event-card"` / `save-events-button` in `BatchEventList.tsx`, or `bun run test:e2e` doesn't exercise the Save→`.ics` download) — without the safety net you have no behavioral guard for this refactor; report and wait for 009.
- Removing the per-keystroke `onChange` (Step 3) breaks **streaming auto-fill** — i.e. fields that update live while the LLM streams parsed events stop updating because they no longer push on each keystroke. (The fix is about *user typing*, not *prop-driven* updates, so streaming should be unaffected — the `useEffect([value])` still flows props into `localValue` when not editing. But if a spec or manual check shows streamed fields freezing, STOP — the buffering strategy needs rethinking, not a hack.)
- The all-day round-trip **cannot be made correct without editing `src/services/exporter.ts`** — that file is plan 008's territory; STOP and report rather than touching the exporter here.
- `bun run test:e2e` fails after the swap and the failure is a real behavior change (not a stale testid you must NOT edit) — report which spec and why.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For the owner after this lands:

- `EventFields` is now the single event-editing surface. Any new editable field is added once, here, via `EditableField` — never re-hand-roll an editor.
- The shared `TimezonePicker` is built by THIS plan and consumed by `EventFields`. **Plan 015** imports that same `TimezonePicker` for `<EventCard>` and should also rewire `BatchEventList`'s card-header tz `<select>` (`:403-417`) to use it — that collapses the last `COMMON_TIMEZONES` duplication (still present in `BatchEventList.tsx:9-27`, intentionally left here for 015).
- `EditableField` now commits only on blur/Enter/Escape. A reviewer should scrutinize: (a) that streamed/prop-driven updates still land (the `useEffect([value])` path), and (b) that the all-day branch sets `allDay` on the emitted event so the exporter's local-time path engages.
- Validation now runs on the live path but is **non-blocking** (shows errors, still emits). If a future requirement needs to *prevent* export of an invalid event, gate it at the Save button (`BatchEventList.tsx` `handleExport` / `page.tsx` export handlers) using `validateEvent`, not inside `EventFields`.
- This plan superseded plan 006's deletion of `EventEditor.tsx` + `EventConfirmation.tsx`; 006's other deletions (`TextInput.tsx`, `ExportOptions.tsx`) and dep/`run.sh` work are independent and unaffected.
