### Task 117: Implement Smart Event Deduplication

- [ ] Design deduplication algorithm that intelligently identifies duplicate events
- [ ] Create deduplication utility function with configurable similarity thresholds
- [ ] Implement fuzzy matching for titles (handle typos, different wording)
- [ ] Compare event dates with reasonable time threshold
- [ ] Compare locations with fuzzy matching
- [ ] Merge duplicate events keeping the most complete information
- [ ] Add UI controls for users to manually mark/unmark duplicates
- [ ] Add settings to enable/disable automatic deduplication
- [ ] Test with various duplicate scenarios (exact matches, near-duplicates, false positives)

**Location:** `src/utils/deduplication.ts` (to be created), `src/app/page.tsx`, `src/components/UnsavedEventsSection.tsx`

**Problem:**
When processing multiple images or text containing the same event information, duplicate events are created. Users need to manually delete duplicates, which is tedious.

**Examples of Duplicates:**
- Same event appearing in multiple uploaded images
- Event mentioned multiple times in pasted text
- Similar events with slight variations in wording

**Solution Approach:**
1. **Similarity Scoring:** Compare events using multiple criteria:
   - Title similarity (fuzzy string matching, 85%+ threshold)
   - Start date proximity (within 5 minutes)
   - Location similarity (if both have locations, 70%+ threshold)

2. **Smart Merging:** When duplicates detected:
   - Keep event with more complete information (has description, location, etc.)
   - Merge attachments from both events
   - Preserve the longer/more detailed description

3. **User Control:**
   - Apply deduplication by default but allow manual review
   - Add "Show duplicates" toggle to review what was merged
   - Allow users to "unmerge" if deduplication was too aggressive
   - Settings to adjust sensitivity or disable entirely

4. **Timing:**
   - Apply deduplication after all events are extracted
   - Before displaying in unsaved events section
   - Re-run when user adds more events to existing unsaved pool

**Notes:**
- Removed initial deduplication implementation because it was too aggressive and merged valid separate events
- Need to balance between catching real duplicates and avoiding false positives
- Consider allowing users to set their own similarity thresholds in settings
