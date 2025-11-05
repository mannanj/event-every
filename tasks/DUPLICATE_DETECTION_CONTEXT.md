# Duplicate Detection Feature - Implementation Context

## Overview
We're building an AI-powered duplicate detection and merging system for Event Every. When users create or import events, the system automatically detects duplicates using LLM similarity analysis, presents them in an intuitive UI, and offers intelligent merging.

## User Flow
1. User creates/imports a new calendar event
2. System automatically checks for duplicates (shows "Checking for duplicates..." spinner)
3. If duplicates found → Modal appears showing:
   - Side-by-side comparison (original vs new)
   - Similarity score (0-100) with confidence level (High/Medium/Low)
   - Match reasons ("Same date and location", "Similar titles")
   - Merged preview showing final combined event
   - Actions: [Merge & Save] [Keep Both] [Cancel]
4. User chooses action → System executes and shows success notification
5. History panel reflects the result (merged event or both kept)

## Architecture Components

### 1. Type Definitions (`src/types/event.ts`)
```typescript
interface DuplicateMatch {
  existingEvent: CalendarEvent;
  incomingEvent: CalendarEvent;
  similarityScore: number; // 0-100
  matchReasons: string[];  // ["Similar title", "Same date"]
  confidence: 'high' | 'medium' | 'low';
}

interface MergeStrategy {
  mergedEvent: CalendarEvent;
  conflicts: FieldConflict[];
  suggestedResolution: string; // LLM explanation
}

interface FieldConflict {
  fieldName: string;
  value1: string;
  value2: string;
  resolution: string; // Which value was chosen
}

interface DuplicateSettings {
  autoDetect: boolean;           // Enable/disable feature
  sensitivityThreshold: number;  // 60-95 (similarity cutoff)
  autoMergeHigh: boolean;       // Auto-merge 90+ confidence
  checkWindowDays: number;       // Only check events within N days
}
```

### 2. Duplicate Detection Service (`src/services/duplicateDetection.ts`)
**Purpose**: LLM-powered similarity detection

**Key Functions**:
- `detectDuplicates(newEvent, existingEvents)`: Returns array of DuplicateMatch
- `scoreSimilarity(event1, event2)`: Returns similarity score with reasons
- Uses LLM with structured prompts to compare events
- Only checks events within time window (±2 weeks by default)
- Includes caching to avoid redundant LLM calls
- Fallback to basic string matching if LLM unavailable

**LLM Prompt Template**:
```
Compare these calendar events and determine similarity:

Event 1: {title, date, location, description}
Event 2: {title, date, location, description}

Return JSON:
{
  "similarityScore": 0-100,
  "isDuplicate": boolean,
  "matchReasons": ["reason1", "reason2"],
  "confidence": "high" | "medium" | "low"
}
```

### 3. Event Merger Service (`src/services/eventMerger.ts`)
**Purpose**: Intelligent field-level merging

**Key Functions**:
- `mergeEvents(event1, event2)`: Returns MergeStrategy
- Smart rules:
  - **Title**: Choose most descriptive or combine
  - **Dates**: Use more precise time range
  - **Location**: Keep most detailed address
  - **Description**: Merge unique details from both
- LLM determines best merge strategy
- Detects field conflicts for user review

### 4. React Hook (`src/hooks/useDuplicateDetection.ts`)
**Purpose**: State management for detection workflow

**Returns**:
```typescript
{
  isDetecting: boolean;              // Loading state
  duplicates: DuplicateMatch[];      // Found matches
  showModal: boolean;                // Trigger UI
  checkDuplicates: (event) => void;  // Start detection
  mergeDuplicates: (match) => void;  // Execute merge
  keepBothEvents: () => void;        // Save separately
}
```

### 5. UI Components

#### `MergeProgressIndicator.tsx`
Simple loading indicator with states:
- "Checking for duplicates..."
- "Analyzing event similarity..."
- "Preparing merge preview..."
- "Done!" (checkmark, fade out)

Black & white spinner, non-blocking overlay.

#### `DuplicateDetectionModal.tsx`
Interactive modal with:
- Side-by-side event comparison
- Similarity score badge with confidence
- Match reasons list
- Merged preview section
- Action buttons (Merge/Keep Both/Cancel)
- Mobile responsive, keyboard accessible
- Black & white theme

**Visual Layout**:
```
┌─────────────────────────────────────┐
│  Potential Duplicate Found          │
├─────────────────────────────────────┤
│  Original Event  →  New Event       │
│  [event details] → [event details]  │
│                                     │
│  Similarity: 87% (High Confidence)  │
│  • Same date and time               │
│  • Similar location                 │
│                                     │
│  ─── Merged Preview ───             │
│  [combined event details]           │
│                                     │
│  [Merge & Save]  [Keep Both]  [✕]   │
└─────────────────────────────────────┘
```

### 6. Storage Integration (`src/services/storage.ts`)
**Modifications**:
- Intercept `saveEvent()` to trigger duplicate check
- Add `replaceEvent()` for merge operations
- Handle batch imports with duplicate checking
- Maintain backward compatibility

**Modified Flow**:
```typescript
saveEvent(event) {
  if (settings.autoDetect) {
    const duplicates = await detectDuplicates(event);
    if (duplicates.length > 0) {
      // Show modal, await user decision
      // Either merge or save as new
    }
  }
  // Normal save
}
```

### 7. Settings Service (`src/services/duplicateSettings.ts`)
**Purpose**: User preferences persistence

**Settings**:
- Auto-detect toggle (default: true)
- Sensitivity slider: 60-95 (default: 75)
- Auto-merge high confidence (default: false)
- Check window days (default: 14)

Stored in localStorage, loaded on app start.

## Dependencies Between Tasks

**Task 33** (Types) → Foundation for everything
**Task 34** (Detection Service) → Depends on Task 33
**Task 35** (Merger Service) → Depends on Task 33
**Task 36** (React Hook) → Depends on Tasks 33, 34, 35
**Task 37** (Progress Indicator) → Depends on Task 33 (standalone)
**Task 38** (Modal) → Depends on Tasks 33, 36, 37
**Task 39** (Storage Integration) → Depends on Tasks 33, 34, 35, 36
**Task 40** (Settings) → Depends on Task 33 (standalone)
**Task 41** (Testing) → Depends on all previous tasks

## Code Standards & Requirements

### Black & White UI Only
- Use only: `bg-black`, `bg-white`, `text-black`, `text-white`, `border-black`, `border-white`
- Grays only for disabled states: `bg-gray-100`, `text-gray-500`

### Minimal Comments
- Remove obvious comments ("Set state", "Call API")
- Keep only critical context (LLM prompt decisions, edge cases)

### Type Safety
- Strict TypeScript, no `any` types
- All interfaces in `src/types/`

### Accessibility
- ARIA labels on all interactive elements
- Keyboard navigation (Esc, Tab, Enter)
- Screen reader support

### Performance
- Debounce detection to avoid excessive LLM calls
- Cache results for identical comparisons
- Only check events within reasonable time window
- Never block UI during detection

## Existing Project Context

**Tech Stack**:
- Next.js 15 with App Router
- TypeScript (strict mode)
- Tailwind CSS
- Claude API for LLM calls (via `/api/parse` endpoint pattern)

**Existing Event Interface** (`src/types/event.ts`):
```typescript
interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  description?: string;
  allDay: boolean;
  created: Date;
  source: 'image' | 'text';
  originalInput?: string;
}
```

**Existing Storage Service** (`src/services/storage.ts`):
- `saveEvent(event)`: Save single event
- `saveEvents(events[])`: Save multiple events
- `updateEvent(event)`: Update existing event
- `getAllEvents()`: Get all stored events
- `deleteEvent(id)`: Remove event
- Uses localStorage with key `event_every_history`

**LLM Integration Pattern**:
Create API routes like `/api/detect-duplicates` that:
1. Accept POST with event data
2. Call Claude API with structured prompt
3. Parse JSON response
4. Return to frontend

## Implementation Notes

### When implementing any task:
1. Check that previous dependencies are complete
2. Import types from `src/types/event.ts`
3. Follow existing code patterns in the project
4. Add minimal, necessary comments only
5. Test locally before marking complete
6. Use black & white styling exclusively
7. Ensure mobile responsive design
8. Add proper error handling

### LLM Integration Best Practices:
- Always include fallback logic for API failures
- Cache responses to minimize costs
- Use streaming for better UX when possible
- Structure prompts for JSON responses
- Validate LLM output before using

### Testing Priorities:
- Exact duplicates (100% match)
- Partial duplicates (70-90%)
- False positives (similar but different)
- Edge cases (timezone differences, all-day events)
- Performance with 500+ events

---

## Tasks 33-41 are ready to implement. Previous tasks (1-32) are complete.
