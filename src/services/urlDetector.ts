import { normalizeUrl } from '@/utils/url';
import type { ScrapedContent } from '@/services/webScraper';

export interface URLDetectionResult {
  urls: string[];
  remainingText: string;
  hasUrls: boolean;
  resolverCapability?: string;
}

export function detectUrlsDeterministically(text: string): URLDetectionResult {
  const urls: string[] = [];
  const parts: string[] = [];
  let cursor = 0;
  for (const match of text.matchAll(rawUrlPattern)) {
    if (urls.length >= 10) break;
    const index = match.index ?? 0;
    const source = sourceUrlToken(match[0]);
    const normalized = normalizeUrl(source);
    if (!normalized) continue;
    urls.push(normalized);
    parts.push(text.slice(cursor, index));
    cursor = index + source.length;
  }
  parts.push(text.slice(cursor));
  return { urls, remainingText: parts.join(''), hasUrls: urls.length > 0 };
}

const rawUrlPattern = /(?:https?:\/\/|www\.)[^\s<>]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>]*)?/gi;
const terminalPunctuation = /[.,;:!?]+$/;
function sourceUrlToken(token: string): string {
  let trimmed = token.replace(terminalPunctuation, '');
  const wrappers: ReadonlyArray<readonly [string, string]> = [['(', ')'], ['[', ']'], ['{', '}']];
  while (trimmed.length > 0) {
    const closing = trimmed.at(-1)!;
    const wrapper = wrappers.find(([, close]) => close === closing);
    if (!wrapper) break;
    const [open] = wrapper;
    const opens = [...trimmed].filter((character) => character === open).length;
    const closes = [...trimmed].filter((character) => character === closing).length;
    if (closes <= opens) break;
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

// Sites answer a server-side fetch with an interstitial more often than with the
// page: Google Meet redirects to /unsupported and prints "confirm you're not a
// bot", Cloudflare prints "Just a moment". Captured from production 2026-09-15.
// Sending that to the model buries the source under noise, and the redirect URL
// in the block then gets picked as the event link. Such a page adds nothing;
// the link itself, left in the prose, is the evidence.
const LOW_SIGNAL_PATTERNS = [
  /not a (ro)?bot/i,
  /doesn'?t work on your browser/i,
  /enable javascript/i,
  /verify (that )?you'?re? (a )?human/i,
  /just a moment/i,
  /checking your browser/i,
  /unusual traffic/i,
  /access denied/i,
  /captcha/i,
];
// Low on purpose: a terse but real page ("Join us June 30 at 6pm at HQ") must
// survive, and the interstitials are caught by wording, not length.
const MIN_USEFUL_SCRAPE_LENGTH = 12;

export function isLowSignalScrape(text: string): boolean {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.replace(/^loading(\.{3}|\u2026)?$/i, '').length < MIN_USEFUL_SCRAPE_LENGTH) return true;
  return LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * The source text goes to the model exactly as written, links included, so a
 * "Video call link: https://..." line keeps its link and the model can name it.
 * Fetched pages follow in source order, each headed by the link the source
 * wrote. `results` comes back from the scraper in the same order as the links it
 * was given, and a fetched result reports where it landed, not what was asked,
 * so the pairing is by position.
 */
export function buildEnrichedUrlText(input: string, detectedUrls: readonly string[], results: readonly ScrapedContent[]): string {
  const alignedByPosition = results.length === detectedUrls.length;
  const blocks = results.flatMap((result, index) => {
    if (result.status !== 'success' || isLowSignalScrape(result.text)) return [];
    const sourceUrl = normalizeUrl(alignedByPosition ? detectedUrls[index] : result.url) ?? result.url;
    const body = result.title ? `${result.title}\n${result.text}` : result.text;
    return [`Original Event: ${sourceUrl}\n${body}`];
  });
  return [input.trim(), ...blocks].filter(Boolean).join('\n\n');
}

export async function detectURLs(text: string, signal?: AbortSignal): Promise<URLDetectionResult> {
  try {
    const response = await fetch('/api/detect-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to detect URLs' }));
      throw new Error(errorData.error || 'Failed to detect URLs');
    }

    const result = await response.json() as URLDetectionResult;
    return result;
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw error;
    }
    console.error('URL detection error:', error);
    throw error instanceof Error
      ? error
      : new Error('Failed to detect URLs');
  }
}
