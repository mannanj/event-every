### Task 53: Meetup.com Event Scraper and Parser
- [ ] Create Meetup.com-specific scraper/parser
- [ ] Extract event details from Meetup pages (title, date, time, location, description)
- [ ] Support Meetup event URLs: `https://www.meetup.com/[group]/events/[id]`
- [ ] Support Meetup group URLs: `https://www.meetup.com/[group]/`
- [ ] Store original event link in event description field
- [ ] Handle Meetup page variations and errors
- [ ] Parse Meetup's structured data or HTML
- [ ] Integrate with batch link processor
- Location: `src/services/meetupScraper.ts`, `src/services/linkProcessor.ts`

**Event Description Format:**
```
[Original event description]

---
Original Event: [link]
```

**Example URLs to support:**
- Event: `https://www.meetup.com/austin-deep-learning/events/307783680/...`
- Group: `https://www.meetup.com/bitcoin-park-austin/`
- Browse: `https://www.meetup.com/find/us--tx--austin/technology/`
