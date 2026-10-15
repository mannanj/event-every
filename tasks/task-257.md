### Task 257: Measure field verification read off the screenshot itself
- [x] `scripts/typesafe/client.ts`: `ask` takes image `assets` and sends the images header.
- [x] `scripts/typesafe/judgments.ts`: `verifyQuestions(extracted, source)` - the same verification wording, reading `image` instead of `text`; `verifyFields` unchanged (text eval re-run: 1206/1234, as before).
- [x] `scripts/typesafe/image-verify.ts`: 19 real image cases x date/time corruptions (incl. the -4 h timezone bug and a day-month swap), an other-screenshot control, and a summary-text arm.
- [x] Results in `scripts/typesafe/data/IMAGE-VERIFY.md`: jev-1.14.0 163/163 with a 0.73 / 0.07 margin; control confirms the image is read.
- Location: `scripts/typesafe/`
