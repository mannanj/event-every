### Task 73: Travel & Appointment Alerts
- [ ] Add pre-event buffer time field to event model
- [ ] Implement VALARM (iCal alert) support in exporter
- [ ] Create alert configuration UI in EventEditor
- [ ] Add smart defaults for event types (flight, appointment, rental)
- [ ] Support multiple alerts per event
- [ ] Parse natural language for buffer times ("arrive 15 mins early")
- [ ] Export alerts to .ics files with proper formatting
- [ ] Test alerts in Apple Calendar, Google Calendar, Outlook
- Location: `src/types/event.ts`, `src/services/exporter.ts`, `src/components/EventEditor.tsx`

**Goal:** Support iOS Calendar-style alerts and pre-event arrival times

**iOS Calendar VALARM Support:**
```
BEGIN:VALARM
TRIGGER:-PT15M
DESCRIPTION:Arrive 15 minutes early
ACTION:DISPLAY
END:VALARM
```

**Phase 1: Update Data Model**
```typescript
interface CalendarEvent {
  // ... existing fields
  alerts?: EventAlert[];
  bufferTime?: BufferTime;
}

interface EventAlert {
  id: string;
  trigger: string;  // ISO 8601 duration: "-PT15M" = 15 mins before
  action: 'display' | 'email' | 'audio';
  description?: string;
  relatedTo?: 'start' | 'end';
}

interface BufferTime {
  minutes: number;
  reason?: string;  // "Arrive early for security", "Prep time"
  showInTitle?: boolean;  // "Flight (Arrive 4:14 PM)"
}
```

**Phase 2: Natural Language Parsing**
Extract buffer times from user input:
- "I need to arrive 15 minutes early" → `bufferTime: { minutes: 15 }`
- "Be there 30 mins before" → `bufferTime: { minutes: 30 }`
- "Get there an hour early for security" → `bufferTime: { minutes: 60, reason: "for security" }`

Update parser to detect these phrases and create alerts.

**Phase 3: Smart Defaults by Event Type**
```typescript
const DEFAULT_ALERTS: Record<string, EventAlert[]> = {
  flight: [
    { trigger: '-PT2H', description: 'Check in online', action: 'display' },
    { trigger: '-PT30M', description: 'Leave for airport', action: 'display' },
  ],
  appointment: [
    { trigger: '-PT15M', description: 'Time to leave', action: 'display' },
  ],
  'car-rental': [
    { trigger: '-PT10M', description: 'Prepare documents', action: 'display' },
  ],
  meeting: [
    { trigger: '-PT5M', description: 'Meeting starts soon', action: 'display' },
  ],
};

// Detect event type from title/description and apply defaults
function getDefaultAlerts(event: CalendarEvent): EventAlert[] {
  const type = detectEventType(event);
  return DEFAULT_ALERTS[type] || [];
}
```

**Phase 4: Alert Configuration UI**
```
┌─────────────────────────────────────────┐
│ Event: Delta Flight DL123              │
├─────────────────────────────────────────┤
│ Start: Nov 13, 2025 at 4:29 PM        │
│                                         │
│ 🔔 Alerts & Reminders                  │
├─────────────────────────────────────────┤
│ ✓ Arrive 15 minutes early (4:14 PM)   │
│   [Edit] [Remove]                       │
│                                         │
│ ✓ Check in online (2 hours before)    │
│   [Edit] [Remove]                       │
│                                         │
│ ✓ Leave for airport (30 mins before)  │
│   [Edit] [Remove]                       │
│                                         │
│ [+ Add Custom Alert]                   │
└─────────────────────────────────────────┘
```

**Add Custom Alert Modal:**
```
┌─────────────────────────────────────────┐
│ Add Alert                              │
├─────────────────────────────────────────┤
│ Notify me:                             │
│ [15 ▼] [minutes ▼] before start      │
│                                         │
│ Or use natural language:              │
│ ┌─────────────────────────────────┐   │
│ │ "2 hours before for check-in"   │   │
│ └─────────────────────────────────┘   │
│                                         │
│ Message (optional):                    │
│ ┌─────────────────────────────────┐   │
│ │ Time to check in online         │   │
│ └─────────────────────────────────┘   │
│                                         │
│ [Cancel] [Add Alert]                   │
└─────────────────────────────────────────┘
```

**Phase 5: ICS Export with VALARM**
```typescript
// exporter.ts
function generateICS(event: CalendarEvent): string {
  const icsEvent = {
    // ... existing fields
    alarms: event.alerts?.map(alert => ({
      action: alert.action,
      trigger: alert.trigger,
      description: alert.description || event.title,
    })),
  };

  return ics.createEvent(icsEvent);
}

// Manual VALARM if ics library doesn't support
function appendVALARM(icsString: string, alert: EventAlert): string {
  const valarm = [
    'BEGIN:VALARM',
    `TRIGGER:${alert.trigger}`,
    `ACTION:${alert.action.toUpperCase()}`,
    alert.description ? `DESCRIPTION:${alert.description}` : '',
    'END:VALARM',
  ].filter(Boolean).join('\r\n');

  // Insert before END:VEVENT
  return icsString.replace('END:VEVENT', `${valarm}\r\nEND:VEVENT`);
}
```

**Phase 6: Buffer Time Display**
When event has buffer time, show arrival time prominently:
```
Flight to Miami
Start: 4:29 PM
Arrive by: 4:14 PM (15 minutes early)
```

Or in title:
```
Flight to Miami (Arrive 4:14 PM)
```

**Example VALARM Formats:**

**15 minutes before:**
```
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Arrive 15 minutes early
END:VALARM
```

**2 hours before:**
```
BEGIN:VALARM
TRIGGER:-PT2H
ACTION:DISPLAY
DESCRIPTION:Check in online
END:VALARM
```

**At event time:**
```
BEGIN:VALARM
TRIGGER:PT0S
ACTION:DISPLAY
DESCRIPTION:Event starting now
END:VALARM
```

**ISO 8601 Duration Format:**
- `PT` = Period of Time
- `H` = Hours, `M` = Minutes, `S` = Seconds
- `-` = Before event (positive = after event)
- Examples:
  - `-PT15M` = 15 minutes before
  - `-PT1H30M` = 1.5 hours before
  - `-P1D` = 1 day before
  - `PT0S` = At event time

**Phase 7: Event Type Detection**
```typescript
function detectEventType(event: CalendarEvent): string {
  const text = `${event.title} ${event.description}`.toLowerCase();

  if (/flight|airline|airport|departure|arrival/.test(text)) {
    return 'flight';
  }
  if (/doctor|dentist|appointment|clinic|hospital/.test(text)) {
    return 'appointment';
  }
  if (/rental|turo|car\s*rental|vehicle/.test(text)) {
    return 'car-rental';
  }
  if (/meeting|call|zoom|conference/.test(text)) {
    return 'meeting';
  }

  return 'generic';
}
```

**Phase 8: Testing**
- [ ] Create flight event with "arrive 15 mins early"
- [ ] Verify VALARM added to ICS export
- [ ] Import to Apple Calendar (iOS/macOS)
- [ ] Verify alert fires 15 minutes before event
- [ ] Test multiple alerts (check-in, departure, arrival)
- [ ] Test with Google Calendar
- [ ] Test with Outlook
- [ ] Verify alert descriptions display correctly
- [ ] Test edge cases (negative durations, custom times)

**Travel Event Example:**

**Flight with Full Alerts:**
```typescript
{
  title: "Delta Flight DL123 to Miami",
  startDate: "2025-11-13T16:29:00",
  endDate: "2025-11-13T18:59:00",
  bufferTime: { minutes: 15, reason: "Security" },
  alerts: [
    { trigger: "-PT2H", description: "Check in online", action: "display" },
    { trigger: "-PT30M", description: "Leave for airport", action: "display" },
    { trigger: "-PT15M", description: "Arrive at airport for security", action: "display" },
  ],
}
```

**Exported ICS:**
```
BEGIN:VEVENT
UID:...
DTSTART:20251113T162900Z
DTEND:20251113T185900Z
SUMMARY:Delta Flight DL123 to Miami
DESCRIPTION:Arrive at airport by 4:14 PM for security
BEGIN:VALARM
TRIGGER:-PT2H
ACTION:DISPLAY
DESCRIPTION:Check in online
END:VALARM
BEGIN:VALARM
TRIGGER:-PT30M
ACTION:DISPLAY
DESCRIPTION:Leave for airport
END:VALARM
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Arrive at airport for security
END:VALARM
END:VEVENT
```

**Future Enhancements:**
- [ ] Location-based alerts (trigger when leaving home)
- [ ] Traffic-aware alerts (adjust based on current conditions)
- [ ] Smart suggestions: "Based on traffic, leave by 3:45 PM"
- [ ] Recurring alerts for repeated events
- [ ] Email alerts (requires backend)
- [ ] SMS alerts (requires Twilio integration)

**Dependencies:**
- None (standalone feature)
- Enhances Task 72 (iterative generation can parse buffer times)

**Priority:** Medium Impact, Medium Effort (6-8 hours)
