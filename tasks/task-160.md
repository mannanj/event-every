### Task 160: Add Export Format Dropdown (JSON or ICS)

**Purpose**: Allow users to choose between JSON or ICS format when exporting all events

**Background Research**:
- ICS files support attachments via `ATTACH` property, but typically only as URLs/references, not inline binary data
- Most calendar apps (macOS Calendar, iOS Calendar, Google Calendar) don't support embedded binary attachments in ICS
- Current implementation: JSON format with separate attachment files works universally
- Proposed: Add ICS option that creates individual .ics files per event + separate attachment files

**Compatibility Analysis**:
- **macOS Calendar**: Can import ICS files, but won't recognize attachment files in ZIP folder structure. Would need attachment URLs pointing to accessible locations.
- **iOS Calendar**: Same limitations as macOS - no support for ZIP-bundled attachments with ICS files
- **Recommendation**: ICS format would work for event metadata (title, date, location, description) but attachments would be lost unless we embed them as base64 data URIs (which most apps don't support well)

**Requirements**:
- Convert "Export all" button to dropdown with arrow icon
- Two export options:
  1. **JSON Format** (current): `events.json` + `attachments/[event-id]/[files]`
  2. **ICS Format** (new): Individual `event-[id].ics` files + `attachments/[event-id]/[files]`
- Maintain all current states: loading, success, error, cooldown
- Dropdown should close after selection
- Both formats generate ZIP download with timestamp filename

**Subtasks**:
- [ ] Research best approach for ICS attachments (URLs vs base64 vs separate files)
- [ ] Create dropdown UI component for Export All button
- [ ] Add arrow icon next to "Export all" text
- [ ] Implement ICS export option in exportAll service
- [ ] Generate individual .ics files for each event
- [ ] Test ICS import on macOS Calendar with ZIP attachments
- [ ] Test ICS import on iOS Calendar with ZIP attachments
- [ ] Update success message to indicate format selected
- [ ] Preserve cooldown mechanism across both export formats

**Location**: `src/app/page.tsx`, `src/services/exportAll.ts`

**Technical Notes**:
- ICS ATTACH property format: `ATTACH;FILENAME=image.jpg:attachments/event-123/image.jpg`
- Consider if relative file paths in ATTACH will work when ICS is imported
- May need to use `file://` URLs or data URIs for attachments
- Alternative: Include README.txt in ZIP explaining how to manually attach files

**Mac-Focused Approach**:
- Target macOS Calendar as primary use case
- Test workflow: User unzips, imports ICS files, attachments available in same folder structure
- May require manual attachment linking in Calendar app
- Accept that iOS/mobile support is secondary

**Implementation Decision**:
- Focus on Mac compatibility
- ICS files will include ATTACH properties with relative or file:// paths
- Include instructions in ZIP for Mac users on import process
- JSON format remains recommended for full portability
