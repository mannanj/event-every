import { describe, expect, test } from 'bun:test';
import { buildEnrichedUrlText, isLowSignalScrape } from '@/services/urlDetector';

const MEET_INVITE = `Google Meeting info:
Civic Signal
Tuesday, September 22 · 7:00 – 8:30pm
Time zone: America/New_York
Google Meet joining info
Video call link: https://meet.google.com/odi-xddv-kez
Or dial: (US) +1 254-218-5862 PIN: 199 901 399#
More phone numbers: https://tel.meet/odi-xddv-kez?pin=2308079664797`;

const MEET_URLS = ['https://meet.google.com/odi-xddv-kez', 'https://tel.meet/odi-xddv-kez?pin=2308079664797'];

// Captured from production on 2026-09-15: Google answers a server-side fetch of a
// Meet link with a redirect to /unsupported and a bot interstitial.
const MEET_BOT_WALLS = [
  {
    url: 'https://meet.google.com/unsupported?meetingCode=odi-xddv-kez&ref=https://meet.google.com/odi-xddv-kez',
    text: "Meet doesn't work on your browser Loading To join the video meeting Visit meet.google.com in Google Chrome, Mozilla Firefox, or Microsoft Edge Download Chrome Download Firefox Download Edge To install and use Meet on a mobile device, go to Google Play or the iTunes Store By joining, you agree to the Terms of Service and Privacy Policy . System info will be sent to confirm you're not a bot.",
    status: 'success' as const,
  },
  {
    url: 'https://meet.google.com/tel/odi-xddv-kez?pin=2308079664797',
    text: "Loading... By joining, you agree to the Terms of Service and Privacy Policy . System info will be sent to confirm you're not a bot.",
    status: 'success' as const,
  },
];

describe('buildEnrichedUrlText', () => {
  test('a Meet invite reaches the model with its links intact and no bot wall', () => {
    const enriched = buildEnrichedUrlText(MEET_INVITE, MEET_URLS, MEET_BOT_WALLS);
    expect(enriched).toContain('Video call link: https://meet.google.com/odi-xddv-kez');
    expect(enriched).toContain('More phone numbers: https://tel.meet/odi-xddv-kez?pin=2308079664797');
    expect(enriched).not.toContain('not a bot');
    expect(enriched).not.toContain('unsupported');
    expect(enriched).not.toContain('Original Event:');
  });

  test('a link whose page could not be fetched still appears in the prose', () => {
    const enriched = buildEnrichedUrlText('Tickets at https://one.test/show tonight.', ['https://one.test/show'], [
      { url: 'https://one.test/show', text: '', status: 'error', error: 'timeout' },
    ]);
    expect(enriched).toBe('Tickets at https://one.test/show tonight.');
  });

  test('a real page is appended after the prose, headed by the link the source wrote', () => {
    const enriched = buildEnrichedUrlText('Tickets at https://one.test/show tonight.', ['https://one.test/show'], [
      { url: 'https://one.test/show?utm=1', text: 'The Empty Bottle presents Midnight Signal, Friday 2 October, doors 8pm. Tickets $15 at the door.', status: 'success' },
    ]);
    expect(enriched).toBe('Tickets at https://one.test/show tonight.\n\nOriginal Event: https://one.test/show\nThe Empty Bottle presents Midnight Signal, Friday 2 October, doors 8pm. Tickets $15 at the door.');
  });

  test('pages follow in the order the links were requested, paired by position', () => {
    const text = 'First www.one.test then https://two.test/path and done.';
    const enriched = buildEnrichedUrlText(text, ['https://www.one.test/', 'https://two.test/path'], [
      { url: 'https://www.one.test/landing', text: 'One: a full event page with a date, a venue and a description long enough to matter.', status: 'success' },
      { url: 'https://two.test/path', text: 'Two: a full event page with a date, a venue and a description long enough to matter.', status: 'success' },
    ]);
    expect(enriched).toBe(`${text}\n\nOriginal Event: https://www.one.test/\nOne: a full event page with a date, a venue and a description long enough to matter.\n\nOriginal Event: https://two.test/path\nTwo: a full event page with a date, a venue and a description long enough to matter.`);
  });

  test('a page title is carried with its text', () => {
    const enriched = buildEnrichedUrlText('https://one.test/show', ['https://one.test/show'], [
      { url: 'https://one.test/show', title: 'Midnight Signal', text: 'Friday 2 October, doors 8pm at The Empty Bottle. Tickets $15 at the door.', status: 'success' },
    ]);
    expect(enriched).toBe('https://one.test/show\n\nOriginal Event: https://one.test/show\nMidnight Signal\nFriday 2 October, doors 8pm at The Empty Bottle. Tickets $15 at the door.');
  });
});

describe('isLowSignalScrape', () => {
  test('recognises the interstitials sites serve to non-browsers', () => {
    for (const wall of MEET_BOT_WALLS) expect(isLowSignalScrape(wall.text)).toBe(true);
    expect(isLowSignalScrape('Just a moment... Checking your browser before accessing the site.')).toBe(true);
    expect(isLowSignalScrape('Please enable JavaScript to continue using this application.')).toBe(true);
    expect(isLowSignalScrape('Loading...')).toBe(true);
    expect(isLowSignalScrape('')).toBe(true);
  });

  test('accepts an ordinary event page, however terse', () => {
    expect(isLowSignalScrape('The Empty Bottle presents Midnight Signal, Friday 2 October, doors 8pm. Tickets $15 at the door.')).toBe(false);
    expect(isLowSignalScrape('Join us June 30 2026 at 6pm at HQ')).toBe(false);
  });
});
