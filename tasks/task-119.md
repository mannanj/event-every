### Task 119: Implement Click-to-Edit Pattern for Events

Replace separate Edit buttons with inline click-to-edit pattern for event displays. Auto-save on change, exit edit mode on blur.

#### Subtasks:

**1. Create Reusable EditableField Component**
- [x] Create `src/components/EditableField.tsx` with click-to-edit functionality
- [x] Support text, date, time, datetime-local, and textarea types
- [x] Visual states: read mode (hover:bg-gray-50), edit mode (border-2 border-black)
- [x] Props: label, value, type, onChange, placeholder, multiline, readOnly
- [x] Auto-save on every change (call onChange immediately)
- [x] Exit edit mode on blur (onBlur) - return to read view
- [x] Cursor: cursor-pointer on hover in read mode (makes click action more obvious)

**2. Create InlineEventEditor Component**
- [x] Create `src/components/InlineEventEditor.tsx` using EditableField
- [x] Display all event fields (title, start, end, location, description) as editable
- [x] Each field independently editable (click to edit, blur to exit)
- [x] Handle validation (required fields, date logic) - show errors inline
- [x] No Save/Cancel buttons (auto-save on change, blur to exit)
- [x] Use same validation logic as EventEditor

**3. Update HistoryPanel for Click-to-Edit**
- [x] Replace static text display with InlineEventEditor
- [x] Remove separate "Edit" button (lines 218-229 in HistoryPanel.tsx)
- [x] Maintain Export button and delete functionality
- [x] Each field clickable to edit in place
- [x] Auto-saves to history on every field change
- [x] Location: `src/components/HistoryPanel.tsx`

**4. Update Event Confirmation/Success Card (Unsaved Events - Task 55)**
- [x] Replace static text with InlineEventEditor (editable fields only)
- [x] Keep existing auto-save timer behavior (no changes to save logic)
- [x] Make fields editable inline (click to edit, blur to exit, auto-save on change)
- [x] No new buttons - keep existing UI flow
- [x] Location: `src/app/page.tsx:444-465`

**5. Update BatchEventList for Collapsible Click-to-Edit**
- [x] Keep checkbox + expandable card UI pattern
- [x] Keep existing "Save (3)" button (saves selected events to history)
- [x] In collapsed view: title and date/location are click-to-edit
- [x] In expanded view: show full InlineEventEditor
- [x] Clicking editable fields in collapsed view auto-expands card
- [x] Auto-save changes to batch event data (not to history yet)
- [x] Maintain selection state during editing
- [x] Location: `src/components/BatchEventList.tsx`

**6. Styling & Visual Polish**
- [x] Consistent hover states across all editable fields (hover:bg-gray-50)
- [x] Cursor changes to `cursor-pointer` on hover
- [x] Focus ring on active input (ring-2 ring-black)
- [x] Smooth transitions for state changes (read ↔ edit)
- [x] Maintain black & white aesthetic
- [x] Border appears only in edit mode (border-2 border-black)

**Location:**
- New: `src/components/EditableField.tsx`
- New: `src/components/InlineEventEditor.tsx`
- Update: `src/components/HistoryPanel.tsx`
- Update: `src/app/page.tsx` (success card only - no behavior changes)
- Update: `src/components/BatchEventList.tsx`

**Related Tasks:**
- Supersedes Task 26 (edit capability for batch events)
- Completes Task 55 (make success card fields editable)
- Implements Task 24 pattern (inline editing)

**Priority:** High Impact, Medium Effort (4-6 hours)

**Design Pattern:**
```
Read Mode (Default):
┌─────────────────────────────────────┐
│ Fall Medicine Dances                │ ← hover:bg-gray-50, cursor-text
│ Start: Nov 18, 2025 at 7:30 PM     │ ← Click any field to edit
│ End: Nov 18, 2025 at 9:00 PM       │
│ Location: Austin, TX               │
└─────────────────────────────────────┘

Edit Mode (Click field):
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │ Fall Medicine Dances|           │ │ ← border-2 border-black, focused
│ └─────────────────────────────────┘ │
│ Start: Nov 18, 2025 at 7:30 PM     │ ← Other fields still in read mode
│ End: Nov 18, 2025 at 9:00 PM       │
│ Location: Austin, TX               │
└─────────────────────────────────────┘

Blur → Returns to Read Mode:
┌─────────────────────────────────────┐
│ Fall Medicine Dances (Updated)      │ ← Auto-saved, back to read view
│ Start: Nov 18, 2025 at 7:30 PM     │
│ End: Nov 18, 2025 at 9:00 PM       │
│ Location: Austin, TX               │
└─────────────────────────────────────┘
```

**Batch Events (Keep Existing Save Button):**
```
┌─────────────────────────────────────┐
│ ☑ Fall Medicine Dances           ▼  │ ← Title is click-to-edit
│   Nov 18 at 7:30 PM • Austin, TX    │ ← Date/location click-to-edit
├─────────────────────────────────────┤
│           Save (3)                   │ ← KEEP THIS - saves to history
│     Pick what you want to keep       │
└─────────────────────────────────────┘
```

**Key Behaviors:**
- ✅ Click field → enters edit mode
- ✅ Type changes → auto-saves immediately (updates event data)
- ✅ Blur (click outside) → exits edit mode, returns to read view
- ✅ No Save/Cancel buttons for inline edits
- ✅ Keep "Save (N)" button in batch events (saves selected to history)
- ✅ Keep existing auto-save timer in success card (no behavior changes)
