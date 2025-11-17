### Task 163: Fix Image + Text Input - Send Text as Prompt to LLM

#### Issue:
When uploading an image AND typing text (e.g., "Would you import these events as single-day events?"), the text was being ignored. The system processed images and text separately instead of combining them.

#### Subtasks:
- [x] Add `text?: string` field to QueueItem interface
- [x] Update `processingQueue.add()` to accept text parameter
- [x] Update `useProcessingQueue` hook to pass text parameter
- [x] Update `handleImageSelect` to accept additionalText parameter
- [x] Pass text to API call in image processing
- [x] Update `handleSmartInputSubmit` to send text with images
- [x] Update `handleTextSubmit` to pass undefined for text parameter

#### Solution:
The text input now accompanies the image in the API request, allowing the LLM to understand instructions like "import as all-day events" when processing images.

- Location: `src/app/page.tsx`, `src/hooks/useProcessingQueue.ts`, `src/services/processingQueue.ts`
