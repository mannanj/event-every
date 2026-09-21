import {
  RESOLVER_BODY_LIMIT,
  assertAllowedResolverUrl,
  fetchWithResolverPolicy,
} from '@/platform/resolver/url-policy';
import { MAX_SCANNER_IMAGE_BYTES } from '@/server/scanner/image';

/**
 * Fetching something an assistant pointed at, rather than sent.
 *
 * A model cannot hand over a photograph: it would have to emit a megabyte of
 * base64 accurately, token by token, and no host forwards an attached file to a
 * remote MCP server. So a picture reaches us one of two ways - a client that
 * runs code reads the file and passes the bytes, or anyone at all passes a URL
 * and this fetches it.
 *
 * THE URL IS THE DANGEROUS HALF. "Fetch whatever this says" inside a Worker
 * that sits next to the account database is the classic server-side request
 * forgery shape, and the fact that an assistant chose the URL rather than a
 * person does not make it safer - it makes it easier to arrange, since a model
 * can be talked into passing one. So this does not call `fetch`. It goes
 * through the same resolver policy the URL-scanning feature already uses, which
 * refuses non-public addresses, pins the scheme, bounds the deadline and caps
 * the body.
 */

export class IntakeError extends Error {}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 8192) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
  }
  return btoa(binary);
}

/**
 * An image URL as the data URL the scanner takes.
 *
 * The media type comes from the RESPONSE, never from the URL's extension: a
 * path ending in .png says nothing about what a server actually returned.
 */
async function guarded<T>(
  url: string,
  signal: AbortSignal,
  read: (response: Response) => Promise<T>,
  whenUnreachable: string,
): Promise<T> {
  let safe: string;
  try {
    safe = assertAllowedResolverUrl(url);
  } catch {
    throw new IntakeError('That link cannot be fetched.');
  }

  let result;
  try {
    result = await fetchWithResolverPolicy(safe, signal);
  } catch {
    throw new IntakeError(whenUnreachable);
  }

  try {
    if (!result.response.ok) throw new IntakeError(`That link answered ${result.response.status}.`);
    return await read(result.response);
  } finally {
    // Always: the policy arms a deadline timer and an abort listener, and
    // leaving them set leaks a timer per call in a long-lived isolate.
    result.close();
  }
}

export async function fetchImageAsDataUrl(url: string, signal: AbortSignal): Promise<string> {
  return guarded(
    url,
    signal,
    async (response) => {
      // The media type comes from the RESPONSE, never from the URL's extension:
      // a path ending in .png says nothing about what a server returned.
      const mediaType = (response.headers.get('content-type') ?? '')
        .split(';')[0]!
        .trim()
        .toLowerCase();
      if (!IMAGE_TYPES.has(mediaType)) {
        throw new IntakeError('That link is not a PNG, JPEG or WebP image.');
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) throw new IntakeError('That image was empty.');
      if (buffer.byteLength > MAX_SCANNER_IMAGE_BYTES) {
        throw new IntakeError('That image is too large to read.');
      }

      return `data:${mediaType};base64,${base64(new Uint8Array(buffer))}`;
    },
    'That image could not be fetched.',
  );
}

/** A page's text, for the link-scanning path. Bounded by the resolver policy. */
export async function fetchPageText(url: string, signal: AbortSignal): Promise<string> {
  return guarded(
    url,
    signal,
    async (response) => {
      const text = (await response.text()).slice(0, RESOLVER_BODY_LIMIT);
      if (!text.trim()) throw new IntakeError('That page had nothing to read.');
      return text;
    },
    'That page could not be fetched.',
  );
}

export function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
    return bytes;
  } catch {
    return null;
  }
}

export { base64 as encodeBase64 };
