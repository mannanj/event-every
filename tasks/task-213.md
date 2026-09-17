### Task 213: Let triage skip non-events and split independent events into parallel scans
- [x] Text submit asks triage first; a null outcome runs the single scan exactly as before
- [x] A confident no-event verdict shows a notice at once instead of paying for a scan
- [x] Independent events split at confident boundaries and scan up to three at a time, first cards arriving early
- [x] URL pages go through the same gate as `url-page` input
- Location: `src/app/page.tsx`
