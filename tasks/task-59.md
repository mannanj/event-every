### Task 59: Reverse Scheduling - Work Backwards from Deadline

**Goal:** AI automatically calculates optimal timing by working backwards from target arrival/deadline

**Real-World Scenario:**
User creates event: "Order ride for bus station" at 3:30 PM
- Bus actually departs at 4:20 PM
- User manually calculated: 10 min drive + rideshare wait + 20 min buffer = order at 3:30 PM
- **AI should do this calculation automatically**

**How It Should Work:**

**Step 1: AI Detects "Preparation" Event**
Trigger words: "order ride", "leave for", "depart for", "head to", "get ready for"

When user creates: "Order ride for bus station"
AI asks: "What time do you need to arrive at the bus station?"

**Step 2: User Provides Deadline**
User: "My bus leaves at 4:20 PM"
OR
AI finds related event in calendar: "Bus to DFW - 4:20 PM"

**Step 3: AI Calculates Backwards**
```
Target: Bus departure at 4:20 PM
↓
Recommended arrival: 4:00 PM (20 min buffer for bus boarding)
↓
Travel time from current location: 10 minutes (Google Maps API)
↓
Rideshare wait time: 5-10 minutes (typical for Austin at 3:30 PM)
↓
Optimal order time: 3:30 PM ✓
```

**Step 4: AI Provides Recommendation**
```
💡 Smart Scheduling

Your bus departs at 4:20 PM. Here's the breakdown:

Bus Station: [Address from calendar]
From: [Current location or Airbnb]
Travel: 10 minutes
Rideshare wait: ~7 minutes (typical for Tuesday 3:30 PM)
Recommended arrival: 4:00 PM (20 min before departure)

Suggested order time: 3:30 PM ✓

[Apply] [Adjust Buffer] [Change Arrival Time]
```

**Step 5: Create Linked Events**
AI offers to create full sequence:
```
3:25 PM - Reminder: "Order rideshare in 5 minutes"
3:30 PM - "Order Rideshare to Bus Station" ← You are here
3:37 PM - "Rideshare Arrives" (estimated)
3:47 PM - "Arrive at Bus Station"
4:00 PM - "Check in at Bus Terminal"
4:20 PM - "Bus Departure to DFW"
```

**Phase 1: Intent Detection**
- [ ] Detect "preparation" keywords in event titles:
  - "order ride", "call uber", "book lyft"
  - "leave for", "depart for", "head to"
  - "get ready for", "prepare for"
  - "pack for", "check in for"
- [ ] Analyze description for destination mentions
- [ ] Search calendar for related target events

**Phase 2: Clarifying Questions**
When preparation event detected, AI asks:
- [ ] "What time do you need to arrive?"
- [ ] "Where are you traveling from?"
- [ ] "What's your destination?"
- [ ] "Do you want me to find the related event?"

**Phase 3: Backward Calculation Engine**
- [ ] Create `calculateBackwards()` function:
  ```typescript
  interface BackwardCalculation {
    targetEvent: CalendarEvent;  // "Bus Departure - 4:20 PM"
    targetArrivalTime: Date;  // 4:00 PM (with buffer)
    travelTime: number;  // 10 minutes
    waitTime: number;  // 7 minutes (rideshare)
    bufferTime: number;  // 20 minutes (user preference)
    preparationTime: number;  // 5 minutes (get ready)
    optimalStartTime: Date;  // 3:30 PM ← Calculated
    breakdown: TimeComponent[];
  }

  interface TimeComponent {
    label: string;  // "Travel to bus station"
    duration: number;  // 10 minutes
    startTime: Date;
    endTime: Date;
  }
  ```

**Phase 4: Context-Aware Buffers**
AI adjusts buffers based on event type:
- [ ] **Bus/Train:** 20-30 min buffer (can't miss departure)
- [ ] **Flight:** 2 hours (TSA, security)
- [ ] **Meeting:** 5-10 min buffer (can be slightly late)
- [ ] **Restaurant:** 0-5 min (flexible arrival)
- [ ] **Concert/Event:** 30-60 min (long entry lines)

**Phase 5: Travel Method Intelligence**
- [ ] Detect travel method from event title:
  - "Order ride" / "Uber" / "Lyft" → Rideshare (add 5-10 min wait)
  - "Leave for" → Driving (no wait time)
  - "Walk to" → Walking (add 5 min for getting ready)
  - "Take metro" → Transit (check schedule, add 10 min wait)
- [ ] Fetch real-time data:
  - Rideshare: Uber/Lyft API for current wait times
  - Transit: Real-time bus/train schedules
  - Driving: Current traffic conditions

**Phase 6: Real-Time Traffic Integration**
- [ ] Google Maps API: Get travel time for specific date/time
- [ ] Account for:
  - Rush hour (3-6 PM = add 30%)
  - Day of week (weekdays vs weekends)
  - Special events (concerts, sports games = add buffer)
  - Weather conditions (rain = add 20%)

**Phase 7: Smart Reminders**
Auto-create reminder sequence:
- [ ] T-30 min: "Your rideshare window opens in 30 minutes"
- [ ] T-5 min: "Time to order your ride to [destination]"
- [ ] T-0: "Order rideshare now" (with deep link to Uber/Lyft)
- [ ] T+7 min: "Rideshare should arrive soon"

**Phase 8: Multi-Leg Journeys**
Handle complex trips:
```
Example: "Dinner before concert"
8:00 PM - Concert starts

AI calculates:
6:00 PM - Dinner reservation (2 hrs before)
7:45 PM - Leave restaurant (calculated)
8:00 PM - Arrive at venue (15 min drive)
8:10 PM - Concert starts (10 min buffer)

Asks: "Want me to create all 4 events?"
```

**Phase 9: Learning User Preferences**
- [ ] Track actual vs estimated times
- [ ] Learn user's typical buffers:
  - Some users always arrive 30 min early
  - Others cut it close (5 min buffer)
- [ ] Adjust recommendations based on history
- [ ] Ask: "You usually arrive 15 min early. Apply same buffer?"

**UI/UX Implementation:**

**In EventEditor:**
```
┌─────────────────────────────────────────┐
│ 🤖 AI Scheduling Assistant              │
├─────────────────────────────────────────┤
│ I noticed you're ordering a ride.       │
│ What time do you need to arrive?        │
│                                         │
│ [4:20 PM] or [Search my events] 🔍     │
└─────────────────────────────────────────┘
```

**After AI Calculation:**
```
┌─────────────────────────────────────────┐
│ 💡 Optimal Timing                       │
├─────────────────────────────────────────┤
│ Bus Departure: 4:20 PM                  │
│ Recommended arrival: 4:00 PM            │
│                                         │
│ 🚗 From your location:                  │
│ Travel time: 10 min                     │
│ Rideshare wait: ~7 min                  │
│ Getting ready: 5 min                    │
│                                         │
│ 🎯 Order rideshare at: 3:30 PM         │
│                                         │
│ [Apply ✓] [Adjust Times] [Add Reminders]│
└─────────────────────────────────────────┘
```

**Common Use Cases:**

1. **Airport Trips:**
   - "Leave for airport"
   - AI: Flight time? → Calculate: 2hr early + 20min drive + 15min parking = leave 2:35 before flight

2. **Meeting Prep:**
   - "Prep for client presentation"
   - AI: Meeting time? → Calculate: Print docs (10m) + commute (25m) + setup (15m) = start 50min early

3. **Morning Routine:**
   - "Wake up for work"
   - AI: Work starts? → Calculate: Commute (30m) + breakfast (20m) + shower (15m) = wake 65min before

4. **Event Arrivals:**
   - "Get to concert"
   - AI: Show time? → Calculate: Parking (20m) + walk (10m) + entry line (30m) = arrive 60min early

**API Design:**

```typescript
POST /api/reverse-schedule

Request:
{
  preparationEvent: CalendarEvent;
  targetTime?: Date;
  targetEventId?: string;  // Link to existing calendar event
  travelMode?: 'rideshare' | 'drive' | 'transit' | 'walk';
}

Response:
{
  calculation: BackwardCalculation;
  recommendation: {
    optimalStartTime: Date;
    breakdown: TimeComponent[];
    reasoning: string;
  };
  suggestedEvents?: CalendarEvent[];  // Full sequence
  reminders?: Reminder[];
}
```

**Testing Scenarios:**
- [ ] Bus trip (your example: order at 3:30, bus at 4:20)
- [ ] Airport departure (2hr early + drive time)
- [ ] Morning work commute (wake up time)
- [ ] Restaurant before movie (calculate both)
- [ ] Multi-city trip (flight connections)

**Edge Cases:**
- [ ] User creates prep event AFTER target time (warn)
- [ ] Not enough time for preparation (highlight in red)
- [ ] Multiple possible target events (let user choose)
- [ ] No location data (ask for clarification)
- [ ] Same-location events (no travel time)

**Privacy:**
- [ ] Location data never stored, only used for calculation
- [ ] Travel APIs called only when user requests
- [ ] Option to disable reverse scheduling feature
- [ ] Clear disclosure when accessing external APIs

**Location:**
- `src/app/api/reverse-schedule/route.ts` (new)
- `src/services/reverseScheduler.ts` (new - backward calculation)
- `src/services/travelCalculator.ts` (reuse from Task 58)
- `src/components/ReverseSchedulingAssistant.tsx` (new - UI)
- `src/components/EventEditor.tsx` (integrate assistant)
- `src/hooks/useReverseScheduling.ts` (new)

**Priority:** High Impact, Medium Effort (10-15 hours)
**Dependencies:** Overlaps with Task 58 (can share travel calculation logic)

**Estimated Cost per Calculation:**
- Google Maps API: $0.005 (travel time)
- Anthropic API: $0.005 (context analysis)
- Total: ~$0.01 per reverse schedule calculation
