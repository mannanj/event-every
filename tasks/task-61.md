### Task 61: Drag-and-Drop Calendar Scheduling & Planning Interface

**Goal:** Visual calendar interface for planning, organizing, and scheduling events with drag-and-drop, timeline views, filtering, and multi-calendar support

**Vision:**
Transform Event Every from a simple event creator into a powerful planning tool. Users can view their events on a timeline, drag them onto custom calendars, plan hypothetical scenarios, detect conflicts, and share their schedules. Filter events by search terms or time ranges, and visualize everything in day/week/month views.

**Note:** This is a large feature that will be broken down into 3-7 subtasks during implementation. This task serves as the master planning document.

---

## Core Features Overview

### 1. Timeline View (Default View)
- Scrollable timeline with time headers
- Events displayed chronologically
- Right sidebar with date markers for quick navigation
- Filter events by search terms
- Filter events by time ranges
- Compact card view for each event

### 2. Calendar View
- Day/Week/Month formats
- Drag-and-drop events from history/timeline
- Visual conflict detection
- Multiple calendar support
- Grid-based layout

### 3. Custom Calendars
- Create multiple calendars (e.g., "Work", "Personal", "Vacation Planning")
- Subscribe to calendars via iCal URL
- Share calendar links (read-only or editable)
- Toggle calendar visibility
- Color coding (within black/white theme using patterns/shading)

### 4. Planning & Scenarios
- Drag events to test different schedules
- View conflicts (overlapping events)
- Save hypothetical scenarios
- Compare multiple scenarios side-by-side

---

## Phase 1: Timeline View with Filtering

**Goal:** Create scrollable timeline as the default events view

**UI Layout:**
```
┌─────────────────────────────────────────────────────┐
│ [Search events...] [Filter: All Time ▼]           │
├──────────────────────────────────┬──────────────────┤
│                                  │  2025           │
│  January 15, 2025               │  ├─ Jan 15 ◄    │
│  ┌──────────────────────────┐   │  ├─ Jan 20      │
│  │ 2:00 PM - Team Meeting  │   │  ├─ Jan 22      │
│  │ Conference Room B        │   │  ├─ Feb 3       │
│  └──────────────────────────┘   │  ├─ Feb 10      │
│                                  │  └─ Feb 14      │
│  January 20, 2025               │                  │
│  ┌──────────────────────────┐   │  2024           │
│  │ 9:00 AM - Car Rental     │   │  ├─ Dec 28      │
│  │ Gary A. (Turo)           │   │  └─ Dec 31      │
│  └──────────────────────────┘   │                  │
│                                  │     [Scroll]     │
│  January 22, 2025               │                  │
│  ┌──────────────────────────┐   │                  │
│  │ All Day - Birthday Party │   │                  │
│  └──────────────────────────┘   │                  │
└──────────────────────────────────┴──────────────────┘
```

**Subtasks:**
- [ ] Create TimelineView component
  - [ ] Vertical scrollable list of events
  - [ ] Group events by date with date headers
  - [ ] Compact event cards with time, title, location
- [ ] Right sidebar date navigator
  - [ ] Show all dates with events
  - [ ] Click to jump to that date
  - [ ] Highlight current scroll position
- [ ] Search filtering
  - [ ] Real-time search as user types
  - [ ] Search across: title, location, description
  - [ ] Highlight matching terms
- [ ] Time range filtering
  - [ ] Dropdown: "All Time", "Past", "Upcoming", "This Week", "This Month", "Custom Range"
  - [ ] Date range picker for custom filtering
  - [ ] Filter applies to timeline and date navigator
- [ ] Performance optimization
  - [ ] Virtual scrolling for large event lists
  - [ ] Lazy loading event cards
  - [ ] Debounced search input

**Data Model:**
```typescript
interface TimelineFilter {
  searchTerm: string;
  timeRange: 'all' | 'past' | 'upcoming' | 'week' | 'month' | 'custom';
  startDate?: Date;
  endDate?: Date;
}

interface TimelineViewState {
  events: CalendarEvent[];
  filteredEvents: CalendarEvent[];
  filter: TimelineFilter;
  scrollPosition: number;
  selectedDate?: Date;
}
```

---

## Phase 2: Calendar Grid View (Day/Week/Month)

**Goal:** Display events in traditional calendar grid layouts

**Week View Example:**
```
┌─────────────────────────────────────────────────────────────┐
│  Week of January 15, 2025           [Day][Week ✓][Month]  │
├────────┬────────┬────────┬────────┬────────┬────────┬──────┤
│  Mon   │  Tue   │  Wed   │  Thu   │  Fri   │  Sat   │ Sun  │
│  15    │  16    │  17    │  18    │  19    │  20    │  21  │
├────────┼────────┼────────┼────────┼────────┼────────┼──────┤
│ 9 AM   │        │        │ ┌────┐ │        │ ┌────┐ │      │
│        │        │        │ │Mtng│ │        │ │Car │ │      │
│ 10 AM  │        │        │ └────┘ │        │ │Pick│ │      │
│        │        │        │        │        │ └────┘ │      │
│ 11 AM  │        │        │        │        │        │      │
│ 12 PM  │        │        │        │        │        │      │
│ 1 PM   │        │        │        │        │        │      │
│ 2 PM   │ ┌────┐ │        │        │        │        │      │
│        │ │Team│ │        │        │        │        │      │
│ 3 PM   │ │Meet│ │        │        │        │        │      │
│        │ └────┘ │        │        │        │        │      │
└────────┴────────┴────────┴────────┴────────┴────────┴──────┘
```

**Subtasks:**
- [ ] CalendarGrid component with view switcher
  - [ ] Day view: Single day, hourly slots
  - [ ] Week view: 7 days, hourly slots
  - [ ] Month view: Calendar grid, multi-event cells
- [ ] Event rendering in grid cells
  - [ ] Position events by start/end time
  - [ ] Handle overlapping events (side-by-side)
  - [ ] All-day events in top row
  - [ ] Truncate long titles with tooltip
- [ ] Navigation controls
  - [ ] Previous/Next buttons
  - [ ] Today button
  - [ ] Date picker for jumping to specific date
  - [ ] Keyboard shortcuts (arrow keys, T for today)
- [ ] Time slot grid
  - [ ] Configurable start/end hours (e.g., 6 AM - 11 PM)
  - [ ] 30-minute or 1-hour increments
  - [ ] Current time indicator (red line)
- [ ] Responsive design
  - [ ] Mobile: Default to day view
  - [ ] Tablet: Default to week view
  - [ ] Desktop: All views available

**Data Model:**
```typescript
interface CalendarViewState {
  view: 'day' | 'week' | 'month';
  currentDate: Date;
  startHour: number;  // Default: 6
  endHour: number;    // Default: 23
  slotDuration: 30 | 60;  // minutes
}

interface GridEvent {
  event: CalendarEvent;
  gridRow: number;      // Hour slot
  gridColumn: number;   // Day column
  gridRowSpan: number;  // Duration in slots
  overlaps: string[];   // IDs of overlapping events
}
```

---

## Phase 3: Drag-and-Drop from History to Calendar

**Goal:** Enable dragging events from timeline/history onto calendar grid

**Flow:**
```
1. User hovers over event in timeline/history
   → Cursor changes to grab/move icon

2. User drags event
   → Event card becomes semi-transparent
   → Calendar grid highlights valid drop zones

3. User drops event on calendar slot
   → Event updates with new date/time
   → Visual feedback (animation)
   → Conflict warning if overlap detected

4. User can also drag existing events to new times
   → Update event in-place
   → Maintain duration
```

**Subtasks:**
- [ ] Draggable event cards
  - [ ] Use react-dnd or native drag-and-drop
  - [ ] Visual feedback during drag (ghost element)
  - [ ] Cursor changes
- [ ] Droppable calendar slots
  - [ ] Highlight valid drop zones on hover
  - [ ] Snap to time slot boundaries
  - [ ] Calculate new date/time from drop position
- [ ] Event time updates
  - [ ] Update CalendarEvent start/end times
  - [ ] Maintain event duration when dragging
  - [ ] Save to storage immediately
  - [ ] Undo/redo support
- [ ] Drag within calendar grid
  - [ ] Drag to new time on same day
  - [ ] Drag to different day
  - [ ] Resize event by dragging edges (bonus)
- [ ] Visual feedback
  - [ ] Show new time while dragging
  - [ ] Conflict indicators (red border/warning)
  - [ ] Success animation on drop

**Data Model:**
```typescript
interface DragDropState {
  isDragging: boolean;
  draggedEvent?: CalendarEvent;
  dropTarget?: {
    date: Date;
    time: string;
  };
  conflicts?: CalendarEvent[];
}

interface EventUpdate {
  eventId: string;
  oldStart: Date;
  oldEnd: Date;
  newStart: Date;
  newEnd: Date;
  hasConflict: boolean;
}
```

---

## Phase 4: Multi-Calendar Support

**Goal:** Create, manage, and toggle multiple calendars

**UI Example:**
```
┌─────────────────────────────────────────────────────┐
│  My Calendars                        [+ New]        │
├─────────────────────────────────────────────────────┤
│  ✓ Personal (24 events)              [⚙️] [📤]     │
│  ✓ Work (12 events)                  [⚙️] [📤]     │
│  ✓ Vacation Planning (5 events)      [⚙️] [📤]     │
│  ☐ Family (archived)                 [⚙️] [📤]     │
├─────────────────────────────────────────────────────┤
│  Subscribed Calendars                               │
├─────────────────────────────────────────────────────┤
│  ✓ Team Events (iCal)                [⚙️] [🔗]     │
│  ✓ Holidays (webcal)                 [⚙️] [🔗]     │
└─────────────────────────────────────────────────────┘
```

**Subtasks:**
- [ ] Calendar data model
  ```typescript
  interface Calendar {
    id: string;
    name: string;
    type: 'personal' | 'subscribed';
    visible: boolean;
    events: CalendarEvent[];
    createdAt: Date;

    // For subscribed calendars
    subscriptionUrl?: string;
    lastSynced?: Date;

    // For sharing
    shareUrl?: string;
    sharePermissions?: 'read' | 'write';

    // Visual (patterns for black/white theme)
    pattern?: 'solid' | 'dots' | 'stripes' | 'grid';
  }
  ```
- [ ] Create calendar UI
  - [ ] Modal/sidebar for new calendar
  - [ ] Name input
  - [ ] Pattern selection (for visual distinction)
  - [ ] Validation (unique names)
- [ ] Calendar list sidebar
  - [ ] Toggle visibility with checkboxes
  - [ ] Event counts
  - [ ] Settings button per calendar
  - [ ] Drag-to-reorder calendars
- [ ] Calendar settings
  - [ ] Rename calendar
  - [ ] Change pattern
  - [ ] Delete calendar (with confirmation)
  - [ ] Archive calendar
  - [ ] Export as .ics file
- [ ] Event assignment to calendars
  - [ ] Default calendar for new events
  - [ ] Move event between calendars
  - [ ] Filter views by selected calendars

---

## Phase 5: Calendar Subscription & Sharing

**Goal:** Subscribe to external calendars and share your calendars

**Subscription Flow:**
```
1. User clicks "Subscribe to Calendar"
2. Enters iCal URL (webcal:// or https://)
3. App fetches and parses .ics file
4. Displays preview of events
5. User confirms → Events added to subscribed calendar
6. Auto-refresh every 24 hours
```

**Sharing Flow:**
```
1. User clicks "Share" on their calendar
2. App generates public URL: event-every.app/cal/abc123
3. Choose permissions: "Read-only" or "Editable"
4. Copy link or generate QR code
5. Recipients can:
   - View calendar in browser
   - Subscribe via iCal URL
   - Download .ics file
```

**Subtasks:**
- [ ] Subscribe to external calendars
  - [ ] iCal URL input
  - [ ] Fetch and parse .ics files
  - [ ] Store subscribed events separately
  - [ ] Auto-refresh on schedule
  - [ ] Handle subscription errors
- [ ] Generate shareable links
  - [ ] Create public calendar page
  - [ ] Read-only vs. editable permissions
  - [ ] Short URL generation
  - [ ] QR code generation
- [ ] Public calendar viewer
  - [ ] Embeddable calendar widget
  - [ ] No login required for viewing
  - [ ] Subscribe button (add to their calendar)
  - [ ] Download .ics option
- [ ] iCal feed endpoint
  - [ ] `/api/calendar/:id/ical` route
  - [ ] Generate .ics file on-the-fly
  - [ ] Support webcal:// protocol
  - [ ] Include all visible events

**API Routes:**
```typescript
// Subscribe to external calendar
POST /api/calendar/subscribe
{
  url: string;  // iCal URL
  name: string;
}

// Generate share link
POST /api/calendar/:id/share
{
  permissions: 'read' | 'write';
}

// Public calendar viewer
GET /cal/:shareId

// iCal feed
GET /api/calendar/:id/ical
→ Returns .ics file
```

---

## Phase 6: Conflict Detection & Scenario Planning

**Goal:** Detect scheduling conflicts and plan hypothetical scenarios

**Conflict Detection:**
```
┌─────────────────────────────────────────────────────┐
│  ⚠️ Scheduling Conflict Detected                   │
├─────────────────────────────────────────────────────┤
│  January 18, 2025                                  │
│                                                     │
│  9:00 AM - 10:30 AM  │ Team Meeting               │
│  10:00 AM - 11:00 AM │ ⚠️ Client Call             │
│                                                     │
│  Overlap: 30 minutes                               │
│                                                     │
│  [Ignore] [Adjust Times] [Cancel One]              │
└─────────────────────────────────────────────────────┘
```

**Scenario Planning:**
```
┌─────────────────────────────────────────────────────┐
│  Scenarios               [+ New Scenario]           │
├─────────────────────────────────────────────────────┤
│  ✓ Current Schedule (24 events)                    │
│  ☐ Option A: Morning Meetings (24 events)         │
│  ☐ Option B: Afternoon Focus (24 events)          │
│                                                     │
│  [Compare Scenarios] [Apply Option A]              │
└─────────────────────────────────────────────────────┘
```

**Subtasks:**
- [ ] Conflict detection algorithm
  - [ ] Check for overlapping events
  - [ ] Calculate overlap duration
  - [ ] Highlight conflicts in calendar view
  - [ ] Real-time conflict checking on drag/drop
- [ ] Conflict resolution UI
  - [ ] Modal with conflict details
  - [ ] Suggestions: adjust times, cancel event
  - [ ] Auto-suggest alternative times
- [ ] Scenario management
  - [ ] Create scenario from current calendar
  - [ ] Duplicate events for testing
  - [ ] Name and save scenarios
  - [ ] Switch between scenarios
  - [ ] Apply scenario to main calendar
- [ ] Scenario comparison
  - [ ] Side-by-side calendar views
  - [ ] Diff view (what changed)
  - [ ] Conflict counts per scenario
  - [ ] Best option suggestion
- [ ] Temporary event states
  - [ ] "Tentative" flag for hypothetical events
  - [ ] Different visual style (dotted border)
  - [ ] Bulk confirm/cancel tentative events

**Data Model:**
```typescript
interface EventConflict {
  eventA: CalendarEvent;
  eventB: CalendarEvent;
  overlapStart: Date;
  overlapEnd: Date;
  overlapMinutes: number;
}

interface Scenario {
  id: string;
  name: string;
  baseCalendarId: string;
  events: CalendarEvent[];
  conflicts: EventConflict[];
  createdAt: Date;
  isActive: boolean;
}

interface CalendarEvent {
  // ... existing fields
  tentative?: boolean;
  scenarioId?: string;
}
```

---

## Phase 7: Advanced Filtering & Search

**Goal:** Powerful search and filtering for finding events

**Filter Options:**
```
┌─────────────────────────────────────────────────────┐
│  🔍 Search & Filter                                 │
├─────────────────────────────────────────────────────┤
│  [Search: "car rental".....................]        │
│                                                     │
│  Time Range:                                        │
│  ○ All Time  ● Upcoming  ○ Past                    │
│  ○ This Week  ○ This Month  ○ Custom Range         │
│                                                     │
│  Calendars:                                         │
│  ✓ Personal  ✓ Work  ☐ Family                     │
│                                                     │
│  Event Type:                                        │
│  ✓ All Day  ✓ Timed  ☐ Tentative                  │
│                                                     │
│  Source:                                            │
│  ✓ Image  ✓ Text  ○ Manual Entry                  │
│                                                     │
│  Location:                                          │
│  ○ Any  ● Has Location  ○ No Location             │
│                                                     │
│  [Clear Filters] [Save Filter Preset]              │
└─────────────────────────────────────────────────────┘
```

**Subtasks:**
- [ ] Advanced search
  - [ ] Search across: title, description, location, contacts
  - [ ] Fuzzy matching
  - [ ] Highlight search results
  - [ ] Search history
- [ ] Multi-criteria filtering
  - [ ] Time range filters
  - [ ] Calendar filters (multi-select)
  - [ ] Event type filters (all-day, timed, tentative)
  - [ ] Source filters (image, text, manual)
  - [ ] Location filters
- [ ] Filter presets
  - [ ] Save commonly used filter combinations
  - [ ] Quick access buttons
  - [ ] Example: "This Week's Work Events"
- [ ] Smart filters
  - [ ] "Events with conflicts"
  - [ ] "Upcoming in next 7 days"
  - [ ] "Events without location"
  - [ ] "Tentative events"
- [ ] Filter persistence
  - [ ] Save filter state to localStorage
  - [ ] Restore on page load
  - [ ] URL params for shareable filtered views

---

## Implementation Breakdown (3-7 Subtasks)

**When ready to implement, break this into:**

1. **Task 61-A: Timeline View & Filtering** (Phase 1)
   - Timeline component, search, time filters, date navigator

2. **Task 61-B: Calendar Grid Views** (Phase 2)
   - Day/Week/Month views, grid rendering, navigation

3. **Task 61-C: Drag-and-Drop Functionality** (Phase 3)
   - Drag from timeline to calendar, within calendar, time updates

4. **Task 61-D: Multi-Calendar System** (Phase 4)
   - Create/manage calendars, toggle visibility, event assignment

5. **Task 61-E: Calendar Subscription & Sharing** (Phase 5)
   - Subscribe to iCal, generate share links, public viewer

6. **Task 61-F: Conflict Detection & Scenarios** (Phase 6)
   - Detect overlaps, scenario planning, comparison tools

7. **Task 61-G: Advanced Search & Filtering** (Phase 7)
   - Multi-criteria filters, presets, smart filters

---

## Technical Considerations

### State Management
- **Local State:** Calendar view settings, current date
- **Global State:** All calendars, all events, filter state
- **Recommendation:** Zustand or React Context with useReducer
- **Persistence:** IndexedDB for large event datasets

### Performance
- **Virtual Scrolling:** Only render visible events in timeline
- **Memoization:** React.memo for event cards
- **Debouncing:** Search input, filter changes
- **Lazy Loading:** Load events in date ranges as needed
- **Web Workers:** Heavy computations (conflict detection, search)

### Libraries
- **Drag-and-Drop:** react-dnd or @dnd-kit/core
- **Calendar Grid:** Build custom (more control) or use react-big-calendar
- **Date Utilities:** date-fns (already in use)
- **iCal Parsing:** ical.js
- **Virtual Scrolling:** react-window or react-virtual

### Data Storage
```typescript
// Storage structure
{
  calendars: Calendar[];
  events: CalendarEvent[];  // All events across calendars
  scenarios: Scenario[];
  filterPresets: FilterPreset[];
  viewState: {
    currentCalendarView: 'day' | 'week' | 'month';
    currentDate: Date;
    activeFilters: FilterState;
    visibleCalendars: string[];
  };
}
```

### API Routes
```typescript
// Calendar management
GET    /api/calendars          → List all calendars
POST   /api/calendars          → Create calendar
PATCH  /api/calendars/:id      → Update calendar
DELETE /api/calendars/:id      → Delete calendar

// Calendar subscription
POST   /api/calendars/subscribe → Subscribe to iCal URL
GET    /api/calendars/:id/sync  → Refresh subscribed calendar

// Calendar sharing
POST   /api/calendars/:id/share → Generate share link
GET    /cal/:shareId           → Public calendar viewer
GET    /api/calendars/:id/ical → iCal feed

// Event management (within calendars)
POST   /api/calendars/:id/events      → Add event to calendar
PATCH  /api/events/:id/calendar       → Move event to different calendar
GET    /api/calendars/:id/conflicts   → Get conflicts for calendar

// Scenarios
POST   /api/scenarios                 → Create scenario
GET    /api/scenarios/:id/conflicts   → Get conflicts in scenario
POST   /api/scenarios/:id/apply       → Apply scenario to main calendar
```

---

## Testing Checklist

- [ ] Timeline view displays events chronologically
- [ ] Date navigator scrolls to correct date
- [ ] Search filters events in real-time
- [ ] Time range filters work correctly
- [ ] Calendar grid renders day/week/month views
- [ ] Events display at correct times
- [ ] Overlapping events stack side-by-side
- [ ] Drag event from timeline to calendar updates time
- [ ] Drag event within calendar updates time
- [ ] Conflict detection identifies overlaps
- [ ] Create multiple calendars
- [ ] Toggle calendar visibility
- [ ] Subscribe to external iCal feed
- [ ] Share calendar generates public link
- [ ] Create and compare scenarios
- [ ] Filter by multiple criteria
- [ ] Save and load filter presets
- [ ] Mobile responsive (day view default)
- [ ] Keyboard navigation works
- [ ] Undo/redo for drag-and-drop

---

## UI/UX Requirements

**Black & White Theme Compliance:**
- Calendars use patterns (dots, stripes, grids) not colors
- Conflicts use bold borders + warning icon
- Hover states use subtle gray tones
- Drag-and-drop feedback uses opacity changes
- Visual hierarchy through typography (bold, size)

**Accessibility:**
- Keyboard navigation for calendar grid
- Screen reader announces conflicts
- ARIA labels for drag-and-drop
- Focus indicators for all interactive elements
- High contrast for text readability

**Mobile Optimization:**
- Timeline view as default on mobile
- Swipe gestures for calendar navigation
- Tap to edit events (no hover)
- Bottom sheet for filters/settings
- Responsive calendar grid (day view on small screens)

---

## Future Enhancements (Post-Launch)

- [ ] Recurring events (daily, weekly, monthly)
- [ ] Calendar templates (e.g., "Standard Work Week")
- [ ] Bulk operations (delete all, move all to calendar)
- [ ] Print calendar view
- [ ] Export scenario as PDF
- [ ] Integration with Google Calendar API (two-way sync)
- [ ] Team calendars with real-time collaboration
- [ ] AI suggestions: "Best time for this meeting?"
- [ ] Time zone support for multi-location events
- [ ] Calendar analytics (time spent per category)

---

## Location

**New Files:**
- `src/components/calendar/TimelineView.tsx`
- `src/components/calendar/CalendarGrid.tsx`
- `src/components/calendar/DayView.tsx`
- `src/components/calendar/WeekView.tsx`
- `src/components/calendar/MonthView.tsx`
- `src/components/calendar/EventCard.tsx`
- `src/components/calendar/DateNavigator.tsx`
- `src/components/calendar/CalendarSidebar.tsx`
- `src/components/calendar/CalendarList.tsx`
- `src/components/calendar/CreateCalendarModal.tsx`
- `src/components/calendar/FilterPanel.tsx`
- `src/components/calendar/ConflictModal.tsx`
- `src/components/calendar/ScenarioManager.tsx`
- `src/hooks/useCalendar.ts`
- `src/hooks/useDragDrop.ts`
- `src/hooks/useConflicts.ts`
- `src/hooks/useScenarios.ts`
- `src/services/calendarService.ts`
- `src/services/icalService.ts`
- `src/services/conflictDetector.ts`
- `src/types/calendar.ts`
- `src/utils/calendarUtils.ts`
- `src/utils/conflictUtils.ts`

**Modified Files:**
- `src/types/event.ts` (add calendar fields)
- `src/services/storage.ts` (add calendar storage)
- `src/app/page.tsx` (add calendar view toggle)

**API Routes:**
- `src/app/api/calendars/route.ts`
- `src/app/api/calendars/[id]/route.ts`
- `src/app/api/calendars/subscribe/route.ts`
- `src/app/api/calendars/[id]/share/route.ts`
- `src/app/api/calendars/[id]/ical/route.ts`
- `src/app/api/scenarios/route.ts`
- `src/app/api/scenarios/[id]/route.ts`
- `src/app/cal/[shareId]/page.tsx` (public viewer)

---

**Priority:** High Impact, Very High Effort (40-60 hours total across all phases)

**Dependencies:**
- Existing event history system
- Event data model
- Storage service

**Estimated Timeline:**
- Phase 1 (Timeline): 6-8 hours
- Phase 2 (Calendar Grid): 8-10 hours
- Phase 3 (Drag-Drop): 8-10 hours
- Phase 4 (Multi-Calendar): 6-8 hours
- Phase 5 (Subscription/Sharing): 8-10 hours
- Phase 6 (Conflicts/Scenarios): 6-8 hours
- Phase 7 (Advanced Filtering): 4-6 hours

---

**Next Steps:**
1. Review this comprehensive plan
2. Prioritize which phases to implement first
3. Break down into subtasks (61-A through 61-G)
4. Begin with Phase 1: Timeline View
