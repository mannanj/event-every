# Field verification read off the screenshot (2026-10-15)

`bun scripts/typesafe/image-verify.ts` (and `TYPESAFE_MODEL=jev-1.14.0 ...`). The 19 real image cases
that have an event and a date (`scripts/eval-images/real`, private and gitignored). Each case's true
date/time, plus corrupted copies: date +3 days, day and month swapped (09/12 read as 12/09, when the
day is 12 or less), time +2 h, and time -4 h (the shipped bug: 10:30 Eastern exported as 06:30). Same
`verifyFields` questions, with `image` in place of `text` (`verifyQuestions(extracted, 'image')`).

| Arm | jev-1.13.0 | jev-1.14.0 |
| --- | --- | --- |
| Image in state | 162/163 (1 correct field flagged) | **163/163** |
| Lowest p on a right field / highest on a wrong one | 0.32 / 0.25 | **0.73 / 0.07** |
| Control: right fields, another event's screenshot | 36/37 read as wrong | 36/37 read as wrong |
| One-line human summary as `text` | 149/163 | 150/163 |

- The control's one "miss" is a real match: the two events both start at 7:00 PM.
- -4 h shift: 18/18 caught on both models. Day-month swap: 9/9.
- The summary arm is not today's production baseline. Production verifies against the scanner's own
  quoted excerpts (Task 232), which this offline set does not have. Some summaries are just "same page
  as real-08", so that arm is a floor, not a fair rival.
- 1.14 reads images better and text worse (see `JEV-1.14.md`), so an image check would pin
  `jev-1.14.0` on its own requests while text stays on 1.13.
- Cost: about 5k input tokens per image request (the Box probe measured 4.2k-5.4k), ~$0.0002 at $0.042/Mtok. Images are a TypeSafe "danger zone"
  feature (`TypeSafe-Danger-Zone-Images: true`) and may change between releases.

19 screenshots is small, and every one is legible. Before wiring this in, run it on the image scans
production actually returns (with the scanner's excerpts) to measure it against what Task 232 does
today.
