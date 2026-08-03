import { describe, expect, mock, test } from 'bun:test';
import {
  RESOLVER_BODY_LIMIT,
  assertAllowedResolverUrl,
  fetchWithResolverPolicy,
  readCappedBody,
} from '../url-policy';

const PUBLIC = 'https://events.example.com/path';

describe('resolver URL policy', () => {
  test('accepts canonical public HTTP and HTTPS URLs and rejects dangerous authority forms', () => {
    expect(assertAllowedResolverUrl(PUBLIC)).toBe(PUBLIC);
    expect(assertAllowedResolverUrl('http://events.example.com:80/path')).toBe('http://events.example.com/path');
    for (const value of [
      'https://user:pass@events.example.com/',
      'https://events.example.com/path#fragment',
      'https://localhost/path',
      'https://intranet/path',
      'https://events.example.com:444/path',
      'ftp://events.example.com/path',
      'https://127.0.0.1/path',
      'https://10.0.0.1/path',
      'https://169.254.169.254/path',
      'https://192.168.1.1/path',
      'https://224.0.0.1/path',
      'https://[::1]/path',
      'https://[fc00::1]/path',
      'https://[fe80::1]/path',
      'https://localhost./path',
      'https://foo.local./path',
      'https://foo.internal./path',
      'https://localhost../path',
      'https://foo.local../path',
      'https://foo.internal../path',
      'https://[fec0::1]/path',
      'https://[::7f00:1]/path',
      'https://[100::1]/path',
      'https://[2001::1]/path',
      'https://[2001:20::1]/path',
      'https://[2002:7f00:1::]/path',
      'https://[3fff::1]/path',
      'https://[5f00::1]/path',
      'https://[64:ff9b::7f00:1]/path',
      'https://events.example.com/#',
      'https://@events.example.com/path',
      ' \nhttps://@events.example.com/path',
      'https:\n//@events.example.com/path',
      'https:////@events.example.com/path',
      `https://events.example.com/${'x'.repeat(2_100)}`,
    ]) expect(() => assertAllowedResolverUrl(value)).toThrow('resolver_url_rejected');
  });

  test('private literal address is rejected', () => {
    expect(() => assertAllowedResolverUrl('https://10.0.0.1/private')).toThrow('resolver_url_rejected');
  });

  test('canonical URL is capped at 2048 bytes', () => {
    expect(() => assertAllowedResolverUrl(`https://events.example.com/${'x'.repeat(2_100)}`)).toThrow('resolver_url_rejected');
  });

  test('private redirect is rejected and every redirect hop is fully revalidated', async () => {
    const seen: string[] = [];
    const fakeFetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(input));
      expect(init?.redirect).toBe('manual');
      if (seen.length === 1) return new Response(null, { status: 302, headers: { location: '/next' } });
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
    });
    await expect(fetchWithResolverPolicy(PUBLIC, new AbortController().signal, fakeFetch as unknown as typeof fetch))
      .rejects.toThrow('resolver_url_rejected');
    expect(seen).toEqual([PUBLIC, 'https://events.example.com/next']);
  });

  test('rejects redirect loops, missing locations, and a fourth redirect', async () => {
    const cases: Array<(url: string, count: number) => Response> = [
      (url) => new Response(null, { status: 302, headers: { location: url } }),
      () => new Response(null, { status: 302 }),
      (_url, count) => new Response(null, { status: 302, headers: { location: `/hop-${count + 1}` } }),
    ];
    for (const responder of cases) {
      let count = 0;
      const fakeFetch = mock(async (input: RequestInfo | URL) => responder(String(input), count++));
      await expect(fetchWithResolverPolicy(PUBLIC, new AbortController().signal, fakeFetch as unknown as typeof fetch))
        .rejects.toThrow('resolver_redirect_rejected');
    }
  });

  test('uses one five-second deadline, forwards caller abort, and sends no ambient credentials', async () => {
    const controller = new AbortController();
    let observed: RequestInit | undefined;
    const fakeFetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      observed = init;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    });
    const pending = fetchWithResolverPolicy(PUBLIC, controller.signal, fakeFetch as unknown as typeof fetch);
    controller.abort(new DOMException('caller cancelled', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(observed?.credentials).toBe('omit');
    expect(observed?.referrer).toBe('');
    expect(new Headers(observed?.headers).get('cookie')).toBeNull();
    expect(new Headers(observed?.headers).get('authorization')).toBeNull();
  });

  test('abort reaches fetch', async () => {
    const controller = new AbortController();
    let exactSignal: AbortSignal | undefined;
    const fakeFetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      exactSignal = init?.signal ?? undefined;
      return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }));
    });
    const pending = fetchWithResolverPolicy(PUBLIC, controller.signal, fakeFetch as unknown as typeof fetch);
    controller.abort(new DOMException('caller cancelled', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(exactSignal?.aborted).toBe(true);
  });

  test('an already-aborted caller performs zero outbound fetches', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('already cancelled', 'AbortError'));
    const fakeFetch = mock(async () => new Response('should not run'));
    await expect(fetchWithResolverPolicy(PUBLIC, controller.signal, fakeFetch as unknown as typeof fetch))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  test('one exact five-second timer spans the redirect chain', async () => {
    const controller = new AbortController();
    const delays: number[] = [];
    let abortForDeadline: (() => void) | undefined;
    let calls = 0;
    const fakeFetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      if (calls === 1) return new Response(null, { status: 302, headers: { location: '/next' } });
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    });
    const pending = fetchWithResolverPolicy(PUBLIC, controller.signal, fakeFetch as unknown as typeof fetch, {
      set(callback, delay) { delays.push(delay); abortForDeadline = callback; return 1; },
      clear() {},
    });
    await Bun.sleep(0);
    if (!abortForDeadline) controller.abort();
    else abortForDeadline();
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(delays).toEqual([5_000]);
    expect(calls).toBe(2);
  });

  test('512 KiB plus one cancels upstream while the exact decoded boundary passes', async () => {
    const exact = new Uint8Array(RESOLVER_BODY_LIMIT);
    await expect(readCappedBody(new Response(exact).body, RESOLVER_BODY_LIMIT, new AbortController().signal))
      .resolves.toHaveLength(RESOLVER_BODY_LIMIT);

    let cancelled = false;
    let sent = false;
    const overflow = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (sent) { controller.close(); return; }
          sent = true;
          controller.enqueue(new Uint8Array(RESOLVER_BODY_LIMIT));
          controller.enqueue(new Uint8Array(1));
        },
        cancel() { cancelled = true; },
      },
      { highWaterMark: 0 },
    );
    await expect(readCappedBody(overflow, RESOLVER_BODY_LIMIT, new AbortController().signal))
      .rejects.toThrow('resolver_body_too_large');
    expect(cancelled).toBe(true);
  });

  test('abort during a pending body read rejects instead of returning partial bytes', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const partial = new ReadableStream<Uint8Array>({
      start(stream) { stream.enqueue(new Uint8Array([1, 2, 3])); },
      cancel() { cancelled = true; },
    });
    const pending = readCappedBody(partial, RESOLVER_BODY_LIMIT, controller.signal);
    await Bun.sleep(0);
    controller.abort(new DOMException('Resolver deadline exceeded', 'TimeoutError'));
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(cancelled).toBe(true);
  });
});
