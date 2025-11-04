### Task 25: Improve Batch Image Upload UI/UX
- [x] Clear image input after image has been uploaded successfully
- [x] Show "Uploading..." state with spinner overlay in ImageUpload component during batch processing
- [x] Update BatchEventList status section to show better progress messages:
  - "Processing image..." when OCR is running
  - "Extracting events..." when parsing events
  - Show current count as events stream in
- [x] Ensure smooth transition between states
- Location: `src/components/ImageUpload.tsx`, `src/components/BatchEventList.tsx`, `src/app/page.tsx`
