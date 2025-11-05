### Task 88: Background Upload with Non-Blocking Input Fields
- [ ] Create background processing queue service
- [ ] Remove input blocking during image/text processing
- [ ] Allow concurrent image uploads while previous uploads process
- [ ] Allow text input while images are being processed
- [ ] Implement queue-based state management for multiple operations
- [ ] Update progress indicators to be non-blocking overlays
- [ ] Add queue visualization showing all active operations
- [ ] Handle cancellation of individual background operations
- [ ] Test concurrent image + text submissions

**Location**: `src/services/processingQueue.ts`, `src/hooks/useProcessingQueue.ts`, `src/app/page.tsx`, `src/components/ImageUpload.tsx`, `src/components/TextInput.tsx`, `src/components/ProcessingQueuePanel.tsx`

**Current Problem:**
When a user uploads images, both the image upload and text input fields become disabled (`isLoading` prop blocks interaction). This prevents users from:
- Pasting text while images are processing
- Uploading additional images while previous images process
- Any interaction with the UI during OCR/parsing operations

**Current Implementation Issues:**
1. **Blocking state** (page.tsx:550, 558):
   ```tsx
   isLoading={batchProcessing?.isProcessing || false}
   ```
   Both inputs disabled when batch is processing

2. **Sequential processing** (page.tsx:221-332):
   ```tsx
   for (let i = 0; i < files.length; i++) {
     // Process each image sequentially
   }
   ```
   No parallelization or background queue

3. **Single batch state** (page.tsx:48):
   ```tsx
   const [batchProcessing, setBatchProcessing] = useState<BatchProcessing | null>(null);
   ```
   Only one batch can process at a time

**Desired Behavior:**
1. User uploads 10 images → images start processing in background
2. User can immediately paste text → text processing starts independently
3. User can upload more images → added to queue without blocking
4. All operations show live progress in a non-blocking queue panel
5. User can cancel individual operations from queue

**Implementation Plan:**

#### 1. Processing Queue Service (`src/services/processingQueue.ts`)
```typescript
interface QueueItem {
  id: string;
  type: 'image' | 'text';
  status: 'queued' | 'processing' | 'complete' | 'error';
  progress: number;
  payload: File | string;
  result?: CalendarEvent[];
  error?: string;
  created: Date;
  startedAt?: Date;
  completedAt?: Date;
}

class ProcessingQueue {
  private queue: QueueItem[] = [];
  private maxConcurrent = 3; // Process up to 3 items simultaneously
  private activeCount = 0;

  add(item: QueueItem): void;
  remove(id: string): void;
  processNext(): void;
  getAll(): QueueItem[];
  getActive(): QueueItem[];
}
```

#### 2. React Hook (`src/hooks/useProcessingQueue.ts`)
```typescript
export function useProcessingQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const addToQueue = (type: 'image' | 'text', payload: File | string) => {
    // Add to queue and start processing
  };

  const cancelItem = (id: string) => {
    // Cancel specific item
  };

  return { queue, addToQueue, cancelItem };
}
```

#### 3. Update page.tsx
- Remove `isLoading` prop from ImageUpload and TextInput
- Replace single `batchProcessing` state with queue-based approach
- Allow `handleImageSelect` and `handleTextSubmit` to run concurrently
- Each operation adds itself to queue independently

#### 4. Queue Visualization Panel (`src/components/ProcessingQueuePanel.tsx`)
- Fixed bottom-right corner panel (like history panel concept)
- Shows all active/queued operations
- Progress bar for each operation
- Cancel button per operation
- Collapsible when not in use
- Black & white minimal design

#### 5. Remove Blocking Overlays
- Remove `isLoading` spinners that block entire components
- Keep progress indicators but make them non-intrusive
- Use toast-style notifications for completion/errors

**Technical Considerations:**
- Use Web Workers for image processing if OCR becomes CPU-intensive
- Implement proper queue prioritization (text before images?)
- Handle API rate limits across multiple concurrent operations
- Persist queue state to localStorage on page reload
- Graceful degradation if concurrency not supported

**Testing Scenarios:**
1. Upload 5 images → paste text immediately → verify both process
2. Upload 25 images → upload 25 more → verify queue handles overflow
3. Cancel mid-processing operation → verify cleanup
4. Rapid fire: upload, text, upload, text → verify all queued
5. Browser refresh during processing → verify queue recovery

**Success Criteria:**
- ✅ User can upload images without blocking text input
- ✅ User can paste text without blocking image uploads
- ✅ Multiple operations process concurrently (respecting rate limits)
- ✅ Non-blocking progress indicators for all operations
- ✅ Individual operation cancellation works correctly
- ✅ UI remains responsive during heavy processing

**Priority**: High (UX improvement, enables true multi-tasking)
**Effort**: 8-12 hours
**Complexity**: Medium-High (requires architectural changes)
