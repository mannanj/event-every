/**
 * Run an input box - words and photos together - through the shared reading
 * path (services/readSources) with the real fetcher, real triage and the real
 * scan model, and print what comes out and how long each step took.
 *
 *   bun scripts/probe-read.ts --text "https://luma.com/join/..." --image shot.png [--image more.png] [--model x]
 *
 * The scan step is probe-scan's (same transport, prompt, schema, routing as the
 * Worker); everything around it is the code the site and the MCP route run.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createOpenRouterTextLinkProvider, createOpenRouterVisionProvider } from '@event-every/scanner/openrouter';
import { scanSource } from '@/server/scanner/scan';
import { createEventEveryOpenRouterTransport } from '@/server/scanner/transport';
import { callOpenRouter } from '@/platform/provider/transport';
import { OWNER_MODELS } from '@/platform/provider/policy';
import { scrapePage } from '@/server/mcp/intake';
import { triageForScan } from '@/server/typesafe/triage';
import { detectUrlsDeterministically } from '@/services/urlDetector';
import { IMAGE_SCAN_CONCURRENCY, linkForPhotos, readLinks, readText, withTypedLink } from '@/services/readSources';
import { mapWithConcurrency } from '@/utils/concurrency';

const args = process.argv.slice(2);
const all = (name: string) => args.flatMap((a, i) => (args[i - 1] === name ? [a] : []));
const text = all('--text')[0] ?? '';
const images = all('--image');
const timeZone = all('--tz')[0] ?? 'America/New_York';
const model = all('--model')[0];

for (const line of readFileSync(`${import.meta.dir}/../.env.local`, 'utf8').split('\n')) {
  const m = line.match(/^(OPENROUTER_API_KEY|TYPESAFE_API_KEY)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}

const t0 = Date.now();
const lap = (what: string) => console.log(`  +${Date.now() - t0}ms ${what}`);
const signal = AbortSignal.timeout(120_000);

type Event = { title: string; start: unknown; url?: string; location: unknown };

async function scan(source: { kind: 'text'; text: string } | { kind: 'image'; dataUrl: string }): Promise<Event[]> {
  const kind = source.kind;
  const handle = { sourceId: randomUUID(), kind, contentHandle: randomUUID() } as const;
  const transport = createEventEveryOpenRouterTransport({
    context: { nowMs: Date.now(), timeZone },
    invoke: (providerBody) => callOpenRouter({
      consumerKind: kind === 'image' ? 'scan_image' : 'scan_text',
      apiKey: process.env.OPENROUTER_API_KEY!,
      providerBody,
      modelOverride: model ?? OWNER_MODELS[kind === 'image' ? 'scan-image' : 'scan-text'],
      signal,
    }),
  });
  const provider = source.kind === 'image'
    ? createOpenRouterVisionProvider({ transport, resolve: async () => ({ sourceId: handle.sourceId, kind: 'image' as const, dataUrl: source.dataUrl }) })
    : createOpenRouterTextLinkProvider({ transport, resolve: async () => ({ sourceId: handle.sourceId, kind: 'text' as const, text: source.text }) });
  const result = await scanSource({ kind, handle, provider } as Parameters<typeof scanSource>[0], { candidateIdFactory: randomUUID });
  lap(`scanned ${kind}: ${result.candidates.length} event(s)`);
  return result.candidates.map((c) => ({
    title: c.title.value ?? '',
    start: c.temporal.value?.start,
    location: c.location.value,
    ...(c.url.value ? { url: c.url.value } : {}),
  }));
}

const linkSteps = {
  detect: async (value: string) => detectUrlsDeterministically(value),
  scrape: (urls: string[]) => mapWithConcurrency(urls, 2, async (url) => {
    const page = await scrapePage(url, signal);
    lap(`fetched ${url} -> ${page.status} ${page.url}`);
    return page;
  }),
};

let events: Event[];
if (images.length === 0) {
  const outcome = await readText<Event>(text, {
    ...linkSteps,
    triage: async (value, source) => {
      const t = await triageForScan(value, source, signal);
      lap(`triage: ${t ? JSON.stringify(t.decision) : 'unavailable (scan as before)'}`);
      return t;
    },
    scan: (value) => scan({ kind: 'text', text: value }),
  });
  events = outcome.kind === 'scanned' ? outcome.items : [];
  if (outcome.kind !== 'scanned') console.log(`  outcome: ${outcome.kind}`);
} else {
  const [links, perImage] = await Promise.all([
    text ? readLinks(text, linkSteps) : Promise.resolve(null),
    mapWithConcurrency(images, IMAGE_SCAN_CONCURRENCY, (path) => {
      const type = path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      return scan({ kind: 'image', dataUrl: `data:${type};base64,${readFileSync(path).toString('base64')}` });
    }),
  ]);
  const link = links ? linkForPhotos(links) : null;
  lap(`link for the photos: ${link ?? '(none)'}`);
  events = withTypedLink(perImage.flat(), link);
}
console.log(`total ${Date.now() - t0}ms`);
for (const e of events) console.log(JSON.stringify(e));
