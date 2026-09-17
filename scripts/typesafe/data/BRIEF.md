# Brief: synthetic eval data for Event Every x TypeSafe

Event Every converts a photo, screenshot, pasted text, or URL into a calendar event.
Inputs are almost always real events. The risky failure is a confident but WRONG card:
wrong date, wrong time, wrong location, a bad title, or a wrong all-day flag.

We are testing three TypeSafe (System One / Jev) judgments that run AFTER extraction:
  A. all-day resolver  - Noul: does this event start at a specific clock time?
  B. field verification - 3 Nouls: does extracted date / time / location match the text?
  C. title selection   - Choice over code-extracted candidate phrases, plus "none of these"

## Output: a JSON array, one object per case, written to the file you are told to write.

{
  "id": "short-unique-id",
  "source": "text" | "ocr" | "email" | "sms" | "invite" | "poster" | "web",
  "text": "the raw input as a user would paste it, or as OCR would produce it",
  "referenceDate": "2026-09-16",
  "truth": {
    "title": "short calendar title, the occasion itself, no date/time/place",
    "date": "YYYY-MM-DD",
    "time": "HH:MM" | null,          // null means all-day / no start time stated
    "location": "string" | null,
    "allDay": true | false
  },
  "hard": "one line on what makes this case hard, or 'clean'"
}

## Coverage to hit (aim for the mix, not just the easy end)
- OCR noise: 0/O, 1/l/I swaps, dropped spaces, line breaks mid-phrase, stray header/footer text
- Email chains with quoted history, signatures, "Sent from my iPhone"
- Screenshots of Google/Outlook invites with dial-in lines and links
- Posters and flyers: ALL CAPS, "doors 8pm / show 9pm", "$25 adv", sponsor lines
- Text threads with chatter around the event ("still on?", "yes see you there")
- Web listing text: nav links, "add to calendar", ticket prices, multiple dates listed but one intended
- Dates: no year, DD/MM vs MM/DD with a locale hint, ordinal words, ISO, weekday only, "next Thursday"
- Times: 24h, "half past three", noon, midnight, a corrected time ("actually make it 4pm"), ranges
- All-day items: holidays, deadlines, closures, birthdays, "all day", multi-day ranges
- Timezones stated (EST, CET, PT/ET pairs) and implied by a city
- Locations: room names, addresses, venues, "Zoom", "Google Meet", a city only
- Titles: buried in noise, split across lines, in caps, preceded by "JOIN US!" or "RE:"

Do NOT include non-events (declined invitations, grocery lists). Every case is a real event.
Do NOT copy the examples in this brief verbatim. Write fresh, realistic text.
Use hyphens, never em dashes, inside "text" and "title".
