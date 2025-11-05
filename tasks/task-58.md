### Task 58: AI Event Assistant - Contextual Intelligence & Recommendations

**Goal:** Conversational AI agent that analyzes event context, user history, and external data to provide smart recommendations and answer questions

**Vision:**
User is editing car rental pickup event → AI agent:
- Finds related Airbnb check-in event from history
- Calculates travel time between addresses (4404 East Oltorf St → 1703 Deerfield Drive)
- Checks traffic patterns for November 5, 2025 at 10 AM
- Recommends: "Your Airbnb check-in is at 3 PM on Nov 4. Given 15-minute drive + traffic, suggest changing pickup to 10:30 AM and leaving Airbnb at 10:00 AM"
- Can answer questions like: "How long will it take to get there?" or "Should I leave earlier?"

**Phase 1: Event Context Awareness**
- [ ] Create AI context builder that analyzes:
  - Current event being edited
  - All events in user's history
  - Related events (same location, overlapping times, related keywords)
  - User's typical patterns (timezone, location preferences)
- [ ] Build context payload for LLM:
  ```typescript
  interface EventContext {
    currentEvent: CalendarEvent;
    relatedEvents: CalendarEvent[];  // Nearby times, locations, keywords
    allEvents: CalendarEvent[];  // Full history for pattern analysis
    userPreferences?: {
      timezone: string;
      defaultBufferTime: number;  // minutes
      travelMode: 'driving' | 'transit' | 'walking';
    };
  }
  ```

**Phase 2: External Data Integration**
- [ ] **Travel Time Calculation:**
  - Integrate Google Maps Distance Matrix API or similar
  - Calculate travel time between locations
  - Account for traffic patterns at specific date/time
  - Support multiple travel modes (driving, transit, walking)
- [ ] **Traffic Data:**
  - Fetch typical traffic for day/time
  - Adjust recommendations based on rush hour
  - Account for time zone differences
- [ ] **Location Intelligence:**
  - Extract addresses from event descriptions
  - Geocode addresses to lat/lng
  - Calculate distances between events
- [ ] **User Database Integration (Future):**
  - Connect to user's external calendars (Google, Apple, Outlook)
  - Search user's notes, documents for context
  - Integration with travel booking APIs (Airbnb, flights, etc.)

**Phase 3: AI Agent API Endpoint**
- [ ] Create `/api/event-assistant` route:
  ```typescript
  POST /api/event-assistant
  {
    eventId: string;
    question?: string;  // User's question
    action?: 'analyze' | 'recommend' | 'update';
    context: EventContext;
  }

  Response:
  {
    recommendations: Recommendation[];
    answer?: string;  // Response to user question
    suggestedUpdates?: Partial<CalendarEvent>;
    reasoning: string;
  }
  ```
- [ ] LLM prompt engineering:
  - Provide full event context
  - Include related events
  - Ask for recommendations with reasoning
  - Request specific action suggestions
- [ ] Stream responses for real-time feel

**Phase 4: Recommendation Types**
- [ ] **Timing Recommendations:**
  - "Adjust start time to allow travel from previous event"
  - "Add buffer time for traffic"
  - "Shift event to avoid conflict with overlapping appointment"
- [ ] **Travel Recommendations:**
  - "Leave Airbnb at 10:00 AM to arrive on time"
  - "Allow 30 extra minutes for rush hour traffic"
  - "Consider taking transit (15 min faster)"
- [ ] **Location Recommendations:**
  - "Update location to full address for GPS navigation"
  - "This address is 5 miles from your Airbnb"
  - "Similar event last month was at different location"
- [ ] **Conflict Detection:**
  - "This overlaps with 'Dentist Appointment' at 2 PM"
  - "You have 3 events this day, suggest spacing them out"
- [ ] **Missing Information:**
  - "Add end time to calculate travel to next event"
  - "Consider adding phone number for car rental company"

**Phase 5: Chat Interface in EventEditor**
- [ ] Add AI Assistant panel in EventEditor component
- [ ] Chat interface with message history:
  ```
  User: "How long to get from my Airbnb to the car rental?"
  AI: "It's a 15-minute drive (6.2 miles) from your Airbnb at 1703
      Deerfield Drive to the rental location at 4404 East Oltorf St.
      On Nov 5 at 10 AM, expect light traffic. Recommend leaving at 9:40 AM."

  User: "Should I change the pickup time?"
  AI: "Yes, I recommend:
      - Keep pickup at 10:00 AM (rental company opens then)
      - Leave Airbnb at 9:40 AM (15 min drive + 5 min buffer)
      - Add 'Departure Time: 9:40 AM' to description?"

  [Apply Suggestions] [Dismiss]
  ```
- [ ] Quick action buttons for common questions:
  - "Check for conflicts"
  - "Calculate travel time"
  - "Find related events"
  - "Optimize my schedule"
- [ ] Display recommendations as actionable cards:
  ```
  🕐 Timing Recommendation
  Leave Airbnb at 9:40 AM to arrive by 10:00 AM
  (15 min drive + 5 min buffer)
  [Apply] [Dismiss]
  ```

**Phase 6: Proactive Analysis (Auto-run)**
- [ ] Automatically analyze event when EventEditor opens
- [ ] Show notification badge if recommendations available
- [ ] Silent background analysis (don't block UI)
- [ ] Display banner: "💡 AI found 3 suggestions for this event"

**Phase 7: Action Execution**
- [ ] AI can suggest specific field updates:
  - Change start time
  - Update description with travel notes
  - Add location details
  - Set reminders
- [ ] User approves changes before applying
- [ ] Show diff view of proposed changes
- [ ] One-click "Apply All Suggestions"

**Phase 8: Multi-Event Optimization**
- [ ] Analyze entire day's schedule
- [ ] Suggest reordering events for efficiency
- [ ] Identify bottlenecks (not enough travel time)
- [ ] Recommend consolidating nearby events
- [ ] Example:
  ```
  🗓️ Schedule Optimization
  You have 4 events on Nov 5:
  - 9 AM: Breakfast (Downtown)
  - 11 AM: Meeting (North Austin) ← 35 min drive
  - 2 PM: Lunch (Downtown) ← 30 min back
  - 4 PM: Car Rental (East Austin)

  Suggestion: Move breakfast to 9:30 AM to allow travel buffer
  [Apply] [View Details]
  ```

**Phase 9: Learning & Personalization**
- [ ] Track which recommendations user accepts/rejects
- [ ] Learn user preferences:
  - Prefers 10-15 min buffer times
  - Usually drives (not transit)
  - Tends to schedule back-to-back events
- [ ] Improve recommendations over time
- [ ] Store user feedback for prompt refinement

**Examples:**

**Scenario 1: Travel Time Assistance**
```
Event: "Car Rental Pickup"
Location: "4404 East Oltorf Street, Austin, TX"
Description: "I'll be coming from my Airbnb at 1703 Deerfield Drive"

AI Analysis:
✓ Found related event: "Austin Airbnb Stay" (Nov 4-6)
✓ Calculated travel time: 15 minutes (6.2 miles)
✓ Checked traffic: Light traffic at 10 AM on Tuesday
✓ Recommendation: Leave Airbnb at 9:40 AM

💡 Suggestions:
1. Add departure time to description: "Leave Airbnb at 9:40 AM"
2. Set reminder: "30 minutes before" (9:30 AM)
3. Update end time to 10:15 AM (typical rental pickup duration)
```

**Scenario 2: Schedule Conflict Detection**
```
User adding new event: "Coffee with Sarah" at 2 PM

AI: "⚠️ Conflict detected: 'Dentist Appointment' is scheduled at
     2:30 PM, 8 miles away (25 min drive). Suggest moving coffee
     to 1 PM or dentist to 3 PM?"
```

**Scenario 3: Conversational Q&A**
```
User: "What's the best time to leave for the airport?"
AI: "Your flight departs at 6:30 PM from Austin-Bergstrom (AUS).
     TSA recommends arriving 2 hours early (4:30 PM).

     From your location (1703 Deerfield Drive):
     - 20-minute drive (11 miles)
     - Allow 15 min for parking/shuttle

     Recommended departure: 3:55 PM
     Would you like me to create a 'Leave for Airport' reminder?"
```

**Technical Implementation:**

```typescript
// AI Agent Service
interface EventAssistant {
  analyze(event: CalendarEvent, allEvents: CalendarEvent[]): Promise<AnalysisResult>;
  chat(question: string, context: EventContext): Promise<string>;
  recommend(event: CalendarEvent, type: RecommendationType): Promise<Recommendation[]>;
  calculateTravel(from: string, to: string, when: Date): Promise<TravelTime>;
}

interface Recommendation {
  id: string;
  type: 'timing' | 'travel' | 'conflict' | 'location' | 'missing-info';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  reasoning: string;
  suggestedChange?: Partial<CalendarEvent>;
  actions: Action[];
}

interface Action {
  label: string;
  type: 'update-field' | 'create-event' | 'delete-event' | 'set-reminder';
  data: unknown;
}
```

**API Integrations Needed:**
- [ ] Google Maps Distance Matrix API (travel time)
- [ ] Google Maps Geocoding API (address → lat/lng)
- [ ] OpenWeather API (weather considerations)
- [ ] TimeZone DB API (timezone handling)
- [ ] Optional: User's Google Calendar API (full context)
- [ ] Optional: Flight tracking APIs (for travel events)

**Testing:**
- [ ] Test with example: Car rental + Airbnb scenario
- [ ] Test conflict detection with overlapping events
- [ ] Test travel time calculation with real addresses
- [ ] Test conversation with various questions
- [ ] Test multi-event day optimization
- [ ] Test with edge cases (same location, all-day events, etc.)

**UI/UX:**
- [ ] Collapsible AI Assistant panel in EventEditor
- [ ] Toggle: "Enable AI Suggestions" (user control)
- [ ] Loading states for analysis
- [ ] Dismissible recommendation cards
- [ ] Conversation history persistence
- [ ] Mobile-friendly chat interface

**Privacy & Security:**
- [ ] All AI processing optional (user must enable)
- [ ] Clear disclosure when accessing event history
- [ ] Option to exclude sensitive events from AI analysis
- [ ] No external data shared without user consent
- [ ] Local processing where possible

**Future Enhancements:**
- [ ] Voice interface ("Hey Event Every, how long to get there?")
- [ ] Integration with smart home (adjust thermostat before leaving)
- [ ] Calendar sync with teammates (avoid scheduling over others)
- [ ] Predictive event creation (AI suggests events based on patterns)
- [ ] Email integration (auto-create events from confirmation emails)

**Location:**
- `src/app/api/event-assistant/route.ts` (new - AI agent endpoint)
- `src/services/eventAssistant.ts` (new - AI logic)
- `src/services/travelCalculator.ts` (new - Google Maps integration)
- `src/components/EventEditor.tsx` (add AI chat panel)
- `src/components/AIRecommendationCard.tsx` (new)
- `src/components/EventAssistantChat.tsx` (new)
- `src/hooks/useEventAssistant.ts` (new)
- `src/types/assistant.ts` (new - interfaces)

**Priority:** High Impact, High Effort (20-30 hours)
**Dependencies:** None (standalone feature)

**Estimated Cost:**
- Google Maps API: ~$0.005 per request (travel time)
- Anthropic API: ~$0.01-0.05 per conversation
- Total: ~$0.10-0.50 per event with full AI assistance
