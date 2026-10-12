import { buildEnrichedUrlText, type URLDetectionResult } from '@/services/urlDetector';
import type { ScrapedContent } from '@/services/webScraper';
import type { TriageOutcome } from '@/services/scanTriage';
import { mapWithConcurrency } from '@/utils/concurrency';
import { videoCallLink } from '@/utils/videoCall';

export { videoCallLink };

/**
 * THE ONE READING PATH. What someone typed and the photos beside it go
 * through these steps whether they were given to this site's input or to the
 * compact one another app embeds (through the MCP `read_into_events` tool).
 * Only the transport differs - the browser calls the routes, the server calls
 * the functions behind them - so the two cannot read the same input
 * differently.
 *
 *   text alone        find links -> fetch their pages -> triage -> scan (once, or split)
 *   photos (+ text)   scan each photo; the links in the text are fetched the
 *                     same way and the event's link comes from them
 *
 * A photo with words beside it used to drop the words: the screenshot of an
 * invite and the join link typed above it are one event, and the link was the
 * part that mattered.
 */

export const IMAGE_SCAN_CONCURRENCY = 1;
export const TEXT_SCAN_CONCURRENCY = 1;

export type ReadPhase =
  | { phase: 'detecting' }
  | { phase: 'fetching'; urlCount: number }
  | { phase: 'extracting'; chunks?: number };

export interface LinkSteps {
  detect(text: string): Promise<URLDetectionResult>;
  scrape(urls: string[], resolverCapability?: string): Promise<ScrapedContent[]>;
  onPhase?(phase: ReadPhase): void;
  cancelled?(): boolean;
}

export interface TextSteps<R> extends LinkSteps {
  triage(text: string, source: 'paste' | 'url-page'): Promise<TriageOutcome | null>;
  /** `durationMinutes` is triage's guess for an event whose source states no end. */
  scan(text: string, options: { quietWhenEmpty: boolean; durationMinutes: number | null }): Promise<R[]>;
}

export type TextReadOutcome<R> =
  | { kind: 'cancelled' }
  | { kind: 'skip' }
  | { kind: 'scanned'; items: R[]; split: boolean };

/** Links in the text, with their pages fetched. Empty when there are none. */
export interface LinkContext {
  urls: string[];
  results: ScrapedContent[];
  hasUrls: boolean;
}

export async function readLinks(text: string, steps: LinkSteps): Promise<LinkContext | null> {
  steps.onPhase?.({ phase: 'detecting' });
  const detection = await steps.detect(text);
  if (steps.cancelled?.()) return null;
  if (!detection.hasUrls || detection.urls.length === 0) return { urls: [], results: [], hasUrls: false };
  steps.onPhase?.({ phase: 'fetching', urlCount: detection.urls.length });
  const results = await steps.scrape(detection.urls, detection.resolverCapability);
  if (steps.cancelled?.()) return null;
  return { urls: detection.urls, results, hasUrls: true };
}

/** Text with no photo: the path the site's input has always taken. */
export async function readText<R>(text: string, steps: TextSteps<R>): Promise<TextReadOutcome<R>> {
  const links = await readLinks(text, steps);
  if (!links) return { kind: 'cancelled' };
  const combined = links.hasUrls ? buildEnrichedUrlText(text, links.urls, links.results) : text;
  if (!combined.trim()) {
    throw new Error(
      links.hasUrls
        ? 'Unable to extract content from the provided URLs. Please check the URLs and try again.'
        : 'Please enter some text or URLs to process.',
    );
  }

  steps.onPhase?.({ phase: 'extracting' });
  // Triage decides when and how many scans run, never what they return.
  // A null outcome (no key, slow, or failed) is the single scan as before.
  const triage = await steps.triage(combined, links.hasUrls ? 'url-page' : 'paste');
  if (steps.cancelled?.()) return { kind: 'cancelled' };
  const decision = triage?.decision ?? { kind: 'single' as const };
  if (decision.kind === 'skip') return { kind: 'skip' };
  if (decision.kind === 'split') {
    steps.onPhase?.({ phase: 'extracting', chunks: decision.chunks.length });
    const perChunk = await mapWithConcurrency(decision.chunks, TEXT_SCAN_CONCURRENCY, (chunk) =>
      steps.scan(chunk, { quietWhenEmpty: true, durationMinutes: null }));
    return { kind: 'scanned', items: perChunk.flat(), split: true };
  }
  const items = await steps.scan(combined, { quietWhenEmpty: false, durationMinutes: triage?.durationMinutes ?? null });
  return { kind: 'scanned', items, split: false };
}

/**
 * The link a photo's event takes from the words typed beside it: the call a
 * link lands on first, else the first link as written. Null when the text has
 * no link.
 */
export function linkForPhotos(links: LinkContext): string | null {
  if (!links.hasUrls) return null;
  for (const [index, source] of links.urls.entries()) {
    const call = videoCallLink(links.results[index]?.status === 'success' ? links.results[index].url : source)
      ?? videoCallLink(source);
    if (call) return call;
  }
  return links.urls[0] ?? null;
}

/** A photo's event keeps a link it read off the photo; otherwise it takes the typed one. */
export function withTypedLink<E extends { url?: string }>(events: E[], link: string | null): E[] {
  if (!link) return events;
  return events.map((event) => (event.url ? event : { ...event, url: link }));
}
