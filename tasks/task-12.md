### Task 12: Google Calendar Integration
- [ ] Set up Google Cloud project and OAuth credentials
- [ ] Implement OAuth flow for Google Calendar API
- [ ] Create service for direct calendar event creation
- [ ] Add "Add to Google Calendar" button in EventConfirmation
- [ ] Handle auth tokens securely (httpOnly cookies or secure storage)
- [ ] Add error handling for API failures
- [ ] Test calendar event creation and permissions
- Location: `src/services/googleCalendar.ts`, `src/app/api/auth/google/`, `src/components/EventConfirmation.tsx`

**Priority**: High Impact, Medium Effort (8-12 hours)
**Benefits**: One-click add to calendar, no file downloads needed
**Trade-offs**: Requires OAuth, privacy considerations
