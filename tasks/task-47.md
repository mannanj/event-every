### Task 47: LLM Event Notes Enrichment with History

**Goal:** Provide real-time LLM-powered grammar improvements and enrichment suggestions for event notes/descriptions, with full history tracking

**Context:**
- User creates event → LLM analyzes and suggests improved wording
- If user is NOT editing: Auto-apply best suggestion
- If user IS editing: Show suggestions without auto-applying (respect user intent)
- Track ALL enrichment history for each field
- Allow user to restore any previous version

**Phase 1: Enrichment API**
- [ ] Create `/api/enrich-notes` Vercel API route
- [ ] Accept event field data (title, description, location text)
- [ ] Use Anthropic API to:
  - Fix grammar/spelling
  - Improve clarity
  - Expand abbreviations
  - Format professionally
- [ ] Return multiple suggestion variants with confidence scores
- [ ] Handle rate limiting gracefully

**Phase 2: Data Model for Enrichment History**
- [ ] Create `FieldEnrichment` interface:
  ```typescript
  interface FieldEnrichment {
    id: string;
    fieldName: 'title' | 'description' | 'location';
    originalValue: string;
    suggestedValue: string;
    confidence: number;
    timestamp: Date;
    applied: boolean;
  }
  ```
- [ ] Update `CalendarEvent` to store:
  ```typescript
  interface CalendarEvent {
    // ... existing fields
    enrichmentHistory: FieldEnrichment[];
    activeEnrichments: {
      title?: string;  // Currently applied enrichment
      description?: string;
      location?: string;
    };
  }
  ```

**Phase 3: Real-Time Enrichment Flow**
- [ ] Trigger enrichment API call when event is created
- [ ] Run in background (non-blocking for user)
- [ ] Store suggestions in `enrichmentHistory[]`
- [ ] Check if user is in edit mode:
  - NOT editing → Auto-apply highest confidence suggestion
  - IS editing → Queue suggestion, show notification badge

**Phase 4: EventEditor Enrichment UI**
- [ ] Add suggestion badge/indicator for each field with enrichments
- [ ] Click badge to open enrichment panel showing:
  - Original text
  - LLM suggested text (with confidence %)
  - Diff view (highlight changes)
  - Actions: "Apply", "Apply at end", "Dismiss"
- [ ] "Apply at end" appends suggestion to existing text
- [ ] "Apply" replaces entire field with suggestion
- [ ] Show enrichment history timeline (restore any version)

**Phase 5: Enrichment History Panel**
- [ ] Add "View Enrichment History" link in EventEditor
- [ ] Display chronological list of all enrichments for event:
  ```
  Title: "Product Demo" → "Product Demonstration Meeting" (95% confidence)
  ├─ Applied 2 hours ago
  └─ Restore | Dismiss

  Description: "meet at office" → "Meeting at office headquarters" (88%)
  ├─ Pending (you're editing)
  └─ Apply | Apply at end | Dismiss
  ```
- [ ] Allow restoring any previous version
- [ ] Show user-entered vs LLM-suggested side-by-side

**Phase 6: Smart Enrichment Triggers**
- [ ] Don't re-enrich if user manually edited field (respect their intent)
- [ ] Only enrich when:
  - Event first created
  - User clicks "Suggest Improvements" button
  - Significant field changes (>30% different)
- [ ] Add manual "Re-enrich" button in EventEditor

**Phase 7: Notification System**
- [ ] Show toast notification when enrichment completes
- [ ] Badge counter on fields with pending suggestions
- [ ] Batch multiple suggestions into single notification
- [ ] Allow dismissing all suggestions at once

**Testing:**
- [ ] Test auto-apply when user NOT editing
- [ ] Test suggestion queuing when user IS editing
- [ ] Test enrichment history restore functionality
- [ ] Test "Apply at end" vs "Apply" behaviors
- [ ] Test with poor grammar: "meeting tmrw at 3pm pls come"
- [ ] Test with professional text (should not over-enrich)
- [ ] Test offline/rate-limited scenarios

**Future Enhancements:**
- [ ] Learn from user preferences (if they always reject certain enrichments)
- [ ] Multi-language support
- [ ] Tone adjustment (formal vs casual)

**Location:**
- `src/app/api/enrich-notes/route.ts` (new)
- `src/types/event.ts` (add enrichment interfaces)
- `src/components/EventEditor.tsx` (enrichment UI)
- `src/components/EnrichmentHistoryPanel.tsx` (new)
- `src/services/storage.ts` (save enrichment history)
- `src/hooks/useEnrichment.ts` (new - enrichment logic)
