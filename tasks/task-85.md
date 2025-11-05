### Task 85: Implement Non-Blocking Queue-Based Event Processing

- [ ] Decouple image upload and text input states (remove shared `batchProcessing` state)
- [ ] Create queue management system with `ProcessingQueue` state and functions (add, process, remove)
- [ ] Remove `isLoading` props from ImageUpload and TextInput components to keep them always enabled
- [ ] Implement concurrent processing for multiple images/text inputs (replace sequential loop with Promise.allSettled)
- [ ] Update state management to track individual queue items instead of single batch
- [ ] Create QueuePanel component to display all processing jobs with real-time status
- [ ] Add per-item progress indicators, cancel, and retry functionality
- [ ] Support independent image upload and text parsing (text box should not disable during image upload)
- [ ] Display processing status below input area with queue of pending/processing/completed jobs
- [ ] Test concurrent event processing with multiple images and text inputs simultaneously

**Location:** `src/app/page.tsx`, `src/components/ImageUpload.tsx`, `src/components/TextInput.tsx`

**Architecture Changes:**

**Current (Blocking):**
- Single `batchProcessing` state controls both ImageUpload and TextInput
- Sequential processing (one image at a time)
- UI disabled during processing

**New (Non-Blocking Queue):**
```typescript
interface QueueItem {
  id: string;
  type: 'image' | 'text';
  status: 'pending' | 'processing' | 'complete' | 'error';
  events: CalendarEvent[];
  progress: number;
  error?: string;
  fileName?: string;
  preview?: string;
}

const [processingQueue, setProcessingQueue] = useState<QueueItem[]>([]);
```

**Key Changes:**
1. Replace shared `batchProcessing` state with independent `processingQueue` array
2. Remove blocking conditions: `isLoading={false}` for both components
3. Process images/text concurrently (Promise.allSettled)
4. Update queue items individually as they process
5. Display queue below with real-time status updates
6. Allow new uploads/text input while processing continues
