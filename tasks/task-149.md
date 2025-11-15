### Task 149: Enhanced Event Editing Experience

#### Overview
Improve the event editing UX to make it faster and more intuitive to modify events from any source (Event Every history, Google Calendar, Apple Calendar). Support bulk editing, quick edits, and smart suggestions.

#### Subtasks

**Core Editing Improvements**
- [ ] Add quick edit mode (hover to edit, click outside to save)
- [ ] Implement keyboard shortcuts for common edits (Cmd+E to edit, Esc to cancel)
- [ ] Add undo/redo for event changes
- [ ] Implement auto-save with visual feedback
- [ ] Add field validation with helpful error messages
- [ ] Improve date/time picker UX (natural language input like "tomorrow at 3pm")
- [ ] Add recurring event editing (edit single vs all instances)
- [ ] Add event duplication feature

**Bulk Editing**
- [ ] Add multi-select for events (checkbox or Cmd+click)
- [ ] Implement bulk actions menu (delete, export, move to calendar)
- [ ] Add bulk date/time adjustment (shift all selected events by X hours/days)
- [ ] Add bulk tag/category assignment
- [ ] Add bulk calendar source reassignment

**Smart Suggestions**
- [ ] Add smart location autocomplete (from previous events)
- [ ] Add smart title autocomplete (from previous events)
- [ ] Suggest event duration based on title/type
- [ ] Suggest location based on event title
- [ ] Detect and suggest timezone for locations
- [ ] Add attendee suggestions (from previous events)

**Rich Editing Features**
- [ ] Add rich text editor for descriptions (markdown support)
- [ ] Add attachment management (add/remove files, images)
- [ ] Add URL/link management
- [ ] Add color coding for events
- [ ] Add custom fields/tags for events
- [ ] Add event templates for common event types

**Visual Improvements**
- [ ] Show edit conflicts when syncing with external calendars
- [ ] Add visual diff when editing synced events
- [ ] Add inline preview of changes before saving
- [ ] Improve mobile editing experience
- [ ] Add drag-and-drop to adjust event times
- [ ] Add visual feedback for saving/syncing status

**Advanced Features**
- [ ] Add event splitting (split one event into multiple)
- [ ] Add event merging (combine duplicate events)
- [ ] Add smart conflict detection (overlapping events warning)
- [ ] Add event history/audit log (see all changes)
- [ ] Add collaborative editing indicators (if event is shared)

#### Location
- `src/components/InlineEventEditor.tsx` - Enhance existing inline editor
- `src/components/BulkEditPanel.tsx` - New bulk editing UI
- `src/components/QuickEditPopover.tsx` - Quick edit overlay
- `src/components/RichEventEditor.tsx` - Full-featured event editor
- `src/hooks/useEventEdit.ts` - Event editing logic
- `src/hooks/useBulkEdit.ts` - Bulk editing logic
- `src/utils/smartSuggestions.ts` - Smart suggestion engine
- `src/utils/naturalLanguageDate.ts` - Natural language date parsing

#### Dependencies
- Rich text editor library (e.g., TipTap, Lexical)
- Date parsing library (e.g., chrono-node for natural language dates)
- Timezone library (already using date-fns or similar)

#### Success Criteria
- [ ] Editing feels instant and responsive
- [ ] Users can edit events with keyboard only
- [ ] Bulk editing works for 100+ events smoothly
- [ ] Smart suggestions are accurate and helpful
- [ ] Changes sync properly to external calendars
- [ ] No data loss during editing
- [ ] Mobile editing experience is touch-optimized
- [ ] Undo/redo works reliably
- [ ] Natural language date input works for common phrases
