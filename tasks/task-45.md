### Task 45: Event Enrichment from Additional Inputs
- [ ] Detect when new input relates to existing event
- [ ] Propose adding new data to matching event
- [ ] Auto-merge information with undo option
- [ ] Show diff/preview of what will be added
- [ ] Support multiple screenshots/texts enriching same event
- [ ] Smart field merging (append descriptions, update times, add locations)

**Location:** `src/components/`, `src/services/parser.ts`, `src/hooks/`

**Details:**
- When user uploads new screenshot/text, check if it relates to recent events
- Two modes:
  1. Ask: "Did you mean to add this to [Event Title]?"
  2. Auto-add: Just merge it and show undo option
- Examples:
  - Upload flight confirmation → event created
  - Upload hotel booking → "Add to your SF trip?"
  - Upload restaurant reservation → auto-adds location to dinner event
- Smart merging:
  - Append to description if new details
  - Update location if more specific
  - Extend time if duration info found
  - Add notes/context
- Show what changed (diff view)
- One-click undo if wrong
- Works with recent events (last 24h or current session)
