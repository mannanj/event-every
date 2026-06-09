### Task 180: Stop streamed-in events from resetting manual selection
- [x] `BatchEventList` no longer resets `selectedEventIds` to "all" whenever the `events` prop changes — it tracks already-seen ids (`seenIdsRef`) and only defaults newly-arrived events to selected, preserving the user's manual select/deselect; selections for deleted events are dropped
- [x] E2E: deselect an event, stream a new one in (second batch appends), assert the deselected one stays unchecked and the new one is checked
- Location: `src/components/BatchEventList.tsx`, `e2e/draft-and-history.spec.ts`

[Task-180]
