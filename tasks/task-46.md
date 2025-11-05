### Task 46: Address Validation & Enrichment

**Goal:** Add intelligent address validation, auto-completion, and LLM-powered location suggestions

**Phase 1: ZIP Code Database Setup**
- [ ] Find/create US ZIP code database JSON (5-10MB with city, state, lat/lng)
- [ ] Add to `/public/data/zipcodes.json`
- [ ] Create utility functions for ZIP lookup in `src/utils/zipcode.ts`

**Phase 2: Background Address Enrichment API**
- [ ] Create `/api/enrich-location` Vercel API route
- [ ] Accept event metadata (rawLocation, title, description)
- [ ] Use LLM/geocoding to generate multiple address suggestions
- [ ] Return array of addresses with confidence scores (0-1)
- [ ] Handle edge cases (no suggestions, ambiguous locations)

**Phase 3: EventEditor Address UI**
- [ ] Add address input field with dropdown suggestions
- [ ] Display all suggestions sorted by confidence (highest first)
- [ ] Auto-select highest confidence address by default
- [ ] Show confidence percentage for each suggestion
- [ ] Allow user to select from dropdown or type custom address

**Phase 4: Real-time Address Search**
- [ ] Add debounced search as user types custom address
- [ ] Validate ZIP code format (5 or 9 digits)
- [ ] Auto-fill city/state from ZIP database
- [ ] Show validation errors inline (invalid ZIP, missing fields)
- [ ] Format full address for display: "123 Main St, City, ST 12345"

**Phase 5: Data Model Updates**
- [ ] Update CalendarEvent interface to store address suggestions
- [ ] Add `locationSuggestions: Array<{address: string, confidence: number}>`
- [ ] Add `selectedLocationIndex: number` to track user choice
- [ ] Ensure full street address exports to .ics LOCATION field for GPS

**Testing:**
- [ ] Verify GPS navigation works from exported .ics files
- [ ] Test ZIP auto-completion with various formats
- [ ] Test LLM suggestions with ambiguous locations ("google hq", "starbucks downtown")
- [ ] Test manual address entry and validation

**Data Storage:**
- ZIP codes: Static JSON file in `/public/data/zipcodes.json`
- No Vercel Blob needed
- Addresses stored in CalendarEvent records

**Location:**
- `public/data/zipcodes.json` (new)
- `src/app/api/enrich-location/route.ts` (new)
- `src/utils/zipcode.ts` (new)
- `src/components/EventEditor.tsx`
- `src/types/event.ts`
