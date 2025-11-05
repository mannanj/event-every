### Task 72: Iterative Event Generation (Pause/Resume/Enrich)
- [ ] Add pause button to event generation UI
- [ ] Implement generation state management (generating/paused/reviewing)
- [ ] Create context accumulation system (combine original + added data)
- [ ] Add resume functionality that re-triggers parsing with full context
- [ ] Implement queued enrichment (auto-regenerate on new data added)
- [ ] Build live skeleton UI with field-specific loading states
- [ ] Create change review interface (accept/reject individual changes)
- [ ] Add "Continue Editing" vs "Finalize Event" states
- [ ] Support drag-and-drop during generation (queue for next iteration)
- [ ] Support text input during generation (queue for next iteration)
- Location: `src/app/page.tsx`, `src/components/EventGenerator.tsx`, `src/services/parser.ts`

**Current Flow:**
```
Upload → Parse → Event Generated → Done
```

**New Flow:**
```
Upload → Parse Started
  ↓
[PAUSE] ← User adds context
  ↓
Resume → Parse with Combined Data
  ↓
Event Generated (v1)
  ↓
User drags new image → Queued Enrichment
  ↓
Auto Re-parse → Live Updates (skeleton + spinners)
  ↓
Show Diff → Accept/Reject Changes
  ↓
Finalize Event
```

**UI States:**

1. **Generating (can be paused):**
```
┌─────────────────────────────────────┐
│ ⏸️  Pause  |  Analyzing image...    │
├─────────────────────────────────────┤
│ 📷 Original image attached          │
│                                     │
│ Drop more images or add notes here  │
│ (will be queued for next iteration) │
└─────────────────────────────────────┘
```

2. **Paused (user can add context):**
```
┌─────────────────────────────────────┐
│ ▶️  Resume  |  Generation paused    │
├─────────────────────────────────────┤
│ Original Input:                     │
│ • Image: flight-boarding-pass.jpg   │
│                                     │
│ Add Context:                        │
│ ┌─────────────────────────────┐   │
│ │ This is a Delta flight.     │   │
│ │ I need to arrive 15 mins    │   │
│ │ early. Add reminder to bring│   │
│ │ passport to description.    │   │
│ └─────────────────────────────┘   │
│                                     │
│ [Chat] [Drag Images Here]          │
└─────────────────────────────────────┘
```

3. **Enriching (live updates):**
```
┌─────────────────────────────────────┐
│ Event: Delta Flight DL123           │
├─────────────────────────────────────┤
│ Start: Nov 13, 2025 at 4:29 PM     │
│ End: Nov 13, 2025 at 6:59 PM       │
│ Location: [⏳ Updating...]          │
│ Description: American Airlines...   │
│              [⏳ Adding new info...] │
│                                     │
│ Processing: gate-info.jpg (2/3)    │
└─────────────────────────────────────┘
```

4. **Review Changes:**
```
┌─────────────────────────────────────┐
│ Review Proposed Changes             │
├─────────────────────────────────────┤
│ Title:                              │
│ - Flight AA 2013 from Miami to...  │
│ + Delta Flight DL123 to Miami      │
│   [✓ Accept] [✗ Reject]            │
│                                     │
│ Description:                        │
│   American Airlines flight AA 2013...│
│ + Remember to bring passport        │
│   [✓ Accept] [✗ Reject]            │
│                                     │
│ Alerts:                             │
│ + Arrive 15 minutes early (4:14 PM)│
│   [✓ Accept] [✗ Reject]            │
│                                     │
│ [Accept All] [Reject All] [Review] │
└─────────────────────────────────────┘
```

**Technical Implementation:**

**State Management:**
```typescript
interface GenerationState {
  status: 'idle' | 'generating' | 'paused' | 'enriching' | 'reviewing' | 'complete';
  iterations: GenerationIteration[];
  currentIteration: number;
  queuedInputs: QueuedInput[];
  pendingChanges?: EventChangeset;
}

interface GenerationIteration {
  id: string;
  timestamp: Date;
  inputs: InputSource[];  // Original image + added context
  result: ParsedEvent;
  processingTime: number;
}

interface QueuedInput {
  id: string;
  type: 'image' | 'text' | 'chat-message' | 'attachment';
  data: string | File;
  addedAt: Date;
  status: 'queued' | 'processing' | 'processed';
}

interface EventChangeset {
  changes: FieldChange[];
  sourceIteration: number;  // Which iteration proposed these changes
}

interface FieldChange {
  field: keyof CalendarEvent;
  oldValue: any;
  newValue: any;
  source: 'user-input' | 'attachment-analysis' | 'chat-instruction';
  confidence: number;
  accepted?: boolean;
}
```

**Parser Service Updates:**
```typescript
// parser.ts
interface ParseContext {
  originalInputs: InputSource[];
  additionalContext?: string;  // User-provided instructions
  attachments?: File[];
  previousResult?: ParsedEvent;  // For enrichment
}

async function parseEvent(context: ParseContext): Promise<ParsedEvent> {
  // Combine all context into single prompt
  const prompt = buildContextualPrompt(context);

  // If previousResult exists, ask LLM to enrich/update
  // Otherwise, create from scratch

  return parsedEvent;
}
```

**Queued Enrichment:**
```typescript
// EventGenerator.tsx
const [queuedInputs, setQueuedInputs] = useState<QueuedInput[]>([]);

// When user drags new image during/after generation
const handleNewInput = async (input: File | string) => {
  const queuedInput = { id: uuid(), type: 'image', data: input, addedAt: new Date() };
  setQueuedInputs(prev => [...prev, queuedInput]);

  // Auto-trigger enrichment after short debounce
  debounce(async () => {
    await enrichEventWithQueuedInputs();
  }, 2000)();
};

const enrichEventWithQueuedInputs = async () => {
  if (queuedInputs.length === 0) return;

  setState('enriching');

  // Process queued inputs
  const newResult = await parseEvent({
    originalInputs: [...originalInputs],
    additionalContext: userContext,
    attachments: queuedInputs.map(q => q.data),
    previousResult: currentEvent,
  });

  // Generate changeset
  const changes = generateChangeset(currentEvent, newResult);

  setState('reviewing');
  setPendingChanges(changes);

  // Clear queue
  setQueuedInputs([]);
};
```

**Live Skeleton Updates:**
```typescript
// Show loading states on individual fields
<div className="event-field">
  <label>Description:</label>
  {isFieldUpdating('description') ? (
    <div className="skeleton-text">
      <span className="animate-pulse">Updating with new information...</span>
    </div>
  ) : (
    <p>{event.description}</p>
  )}
</div>
```

**Change Review:**
```typescript
// ChangeReviewModal.tsx
const ChangeReviewModal = ({ changeset, onAccept, onReject }: Props) => {
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});

  const acceptChange = (changeId: string) => {
    setDecisions(prev => ({ ...prev, [changeId]: true }));
  };

  const rejectChange = (changeId: string) => {
    setDecisions(prev => ({ ...prev, [changeId]: false }));
  };

  const applyChanges = () => {
    const acceptedChanges = changeset.changes.filter(c => decisions[c.field]);
    onAccept(acceptedChanges);
  };

  return (
    // Render diff view for each field
    changeset.changes.map(change => (
      <FieldDiff
        field={change.field}
        oldValue={change.oldValue}
        newValue={change.newValue}
        onAccept={() => acceptChange(change.field)}
        onReject={() => rejectChange(change.field)}
      />
    ))
  );
};
```

**Example Use Case (Flight Event):**

1. **Upload boarding pass image**
2. **Pause during generation**
3. **Add context via text:**
   ```
   "This is a Delta flight. I need to arrive 15 minutes early.
   Add to description: Bring passport."
   ```
4. **Resume → Gets enriched event**
5. **Drag gate information PDF**
6. **System auto-enriches (queued)**
7. **Shows changes:**
   ```
   - Airline: American Airlines → Delta
   + Alert: Arrive at 4:14 PM (15 min before)
   + Description: ...Bring passport
   + Gate: B23 (from gate-info.pdf)
   ```
8. **Accept all → Finalized event**

**Dependencies:**
- Task 68 (version history for tracking iterations)
- Task 69 (attachment support)
- Task 70 (attachment analysis for enrichment)

**Notes:**
- Pause/resume fundamentally changes generation from one-shot to iterative
- Queued enrichment creates "continuous refinement" UX
- Change review prevents unwanted AI modifications
- Each iteration saved as version (ties to Task 68)
- Consider rate limiting: max 5 enrichment iterations per event

**Priority:** High Impact, High Effort (12-15 hours)
