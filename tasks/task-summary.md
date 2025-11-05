# Event Every - Task Summary

One-liner summary of all tasks organized by feature area.

## ✅ Completed Tasks (1-32)

All foundational features implemented:
- Daily event limit increased to 10
- Honeypot bot protection in email request modal
- Rate limiting infrastructure
- Vercel deployment
- Security improvements

---

## 🔄 Duplicate Detection System (Tasks 33-41)

**Priority**: High | **Effort**: Medium (15-20 hours total) | **Follow**: IMPLEMENTATION_ORDER.md

- **Task 33**: Type definitions for duplicate detection system
- **Task 34**: LLM-powered duplicate event detection service
- **Task 35**: Smart event merging with conflict resolution
- **Task 36**: React hook for duplicate detection workflow
- **Task 37**: Progress indicator during duplicate checking
- **Task 38**: Modal UI for reviewing and approving duplicate merges
- **Task 39**: Integrate duplicate detection into save flow
- **Task 40**: User settings for duplicate detection sensitivity and behavior
- **Task 41**: Comprehensive testing of duplicate detection edge cases

**Implementation Order**: Must follow exact sequence: 33 → 34 → 35 → 37 → 40 → 36 → 38 → 39 → 41

---

## 🔓 Event Limits & Unlock System (Tasks 42-43)

**Priority**: Medium | **Effort**: Low (2-3 hours total)

- **Task 42**: Backend unlock code system (3 single-use codes to extend limit from 10 to 100 events/day)
- **Task 43**: UI for entering unlock codes in daily limit display

---

## 💬 Conversational Editing (Tasks 44-45)

**Priority**: Medium | **Effort**: Medium (8-10 hours total)

- **Task 44**: Natural language event editing via chat interface ("change time to 3pm", "move to next Tuesday")
- **Task 45**: Auto-detect and merge additional inputs (screenshots/text) into existing events

---

## 📍 Location Features (Tasks 46, 62-64)

**Priority**: High | **Effort**: Medium (10-12 hours total)

- **Task 46**: Address validation with ZIP code database and LLM-powered location suggestions
- **Task 62**: Backend API for distance and travel time between locations (Google Maps integration)
- **Task 63**: GPS icon in header to capture and store user location (red/green/blue dot states)
- **Task 64**: Show distance/travel time enrichments on event cards with shimmer loading

---

## ✨ Event Enrichment (Task 47)

**Priority**: Medium | **Effort**: Medium (8-10 hours)

- **Task 47**: LLM-powered grammar improvements and enrichment suggestions for event notes with full history tracking

---

## 🤖 AI Chat & Assistance (Tasks 48, 58, 65-67)

**Priority**: High | **Effort**: High (25-30 hours total)

- **Task 48**: Chat with AI about your events (placeholder)
- **Task 58**: AI assistant that analyzes context, calculates travel times, and provides smart recommendations (car rental → Airbnb scenario)
- **Task 65**: Chat interface UI on event cards
- **Task 66**: Q&A functionality via chat with event context
- **Task 67**: Natural language event editing through chat

**Dependencies**: 65 → 66 → 67

---

## 🗺️ Multi-Location Events (Task 49)

**Priority**: Medium | **Effort**: Medium (6-8 hours)

- **Task 49**: Support events with multiple sequential stops (ceremony → photos → reception) exported as linked .ics events

---

## 🔗 Import & Batch Processing (Tasks 50-54)

**Priority**: Medium | **Effort**: High (15-18 hours total)

- **Task 50**: Extract events from webpage links (Meetup, Eventbrite, Facebook Events)
- **Task 51**: Upload and process multiple images at once (up to 25)
- **Task 52**: Background queue for processing multiple links
- **Task 53**: Meetup.com event scraper and parser
- **Task 54**: Grouped event card UI for batch imports with "Add All" or "Add Selected"

---

## ✏️ Editing & Review (Task 55)

**Priority**: Low | **Effort**: Low (1-2 hours)

- **Task 55**: Add edit button to initial processing success card before auto-save

---

## 📎 Attachments (Tasks 56-57, 69-70)

**Priority**: Medium | **Effort**: Medium (12-15 hours total)

- **Task 56**: Include original uploaded images/text as ICS attachments
- **Task 57**: Export LLM reasoning metadata as attachments (transparency feature)
- **Task 69**: Drag-and-drop attachment management on event cards
- **Task 70**: Smart suggestions from analyzing uploaded attachments

**Dependencies**: 56 → 57, 69 → 70

---

## ⏱️ Advanced Scheduling (Task 59)

**Priority**: High | **Effort**: Medium (10-15 hours)

- **Task 59**: Reverse scheduling - AI calculates optimal start time working backwards from deadline ("order ride for bus station" example)

---

## 📱 Communication (Task 60)

**Priority**: Medium | **Effort**: High (15-20 hours)

- **Task 60**: AI-powered messaging to event contacts (running late notifications, questions) via SMS/email with Twilio integration

---

## 📅 Calendar Interface (Task 61)

**Priority**: Very High | **Effort**: Very High (40-60 hours)

- **Task 61**: Full calendar system with drag-and-drop, timeline/grid views, multi-calendar support, conflict detection, subscriptions, sharing, and scenario planning

**Phases to break down**:
- 61-A: Timeline view & filtering
- 61-B: Calendar grid views (day/week/month)
- 61-C: Drag-and-drop functionality
- 61-D: Multi-calendar system
- 61-E: Calendar subscription & sharing
- 61-F: Conflict detection & scenarios
- 61-G: Advanced search & filtering

**Note**: This is a massive feature - essentially a full calendar app within Event Every

---

## 📜 Event History & Versioning (Task 68)

**Priority**: Medium | **Effort**: Medium (6-8 hours)

- **Task 68**: Version history with git-style diff and restore functionality

**Dependencies**: Requires Task 67 (editing creates versions)

---

## 🔄 Calendar Sync (Task 71)

**Priority**: High | **Effort**: Very High (20+ hours)

- **Task 71**: Two-way calendar sync with iOS/Google/Outlook calendars (complex, requires research)

---

## 🔁 Iterative Generation (Task 72)

**Priority**: High | **Effort**: High (12-15 hours)

- **Task 72**: Pause/resume event generation, queue enrichments, review changes iteratively with live skeleton updates

**Dependencies**: Tasks 68 (versioning), 69 (attachments), 70 (attachment analysis)

---

## ⏰ Alerts & Reminders (Task 73)

**Priority**: High | **Effort**: Medium (6-8 hours)

- **Task 73**: VALARM support for travel alerts and pre-event arrival times in ICS exports (iOS Calendar compatible)

---

## 🎉 Party Planning Mode (Task 74)

**Priority**: Very High | **Effort**: Very High (40-60 hours)

- **Task 74**: Collaborative event planning with voting, expense splitting, AI recommendations, and real-time collaboration

**Note**: Essentially a new product - requires user auth, database migration, and significant infrastructure changes

---

## 🎨 Misc (Task 9999)

- **Task 9999**: Branding placeholder

---

## Quick Start Guide

### For Immediate Impact (Quick Wins)
1. **Task 43** - Unlock code UI (1-2 hours)
2. **Task 55** - Edit button on success card (1-2 hours)
3. **Task 63** - GPS location icon (2-3 hours)

### For Next Sprint (Follow Implementation Order)
1. **Tasks 33-41** - Duplicate Detection (must follow IMPLEMENTATION_ORDER.md)
2. **Task 73** - Alerts & Reminders (high user value)
3. **Task 59** - Reverse Scheduling (unique feature)

### For Major Features (Plan Carefully)
1. **Task 61** - Calendar Interface (break into 7 subtasks)
2. **Task 58** - AI Assistant (significant value)
3. **Task 74** - Party Planning (new product direction)

---

## Dependencies Map

```
Task 65 (Chat UI) → Task 66 (Q&A) → Task 67 (Editing)
Task 67 (Editing) → Task 68 (Versioning)
Task 69 (Attachments) → Task 70 (Analysis)
Task 56 (Attachments) → Task 57 (Metadata)
Tasks 68, 69, 70 → Task 72 (Iterative Generation)
```

---

## Effort Estimates Summary

- **Low Effort** (1-3 hours): 43, 55
- **Medium Effort** (4-10 hours): 33-41 (combined), 42, 44, 46, 47, 49, 59, 62-64, 68, 73
- **High Effort** (10-20 hours): 45, 50-54, 56-57+69-70, 58+65-67, 60, 72
- **Very High Effort** (20+ hours): 61, 71, 74

---

## Priority Recommendations

### Must Do (Core Value)
- Tasks 33-41: Duplicate Detection
- Task 58: AI Assistant
- Task 73: Alerts & Reminders

### Should Do (High Impact)
- Task 59: Reverse Scheduling
- Task 61: Calendar Interface
- Task 72: Iterative Generation

### Nice to Have (Enhancements)
- Tasks 44-45: Conversational Editing
- Tasks 46, 62-64: Location Features
- Tasks 50-54: Batch Processing

### Future Consideration (Major Undertakings)
- Task 71: Calendar Sync (complex)
- Task 74: Party Planning (new product)

---

**Last Updated**: 2025-11-04
**Total Pending Tasks**: 42 (excluding completed 1-32)
**Estimated Total Effort**: 250-350 hours
