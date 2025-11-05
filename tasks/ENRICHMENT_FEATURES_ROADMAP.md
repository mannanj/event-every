# Event Enrichment Features Roadmap

## Overview
This document outlines the AI-powered enrichment features for Event Every, focusing on intelligent address validation and LLM-based text improvements.

## Task Breakdown

### Task 46: Address Validation & Enrichment
**Priority:** HIGH (foundational for GPS navigation)
**Dependencies:** None
**Timeline:** 1-2 weeks

**What it does:**
- ZIP code database for validation (5-10MB static file)
- Background API generates multiple address suggestions from event context
- User picks from confidence-ranked suggestions or enters custom address
- Real-time validation ensures GPS-ready addresses in .ics exports

**Key Files:**
- `public/data/zipcodes.json` (ZIP code database)
- `src/app/api/enrich-location/route.ts` (enrichment API)
- `src/utils/zipcode.ts` (validation utilities)
- `src/components/EventEditor.tsx` (address UI)

---

### Task 47: LLM Event Notes Enrichment
**Priority:** MEDIUM (quality-of-life improvement)
**Dependencies:** Task 46 (shares enrichment pattern)
**Timeline:** 2-3 weeks

**What it does:**
- LLM analyzes event text and suggests grammar/clarity improvements
- Auto-applies when user not editing, shows suggestions when editing
- Full enrichment history with restore capability
- "Apply" vs "Apply at end" options for suggestions

**Key Files:**
- `src/app/api/enrich-notes/route.ts` (enrichment API)
- `src/components/EnrichmentHistoryPanel.tsx` (history UI)
- `src/hooks/useEnrichment.ts` (enrichment logic)

---

### Task 49: Multi-Location Events
**Priority:** LOW (advanced feature for future)
**Dependencies:** Task 46 (address validation required)
**Timeline:** 3-4 weeks

**What it does:**
- Support events with multiple sequential stops (ceremony → photos → reception)
- Each location has its own start/end time
- Exports as multiple linked .ics events (current calendar software limitation)
- Data model supports future single-event view in custom calendar

**Key Files:**
- `src/types/event.ts` (multi-location data model)
- `src/services/exporter.ts` (multi-event .ics generation)
- `src/components/EventEditor.tsx` (multi-location UI)

---

## Implementation Order

```
Phase 1: Task 46 (Address Validation)
├─ Set up ZIP code database
├─ Build enrichment API pattern
├─ Implement address UI with suggestions
└─ Validate GPS navigation works

Phase 2: Task 47 (Notes Enrichment)
├─ Reuse enrichment API pattern from Task 46
├─ Build enrichment history system
├─ Implement suggestion UI
└─ Add notification system

Phase 3: Task 49 (Multi-Location)
├─ Extend data model for multiple locations
├─ Build multi-location UI
├─ Implement multi-event .ics export
└─ Prepare for future custom calendar
```

## Data Model Evolution

### Current (Single Location)
```typescript
interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;  // Single address string
  description?: string;
  // ... other fields
}
```

### After Task 46 (Address Enrichment)
```typescript
interface CalendarEvent {
  // ... existing fields
  location?: string;  // User-selected address
  locationSuggestions?: Array<{
    address: string;
    confidence: number;
  }>;
  selectedLocationIndex?: number;
}
```

### After Task 47 (Notes Enrichment)
```typescript
interface CalendarEvent {
  // ... existing fields
  enrichmentHistory: FieldEnrichment[];
  activeEnrichments: {
    title?: string;
    description?: string;
    location?: string;
  };
}
```

### After Task 49 (Multi-Location)
```typescript
interface CalendarEvent {
  // ... existing fields
  isMultiLocation: boolean;
  locations: EventLocation[];  // Array of stops with times
  location?: string;  // Legacy for single-location events
}

interface EventLocation {
  id: string;
  address: string;
  startTime: Date;
  endTime: Date;
  title?: string;
  order: number;
}
```

## Technical Architecture

### Enrichment API Pattern (Shared)
Both address and notes enrichment follow this pattern:

```typescript
// /api/enrich-[type]/route.ts
POST /api/enrich-location
{
  "rawLocation": "meeting at google hq",
  "title": "Product Demo",
  "description": "..."
}

Response:
{
  "suggestions": [
    { "value": "1600 Amphitheatre Pkwy, Mountain View, CA 94043", "confidence": 0.95 },
    { "value": "345 Spear St, San Francisco, CA 94105", "confidence": 0.72 }
  ]
}
```

### Storage Strategy
- **ZIP codes:** Static JSON file (no API calls)
- **Enrichment history:** LocalStorage/IndexedDB (same as events)
- **No Vercel Blob needed** for any of these features

### .ics Export Strategy

**Single-location events (current):**
```ics
BEGIN:VEVENT
UID:event-123
SUMMARY:Product Demo
DTSTART:20251205T140000Z
DTEND:20251205T150000Z
LOCATION:1600 Amphitheatre Pkwy, Mountain View, CA 94043
DESCRIPTION:Meeting with team
END:VEVENT
```

**Multi-location events (Task 49):**
```ics
BEGIN:VEVENT
UID:event-456-1
SUMMARY:Wedding - Ceremony
DTSTART:20251215T140000Z
DTEND:20251215T150000Z
LOCATION:St. Mary's Church, 123 Oak St, San Francisco, CA
DESCRIPTION:Part 1 of 3
END:VEVENT

BEGIN:VEVENT
UID:event-456-2
SUMMARY:Wedding - Reception
DTSTART:20251215T180000Z
DTEND:20251215T220000Z
LOCATION:Grand Hotel, 456 Main St, San Francisco, CA
DESCRIPTION:Part 2 of 3
END:VEVENT
```

## Future Vision: Custom Calendar Software

These tasks prepare data models to support future custom calendar that can:
- Display multi-location events as single timeline
- Show enrichment history inline
- Enable GPS navigation between stops
- Sync with standard calendar apps

**Data model is forward-compatible** - when we build custom calendar, all existing events will work without migration.

---

## Questions & Decisions

### Address Enrichment (Task 46)
- **Q:** Use Anthropic API or geocoding service for suggestions?
- **A:** Start with Anthropic (already integrated), add geocoding if needed

### Notes Enrichment (Task 47)
- **Q:** How aggressive should auto-apply be?
- **A:** Conservative - only auto-apply when user NOT editing

### Multi-Location (Task 49)
- **Q:** Max number of locations per event?
- **A:** No hard limit, but suggest 5-10 for UX

---

**Last Updated:** 2025-11-04
**Status:** Task files created, ready for implementation
