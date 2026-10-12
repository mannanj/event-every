import { describe, expect, test } from 'bun:test';
import { linkForPhotos, readLinks, readText, videoCallLink, withTypedLink, type TextSteps } from '@/services/readSources';
import { buildEnrichedUrlText, detectUrlsDeterministically } from '@/services/urlDetector';
import type { ScrapedContent } from '@/services/webScraper';

// Captured 2026-10-12: a Luma personal join link, fetched by a server, lands on
// Google Meet's "unsupported browser" page with the room in `ref`.
const LUMA = 'https://luma.com/join/g-XQk0mp1Mtd25IB5';
const MEET_LANDING = 'https://meet.google.com/unsupported?meetingCode=tye-iekt-ttn&ref=https://meet.google.com/tye-iekt-ttn';
const MEET_PAGE: ScrapedContent = {
  url: MEET_LANDING,
  title: 'Meet',
  text: "Google Meet doesn't work on your browser. Confirm you're not a robot.",
  status: 'success',
};

describe('videoCallLink', () => {
  test('unwraps Meet\'s unsupported page to the room', () => {
    expect(videoCallLink(MEET_LANDING)).toBe('https://meet.google.com/tye-iekt-ttn');
    expect(videoCallLink('https://meet.google.com/tye-iekt-ttn')).toBe('https://meet.google.com/tye-iekt-ttn');
  });

  test('other call hosts by room path; a home page or an ordinary site is not a call', () => {
    expect(videoCallLink('https://us02web.zoom.us/j/123456789')).toBe('https://us02web.zoom.us/j/123456789');
    expect(videoCallLink('https://zoom.us/')).toBeNull();
    expect(videoCallLink('https://meet.google.com/unsupported')).toBeNull();
    expect(videoCallLink('https://luma.com/event/abc')).toBeNull();
    expect(videoCallLink('not a url')).toBeNull();
  });
});

describe('a photo with a link typed beside it', () => {
  const steps = (results: ScrapedContent[]) => ({
    detect: async (text: string) => detectUrlsDeterministically(text),
    scrape: async () => results,
  });

  test('the join link\'s call becomes the event\'s link', async () => {
    const links = await readLinks(LUMA, steps([MEET_PAGE]));
    expect(linkForPhotos(links!)).toBe('https://meet.google.com/tye-iekt-ttn');
  });

  test('a link that is not a call is kept as written', async () => {
    const links = await readLinks('see https://luma.com/event/abc', steps([
      { url: 'https://luma.com/event/abc', text: 'Summit dry run, Oct 12', status: 'success' },
    ]));
    expect(linkForPhotos(links!)).toBe('https://luma.com/event/abc');
  });

  test('a failed fetch still keeps the typed link', async () => {
    const links = await readLinks(LUMA, steps([{ url: LUMA, text: '', status: 'error', error: 'x' }]));
    expect(linkForPhotos(links!)).toBe(LUMA);
  });

  test('no link, no change; a link read off the photo wins', () => {
    const events = [{ title: 'A' }, { title: 'B', url: 'https://on-the-poster.example' }];
    expect(withTypedLink(events, null)).toBe(events);
    expect(withTypedLink(events, 'https://meet.google.com/tye-iekt-ttn')).toEqual([
      { title: 'A', url: 'https://meet.google.com/tye-iekt-ttn' },
      { title: 'B', url: 'https://on-the-poster.example' },
    ]);
  });
});

test('an interstitial page adds no text, but its call link is kept for the model', () => {
  const text = buildEnrichedUrlText(`Dry run Monday 7pm ${LUMA}`, [LUMA], [MEET_PAGE]);
  expect(text).toContain('Video call link: https://meet.google.com/tye-iekt-ttn');
  expect(text).not.toContain('robot');
});

describe('readText: the site\'s text path, step for step', () => {
  const base = (over: Partial<TextSteps<string>> = {}): TextSteps<string> & { scanned: string[]; phases: string[] } => {
    const scanned: string[] = [];
    const phases: string[] = [];
    return {
      scanned,
      phases,
      detect: async (text) => detectUrlsDeterministically(text),
      scrape: async () => [],
      triage: async () => null,
      scan: async (text) => {
        scanned.push(text);
        return [text];
      },
      onPhase: (p) => phases.push(p.phase),
      ...over,
    };
  };

  test('no triage answer is one scan of the whole text', async () => {
    const steps = base();
    expect(await readText('Dinner Friday 7pm', steps)).toEqual({ kind: 'scanned', items: ['Dinner Friday 7pm'], split: false });
    expect(steps.phases).toEqual(['detecting', 'extracting']);
  });

  test('links are fetched and folded in before the scan', async () => {
    const steps = base({
      scrape: async () => [{ url: 'https://a.com/e', title: 'Talk', text: 'Talk on Oct 20 at 6pm', status: 'success' }],
    });
    await readText('come https://a.com/e', steps);
    expect(steps.scanned[0]).toContain('Original Event: https://a.com/e\nTalk\nTalk on Oct 20 at 6pm');
    expect(steps.phases).toEqual(['detecting', 'fetching', 'extracting']);
  });

  test('triage can skip, or split into chunks scanned on their own', async () => {
    const outcome = (decision: object) => ({ available: true as const, decision, shape: 'x', hasEvent: 1, complete: null }) as never;
    expect(await readText('hello', base({ triage: async () => outcome({ kind: 'skip', reason: 'no_event' }) }))).toEqual({ kind: 'skip' });
    const steps = base({ triage: async () => outcome({ kind: 'split', chunks: ['a Mon', 'b Tue'] }) });
    expect(await readText('a Mon\n\nb Tue', steps)).toEqual({ kind: 'scanned', items: ['a Mon', 'b Tue'], split: true });
  });

  test('triage\'s typical duration reaches a single scan', async () => {
    let seen: number | null = -1;
    await readText('Coffee Tue 9am', base({
      triage: async () => ({ available: true, decision: { kind: 'single' }, shape: 'one_event', hasEvent: 1, complete: null, durationMinutes: 30 }) as never,
      scan: async (_t, o) => { seen = o.durationMinutes; return []; },
    }));
    expect(seen).toBe(30);
  });

  test('cancelled mid-way stops before scanning', async () => {
    const steps = base({ cancelled: () => true });
    expect(await readText('x', steps)).toEqual({ kind: 'cancelled' });
    expect(steps.scanned).toEqual([]);
  });
});
