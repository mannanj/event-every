import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

/**
 * What this endpoint is willing to call things.
 *
 * The upload route takes the media type from whoever uploaded. Echoing it back
 * on the way out would let an uploader choose what the browser executes on
 * eventevery.com - `text/html` here is stored cross-site scripting against the
 * app's own origin, session cookie and all. Self-only today, since both ends
 * need the same session, but "you can only attack yourself" stops being true
 * the moment anything is ever shared.
 *
 * Asserted against the source because the route needs a Cloudflare context to
 * call. The list and the three headers are the whole control; if any of them
 * goes missing, this fails.
 */

const route = readFileSync('src/app/api/attachments/file/route.ts', 'utf8');

describe('the served media type', () => {
  test('is an allowlist, not a denylist', () => {
    // A list of types a browser will NOT execute goes out of date silently.
    expect(route).toContain('const SERVABLE = new Set(');
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'text/calendar', 'text/plain']) {
      expect(route).toContain(`'${type}'`);
    }
  });

  test('anything unrecognised is served as bytes, not as content', () => {
    expect(route).toMatch(/SERVABLE\.has\(stored\) \? stored : 'application\/octet-stream'/);
  });

  test('the stored type is never echoed straight into the header', () => {
    expect(route).toContain("'Content-Type': servableType(file.mimeType)");
    expect(route).not.toMatch(/'Content-Type': file\.mimeType/);
  });
});

describe('the headers that back it up', () => {
  test('sniffing cannot overrule the allowlist', () => {
    expect(route).toContain("'X-Content-Type-Options': 'nosniff'");
  });

  test('nothing from here is treated as a document in this origin', () => {
    expect(route).toContain("'Content-Disposition': 'attachment'");
  });

  test('a shared cache never holds one person’s file', () => {
    expect(route).toContain("'Cache-Control': 'private, no-store'");
  });
});
