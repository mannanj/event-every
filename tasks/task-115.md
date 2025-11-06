### Task 115: Add Sort Dropdown for Events
- [ ] Design sort dropdown UI (minimal black & white)
- [ ] Implement dropdown component with sort options
- [ ] Add sort options: Time (newest first), Time (oldest first), Title (A-Z), Title (Z-A), Created order
- [ ] Store sort preference in state (consider localStorage for persistence)
- [ ] Update event list to respect selected sort order
- [ ] Place dropdown in appropriate location (above event list or in header)
- Location: `src/components/BatchEventList.tsx`, new `src/components/EventSortDropdown.tsx`

#### Sort Options
1. **Time (newest first)** - Sort by event start date, newest at top (default)
2. **Time (oldest first)** - Sort by event start date, oldest at top
3. **Created order** - Original order events were created/parsed
4. **Title (A-Z)** - Alphabetical by event title, ascending
5. **Title (Z-A)** - Alphabetical by event title, descending

#### UI Design
```
[Sort by: Time (newest first) ▼]
```

**Dropdown appearance:**
- Minimal black border
- White background
- Black text
- Hover: light gray background
- Match existing app aesthetic

#### Implementation
1. Create `EventSortDropdown.tsx` component
2. Add sort state to BatchEventList: `const [sortBy, setSortBy] = useState('time-desc')`
3. Implement sort function:
   ```typescript
   const sortEvents = (events: CalendarEvent[], sortBy: string) => {
     const sorted = [...events];
     switch (sortBy) {
       case 'time-desc': return sorted.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
       case 'time-asc': return sorted.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
       case 'title-asc': return sorted.sort((a, b) => a.title.localeCompare(b.title));
       case 'title-desc': return sorted.sort((a, b) => b.title.localeCompare(a.title));
       case 'created': return sorted; // Keep original order
       default: return sorted;
     }
   };
   ```
4. Apply sort before rendering event list
5. Optional: Persist sort preference to localStorage

#### Placement
Consider two options:
1. **Above event list** - Between status/skeleton and events
2. **In section header** - Next to "Made some events" (if header remains)

Recommended: Place above event list for clear context
