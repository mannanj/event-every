### Task 64: Event Card Location Enrichments

**Goal**: Add location enrichment labels above Export/Edit buttons in event cards. Show "Enter your location" link if user hasn't set location, or "Location enrichments" with distance/time data (with shimmer loading states) if location is set.

**Subtasks**:
- [ ] Update event card component to check for user location
- [ ] Add enrichment section above Export/Edit buttons
- [ ] If no user location: show blue link "Share your location" that triggers location icon click
- [ ] If user location set: show "Location enrichments" label (not clickable)
- [ ] Fetch enrichment data asynchronously after event card is displayed
- [ ] Show shimmer skeleton loading for "x mi away" and "x min drive" while loading
- [ ] Display actual values once API returns data
- [ ] Handle errors silently (don't show enrichments if API fails)
- [ ] Only show enrichments if event has a physical location

**Location**:
- `src/components/EventCard.tsx` (update)
- `src/components/LocationEnrichments.tsx` (new)
- `src/hooks/useLocationEnrichments.ts` (new)

**Layout in Event Card**:
```
┌─────────────────────────────────┐
│ Flight AA 2013 from Miami...    │
│ Start: Nov 13, 2025 at 4:29 PM │
│ Location: Miami (MIA) to DCA    │
│ Description: American Airlines...│
│                                 │
│ Location enrichments            │  ← New section
│ 2.3 mi away • 15 min drive     │  ← Shimmer while loading
│                                 │
│ [Export] [Edit]                 │
└─────────────────────────────────┘
```

**No User Location State**:
```
Share your location to see distance and travel time
      ↑ Blue link (triggers GPS icon)
```

**Loading State**:
```
Location enrichments
▓▓▓ mi away • ▓▓ min drive
   ↑ Shimmer skeleton
```

**Loaded State**:
```
Location enrichments
2.3 mi away • 15 min drive
```

**Notes**:
- Non-blocking async loading
- Don't delay event card display
- Fail silently if enrichment API errors
- Only trigger if both user location and event location exist
