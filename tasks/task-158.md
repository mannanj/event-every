### Task 158: Add Export All Events to ZIP

**Purpose**: Provide users a safety net to backup all their events data before IndexedDB migration

**Requirements**:
- Export all events from LocalStorage/IndexedDB with their attachments
- Create a single ZIP file download containing:
  - `events.json` - all event data (dates as ISO strings, without base64 attachments inline)
  - `attachments/[event-id]/[filename]` - actual attachment files organized by event
- **CRITICAL**: Lazy load JSZip library only when Export All button is clicked (dynamic import)
- Must not bloat initial app bundle with JSZip
- Client-side only (no server involvement)
- Handle events with image attachments (base64 → binary files)
- Success/error feedback to user

**Subtasks**:
- [x] Install JSZip library (`npm install jszip`)
- [x] Create export service with lazy-loaded JSZip (dynamic import)
- [x] Export events.json with attachment metadata (no inline base64)
- [x] Convert base64 attachments to binary files in ZIP
- [x] Organize ZIP structure: events.json + attachments/[event-id]/files
- [x] Add "Export All" button to history panel
- [x] Trigger download with timestamp filename
- [x] Add loading state during ZIP generation
- [x] Show success/error notifications

**Location**: `src/services/exportAll.ts`, history component

**Technical Notes**:
- Use dynamic import: `const JSZip = (await import('jszip')).default;`
- Filename format: `event-every-export-YYYY-MM-DDTHH-MM-SS.zip`
- Handle quota errors gracefully
- Preserve all event metadata including timezone, source, etc.
