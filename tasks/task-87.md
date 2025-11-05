### Task 87: Advanced LLM-Powered Batch URL Detection and Event Extraction
- [ ] Remove separate LinkInput component (revert to single TextInput)
- [ ] Create LLM-based URL detection service (Phase 1)
- [ ] Implement parallel/batch URL fetching and scraping (Phase 2)
- [ ] Integrate scraped content with existing batch event parser (Phase 3)
- [ ] Add URL processing status indicators in UI
- [ ] Handle mixed input (text + multiple URLs)
- [ ] Store original URL links in event descriptions
- [ ] Support Meetup, Eventbrite, Luma, and other event platforms
- [ ] Add error handling for invalid/unreachable URLs
- [ ] Update UI to show "Fetching X URLs..." progress
- Location: `src/app/page.tsx`, `src/services/urlDetector.ts`, `src/services/webScraper.ts`, `src/app/api/detect-urls/route.ts`

**Architecture:**

**Phase 1: URL Detection (LLM-Powered)**
```typescript
// src/services/urlDetector.ts
// LLM analyzes input and extracts all URLs
interface URLDetectionResult {
  urls: string[];              // All detected URLs
  remainingText: string;        // Non-URL text content
  hasUrls: boolean;            // Whether URLs were found
}

// API: /api/detect-urls
// Uses Claude to intelligently extract URLs from any text format
// Example inputs it handles:
// - "Check out these events: https://meetup.com/... and https://luma.com/..."
// - Just URLs with no other text
// - Text with embedded URLs in sentences
// - Multiple meetup links separated by newlines
```

**Phase 2: Parallel URL Fetching**
```typescript
// Extends src/services/webScraper.ts
// Fetch multiple URLs in parallel with Promise.all()
interface BatchScrapedContent {
  results: Array<{
    url: string;
    text: string;
    title?: string;
    error?: string;
    status: 'success' | 'error';
  }>;
  successCount: number;
  errorCount: number;
}

// Features:
// - Parallel fetching (Promise.all) for speed
// - Individual error handling (one failure doesn't stop others)
// - Progress tracking for UI updates
```

**Phase 3: Combined Event Parsing**
```typescript
// src/app/page.tsx - handleTextSubmit
// When user submits text:
// 1. Call /api/detect-urls to extract URLs
// 2. If URLs found:
//    a. Fetch/scrape all URLs in parallel
//    b. Combine: original text + all scraped content
//    c. Append each URL to its content: "---\nOriginal Event: {url}"
// 3. Send combined content to existing /api/parse (batch mode)
// 4. Existing batch processing handles the rest!

// UI shows:
// "Detecting URLs..." (Phase 1)
// "Fetching 3 event pages..." (Phase 2)
// "Extracting events..." (Phase 3)
```

**User Experience Flow:**

1. User pastes into TextInput:
   ```
   Hey check these out:
   https://www.meetup.com/bitcoin-park-austin/events/305000000/
   https://www.meetup.com/austin-deep-learning/events/307783680/
   ```

2. System automatically:
   - Detects 2 URLs via LLM
   - Fetches both Meetup pages in parallel
   - Scrapes HTML from both
   - Combines scraped content with original text
   - Sends to Claude for event extraction
   - Returns all events with original URLs in descriptions

3. User sees BatchEventList with events from both URLs

**Event Description Format:**
```
[Meetup event description extracted from page]

---
Original Event: https://www.meetup.com/bitcoin-park-austin/events/305000000/
```

**Benefits:**
- No separate input field - simpler UX
- Handles mixed content (text + URLs)
- Batch processing for multiple URLs
- Intelligent URL detection (not just regex)
- Reuses existing batch event flow
- Original URLs preserved in descriptions

**Implementation Order:**
1. Create /api/detect-urls endpoint with LLM
2. Extend webScraper.ts for batch fetching
3. Update handleTextSubmit to orchestrate 3 phases
4. Remove LinkInput component and references
5. Add URL processing status UI
6. Test with multiple Meetup URLs

**Dependencies:**
- Task 50 (partial - webScraper.ts exists)
- Task 52 (Batch Link Processing Infrastructure) - merges with this
- Task 53 (Meetup scraper) - HTML parsing works generically

**Notes:**
- This approach is more flexible than regex URL detection
- LLM can handle messy input formats
- Extensible to any event platform (not just Meetup)
- Two LLM calls (detection + parsing) but cleaner architecture
- Could optimize later with streaming or single-pass LLM
