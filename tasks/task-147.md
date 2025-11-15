### Task 147: Calendar Integration - Connect Apple/Google Calendars

#### Overview
Enable users to connect their existing Apple Calendar and Google Calendar accounts to Event Every. Display all calendars in a unified view with the ability to sync events bidirectionally.

#### Subtasks
- [ ] Research calendar integration APIs (Apple CalDAV, Google Calendar API)
- [ ] Set up OAuth 2.0 authentication for Google Calendar
- [ ] Set up CalDAV authentication for Apple Calendar (iCloud)
- [ ] Create calendar connection service for Google Calendar API
- [ ] Create calendar connection service for Apple CalDAV
- [ ] Add calendar account management UI (connect/disconnect accounts)
- [ ] Implement event fetching from connected calendars
- [ ] Create unified calendar view component showing all calendars together
- [ ] Add calendar filtering (show/hide specific calendars)
- [ ] Add calendar color coding for visual distinction
- [ ] Implement two-way sync: push Event Every events to external calendars
- [ ] Implement two-way sync: pull updates from external calendars
- [ ] Add sync status indicators and error handling
- [ ] Store calendar credentials securely (encrypted local storage or backend)
- [ ] Add background sync with configurable intervals
- [ ] Handle timezone conversions properly
- [ ] Add conflict resolution for sync conflicts
- [ ] Update storage service to track which events came from which calendar source
- [ ] Add calendar selection when exporting Event Every events

#### Technical Considerations
- **Google Calendar API**: Requires OAuth 2.0, project setup in Google Cloud Console
- **Apple CalDAV**: Uses iCloud CalDAV protocol (https://caldav.icloud.com)
- **Authentication**: Need to decide on backend vs frontend-only auth
- **Sync Strategy**: Real-time vs polling vs webhook-based
- **Data Model**: Extend CalendarEvent interface to include calendar source, sync status
- **Security**: Never store plaintext credentials
- **Rate Limits**: Handle API rate limits gracefully

#### Location
- `src/services/calendarSync.ts` - New calendar sync service
- `src/services/googleCalendar.ts` - Google Calendar integration
- `src/services/appleCalendar.ts` - Apple CalDAV integration
- `src/components/CalendarConnections.tsx` - Calendar account management UI
- `src/components/UnifiedCalendarView.tsx` - Combined calendar view
- `src/hooks/useCalendarSync.ts` - Calendar sync hook
- `src/types/calendar.ts` - Calendar-related types

#### Dependencies
- Google Calendar API client library
- CalDAV client library
- OAuth 2.0 implementation
- Potential backend API endpoints for secure credential storage

#### Success Criteria
- [ ] Users can connect Google Calendar accounts
- [ ] Users can connect Apple Calendar (iCloud) accounts
- [ ] All calendars display in a unified view
- [ ] Events from external calendars are properly formatted
- [ ] Users can push Event Every events to external calendars
- [ ] Sync works bidirectionally without data loss
- [ ] Calendar colors and names are preserved
- [ ] Timezone handling is accurate
