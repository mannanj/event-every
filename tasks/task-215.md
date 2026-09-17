### Task 215: Understand the long timezone names calendar invites print
- [x] Windows display names such as "Eastern Time (US & Canada)" and plain names such as "Pacific Time" resolve to their IANA zone
- [x] A name beside an offset keeps its DST rules instead of freezing at the offset
- [x] Regression test for the real interview email that was exported at 06:30 instead of 10:30 Eastern
- Location: `src/utils/timezone.ts`, `src/utils/__tests__/timezone.test.ts`, `src/services/__tests__/reviewEvent.test.ts`
