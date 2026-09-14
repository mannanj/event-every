/**
 * Why does a scan fail? Capture the raw model output and the exact rejection.
 *
 * The eval reports THAT a case failed. This reports WHY, by tapping the transport
 * to keep the raw provider response, then pushing the same response through each
 * stage in turn and printing where it stops:
 *
 *   1. HTTP            did OpenRouter answer at all
 *   2. JSON            is the content parseable
 *   3. wire schema     does the scanner's own Zod accept the observation
 *   4. replay schema   does toDurableScanReplay accept the post-processed result
 *
 * Stage 3 is the suspect: "The provider returned an invalid observation" is the
 * scanner refusing the model's shape, and the message says nothing about which
 * field. Printing the Zod issue paths turns a shrug into a fix.
 *
 *   bun scripts/diagnose-scan-failure.ts [model] [caseId...]
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { scanSource } from '@/server/scanner/scan';
import { createEventEveryOpenRouterTransport } from '@/server/scanner/transport';
import { toDurableScanReplay } from '@/platform/provider/replay';
import { callOpenRouter } from '@/platform/provider/transport';
import { createOpenRouterTextLinkProvider } from '@event-every/scanner/openrouter';

import { EVAL_CASES } from './scan-eval-cases';

const MODEL = process.argv[2] ?? 'deepseek/deepseek-v4-flash';
const WANTED = process.argv.slice(3);
const CASES = WANTED.length ? EVAL_CASES.filter((c) => WANTED.includes(c.id)) : EVAL_CASES.slice(0, 6);

function apiKey(): string {
  const line = readFileSync(`${import.meta.dir}/../.env.local`, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('OPENROUTER_API_KEY='));
  if (!line) throw new Error('OPENROUTER_API_KEY missing');
  return line.split('=').slice(1).join('=').trim().replace(/^"|"$/g, '');
}

const key = apiKey();

for (const testCase of CASES) {
  console.log(`\n=== ${testCase.id} (${testCase.category}) ===`);
  console.log(`input: ${testCase.text.slice(0, 90)}${testCase.text.length > 90 ? '...' : ''}`);

  const source = { sourceId: randomUUID(), kind: 'text' as const, contentHandle: randomUUID() };
  let raw: unknown = null;
  let httpNote = '';

  const transport = createEventEveryOpenRouterTransport({
    invoke: async (providerBody) => {
      const result = await callOpenRouter({
        consumerKind: 'scan_text',
        apiKey: key,
        providerBody: { ...providerBody, model: MODEL },
        signal: AbortSignal.timeout(120_000),
      });
      // Keep what came back so a later rejection can be explained.
      if (result.status === 'success') raw = result.value;
      else httpNote = `${result.status}: ${JSON.stringify((result as { failure?: unknown }).failure ?? {})}`;
      return result;
    },
  });

  const provider = createOpenRouterTextLinkProvider({
    transport,
    resolve: async () => ({ sourceId: source.sourceId, kind: 'text' as const, text: testCase.text }),
  });

  let result;
  try {
    result = await scanSource({ kind: 'text', handle: source, provider }, { candidateIdFactory: randomUUID });
  } catch (error) {
    console.log(`STOPPED at scanner: ${error instanceof Error ? error.message : 'unknown'}`);
    if (httpNote) console.log(`  transport: ${httpNote}`);
    if (raw) {
      const content = (raw as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
      if (typeof content === 'string') {
        console.log(`  model content (first 420 chars):\n    ${content.slice(0, 420).replace(/\n/g, '\n    ')}`);
        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          console.log(`  parsed keys: ${JSON.stringify(Object.keys(parsed))}`);
          const first = (parsed.candidates as unknown[])?.[0] as Record<string, unknown> | undefined;
          if (first) console.log(`  candidate[0] keys: ${JSON.stringify(Object.keys(first))}`);
        } catch {
          console.log('  content is not valid JSON');
        }
      } else {
        console.log(`  no string content; envelope keys: ${JSON.stringify(Object.keys(raw as object))}`);
      }
    }
    continue;
  }

  console.log(`scanner OK: ${result.candidates.length} candidate(s), ${result.issues.length} issue(s)`);
  try {
    const replay = toDurableScanReplay({ source, ...result }) as { candidates: unknown[] };
    const first = replay.candidates[0] as Record<string, unknown> | undefined;
    const temporal = (first?.temporal as { value?: unknown })?.value;
    console.log(`replay OK: title=${JSON.stringify((first?.title as { value?: unknown })?.value)}`);
    console.log(`  temporal=${JSON.stringify(temporal)?.slice(0, 200)}`);
  } catch (error) {
    console.log(`STOPPED at replay: ${error instanceof Error ? error.message : 'unknown'}`);
  }
}
