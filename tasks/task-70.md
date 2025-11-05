### Task 70: Attachment Analysis & Smart Suggestions
- [ ] Process uploaded attachments through OCR pipeline
- [ ] Parse extracted text for event-relevant information
- [ ] Generate suggested edits based on attachment content
- [ ] Display suggestions in chat or as inline prompts
- [ ] Allow user to accept/reject/modify suggestions
- [ ] Save attachment metadata (type, extracted text, applied suggestions)
- Location: `src/services/ocr.ts`, `src/services/parser.ts`, `src/components/ChatModal.tsx`

**Dependencies:** Task 69

**Notes:**
- Example: Airbnb check-in PDF → extract address, check-in time, instructions
- Suggestions could appear as chat messages: "I found a check-in time of 3 PM in your attachment. Update event start time?"
- Store which attachments contributed to which fields
