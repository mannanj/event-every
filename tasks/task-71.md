### Task 71: Calendar Sync (iOS)
- [ ] Research iOS calendar integration options (CalDAV, native calendar URLs, shortcuts)
- [ ] Implement two-way sync mechanism
- [ ] Add sync settings to event card
- [ ] Handle conflict resolution
- [ ] Support Google Calendar, Apple Calendar, Outlook
- [ ] Add sync status indicators
- [ ] Implement periodic background sync
- Location: `src/services/sync.ts`, `src/components/SyncSettings.tsx`

**Notes:**
- High complexity - requires platform-specific integrations
- Web app limitations: may need to use .ics export + calendar subscription URLs
- Consider building native iOS app or PWA with calendar permissions
- Alternative: One-way export with "Add to Calendar" links
- Research Vercel serverless functions for CalDAV proxy
