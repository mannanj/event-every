### Task 229: A storyboard the features can be re-photographed from

A rerunnable capture of the two new behaviours, written as a story: each page is
the app before an interaction, with the control about to be used ringed, and a
caption that says what is coming so the next page pays it off.

Driving it against the real app with the e2e mocks means the document is
generated rather than assembled, so it can be rerun later and produce a current
one instead of a stale screenshot pasted into a doc.

- [x] `storyboard/features.spec.ts`: settle, mark, shoot, unmark, act, one interaction per page
- [x] The mark is drawn into the live page as a fixed overlay, so it photographs with the app
- [x] Scroll the marked control into frame first, since Review sits below the fold
- [x] `storyboard/build-pdf.mjs` assembles the shots and captions into a PDF
- [x] Its own Playwright config, kept out of `./e2e` so the normal run never picks it up
- Location: `storyboard/`, `playwright.storyboard.config.ts`

17 pages: removing a card and undoing it, one undoable removal at a time, the
section outliving its last card, and Recent holding one row across a repeat but
two across an edit.
