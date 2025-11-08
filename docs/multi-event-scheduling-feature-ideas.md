# Multi-Event Scheduling & Conflict Resolution Feature Ideas

**Date**: November 7, 2025
**Context**: Discussion about adding AI-powered features for handling multiple events and scheduling conflicts

---

## Original Problem Statement

Currently, the Event Every app helps quickly convert images/text into calendar events, but users face challenges when:
- Dropping in several events at once
- Choosing among multiple options at similar times
- Needing to visualize and plan efficiently
- Traditional calendar software (macOS iCal, Google Calendar) having limitations in handling conflicts

The question: What new features can we create leveraging AI and LLMs to solve these scheduling optimization problems?

---

## Current App Capabilities (As of Nov 2025)

Based on the codebase analysis:
- ✓ Batch event extraction from images and text
- ✓ Event storage and history
- ✓ LLM API integration for parsing
- ✓ Streaming event processing
- ✓ URL detection and web scraping for event details
- ✓ Inline event editing
- ✓ iCal export functionality

---

## Proposed Feature Categories

### High-Impact Features (Immediate Value)

#### 1. Conflict Detection & Visual Timeline
**Purpose**: Auto-detect overlapping/conflicting events and visualize them clearly

**Features**:
- Auto-detect overlapping/conflicting events
- Show a visual timeline view with color-coded conflicts
- Display events side-by-side when they overlap
- AI highlights: "3 events on Saturday 2-4pm"

**Data Model**:
```typescript
interface ConflictGroup {
  timeSlot: { start: Date; end: Date };
  events: CalendarEvent[];
  conflictSeverity: 'overlap' | 'adjacent' | 'same-day';
}
```

**Implementation Complexity**: Easy to Medium

---

#### 2. Smart Event Comparison
**Purpose**: When conflicts are detected, provide AI-powered analysis to help decision-making

**Features**:
When you have conflicting events, AI generates a comparison card:
- **What's different**: Location, topic, people, importance signals
- **What AI thinks**: "Event A seems like a conference (industry keywords), Event B is social (casual language)"
- **Decision factors**: Travel time, event type, duration
- **Quick action**: Swipe/click to choose, reject others

**Implementation Complexity**: Medium (leverages existing LLM integration)

---

#### 3. Intelligent Event Scoring
**Purpose**: Automatically prioritize events based on multiple factors

**AI automatically scores each event based on**:
- Explicit importance signals ("VIP", "mandatory", "optional")
- Event type detection (conference, social, work, personal)
- Location analysis (distance from other events, travel time)
- Historical patterns (if tracking user preferences)

**Implementation Complexity**: Medium

---

### Medium-Complexity Features

#### 4. "Optimize My Week" Assistant
**Purpose**: Generate optimized schedule scenarios from many event options

**Workflow**:
1. Drop in 20+ event invitations
2. AI asks clarifying questions:
   - "Prefer in-person or virtual events?"
   - "Max events per day?"
   - "Willing to travel more than X miles?"
3. Generates 2-3 optimized schedule scenarios
4. Shows trade-offs for each scenario

**Implementation Complexity**: Medium to High

---

#### 5. Natural Language Filtering
**Purpose**: Query events using conversational language instead of manual filtering

**Examples**:
- "Show me only evening events this week"
- "Which conferences are in SF?"
- "What events can I attend if I'm free after 2pm?"
- AI understands context and intent

**Implementation Complexity**: Medium

---

#### 6. Batch Event Decision Mode
**Purpose**: Provide a specialized UI for rapid event triage

**Features**:
- **Swipe interface**: Left=reject, Right=accept, Up=maybe
- **Criteria filters**: Show only events < 30min away
- **Quick comparison**: Tap two events to compare side-by-side
- **Bulk actions**: "Reject all conflicting social events when I have work events"

**Implementation Complexity**: Medium

---

### Advanced Features

#### 7. Constraint-Based Auto-Filtering
**Purpose**: Define scheduling rules once, apply automatically to all events

**Example Configuration**:
```typescript
const constraints = {
  maxEventsPerDay: 3,
  noMeetingsBefore: "10:00 AM",
  maxTravelTime: 30, // minutes
  preferredEventTypes: ["conference", "workshop"],
  blackoutDates: [...]
}
```

AI auto-filters and highlights constraint violations

**Implementation Complexity**: High

---

#### 8. Scenario Planning
**Purpose**: Create and compare multiple "what-if" schedule versions

**Features**:
- Create multiple schedule versions:
  - "Version A": All tech events
  - "Version B": Balanced work/social
  - "Version C": Minimize travel
- Compare them visually
- Export chosen scenario

**Implementation Complexity**: High

---

#### 9. Smart Event Enrichment
**Purpose**: Automatically add contextual metadata to help decision-making

**AI automatically adds**:
- Estimated travel time between events
- Weather forecast
- Event popularity/attendance estimates
- Related events you might want to cluster

**Implementation Complexity**: High (requires additional APIs)

---

#### 10. Learning Preferences
**Purpose**: Build user preference models over time

**AI learns patterns like**:
- Always choose in-person over virtual
- Prefer morning events
- Avoid events >20 miles away
- Auto-applies these as soft preferences

**Implementation Complexity**: High (requires ML/tracking infrastructure)

---

## Recommended MVP (Phase 1)

Start with these 3 features for maximum impact with reasonable effort:

### 1. Conflict Detection View (Easy to build)
- Add a toggle: "Show Conflicts Only"
- Visual grouping of overlapping events
- Simple color coding (red = conflict, yellow = tight timing)

### 2. AI Event Comparison (Leverages existing LLM integration)
When conflicts detected, generate comparison:
- "Event A is a tech conference (from keywords: 'AI', 'workshop')"
- "Event B is social (keywords: 'dinner', 'friends')"
- "Event A requires 45min travel, Event B is 10min away"
- One button: "Help me decide" → shows AI analysis

### 3. Quick Triage Mode (New UI mode)
- Swipe/keyboard shortcuts for fast decisions
- Accept/Reject/Maybe buckets
- Saves decisions, only exports accepted events

---

## Technical Implementation Approach

### Existing Infrastructure
Already have:
- ✓ Batch event extraction
- ✓ Event storage
- ✓ LLM API integration

### New Components Needed

```typescript
// New service: src/services/conflictDetector.ts
export function detectConflicts(events: CalendarEvent[]): ConflictGroup[]

// New service: src/services/eventAnalyzer.ts
export async function compareEvents(events: CalendarEvent[]): Promise<EventComparison>

// New service: src/services/eventScorer.ts
export async function scoreEvent(event: CalendarEvent): Promise<EventScore>

// New component: src/components/ConflictTimeline.tsx
// New component: src/components/EventComparisonCard.tsx
// New component: src/components/TriageMode.tsx
// New component: src/components/ScenarioPlanner.tsx
```

### Data Model Extensions

```typescript
interface EventScore {
  overall: number; // 0-100
  factors: {
    importance: number;
    convenience: number;
    type: 'conference' | 'social' | 'work' | 'personal';
    travelTime?: number;
  };
  reasoning: string;
}

interface EventComparison {
  events: CalendarEvent[];
  differences: {
    location: string;
    type: string;
    duration: string;
    travelRequirements: string;
  };
  recommendation: {
    suggested: string; // event ID
    reasoning: string;
    confidence: number;
  };
}

interface ScheduleScenario {
  id: string;
  name: string;
  events: CalendarEvent[];
  score: number;
  tradeoffs: string[];
}
```

---

## Design Considerations

### UI/UX Principles
- Maintain minimal black & white aesthetic
- Use vibrant gradient accents for new features
- Keep interactions fast and responsive
- Mobile-first design for swipe gestures
- Accessible keyboard shortcuts

### Performance
- Conflict detection should run client-side (fast)
- LLM comparisons should be batched to minimize API calls
- Cache event scores to avoid recomputation
- Lazy load scenario planning features

### Privacy
- All event data stays local (localStorage/IndexedDB)
- LLM API calls should anonymize personal details
- User preference learning should be opt-in

---

## Future Considerations

- Integration with calendar APIs (Google Calendar, iCal) for real-time conflict detection
- Collaborative scheduling (share scenarios with others)
- Export optimized schedules as shareable links
- Mobile app with native swipe gestures
- Integration with travel/weather APIs for enrichment

---

## Next Steps

1. Validate MVP feature set with users
2. Design conflict detection algorithm
3. Prototype timeline visualization
4. Build event comparison LLM prompt
5. Create triage mode UI mockups
6. Implement Phase 1 features
7. Gather user feedback
8. Iterate toward advanced features

---

## References

- Main App: `src/app/page.tsx`
- Event Types: `src/types/event.ts`
- Project Guidelines: `CLAUDE.md`
