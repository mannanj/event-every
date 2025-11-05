### Task 74: Party Planning Mode (Collaborative Event Planning)
- [ ] Create "Planning Mode" toggle for events
- [ ] Implement shareable planning links with access controls
- [ ] Build multi-user collaboration infrastructure
- [ ] Add comment/discussion threads on event proposals
- [ ] Create proposal system (time, location, activities, etc.)
- [ ] Implement voting mechanism with vote tallies
- [ ] Build AI recommendation engine based on conversation and votes
- [ ] Add payment collection and expense splitting
- [ ] Create "Finalize Event" flow to convert planning → scheduled event
- [ ] Add real-time updates for collaborators
- Location: `src/app/planning/[id]/page.tsx`, `src/components/PlanningMode/`, `src/services/collaboration.ts`

**Goal:** Transform event creation into collaborative group planning with AI-powered recommendations

**Vision:**
Instead of creating a finalized event, users can create a "planning event" where:
- Multiple people collaborate on details
- Everyone can suggest and vote on options
- AI analyzes preferences and makes smart suggestions
- Expenses are tracked and split
- Once decided, convert to final calendar event for all participants

**Use Cases:**

1. **Birthday Party:**
   - Create planning event: "Sarah's 30th Birthday"
   - Invite 20 friends
   - Vote on date/time options
   - Suggest and vote on venues (restaurants, bars, venues)
   - Discuss activities and themes in comments
   - AI suggests venues based on group preferences
   - Collect money for venue deposit
   - Finalize → Everyone gets calendar event

2. **Group Trip:**
   - Planning event: "Weekend in Austin"
   - Collaborators add Airbnb options
   - Vote on dates that work for everyone
   - Discuss and vote on activities
   - AI recommends restaurants based on dietary preferences mentioned
   - Split Airbnb cost
   - Track who paid for what

3. **Team Dinner:**
   - Planning event: "Q4 Team Celebration"
   - Vote on restaurant options
   - AI suggests times based on team calendars
   - Comments: dietary restrictions, preferences
   - Split bill evenly
   - Finalize and send invite to all

---

## Phase 1: Planning Mode Foundation

**Planning Event Model:**
```typescript
interface PlanningEvent {
  id: string;
  title: string;
  status: 'planning' | 'voting' | 'finalized' | 'cancelled';

  // Collaboration
  creator: User;
  collaborators: Collaborator[];
  shareLink: string;
  permissions: PlanningPermissions;

  // Planning data
  proposals: Proposal[];
  comments: Comment[];
  votes: Vote[];

  // AI insights
  aiRecommendations?: AIRecommendation[];

  // Financial
  expenses: Expense[];
  payments: Payment[];

  // Final event (once decided)
  finalizedEvent?: CalendarEvent;

  created: Date;
  lastActivity: Date;
}

interface Collaborator {
  id: string;
  name: string;
  email: string;
  role: 'organizer' | 'contributor' | 'viewer';
  joinedAt: Date;
  avatar?: string;
}

interface PlanningPermissions {
  anyoneCanPropose: boolean;
  anyoneCanVote: boolean;
  anyoneCanComment: boolean;
  requireApprovalForChanges: boolean;
}
```

**UI Toggle:**
```
┌─────────────────────────────────────────┐
│ Create Event                           │
├─────────────────────────────────────────┤
│ Mode:                                  │
│ ( ) Solo Event (just for me)          │
│ (•) Planning Mode (collaborate)       │
│                                         │
│ [Continue]                             │
└─────────────────────────────────────────┘
```

---

## Phase 2: Shareable Planning Links

**Share Modal:**
```
┌─────────────────────────────────────────┐
│ Share Planning Event                   │
├─────────────────────────────────────────┤
│ Link: event-every.app/plan/abc123     │
│ [Copy Link]                            │
│                                         │
│ Invite by Email:                       │
│ ┌─────────────────────────────────┐   │
│ │ sarah@example.com               │   │
│ │ john@example.com                │   │
│ └─────────────────────────────────┘   │
│ [Send Invites]                         │
│                                         │
│ Permissions:                           │
│ ✓ Anyone can suggest options           │
│ ✓ Anyone can vote                      │
│ ✓ Anyone can comment                   │
│ [ ] Require approval for proposals     │
│                                         │
│ [Save Settings]                        │
└─────────────────────────────────────────┘
```

**Access Control:**
```typescript
// Public link with name entry
/plan/abc123 → Anyone with link can view/contribute

// Invite-only with email verification
/plan/abc123?invite=xyz → Must verify email to access

// Role-based permissions
- Organizer: Full control, can finalize
- Contributor: Propose, vote, comment
- Viewer: View only, no actions
```

---

## Phase 3: Proposals System

**Proposal Types:**
```typescript
interface Proposal {
  id: string;
  planningEventId: string;
  type: 'time' | 'location' | 'activity' | 'budget' | 'custom';
  author: Collaborator;

  // Proposal content
  title: string;
  description?: string;
  options?: ProposalOption[];  // For voting (multiple choice)

  // Voting
  votes: Vote[];
  voteTally: VoteTally;

  // Discussion
  comments: Comment[];

  // Status
  status: 'open' | 'accepted' | 'rejected' | 'expired';

  created: Date;
  deadline?: Date;
}

interface ProposalOption {
  id: string;
  label: string;
  details?: string;
  votes: number;
  voters: string[];  // User IDs
}

interface Vote {
  id: string;
  proposalId: string;
  optionId: string;
  voter: Collaborator;
  timestamp: Date;
}

interface VoteTally {
  totalVotes: number;
  leaderOption?: string;
  consensusReached?: boolean;  // e.g., 70% agree
}
```

**Time Proposal (Doodle-style):**
```
┌─────────────────────────────────────────┐
│ Proposal: When should we meet?         │
│ by @sarah_organizer                    │
├─────────────────────────────────────────┤
│ Vote for times that work for you:     │
│                                         │
│ [ ] Friday, Nov 8 at 7:00 PM (3 votes)│
│     ✓ Sarah, John, Mike                │
│                                         │
│ [✓] Saturday, Nov 9 at 6:00 PM (5 votes)│
│     ✓ Sarah, John, Mike, Amy, David    │
│                                         │
│ [ ] Sunday, Nov 10 at 5:00 PM (2 votes)│
│     ✓ Sarah, Amy                       │
│                                         │
│ [Save My Votes]                        │
│                                         │
│ 💬 5 comments                          │
│ [View Discussion]                      │
└─────────────────────────────────────────┘
```

**Location Proposal:**
```
┌─────────────────────────────────────────┐
│ Proposal: Where should we eat?         │
│ by @john                               │
├─────────────────────────────────────────┤
│ Vote for your preferred venue:        │
│                                         │
│ [ ] Uchi Restaurant                    │
│     ⭐⭐⭐⭐⭐ | $$$ | Japanese        │
│     📍 Downtown                        │
│     Votes: 7 👍                        │
│                                         │
│ [✓] Odd Duck                           │
│     ⭐⭐⭐⭐ | $$ | Farm-to-table      │
│     📍 South Lamar                     │
│     Votes: 9 👍                        │
│                                         │
│ [ ] Franklin BBQ                       │
│     ⭐⭐⭐⭐⭐ | $ | BBQ                │
│     📍 East Austin                     │
│     Votes: 4 👍                        │
│                                         │
│ [+ Suggest Another Place]             │
│                                         │
│ 🤖 AI Suggestion: "Based on votes and  │
│    dietary preferences mentioned, Odd  │
│    Duck seems like the best fit!"      │
└─────────────────────────────────────────┘
```

**Custom Proposal:**
```
┌─────────────────────────────────────────┐
│ New Proposal                           │
├─────────────────────────────────────────┤
│ Type: [Time ▼] [Location] [Activity]  │
│       [Budget] [Custom]                │
│                                         │
│ Title:                                 │
│ ┌─────────────────────────────────┐   │
│ │ What activity after dinner?     │   │
│ └─────────────────────────────────┘   │
│                                         │
│ Options (one per line):               │
│ ┌─────────────────────────────────┐   │
│ │ Karaoke at The Hideout          │   │
│ │ Bowling at Highland Lanes       │   │
│ │ Just hang at the restaurant     │   │
│ └─────────────────────────────────┘   │
│                                         │
│ Voting Deadline (optional):           │
│ [Nov 5, 2025 ▼]                       │
│                                         │
│ [Cancel] [Create Proposal]            │
└─────────────────────────────────────────┘
```

---

## Phase 4: Comments & Discussion

**Comment Thread:**
```typescript
interface Comment {
  id: string;
  parentId?: string;  // For nested replies
  planningEventId: string;
  proposalId?: string;  // If commenting on specific proposal

  author: Collaborator;
  content: string;
  mentions?: string[];  // @user mentions

  reactions?: Reaction[];

  created: Date;
  edited?: Date;
}

interface Reaction {
  emoji: string;  // 👍, ❤️, 😂, etc.
  users: string[];  // User IDs who reacted
}
```

**Comment UI:**
```
┌─────────────────────────────────────────┐
│ 💬 Discussion (12 comments)            │
├─────────────────────────────────────────┤
│ @sarah · 2 hours ago                   │
│ What about making it a brunch instead? │
│ I know some people can't do evenings.  │
│                                         │
│ 👍 3  ❤️ 1  [Reply]                    │
│                                         │
│   └─ @john · 1 hour ago                │
│      That works for me! Saturday 11am? │
│      👍 2  [Reply]                      │
│                                         │
│      └─ @mike · 30 mins ago            │
│         +1 for Saturday brunch         │
│         👍 1  [Reply]                   │
│                                         │
│ @amy · 45 mins ago                     │
│ Just FYI I'm vegetarian, so Odd Duck   │
│ would be perfect 🌱                    │
│ ❤️ 4  [Reply]                          │
│                                         │
│ 🤖 AI Insight: "4 people mentioned     │
│    dietary preferences. I've updated   │
│    the venue suggestions to highlight  │
│    vegetarian-friendly options."       │
│                                         │
│ ┌─────────────────────────────────┐   │
│ │ Add a comment...                │   │
│ │ Use @ to mention someone        │   │
│ └─────────────────────────────────┘   │
│ [Post Comment]                         │
└─────────────────────────────────────────┘
```

**@Mentions:**
- Type `@` to trigger mention dropdown
- Notifies mentioned user
- Creates connection for AI context

---

## Phase 5: AI Recommendations

**AI Analysis Engine:**
```typescript
interface AIRecommendation {
  id: string;
  planningEventId: string;
  type: 'time' | 'location' | 'activity' | 'insight';

  title: string;
  description: string;
  reasoning: string;  // Why AI suggests this
  confidence: number;

  basedOn: {
    votes?: VoteTally[];
    comments?: string[];  // Comment IDs
    preferences?: string[];  // Extracted from discussion
  };

  actionable?: {
    proposalId?: string;
    optionId?: string;
  };

  created: Date;
}
```

**AI Capabilities:**

1. **Time Conflict Detection:**
```
🤖 AI Insight:
"Based on calendar integration, Saturday 6 PM works for 8/10 people.
John and Mike have conflicts but mentioned flexibility in comments."

Suggested Action: Create proposal for Saturday 6 PM
[Create Proposal]
```

2. **Preference Extraction:**
```
🤖 AI Insight:
"I noticed 3 people mentioned dietary restrictions:
- Amy: Vegetarian
- David: Gluten-free
- Sarah: Dairy allergy

Odd Duck has excellent options for all three."

[Update Venue Proposals]
```

3. **Budget Analysis:**
```
🤖 AI Insight:
"Average budget mentioned: $30-40 per person
Current venue (Uchi) is ~$60/person
Odd Duck ($35/person) fits budget better and has higher votes"

[Switch Recommendation]
```

4. **Consensus Detection:**
```
🤖 AI Insight:
"✅ Consensus reached on Saturday, Nov 9 at 6 PM
   9/10 people voted for this time

Ready to finalize this detail?"

[Accept & Move to Next Decision]
```

5. **Activity Suggestions:**
```
🤖 AI Suggestion:
"Based on your group (10 people, mix of ages, birthday celebration),
here are activity ideas:

1. Karaoke at The Hideout (nearby, fun, inclusive)
2. Escape Room at The Escape Game (team activity)
3. Dessert at Amy's Ice Cream (casual, sweet ending)

[Create Activity Proposal with These Options]
```

**AI Service:**
```typescript
// services/aiPlanning.ts

async function analyzeConversation(
  planningEvent: PlanningEvent
): Promise<AIRecommendation[]> {
  // Extract all context
  const context = {
    proposals: planningEvent.proposals,
    comments: planningEvent.comments,
    votes: planningEvent.votes,
    collaborators: planningEvent.collaborators,
  };

  // Send to LLM
  const prompt = `
    Analyze this event planning conversation and provide insights:

    Event: ${planningEvent.title}
    Participants: ${planningEvent.collaborators.length}

    Current proposals: ${JSON.stringify(context.proposals)}
    Discussion: ${JSON.stringify(context.comments)}
    Votes: ${JSON.stringify(context.votes)}

    Provide:
    1. Consensus detection (what's been decided?)
    2. Preference extraction (dietary, accessibility, budget)
    3. Conflict detection (scheduling conflicts, budget mismatches)
    4. Smart suggestions (venues, activities, times)
    5. Next steps (what still needs to be decided?)
  `;

  const recommendations = await callLLM(prompt);
  return recommendations;
}
```

---

## Phase 6: Payment Collection & Expense Splitting

**Expense Model:**
```typescript
interface Expense {
  id: string;
  planningEventId: string;

  title: string;
  amount: number;
  currency: 'USD' | 'EUR' | 'GBP';

  // Who paid
  paidBy: Collaborator;

  // How to split
  splitType: 'equal' | 'custom' | 'percentage';
  splitDetails: ExpenseSplit[];

  // Payment tracking
  payments: Payment[];

  status: 'pending' | 'partially-paid' | 'paid';

  created: Date;
  dueDate?: Date;
}

interface ExpenseSplit {
  collaboratorId: string;
  amount: number;
  paid: boolean;
}

interface Payment {
  id: string;
  expenseId: string;
  payer: Collaborator;
  amount: number;
  method: 'venmo' | 'paypal' | 'cash' | 'card';
  status: 'pending' | 'completed' | 'failed';
  transactionId?: string;
  timestamp: Date;
}
```

**Expense UI:**
```
┌─────────────────────────────────────────┐
│ 💰 Expenses & Payments                 │
├─────────────────────────────────────────┤
│ Venue Deposit                          │
│ $200.00 · Paid by Sarah                │
│                                         │
│ Split equally among 10 people:        │
│ $20.00 each                            │
│                                         │
│ Payment Status:                        │
│ ✅ Sarah ($20) - Paid                  │
│ ✅ John ($20) - Paid                   │
│ ⏳ Mike ($20) - Pending                │
│ ✅ Amy ($20) - Paid                    │
│ ⏳ David ($20) - Pending               │
│ ... 5 more                             │
│                                         │
│ Total Collected: $160 / $200          │
│ Still Owed: $40                        │
│                                         │
│ [Request Payment from Pending]        │
│ [+ Add Another Expense]               │
└─────────────────────────────────────────┘
```

**Add Expense:**
```
┌─────────────────────────────────────────┐
│ New Expense                            │
├─────────────────────────────────────────┤
│ What's this for?                       │
│ ┌─────────────────────────────────┐   │
│ │ Venue deposit                    │   │
│ └─────────────────────────────────┘   │
│                                         │
│ Amount: $ [200.00]                    │
│                                         │
│ Who paid?                              │
│ [Sarah (me) ▼]                        │
│                                         │
│ How to split?                          │
│ (•) Equal split (10 people = $20 each)│
│ ( ) Custom amounts                     │
│ ( ) Percentage                         │
│                                         │
│ Due date (optional):                   │
│ [Nov 1, 2025 ▼]                       │
│                                         │
│ [Cancel] [Add Expense]                │
└─────────────────────────────────────────┘
```

**Payment Request:**
```
┌─────────────────────────────────────────┐
│ Request Payment                        │
├─────────────────────────────────────────┤
│ Send payment request to:              │
│ ✓ Mike ($20)                           │
│ ✓ David ($20)                          │
│                                         │
│ Message:                               │
│ ┌─────────────────────────────────┐   │
│ │ Hi! Please pay your share of the│   │
│ │ venue deposit by Nov 1. Thanks! │   │
│ └─────────────────────────────────┘   │
│                                         │
│ Payment methods:                       │
│ ✓ Venmo: @sarah-organizer             │
│ ✓ PayPal: sarah@example.com           │
│ ✓ Cash (in person)                     │
│                                         │
│ [Send Requests]                        │
└─────────────────────────────────────────┘
```

**Payment Integration:**
```typescript
// Venmo/PayPal deep links
const paymentLink = generatePaymentLink({
  method: 'venmo',
  recipient: '@sarah-organizer',
  amount: 20,
  note: 'Venue deposit for Sarah\'s birthday party',
});

// venmo://paycharge?txn=pay&recipients=sarah-organizer&amount=20&note=...
```

---

## Phase 7: Finalize Event

**Finalization Flow:**
```
┌─────────────────────────────────────────┐
│ Ready to Finalize?                     │
├─────────────────────────────────────────┤
│ Review final details:                  │
│                                         │
│ ✅ Date & Time: Saturday, Nov 9, 6 PM │
│    (9/10 people voted for this)       │
│                                         │
│ ✅ Location: Odd Duck                  │
│    (highest votes, fits budget)       │
│                                         │
│ ✅ Activity: Karaoke after dinner     │
│    (7/10 voted yes)                   │
│                                         │
│ ⚠️  Payments: $40 still pending        │
│    (Mike & David haven't paid)        │
│                                         │
│ Once finalized:                        │
│ • Calendar event sent to all          │
│ • Reservations can be made            │
│ • Planning mode locks (view-only)     │
│                                         │
│ [Not Yet] [Finalize Event]            │
└─────────────────────────────────────────┘
```

**Post-Finalization:**
```
✅ Event Finalized!

Calendar invites sent to:
• sarah@example.com ✓
• john@example.com ✓
• mike@example.com ✓
... +7 more

Planning details saved in event description.

[View Final Event] [Back to Planning Mode (View Only)]
```

**Finalized Event Includes:**
- All decided details (time, location, activities)
- Complete discussion history (exported as attachment)
- Expense summary and payment status
- List of attendees
- AI insights and recommendations used

---

## Phase 8: Real-Time Collaboration

**WebSocket/Realtime Updates:**
```typescript
// Using Supabase Realtime or Pusher

const subscribeToPlanning = (planningEventId: string) => {
  const channel = supabase
    .channel(`planning:${planningEventId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'proposals' },
      (payload) => {
        // Update proposals in real-time
      }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'votes' },
      (payload) => {
        // Update vote tallies
      }
    )
    .subscribe();
};
```

**Live Presence:**
```
┌─────────────────────────────────────────┐
│ Planning: Sarah's 30th Birthday        │
│                                         │
│ 🟢 4 people online:                    │
│ • Sarah (you)                          │
│ • John                                 │
│ • Mike                                 │
│ • Amy                                  │
└─────────────────────────────────────────┘
```

**Activity Feed:**
```
┌─────────────────────────────────────────┐
│ 📊 Recent Activity                     │
├─────────────────────────────────────────┤
│ 🗳️  John voted on time proposal        │
│     2 minutes ago                      │
│                                         │
│ 💬 Amy commented on venue              │
│     "I'm vegetarian, so..."            │
│     5 minutes ago                      │
│                                         │
│ 🤖 AI suggested 3 new venues           │
│     10 minutes ago                     │
│                                         │
│ 📝 Mike created activity proposal      │
│     30 minutes ago                     │
│                                         │
│ [View All Activity]                    │
└─────────────────────────────────────────┘
```

---

## Technical Architecture

**Backend Requirements:**
- Database: PostgreSQL (store planning events, proposals, votes, comments)
- Real-time: Supabase Realtime or Pusher (live updates)
- Auth: User accounts required for collaboration
- Payment: Stripe for payment processing (optional)
- AI: Claude API for recommendations

**Database Schema:**
```sql
CREATE TABLE planning_events (
  id UUID PRIMARY KEY,
  title TEXT,
  status TEXT,
  creator_id UUID REFERENCES users(id),
  share_link TEXT UNIQUE,
  permissions JSONB,
  created_at TIMESTAMP,
  finalized_at TIMESTAMP
);

CREATE TABLE collaborators (
  id UUID PRIMARY KEY,
  planning_event_id UUID REFERENCES planning_events(id),
  user_id UUID REFERENCES users(id),
  role TEXT,
  joined_at TIMESTAMP
);

CREATE TABLE proposals (
  id UUID PRIMARY KEY,
  planning_event_id UUID REFERENCES planning_events(id),
  type TEXT,
  author_id UUID REFERENCES users(id),
  title TEXT,
  options JSONB,
  status TEXT,
  deadline TIMESTAMP,
  created_at TIMESTAMP
);

CREATE TABLE votes (
  id UUID PRIMARY KEY,
  proposal_id UUID REFERENCES proposals(id),
  option_id TEXT,
  voter_id UUID REFERENCES users(id),
  timestamp TIMESTAMP,
  UNIQUE(proposal_id, voter_id)  -- One vote per user per proposal
);

CREATE TABLE comments (
  id UUID PRIMARY KEY,
  planning_event_id UUID REFERENCES planning_events(id),
  proposal_id UUID REFERENCES proposals(id),
  parent_id UUID REFERENCES comments(id),
  author_id UUID REFERENCES users(id),
  content TEXT,
  reactions JSONB,
  created_at TIMESTAMP
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY,
  planning_event_id UUID REFERENCES planning_events(id),
  title TEXT,
  amount DECIMAL,
  paid_by UUID REFERENCES users(id),
  split_type TEXT,
  split_details JSONB,
  status TEXT,
  created_at TIMESTAMP
);

CREATE TABLE payments (
  id UUID PRIMARY KEY,
  expense_id UUID REFERENCES expenses(id),
  payer_id UUID REFERENCES users(id),
  amount DECIMAL,
  method TEXT,
  status TEXT,
  transaction_id TEXT,
  timestamp TIMESTAMP
);
```

**API Endpoints:**
```typescript
// Planning Events
POST   /api/planning                    // Create planning event
GET    /api/planning/:id                // Get planning event
PUT    /api/planning/:id                // Update planning event
POST   /api/planning/:id/finalize       // Finalize → calendar event

// Proposals
POST   /api/planning/:id/proposals      // Create proposal
GET    /api/planning/:id/proposals      // List proposals
PUT    /api/planning/:id/proposals/:pid // Update proposal
DELETE /api/planning/:id/proposals/:pid // Delete proposal

// Votes
POST   /api/proposals/:pid/votes        // Cast vote
DELETE /api/proposals/:pid/votes        // Remove vote
GET    /api/proposals/:pid/votes        // Get vote tallies

// Comments
POST   /api/planning/:id/comments       // Add comment
GET    /api/planning/:id/comments       // List comments
PUT    /api/comments/:cid               // Edit comment
DELETE /api/comments/:cid               // Delete comment
POST   /api/comments/:cid/reactions     // Add reaction

// AI
POST   /api/planning/:id/analyze        // Trigger AI analysis
GET    /api/planning/:id/recommendations // Get AI recommendations

// Expenses
POST   /api/planning/:id/expenses       // Add expense
GET    /api/planning/:id/expenses       // List expenses
POST   /api/expenses/:eid/payments      // Record payment
POST   /api/expenses/:eid/request       // Send payment request

// Collaboration
POST   /api/planning/:id/invite         // Invite collaborators
GET    /api/planning/:id/activity       // Get activity feed
```

---

## Testing Scenarios

1. **Create Planning Event**
   - Start planning mode
   - Generate share link
   - Invite 5 collaborators

2. **Time Voting**
   - Create time proposal with 3 options
   - All collaborators vote
   - AI detects consensus
   - Accept winning time

3. **Location Discussion**
   - Create venue proposal
   - Collaborators comment dietary restrictions
   - AI suggests venues matching preferences
   - Vote and select venue

4. **Expense Splitting**
   - Add venue deposit expense
   - Split equally among 10 people
   - Track payments
   - Send reminders to pending

5. **Finalization**
   - Review all decided details
   - Finalize event
   - Calendar invites sent to all

---

## Future Enhancements

- [ ] Calendar integration (auto-detect conflicts)
- [ ] Venue booking integration (OpenTable, Resy)
- [ ] Automatic reminders for unpaid expenses
- [ ] Export planning summary as PDF
- [ ] Template planning events (birthday party template, etc.)
- [ ] Poll expiration and auto-selection
- [ ] Anonymous voting option
- [ ] Private proposals (organizer-only view)
- [ ] Mobile app with push notifications
- [ ] Integration with group chat (Slack, Discord)

---

**Location:**
- `src/app/planning/[id]/page.tsx` (main planning interface)
- `src/components/PlanningMode/` (all planning components)
  - `ProposalCard.tsx`
  - `VotingInterface.tsx`
  - `CommentThread.tsx`
  - `ExpenseTracker.tsx`
  - `AIRecommendations.tsx`
  - `ActivityFeed.tsx`
- `src/services/collaboration.ts` (real-time collaboration)
- `src/services/aiPlanning.ts` (AI recommendations)
- `src/hooks/usePlanning.ts`

**Priority:** Very High Impact, Very High Effort (40-60 hours)

**Dependencies:**
- Requires user authentication system
- Requires database (currently using LocalStorage)
- May require backend migration to Next.js API + Supabase/PostgreSQL

**Notes:**
- This is the biggest feature yet - essentially a new product
- Transforms app from solo tool → collaborative platform
- Consider launching as beta feature first
- May want to split into smaller sub-tasks (Phase 1, Phase 2, etc.)
- Significant infrastructure changes required
