### Task 207: Keep links in the scan text, make Discard all discard, let the points outrank the all-day flag

Reported 2026-09-15 from production: a pasted Google Meet invite came back as two cards at
12:00 AM, and "Discard all" left every card on screen.

- [x] Send the source text to the model with its links intact, and drop fetched pages that are bot interstitials
- [x] Restore the pre-scanner "Cancel / Discard all" semantics: abort the work and clear what it produced
- [x] Derive all-day from the temporal points, not the model's flag, and give a zero-length event its default duration
- [x] Pin each with a unit test, and the discard with a browser test
- Location: `src/services/urlDetector.ts`, `src/services/reviewEvent.ts`, `src/app/page.tsx`,
  `src/services/__tests__/urlEnrichment.test.ts`, `src/services/__tests__/reviewEvent.test.ts`,
  `e2e/discard-all.spec.ts`, `e2e/url-scrape.spec.ts`

#### What was reproduced, independently of the previous session's notes

Driving eventevery.com with Playwright and intercepting `/api/scan` showed the text the model
actually received. Both Meet links had been cut out of the prose, leaving `Video call link:`
with nothing after it, and two "Original Event" blocks had been appended containing Google's
server-side interstitial ("Meet doesn't work on your browser ... System info will be sent to
confirm you're not a bot"), headed by the `/unsupported?meetingCode=` redirect URL. On that run
the model still found the time but returned the redirect as the event link. The result is
nondeterministic; the earlier session saw two candidates with no time at all.

Git history: the pre-scanner enrichment (`5bb24f7~1`) also stripped links and appended
scraped pages unfiltered, so neither version handled this. The old cancel handler cleared
`unsavedEvents`, `batchProcessing`, `imageProcessingStatuses` and `urlProcessingStatus`; the
scanner rewrite kept only the abort. That handler is restored. The old
`convertParsedToCalendarEvent` trusted the model's `allDay` and only fixed `end < start`, so
`reviewEvent.ts` is a fair port of it and the fix is made there.

#### The fix

`buildEnrichedUrlText` now returns the source exactly as written, followed by one block per
fetched page in request order, each headed by the link the source wrote (the scraper reports
where it landed, not what it asked for, so pairing is by position). `isLowSignalScrape` drops
interstitials by wording, with a 12-character floor so a terse real page survives.

`reviewDraftToCalendarEvent`: a date with no time is all-day even under `allDay: false`, a timed
start is never all-day even under `allDay: true`, and `end <= start` gets the default duration.

#### Still open, not attempted here

- Eight e2e spec files still target the review UI deleted in `f72a4e5`, not the two that commit
  listed. See the run log summary in the commit message of the follow-up.
- Whether an all-day `end` date from the Scanner is inclusive or exclusive is unverified; a
  multi-day all-day range may export one day short.
- `/dev/local-model` and `/dev/gpu-probe` are untracked spike pages that the last deploy
  published; production still serves the previous Worker version until this is deployed.
