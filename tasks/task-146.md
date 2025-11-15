### Task 146: Fix Custom Date Range Filter UI and Filtering Logic
- [x] Remove time-based preset options from dropdown (Last Hour, 24h, Week, Month, Next variants)
- [x] Move all preset options to custom date range modal only
- [x] Redesign modal with wider layout (max-w-4xl) and 6-column grid for presets
- [x] Update date pickers to display in 2-column layout
- [x] Fix filtering logic to properly handle time-based ranges with full timestamps
- [x] Update handleDateRangeSubmit to accept both Date objects and strings
- Location: `src/app/page.tsx`, `src/hooks/useHistory.ts`
