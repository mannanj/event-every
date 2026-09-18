/**
 * Measures the real scan request: how many prompt tokens the fixed system
 * prompt plus strict schema cost, how many the image adds, and how many the
 * answer takes. Wraps fetch to ask OpenRouter for usage on the same call.
 *   bun scripts/probe-scan-usage.ts real/real-01.png real/real-13.png
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { scanSource } from '@/server/scanner/scan';
import { createEventEveryOpenRouterTransport } from '@/server/scanner/transport';
import { callOpenRouter } from '@/platform/provider/transport';
import { createOpenRouterVisionProvider } from '@event-every/scanner/openrouter';

const key = readFileSync(`${import.meta.dir}/../.env.local`, 'utf8').split('\n').find((l) => l.startsWith('OPENROUTER_API_KEY='))!.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const CONTEXT = { nowMs: Date.parse('2026-09-15T16:00:00-04:00'), timeZone: 'America/New_York' } as const;

const realFetch = globalThis.fetch;
let last: { bodyBytes: number; usage?: Record<string, unknown> } = { bodyBytes: 0 };
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
  body.usage = { include: true };
  const schema = JSON.stringify((body.response_format as { json_schema?: { schema?: unknown } })?.json_schema?.schema ?? '');
  last = { bodyBytes: String(init?.body).length };
  const res = await realFetch(input, { ...init, body: JSON.stringify(body) });
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    last.usage = { ...(parsed.usage ?? {}), schemaChars: schema.length };
    if (process.env.PROBE_DUMP) {
      const content = String(parsed.choices?.[0]?.message?.content ?? '');
      const obj = JSON.parse(content) as Record<string, unknown>;
      const share = (v: unknown) => JSON.stringify(v).length;
      const total = content.length;
      const rows: string[] = [];
      const walk = (o: unknown, path: string) => {
        if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o as Record<string, unknown>)) { const n = share(v); if (n > total * 0.04) rows.push(`${(path + '.' + k).padEnd(40)} ${String(Math.round(100 * n / total)).padStart(3)}%`); if (path.split('.').length < 3) walk(v, path + '.' + k); }
        if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`));
      };
      walk(obj, '$');
      console.log(`answer chars=${total}\n` + rows.join('\n'));
    }
  } catch { /* keep */ }
  return new Response(text, { status: res.status, headers: res.headers });
}) as typeof fetch;

for (const rel of process.argv.slice(2)) {
  const bytes = readFileSync(`${import.meta.dir}/eval-images/${rel}`);
  const source = { sourceId: randomUUID(), kind: 'image' as const, contentHandle: randomUUID() };
  const transport = createEventEveryOpenRouterTransport({
    context: CONTEXT,
    invoke: async (providerBody) => callOpenRouter({ consumerKind: 'scan_image', apiKey: key, providerBody, modelOverride: process.env.PROBE_MODEL, signal: AbortSignal.timeout(180_000) }),
  });
  const provider = createOpenRouterVisionProvider({ transport, resolve: async () => ({ sourceId: source.sourceId, kind: 'image' as const, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }) });
  await scanSource({ kind: 'image', handle: source, provider } as Parameters<typeof scanSource>[0], { candidateIdFactory: randomUUID });
  const u = last.usage ?? {};
  console.log(`${rel.padEnd(18)} ${Math.round(bytes.length / 1024)}KB prompt=${u.prompt_tokens} completion=${u.completion_tokens} cost=$${Number(u.cost ?? 0).toFixed(5)} schemaChars=${u.schemaChars} bodyKB=${Math.round(last.bodyBytes / 1024)}`);
}
