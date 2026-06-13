export function normalizeUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  // Strip only zero-width junk (BOM, ZWSP/ZWNJ/ZWJ, word-joiner) that LLM/OCR may emit.
  // Do NOT strip ASCII spaces — a space in a path is real and must be percent-encoded by new URL(), not deleted.
  const cleaned = raw.replace(/[​-‍⁠﻿]/g, '').trim();
  if (!cleaned) return undefined;

  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export interface UrlDisplayParts {
  hostname: string;   // www. stripped
  path: string;       // pathname + search
  isMeetup: boolean;
}

export function getUrlDisplayParts(url: string): UrlDisplayParts | null {
  const parsed = safeParseUrl(url);
  if (!parsed) return null;
  const hostname = parsed.hostname.replace(/^www\./, '');
  return {
    hostname,
    path: parsed.pathname + parsed.search,
    isMeetup: hostname.includes('meetup.com'),
  };
}
