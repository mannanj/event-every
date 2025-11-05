### Task 86: Add Event Deduplication for Multi-Image Upload

- [ ] Create deduplication utility function that compares events by title, date, and location
- [ ] Apply deduplication when adding events from multiple images to batch
- [ ] Test with multiple images containing duplicate events
- [ ] Ensure original events are preserved when no duplicates exist

**Location:** `src/utils/deduplication.ts`, `src/app/page.tsx`

**Problem:**
When uploading multiple images, each image is processed independently and events are simply appended to the batch. If the same event appears in multiple images (e.g., screenshots from the same event page), duplicate events are created.

Example: User uploaded 6 images and got 19 events with many duplicates:
- "Austin LangChain AIMUG Meeting" appeared twice
- "Networking & Welcome" appeared twice
- "Introductions & Kickoff" appeared twice
- etc.

**Solution:**
Implement smart deduplication that:
1. Compares events by title similarity (fuzzy matching)
2. Checks if start dates are within a reasonable threshold (e.g., same minute)
3. Compares locations if present
4. Keeps the event with higher confidence or more complete information
5. Applies deduplication after all images are processed but before displaying to user
