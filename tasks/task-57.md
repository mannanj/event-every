### Task 57: LLM Reasoning Metadata as Attachments (Future)

**Goal:** Capture and export LLM reasoning, prompts, and decision-making process as attachments

**Vision:**
- Transparency into how AI parsed the event
- Debug why certain fields were chosen
- Learn from AI's interpretation over time
- Historical record of AI decision-making

**Phase 1: Capture LLM Metadata**
- [ ] Extend ParsedEvent to include metadata:
  ```typescript
  interface ParsedEvent {
    // ... existing fields
    metadata?: {
      prompt: string;  // Full prompt sent to LLM
      rawResponse: string;  // Raw LLM response
      reasoning?: string;  // LLM's explanation (if available)
      confidence: number;
      alternatives?: ParsedEvent[];  // Other interpretations considered
      processingTime: number;  // ms
      model: string;  // e.g., "claude-3-opus"
      tokenCount?: number;
    };
  }
  ```

**Phase 2: Update API to Return Metadata**
- [ ] Modify `/api/parse` to return full metadata
- [ ] Include prompt template used
- [ ] Include LLM's raw JSON response
- [ ] Optional: Request LLM to explain its reasoning in response
- [ ] Store tokens used, processing time

**Phase 3: Store Metadata in CalendarEvent**
- [ ] Add `llmMetadata` field to CalendarEvent:
  ```typescript
  interface CalendarEvent {
    // ... existing fields
    llmMetadata?: {
      prompt: string;
      response: string;
      reasoning?: string;
      confidence: number;
      alternatives?: ParsedEvent[];
      processingTime: number;
      model: string;
      timestamp: Date;
    };
  }
  ```
- [ ] Update storage.ts to persist metadata

**Phase 4: Export Metadata as Attachment**
- [ ] Create JSON attachment with full metadata:
  ```json
  {
    "event": "Product Launch Demo",
    "created": "2025-01-15T10:30:00Z",
    "llm": {
      "model": "claude-3-opus",
      "prompt": "Extract calendar event details from: ...",
      "response": "{ title: 'Product Launch Demo', ... }",
      "reasoning": "I identified this as a product demo because...",
      "confidence": 0.92,
      "alternatives": [
        { "title": "Product Meeting", "confidence": 0.78 }
      ],
      "processingTime": 1234
    },
    "originalInput": "..."
  }
  ```
- [ ] Filename: `${event.title}-llm-metadata.json`
- [ ] Include in ICS export as ATTACH property

**Phase 5: UI to View Metadata**
- [ ] Add "View AI Reasoning" button in EventEditor
- [ ] Display metadata in expandable panel:
  - Prompt used
  - Raw response
  - Reasoning explanation
  - Confidence scores
  - Alternative interpretations
  - Processing stats
- [ ] Black & white code-style display (monospace font)
- [ ] Copy-to-clipboard buttons for each section

**Phase 6: Learning from History**
- [ ] Analyze metadata across all events
- [ ] Show patterns: "AI often mistakes X for Y"
- [ ] Allow user feedback: "This interpretation was wrong"
- [ ] Export feedback to improve future prompts

**Testing:**
- [ ] Create event from ambiguous text
- [ ] Verify metadata captures prompt and reasoning
- [ ] Export to ICS with metadata attachment
- [ ] Import to calendar (metadata should be attached)
- [ ] View metadata in EventEditor UI
- [ ] Test with image OCR (include OCR confidence too)

**Future Enhancements:**
- [ ] Timeline visualization of how LLM refined its answer
- [ ] Compare multiple LLM models' interpretations
- [ ] User annotation: "This field should have been X"
- [ ] Export curated dataset for fine-tuning

**Location:**
- `src/types/event.ts` (add metadata interfaces)
- `src/app/api/parse/route.ts` (return metadata)
- `src/services/exporter.ts` (export metadata attachment)
- `src/components/LLMMetadataPanel.tsx` (new - view metadata)
- `src/components/EventEditor.tsx` (add "View AI Reasoning" button)

**Priority:** Low Impact, High Effort (8-10 hours)
**Dependencies:** Requires Task 56 (basic attachment support)
