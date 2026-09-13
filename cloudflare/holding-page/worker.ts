/**
 * Holding-page Worker — served while the app itself is unavailable.
 *
 * Deliberately standalone: no bindings, no imports beyond the status strings,
 * no build step. It exists to answer when the application cannot, so anything
 * it depended on would be a thing that can take it down too.
 */
import { statusResponse } from '../../src/lib/statusPages';

export default {
  fetch(request: Request): Response {
    const { pathname } = new URL(request.url);

    // Crawlers ask for these constantly; answering plainly keeps the 503 out
    // of the logs for requests that were never going to render a page.
    if (pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    if (pathname === '/favicon.ico') {
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    }

    // Every other path, including the API, answers 503 with Retry-After so
    // calendars and crawlers treat this as temporary rather than deleted.
    return statusResponse('resting');
  },
} satisfies ExportedHandler;
