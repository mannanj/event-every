### Task 89: Implement True Parallel URL Processing with Real-Time Results
- [ ] Refactor handleTextSubmit to process each URL independently
- [ ] Process URLs in parallel (don't wait for all to finish)
- [ ] Stream events in real-time as each URL completes parsing
- [ ] Add individual URL processing status indicators
- [ ] Show events appearing as they're parsed (not batched at end)
- [ ] Handle rate limiting across multiple parallel parse requests
- [ ] Update UI to show per-URL progress (fetching, parsing, complete)
- [ ] Maintain original URL in event description for each
- Location: `src/app/page.tsx`

**Current Flow (Suboptimal):**
```
URL 1 ──┐
URL 2 ──┼──> Wait for ALL ──> Combine ──> Parse ALL ──> Stream results
URL 3 ──┘     to finish
```

**Target Flow (Optimal):**
```
URL 1 ──> Scrape ──> Parse ──> Stream events ─┐
URL 2 ──> Scrape ──> Parse ──> Stream events ─┼──> Real-time results
URL 3 ──> Scrape ──> Parse ──> Stream events ─┘
```

**Benefits:**
- Events appear as soon as each URL finishes (faster perceived performance)
- One slow URL doesn't block others
- Better user feedback with per-URL progress
- True parallel processing end-to-end

**Implementation Approach:**
1. Remove batch scraping + combined parsing
2. Launch parallel promises, one per URL
3. Each promise: scrape → parse → stream events
4. Update UI as each completes
5. Add status tracking per URL (similar to image processing UI)
