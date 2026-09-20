### Task 233: Correct the latency claim, prove the excerpts are real, measure the OCR route
- [x] Task 232 was described as costing no extra wait. That was wrong: `/api/scan` awaits verification before it answers, so the scan waits for it. Budget cut from 1500 ms to 900 ms, just above the 385 ms measured, and the comment now says plainly that it sits on the response path
- [x] Proved the premise of Task 232 on a real image rather than a fixture: a live scan of `real-01.png` returned `title` excerpt "Men's Embodiment Circle Europe - 06/17/26" and `temporal` excerpt "1st & 3rd Wednesday of Each Month 7:00 PM - 9:00 PM", so image verification reads real words
- [x] `scripts/ocr-real-images.ts` OCRs the 23 real images with Tesseract and writes them as text cases the existing scan-reliability runner scores, so the OCR route is judged by the same answer key and the same scorer as the vision route
- [x] OCR speed and confidence measured on all 23: mean 219 ms per image, every image produced text, mean per-word confidence 74.0 to 96.5
- [x] `EVAL_DEBUG=1` on the reliability runner now prints the provider failure, which is what surfaced the rate limit below
- [ ] OCR accuracy against the answer key: blocked, OpenRouter is returning 429 provider_rate_limited account-wide. Re-run `EVAL_REAL_DIR=ocr EVAL_ONLY=real-01,...,real-23 bun scripts/measure-scan-reliability.ts 1` when it clears
- [ ] Split the score by screenshot against photo-of-a-flyer, and decide by the agreed rule: 42+/46 build the cascade, 35-41 use OCR only as a prefilter, under 35 drop it
- Location: `src/server/typesafe/verify.ts`, `scripts/ocr-real-images.ts`, `scripts/measure-scan-reliability.ts`, `scripts/probe-scan-usage.ts`
