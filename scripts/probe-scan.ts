/**
 * Run one source through the production scan path and print what the model
 * returned, so a wrong card can be traced to the provider round-trip rather
 * than guessed at.
 *
 *   bun scripts/probe-scan.ts --text "Dinner Friday 7pm" [--model x] [--no-context]
 *   bun scripts/probe-scan.ts --image path.png  [--model x] [--no-context]
 *
 * Same transport, prompt, schema, temperature and routing as the Worker; the
 * only knobs are the model and whether the host context message is sent.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createOpenRouterTextLinkProvider, createOpenRouterVisionProvider } from '@event-every/scanner/openrouter';
import { scanSource } from '@/server/scanner/scan';
import { createEventEveryOpenRouterTransport } from '@/server/scanner/transport';
import { callOpenRouter } from '@/platform/provider/transport';
import { OWNER_MODELS } from '@/platform/provider/policy';
import { WireProviderScanObservationSchema } from '../vendor/event-every-scanner/dist/openrouter/wire-schema.js';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const text = flag('--text');
const imagePath = flag('--image');
const noContext = args.includes('--no-context');
const guided = args.includes('--guided-schema');
const timeZone = flag('--tz') ?? 'America/New_York';
if (!text && !imagePath) throw new Error('pass --text or --image');

function apiKey(): string {
  const line = readFileSync(`${import.meta.dir}/../.env.local`, 'utf8').split('\n').find((l) => l.startsWith('OPENROUTER_API_KEY='));
  if (!line) throw new Error('OPENROUTER_API_KEY missing from .env.local');
  return line.split('=').slice(1).join('=').trim().replace(/^"|"$/g, '');
}

const kind = imagePath ? 'image' : 'text';
const model = flag('--model') ?? OWNER_MODELS[kind === 'image' ? 'scan-image' : 'scan-text'];
const source = { sourceId: randomUUID(), kind, contentHandle: randomUUID() } as const;
const startedAt = Date.now();
let raw: unknown = null;
let transportNote = '';
const transport = createEventEveryOpenRouterTransport({
  context: noContext ? undefined : { nowMs: Date.now(), timeZone },
  invoke: async (providerBody) => {
    const result = await callOpenRouter({
      consumerKind: kind === 'image' ? 'scan_image' : 'scan_text',
      apiKey: apiKey(),
      providerBody: guided ? withGuidedSchema(providerBody) : providerBody,
      modelOverride: model,
      signal: AbortSignal.timeout(120_000),
    });
    if (result.status === 'success') raw = result.value;
    else transportNote = JSON.stringify({ status: result.status, ...(result as { failure?: unknown }) });
    return result;
  },
});

const POINT_GUIDANCE: Record<string, string> = {
  floating: 'A calendar date with a clock time the source states, and no time zone stated. Use this whenever the source gives a time.',
  zoned: 'A calendar date with a clock time and a time zone the source names (IANA name, abbreviation or "Time zone:" line).',
  partial: 'A date or time the source states only in part, such as a month and day with no derivable year.',
  date: 'A calendar date only. Use this only when the source states no clock time at all for the event.',
};
const POINT_ORDER = ['floating', 'zoned', 'partial', 'date'];

function withGuidedSchema(providerBody: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const body = JSON.parse(JSON.stringify(providerBody)) as Record<string, unknown>;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const oneOf = record.oneOf;
    if (Array.isArray(oneOf) && oneOf.some((b) => POINT_ORDER.includes(String((b as { properties?: { kind?: { const?: string } } }).properties?.kind?.const)))) {
      const kindOf = (b: unknown) => String((b as { properties?: { kind?: { const?: string } } }).properties?.kind?.const);
      for (const branch of oneOf) {
        const guidance = POINT_GUIDANCE[kindOf(branch)];
        if (guidance) (branch as Record<string, unknown>).description = guidance;
      }
      record.oneOf = [...oneOf].sort((a, b) => POINT_ORDER.indexOf(kindOf(a)) - POINT_ORDER.indexOf(kindOf(b)));
    }
    Object.values(record).forEach(walk);
  };
  walk((body.response_format as { json_schema?: { schema?: unknown } })?.json_schema?.schema);
  return body;
}

function explainRaw(): void {
  if (transportNote) console.log(`  transport: ${transportNote.slice(0, 300)}`);
  const content = (raw as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') { if (raw) console.log(`  envelope keys: ${JSON.stringify(Object.keys(raw as object))}`); return; }
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { console.log(`  content not JSON: ${content.slice(0, 200)}`); return; }
  const first = (parsed as { candidates?: Array<Record<string, unknown>> }).candidates?.[0];
  console.log(`  raw temporal value: ${JSON.stringify((first?.temporal as { value?: unknown })?.value).slice(0, 300)}`);
  console.log(`  raw temporal evidence: ${JSON.stringify((first?.temporal as { evidence?: unknown })?.evidence).slice(0, 300)}`);
  const check = WireProviderScanObservationSchema.safeParse(parsed);
  if (!check.success) console.log(`  schema issues: ${check.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ').slice(0, 500)}`);
}
const provider = kind === 'image'
  ? createOpenRouterVisionProvider({ transport, resolve: async () => ({ sourceId: source.sourceId, kind: 'image' as const, dataUrl: `data:image/png;base64,${readFileSync(imagePath!).toString('base64')}` }) })
  : createOpenRouterTextLinkProvider({ transport, resolve: async () => ({ sourceId: source.sourceId, kind: 'text' as const, text: text! }) });

try {
  const result = await scanSource({ kind, handle: source, provider } as Parameters<typeof scanSource>[0], { candidateIdFactory: randomUUID });
  console.log(`model=${model} kind=${kind} context=${!noContext} guided=${guided} ms=${Date.now() - startedAt}`);
  for (const c of result.candidates) {
    const t = c.temporal.value;
    console.log(JSON.stringify({ title: c.title.value, start: t?.start, end: t?.end, allDay: t?.allDay, location: c.location.value, url: c.url.value }));
  }
  if (result.candidates.length === 0) console.log('(no candidates)');
} catch (error) {
  console.log(`model=${model} kind=${kind} context=${!noContext} FAILED: ${error instanceof Error ? error.message : String(error)}`);
  explainRaw();
}
