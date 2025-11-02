### Task 16: Privacy-First Local Processing
- [ ] Integrate Tesseract.js for client-side OCR
- [ ] Research and evaluate local LLM options (Llama 3.2 Vision, WebLLM)
- [ ] Implement fallback: local processing → Claude API if local fails
- [ ] Add user preference toggle (privacy mode vs cloud mode)
- [ ] Optimize bundle size for Tesseract.js (lazy loading)
- [ ] Test accuracy comparison between local OCR and Claude vision
- [ ] Add loading indicators for local processing
- [ ] Update privacy policy/documentation
- Location: `src/services/localOCR.ts`, `src/services/localLLM.ts`, `src/hooks/useParser.ts`

**Priority**: Medium Impact, High Effort (20-30 hours)
**Benefits**: Complete privacy, offline support, no API costs
**Trade-offs**: Lower accuracy, larger bundle, more compute needed
