import { detectURLs } from '@/services/urlDetector';
import { scrapeURLsBatch } from '@/services/webScraper';
import type { LinkSteps } from '@/services/readSources';

/** The browser's transport for the shared reading path: the site's own routes. */
export function siteLinkSteps(signal: AbortSignal): Pick<LinkSteps, 'detect' | 'scrape'> {
  return {
    detect: (text) => detectURLs(text, signal),
    scrape: async (urls, capability) => (await scrapeURLsBatch(urls, signal, capability)).results,
  };
}
