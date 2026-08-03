export const RESOLVER_TEXT_MAX_BYTES = 100_000;
export const RESOLVER_TITLE_MAX_BYTES = 512;
const encoder = new TextEncoder();

export function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8Bytes(value) <= maxBytes) return value;
  const points = Array.from(value);
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (utf8Bytes(points.slice(0, middle).join('')) <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return points.slice(0, low).join('');
}

function utf8Bytes(value: string): number {
  let total = 0;
  for (let index = 0; index < value.length;) {
    let end = Math.min(index + 32_768, value.length);
    if (end < value.length && /[\ud800-\udbff]/.test(value[end - 1]!) && /[\udc00-\udfff]/.test(value[end]!)) end--;
    total += encoder.encode(value.slice(index, end)).byteLength;
    index = end;
  }
  return total;
}

export function sanitizeResolvedContent(value: string, mediaType: 'text/html' | 'text/plain' = 'text/html'): Readonly<{ text: string; title?: string }> {
  if (mediaType === 'text/plain') return { text: truncateUtf8(normalize(value), RESOLVER_TEXT_MAX_BYTES) };
  const titleMatch = value.match(/<title\b[^>]*>([\s\S]*?)(?:<\/title\s*>|$)/i);
  const title = titleMatch ? normalize(decodeEntities(stripTags(titleMatch[1]))) : '';
  const bodyMatch = value.match(/<body\b[^>]*>([\s\S]*?)(?:<\/body\s*>|$)/i);
  let content = bodyMatch?.[1] ?? value;
  content = content
    .replace(/<!--(?:[\s\S]*?)(?:-->|$)/g, ' ')
    .replace(/<(?:script|style|noscript|template|svg)\b[^>]*>[\s\S]*?(?:<\/(?:script|style|noscript|template|svg)\s*>|$)/gi, ' ')
    .replace(/<title\b[^>]*>[\s\S]*?(?:<\/title\s*>|$)/gi, ' ');
  const text = normalize(decodeEntities(stripTags(content)));
  return {
    ...(title ? { title: truncateUtf8(title, RESOLVER_TITLE_MAX_BYTES) } : {}),
    text: truncateUtf8(text, RESOLVER_TEXT_MAX_BYTES),
  };
}

function stripTags(value: string): string { return value.replace(/<[^>]*(?:>|$)/g, ' '); }
function normalize(value: string): string { return value.replace(/\s+/gu, ' ').trim(); }

function decodeEntities(value: string): string {
  const named: Readonly<Record<string, string>> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (_all, decimal: string | undefined, hexadecimal: string | undefined, name: string | undefined) => {
    if (decimal || hexadecimal) {
      const codePoint = Number.parseInt(decimal ?? hexadecimal!, decimal ? 10 : 16);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : '\ufffd';
    }
    return named[name!.toLowerCase()] ?? `&${name};`;
  });
}
