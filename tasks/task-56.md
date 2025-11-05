### Task 56: ICS Attachment Support - Original Input Files

**Goal:** Include original uploaded images and raw text as attachments in exported ICS files

**Background:**
- ICS standard supports `ATTACH` property for file attachments
- Can use base64 inline data: `ATTACH;ENCODING=BASE64;VALUE=BINARY:...`
- Can use data URIs: `ATTACH:data:image/jpeg;base64,...`
- Apple Calendar, Google Calendar, Outlook all support attachments

**Phase 1: Update Data Model**
- [x] Add `attachments` array to CalendarEvent interface:
  ```typescript
  interface CalendarEvent {
    // ... existing fields
    attachments?: EventAttachment[];
  }

  interface EventAttachment {
    id: string;
    filename: string;
    mimeType: string;
    data: string;  // base64 or data URI
    type: 'original-image' | 'original-text' | 'llm-metadata';
    size: number;  // bytes
  }
  ```
- [x] Update storage.ts to persist attachments

**Phase 2: Capture Original Image as Attachment**
- [x] When image is uploaded (page.tsx:172-190), store base64 data
- [x] Create EventAttachment with type='original-image'
- [x] Set filename based on event title: `${event.title}-original.jpg`
- [x] Store mimeType from file.type

**Phase 3: Capture Original Text as Attachment**
- [x] When text is submitted (page.tsx:210-258), create .txt attachment
- [x] Create EventAttachment with type='original-text'
- [x] Set filename: `${event.title}-original-input.txt`
- [x] Encode text as base64 or use data URI

**Phase 4: Update ICS Exporter**
- [x] Check if `ics` library supports attachments parameter
- [x] If yes: Add attachments array to EventAttributes
- [x] If no: Manually append ATTACH properties to ICS string
- [x] Format: `ATTACH;ENCODING=BASE64;VALUE=BINARY;X-FILENAME="filename.jpg":...`
- [x] Or: `ATTACH:data:image/jpeg;base64,...`

**Phase 5: Testing**
- [x] Export event with image attachment
- [x] Import to Apple Calendar - verify image appears
- [x] Import to Google Calendar - verify image appears
- [x] Export event with text attachment
- [x] Test attachment file sizes (ensure reasonable limits)
- [x] Test batch export with multiple attachments

**Considerations:**
- **File Size Limits:** Base64 encoding increases size by ~33%. Keep attachments reasonable (<5MB per event)
- **Image Compression:** Consider compressing images before base64 encoding
- **User Control:** Add checkbox "Include original input as attachment" in export options
- **Storage:** Attachments will increase LocalStorage usage significantly

**Location:**
- `src/types/event.ts` (add EventAttachment interface)
- `src/services/exporter.ts` (add attachment export)
- `src/services/storage.ts` (persist attachments)
- `src/app/page.tsx` (capture original input as attachments)

**Priority:** Medium Impact, Medium Effort (4-6 hours)
