### Task 161: Enhanced History Management with Filters, Views, and Organization

- [ ] Remove intermediary saved view (direct save after confirmation)
- [ ] Add view mode toggle (List View / Card View)
- [ ] Implement multi-select mode with checkboxes
- [ ] Add search bar with pill-based filtering
- [ ] Create filter dropdown with common filter options
- [ ] Implement custom list creation and management
- [ ] Add bulk actions toolbar (export selected, delete selected, move to list)
- [ ] Implement trash bin with restore functionality
- [ ] Add event merge capability
- [ ] Add quick delete actions on individual events
- [ ] Update export flow to work with multi-select
- [ ] Persist view preferences and lists to storage
- Location: `src/components/HistoryPanel.tsx`, `src/services/storage.ts`, `src/types/event.ts`, `src/components/SearchBar.tsx`, `src/components/FilterPills.tsx`, `src/components/ListView.tsx`, `src/components/TrashBin.tsx`

#### Design Specifications

**View Modes:**
- List View: Compact rows with essential info (title, date, location)
- Card View: Current card-based layout

**Multi-Select:**
- Checkbox appears on hover/tap in normal mode
- Toggle "Select" mode button to show all checkboxes
- Selected count indicator
- Bulk actions toolbar appears when items selected

**Search & Filters:**
- Search bar at top with pill-based results
- Filter dropdown with options:
  - Date ranges (Today, This Week, This Month, Custom)
  - Event type (All Day, Timed)
  - Source (Image, Text)
  - Lists (All Events, [Custom Lists], Trash)
- Pills appear below search for active filters
- Click pill to remove filter

**Lists:**
- Create custom lists (e.g., "Work Events", "Personal", "Travel")
- Drag-drop events between lists (or use bulk move)
- Lists appear in sidebar or dropdown
- Color-coded list badges on events

**Trash Bin:**
- Deleted events move to trash (soft delete)
- 30-day auto-purge (configurable)
- Restore button on trash items
- Empty trash button

**Event Merge:**
- Select 2+ events → "Merge" button appears
- Preview merged event
- Choose primary event for details
- Combine descriptions/notes

**Quick Actions:**
- Delete icon on event hover (moves to trash)
- Edit icon (existing functionality)
- Move to list dropdown
- Duplicate event option

#### Data Model Updates

```typescript
interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  description?: string;
  allDay: boolean;
  created: Date;
  modified?: Date;
  source: 'image' | 'text';
  originalInput?: string;
  listIds?: string[];  // NEW: Associated lists
  deleted?: boolean;   // NEW: Trash bin flag
  deletedAt?: Date;    // NEW: Trash timestamp
}

interface EventList {
  id: string;
  name: string;
  color?: string;
  created: Date;
  eventCount: number;
}

interface ViewPreferences {
  mode: 'list' | 'card';
  activeFilters: Filter[];
  activeListId?: string;
}

interface Filter {
  type: 'date' | 'source' | 'list' | 'search';
  value: any;
  label: string;
}
```

#### Component Structure

```
HistoryPanel.tsx
├── SearchBar.tsx (search input + filter dropdown)
├── FilterPills.tsx (active filters as removable pills)
├── ViewToggle.tsx (list/card view switcher)
├── SelectModeToggle.tsx (enable multi-select)
├── BulkActionsToolbar.tsx (export, delete, move to list)
├── ListSidebar.tsx (custom lists navigation)
├── ListView.tsx (compact row-based view)
├── CardView.tsx (existing card layout with checkboxes)
├── TrashBin.tsx (deleted events with restore)
└── MergeModal.tsx (merge preview and confirmation)
```

#### Implementation Notes

**Remove Intermediary Save:**
- Currently: Input → Confirmation → Save View → History
- New: Input → Confirmation → Auto-save → History
- Save happens immediately after confirmation

**Multi-Select UX:**
- Default: Checkboxes hidden, appear on hover
- "Select" mode: All checkboxes visible
- Mobile: Long-press to enter select mode

**Search Performance:**
- Debounce search input (300ms)
- Index events for fast search (title, description, location)
- Search pills show as "Title: X", "Location: Y"

**List Management:**
- "Create List" button in filter dropdown
- Inline list rename
- List color picker (8 preset colors)
- Show event count per list

**Trash Bin:**
- Separate "Trash" view in filter dropdown
- Auto-purge after 30 days (localStorage cleanup)
- "Restore All" and "Empty Trash" buttons
- Confirm before permanent delete

**Event Merge:**
- Select 2+ events → "Merge Events" button
- Modal shows side-by-side comparison
- Radio buttons to choose primary event
- Merged event gets combined description
- Original events moved to trash

#### Testing Checklist

- [ ] View mode persists across sessions
- [ ] Multi-select works on mobile (long-press)
- [ ] Search filters correctly across all fields
- [ ] Filter pills remove filters when clicked
- [ ] Lists save/load from storage
- [ ] Events can be assigned to multiple lists
- [ ] Trash auto-purges after 30 days
- [ ] Restore from trash works correctly
- [ ] Merge combines events as expected
- [ ] Export selected works with multi-select
- [ ] Delete confirmation prevents accidents
- [ ] List colors display correctly
- [ ] Search performance is fast (>1000 events)

#### Accessibility

- [ ] Keyboard navigation for multi-select (Space to toggle)
- [ ] Screen reader announces selected count
- [ ] Filter pills keyboard accessible (Enter/Delete)
- [ ] List navigation keyboard accessible
- [ ] ARIA labels for all new buttons
- [ ] Focus management in merge modal

#### Black & White Design Compliance

- Checkboxes: Black border, white background, black check
- Selected state: Black background, white text
- Filter pills: White background, black border, black text
- List badges: Black border, white background (no colors)
- Trash icon: Black outline
- Merge icon: Black outline
- View toggle: Black border, active state inverted

---

**Priority**: High
**Estimated Effort**: Large (3-4 sessions)
**Dependencies**: None
**Breaks Compatibility**: Yes (removes saved view, updates storage schema)
