### Task 60: Event Stakeholder Communication - AI-Powered Messaging

**Goal:** Chat with event participants/hosts and automate communications (delays, questions, updates)

**Vision:**
You're running late → Tell AI: "Let my Turo host know I'm running 15 minutes late"
AI drafts message → You approve → AI sends via SMS/email/app
Or: "Ask the restaurant if they can add one more person to my reservation"

**Real-World Scenarios:**

1. **Running Late Notifications:**
   ```
   You: "I'm stuck in traffic, tell Gary I'll be 20 minutes late"
   AI: "I'll message your Turo host Gary A.:

        Hi Gary, I'm running about 20 minutes late due to traffic.
        My new ETA is 4:20 PM instead of 4:00 PM. Apologies for
        the delay. See you soon!"

   [Send via SMS] [Send via Email] [Edit Message]
   ```

2. **Ask Questions:**
   ```
   You: "Ask the restaurant if they have outdoor seating available"
   AI: "I'll contact Uchi Restaurant:

        Hi, I have a reservation for 2 at 7 PM tonight. Do you
        have outdoor seating available? Would prefer patio if
        possible. Thanks!"

   [Send] [Track Response]
   ```

3. **Automatic Updates:**
   ```
   AI detects you're running late (GPS tracking + schedule analysis)

   AI: "🚨 You're 10 minutes behind schedule for your car rental
        pickup. Should I notify Gary at Turo?

        Suggested message:
        'Hi Gary, running about 10 minutes late. New ETA: 4:10 PM.'

        [Send Now] [Dismiss] [Edit]"
   ```

**Phase 1: Contact Information Extraction**
- [ ] Parse event descriptions for contact info:
  - Phone numbers: (512) 555-1234
  - Email addresses: gary@example.com
  - Contact names: "hosted by Gary A."
  - Business names: "Turo", "Uchi Restaurant"
- [ ] Store contacts in event:
  ```typescript
  interface EventContact {
    id: string;
    name: string;
    role: 'host' | 'attendee' | 'organizer' | 'venue' | 'service-provider';
    phone?: string;
    email?: string;
    platform?: 'turo' | 'airbnb' | 'eventbrite' | 'restaurant';
    platformId?: string;  // For API integration
  }

  interface CalendarEvent {
    // ... existing fields
    contacts?: EventContact[];
  }
  ```

**Phase 2: Message Drafting AI**
- [ ] Create `/api/draft-message` endpoint
- [ ] Input: User's intent + event context
- [ ] LLM generates appropriate message:
  - Professional tone for business
  - Casual tone for personal
  - Apologetic for delays
  - Polite for requests
- [ ] Include relevant context from event automatically
- [ ] Smart variables: ETA, location, date, time

**Phase 3: Multi-Channel Sending**
- [ ] **SMS via Twilio:**
  - Send text messages to phone numbers
  - Receive responses
  - Two-way conversation thread
- [ ] **Email:**
  - Send via SendGrid or similar
  - Track opens/replies
  - Thread management
- [ ] **Platform Integration (Future):**
  - Turo API: Message through Turo app
  - Airbnb API: Message through Airbnb
  - OpenTable API: Restaurant communications
  - Eventbrite API: Contact organizers

**Phase 4: Communication UI in EventEditor**
```
┌─────────────────────────────────────────┐
│ 📞 Event Contacts                       │
├─────────────────────────────────────────┤
│ Gary A. (Turo Host)                     │
│ 📱 (512) 555-1234                       │
│ ✉️  gary@turo.com                       │
│ [Message] [Call]                        │
│                                         │
│ Recent Messages:                        │
│ 12:15 PM You: "Booking confirmed"      │
│ 12:20 PM Gary: "Great, see you at 4!"  │
│                                         │
│ [New Message]                           │
└─────────────────────────────────────────┘
```

**Phase 5: Quick Actions**
Pre-built message templates:
- [ ] "I'm running late" → AI calculates new ETA, drafts apology
- [ ] "Ask a question" → AI drafts polite inquiry
- [ ] "Confirm arrival" → AI confirms you're on the way
- [ ] "Request change" → AI drafts modification request
- [ ] "Cancel event" → AI drafts cancellation with apology

**Phase 6: Automatic Delay Detection**
- [ ] Monitor user's location (with permission)
- [ ] Compare to scheduled event times
- [ ] If running late (>10 min), proactively offer to notify:
  ```
  🚨 You're running 15 minutes late for:
  "Car Rental Pickup with Gary A."

  Suggested message:
  "Hi Gary, stuck in traffic. Running about 15 minutes late.
   New ETA: 4:15 PM. Sorry for the delay!"

  [Send Now] [Snooze 5 min] [Dismiss]
  ```

**Phase 7: Response Tracking**
- [ ] Track sent messages
- [ ] Receive and display replies
- [ ] Update event based on responses:
  - Host says "No problem, see you then" → No action
  - Restaurant says "Sorry, no outdoor seating" → Add to notes
  - Meeting moved → AI offers to update event time
- [ ] Notification when new reply received

**Phase 8: Conversation History**
- [ ] Store all messages related to event
- [ ] Display threaded conversation view
- [ ] Export conversation as attachment (ties to Task 56)
- [ ] Search across all event communications

**Phase 9: Platform-Specific Intelligence**

**Turo:**
- [ ] Detect Turo rental from description
- [ ] Extract host name and contact info
- [ ] Common messages: "Running late", "Pickup location?", "Extend rental?"
- [ ] Parse Turo confirmation emails for details

**Airbnb:**
- [ ] Detect Airbnb booking
- [ ] Extract host contact
- [ ] Common: "Check-in time?", "Late arrival", "Early checkout?"
- [ ] Integration with Airbnb messaging API

**Restaurants:**
- [ ] Detect restaurant reservations
- [ ] Extract phone number from OpenTable/Resy
- [ ] Common: "Add guest", "Dietary restrictions", "Running late"

**Meetings:**
- [ ] Extract attendee emails
- [ ] Integration with Google Calendar attendees
- [ ] "Running late" → Email all attendees
- [ ] "Cancel meeting" → Send cancellations

**UI Examples:**

**In EventEditor:**
```
┌─────────────────────────────────────────┐
│ Event: Car Rental Pickup               │
├─────────────────────────────────────────┤
│ Contact: Gary A. (Turo Host)           │
│                                         │
│ Quick Actions:                          │
│ [😬 I'm Running Late]                  │
│ [❓ Ask Question]                       │
│ [✅ Confirm Arrival]                    │
│ [📝 Custom Message]                     │
└─────────────────────────────────────────┘
```

**Running Late Flow:**
```
You click: "I'm Running Late"

┌─────────────────────────────────────────┐
│ 🕐 How late will you be?                │
├─────────────────────────────────────────┤
│ AI detected: 15 minutes based on GPS   │
│                                         │
│ [5 min] [10 min] [15 min ✓] [30 min]  │
│ [Custom: ____]                          │
│                                         │
│ Preview message:                        │
│ ┌─────────────────────────────────┐   │
│ │ Hi Gary,                         │   │
│ │                                  │   │
│ │ I'm running about 15 minutes    │   │
│ │ late due to traffic. My new ETA │   │
│ │ is 4:15 PM instead of 4:00 PM.  │   │
│ │                                  │   │
│ │ Apologies for the inconvenience.│   │
│ │ See you soon!                    │   │
│ └─────────────────────────────────┘   │
│                                         │
│ Send via: [📱 SMS] [✉️ Email] [Both]  │
│                                         │
│ [Edit Message] [Send] [Cancel]         │
└─────────────────────────────────────────┘
```

**Ask Question Flow:**
```
You: "Ask him if I can pick up the car 30 minutes earlier"

AI drafts:
┌─────────────────────────────────────────┐
│ Hi Gary,                                │
│                                         │
│ Quick question: Would it be possible   │
│ to pick up the car 30 minutes earlier  │
│ at 3:30 PM instead of 4:00 PM?         │
│                                         │
│ Let me know if that works. Thanks!     │
└─────────────────────────────────────────┘

[Send] [Edit] [Cancel]
```

**Automatic Detection Example:**
```
[12:30 PM] You're at home, event starts at 4:00 PM
[3:25 PM] AI: "Reminder: Order rideshare in 5 minutes"
[3:35 PM] AI: "You haven't ordered yet. Traffic is heavy. Running late?"
[3:40 PM] AI: "🚨 If you leave now, you'll arrive at 4:15 PM (15 min late)"

             Should I notify Gary?
             [Yes, Send Message] [I'll Handle It] [Already Notified]
```

**API Design:**

```typescript
POST /api/draft-message

Request:
{
  eventId: string;
  contactId: string;
  intent: 'running-late' | 'ask-question' | 'confirm' | 'cancel' | 'custom';
  context?: {
    delayMinutes?: number;
    newETA?: Date;
    question?: string;
    customMessage?: string;
  };
}

Response:
{
  message: {
    subject?: string;  // For email
    body: string;
    tone: 'professional' | 'casual' | 'apologetic';
    channelRecommendation: 'sms' | 'email' | 'both';
  };
  estimatedResponseTime?: string;  // "Usually replies within 1 hour"
}
```

```typescript
POST /api/send-message

Request:
{
  eventId: string;
  contactId: string;
  message: string;
  channel: 'sms' | 'email' | 'platform';
}

Response:
{
  success: boolean;
  messageId: string;
  sentAt: Date;
  deliveryStatus: 'sent' | 'delivered' | 'failed';
}
```

**Data Model:**

```typescript
interface EventMessage {
  id: string;
  eventId: string;
  contactId: string;
  direction: 'sent' | 'received';
  content: string;
  channel: 'sms' | 'email' | 'platform';
  timestamp: Date;
  status: 'draft' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed';
  metadata?: {
    twilioMessageId?: string;
    emailMessageId?: string;
    deliveredAt?: Date;
    readAt?: Date;
  };
}

interface MessageThread {
  eventId: string;
  contactId: string;
  messages: EventMessage[];
  lastMessageAt: Date;
  unreadCount: number;
}
```

**Privacy & Security:**
- [ ] **Explicit consent:** User must approve before any message sent
- [ ] **Phone number validation:** Verify before sending SMS
- [ ] **Rate limiting:** Max 10 messages per event
- [ ] **Opt-out links:** Include in automated messages
- [ ] **Data retention:** Auto-delete messages after event date + 30 days
- [ ] **Encryption:** All messages encrypted at rest
- [ ] **No spam:** Never send marketing, only event-related

**Cost Considerations:**
- **Twilio SMS:** $0.0079 per message (US)
- **SendGrid Email:** $0.0006 per email
- **Anthropic API:** $0.005 per message draft
- **Total per message:** ~$0.01-0.02

**Testing:**
- [ ] Draft "running late" message
- [ ] Send SMS to test number
- [ ] Receive and display reply
- [ ] Test automatic delay detection
- [ ] Test with multiple contacts per event
- [ ] Test conversation threading
- [ ] Test different platforms (Turo, Airbnb, etc.)

**Future Enhancements:**
- [ ] Voice calls through app
- [ ] Group messages (notify all attendees)
- [ ] Auto-reply based on common questions
- [ ] Integration with contact management systems
- [ ] Multi-language support
- [ ] Smart scheduling: "Best time to contact this person?"

**Location:**
- `src/app/api/draft-message/route.ts` (new)
- `src/app/api/send-message/route.ts` (new)
- `src/services/messagingService.ts` (new - Twilio/SendGrid integration)
- `src/services/contactExtractor.ts` (new - parse contact info)
- `src/components/EventContacts.tsx` (new - contact management UI)
- `src/components/MessageComposer.tsx` (new - draft messages)
- `src/components/MessageThread.tsx` (new - conversation view)
- `src/hooks/useMessaging.ts` (new)
- `src/types/messaging.ts` (new - interfaces)

**Priority:** Medium Impact, High Effort (15-20 hours)
**Dependencies:** None (standalone feature)

**Legal Considerations:**
- [ ] TCPA compliance (US telemarketing laws)
- [ ] CAN-SPAM Act compliance (email)
- [ ] GDPR compliance (EU data protection)
- [ ] User consent for automated messaging
- [ ] Terms of service for communication features
