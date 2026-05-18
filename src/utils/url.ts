export function normalizeUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  // Strip whitespace + zero-width chars (BOM, ZWJ, ZWNJ) that LLM/OCR may emit
  const cleaned = raw.replace(/[\s​-‍﻿]+/g, '').trim();
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

export function isValidUrl(raw?: string | null): boolean {
  return normalizeUrl(raw) !== undefined;
}
