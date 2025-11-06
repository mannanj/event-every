### Task 114: Add "New" Badge to Recently Created Events
- [ ] Add timestamp tracking for when events are created
- [ ] Implement logic to check if event was created in last 10 minutes
- [ ] Update event card to show "NEW" badge for recent events
- [ ] Add badge styling (existing green badge can be reused/enhanced)
- [ ] Ensure badge appears on newly processed events
- [ ] Badge should disappear after 10 minutes
- Location: `src/components/BatchEventList.tsx`, `src/types/event.ts`

#### Purpose
Help users identify which events just arrived, especially useful when:
- Multiple batches are processing simultaneously
- User is reviewing events over time
- Events arrive while user is selecting/reviewing

#### Current Behavior
- "NEW" badge shown on last event in list during processing (`isNew` flag)
- Badge is based on array position, not actual creation time

#### Target Behavior
- "NEW" badge shown on events created within last 10 minutes
- Badge based on event creation timestamp
- Badge automatically disappears after 10 minutes
- Works independently of processing state

#### Implementation
1. Ensure `CalendarEvent.created` timestamp is properly set
2. Add utility function to check if event is "new" (< 10 mins old)
3. Update badge logic in BatchEventList:
   ```typescript
   const isNew = (new Date().getTime() - event.created.getTime()) < 10 * 60 * 1000;
   ```
4. Replace current `isNew` logic with timestamp-based check
5. Consider using `useEffect` + interval to update badge visibility

#### Design
- Maintain current green badge design
- Text: "NEW" (existing)
- Consider adding icon or different color for extra visibility
