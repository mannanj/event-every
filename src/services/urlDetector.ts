import { emitIfCommunityLimited } from '@/utils/communityLimit';
import { normalizeUrl } from '@/utils/url';
import type { ScrapedContent } from '@/services/webScraper';

export interface URLDetectionResult {
  urls: string[];
  remainingText: string;
  hasUrls: boolean;
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

/** Replaces source URL occurrences in source order, even when the detector normalizes/reorders them. */
export function buildEnrichedUrlText(input: string, detectedUrls: readonly string[], remainingText: string, results: readonly ScrapedContent[]): string {
  const wanted = new Set(detectedUrls.map((url) => normalizeUrl(url)).filter((url): url is string => url !== null));
  const successfulByUrl = new Map<string, number[]>();
  for (const [resultIndex, result] of results.entries()) {
    const normalized = normalizeUrl(result.url);
    if (normalized && result.status === 'success') successfulByUrl.set(normalized, [...(successfulByUrl.get(normalized) ?? []), resultIndex]);
  }
  const blocks: string[] = [];
  const sourceParts: string[] = [];
  const usedResultIndexes = new Set<number>();
  let cursor = 0;
  for (const match of input.matchAll(rawUrlPattern)) {
    const raw = sourceUrlToken(match[0]); const normalized = normalizeUrl(raw);
    if (!normalized || !wanted.has(normalized)) continue;
    const index = match.index ?? 0;
    const prose = input.slice(cursor, index).trim();
    if (prose) sourceParts.push(prose);
    const available = successfulByUrl.get(normalized);
    const resultIndex = available?.shift();
    if (resultIndex !== undefined) {
      const result = results[resultIndex];
      usedResultIndexes.add(resultIndex);
      const block = `Original Event: ${normalized}\n${result.text}`;
      blocks.push(block);
      sourceParts.push(block);
    }
    // Leave sentence punctuation behind as prose after the corresponding block.
    cursor = index + raw.length;
  }
  const tail = input.slice(cursor).trim();
  if (tail) sourceParts.push(tail);
  const sourceProse = sourceParts.filter((part) => !part.startsWith('Original Event:')).join(' ');
  const normalizeWhitespace = (value: string) => {
    let normalized = value.replace(/\s+/g, ' ').trim();
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']] as const) {
      normalized = normalized.replaceAll(`${open} ${close}`, `${open}${close}`);
    }
    return normalized;
  };
  const unmatchedBlocks = results.flatMap((result, resultIndex) => {
    if (result.status !== 'success' || usedResultIndexes.has(resultIndex)) return [];
    const normalized = normalizeUrl(result.url);
    return normalized ? [`Original Event: ${normalized}\n${result.text}`] : [];
  });
  // The detector owns prose. Only preserve source interleaving when it agrees with that contract.
  if (normalizeWhitespace(sourceProse) === normalizeWhitespace(remainingText)) {
    return [...sourceParts, ...unmatchedBlocks].join('\n\n');
  }
  return [remainingText.trim(), ...blocks, ...unmatchedBlocks].filter(Boolean).join('\n\n');
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
      await emitIfCommunityLimited(response);
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
