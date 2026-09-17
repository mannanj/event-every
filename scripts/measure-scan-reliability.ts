/**
 * Measure how often a model produces a CORRECT event, not merely a valid one.
 *
 * Task 205. An earlier version of this counted a run as passed when the replay
 * schema did not throw, and reported "current model 50%, candidate 100%" off six
 * runs across three inputs. An independent review pulled that apart, and it was
 * right on every count:
 *
 *   - Schema survival is not correctness. An empty candidate list validates
 *     perfectly, so a model that extracts nothing scored as a clean pass. That
 *     alone could have made the whole comparison meaningless.
 *   - n=6 over 3 inputs is three data points, not six, and cannot separate 50%
 *     from 100% at any useful confidence.
 *   - Three hand-picked sentences are anecdotes. A calendar extractor breaks on
 *     shapes - relative dates, implicit years, timezones, multiple events, text
 *     containing no event at all - and none of those were represented.
 *
 * So this now scores against hand-written ground truth in scan-eval-cases.ts,
 * separates the two questions it was previously conflating, and reports a Wilson
 * interval rather than a bare percentage:
 *
 *   SCHEMA     did the output survive scanSource + toDurableScanReplay
 *   CORRECT    did it find the right number of events, with the right title,
 *              date and time where the input actually states them
 *
 * A run can pass SCHEMA and fail CORRECT. That gap is the finding.
 *
 * Everything except the model id is held constant: fixedProviderBody pins the
 * temperature, max_tokens, reasoning, provider policy and json_schema, so the
 * only variable is the model. Runs outside the Worker so a failure costs a
 * fraction of a cent instead of $0.02 against the app's $1/day pot.
 *
 *   bun scripts/measure-scan-reliability.ts [repeats-per-case]
 *
 *   EVAL_MODELS         comma list of text models (default: the production text model)
 *   EVAL_IMAGE_MODELS   comma list of image models (default: the production image model)
 *   EVAL_ONLY           comma list of case ids to run
 *
 * The request is built exactly as the Worker builds it: same transport wrapper
 * (context message, schema guidance, evidence repair), same pinned body. The
 * model is the only variable, and it is varied through the transport's own
 * evaluation seam rather than a body field the transport would overwrite.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { scanSource } from '@/server/scanner/scan';
import { createEventEveryOpenRouterTransport } from '@/server/scanner/transport';
import { OWNER_MODELS } from '@/platform/provider/policy';
import { existsSync } from 'node:fs';
import { toDurableScanReplay } from '@/platform/provider/replay';
import { callOpenRouter } from '@/platform/provider/transport';
import { createOpenRouterTextLinkProvider, createOpenRouterVisionProvider } from '@event-every/scanner/openrouter';

import { EVAL_CASES, type EvalCase } from './scan-eval-cases';
import { normalizeTemporal } from '@/services/temporalNormalize';
import type { EventCandidate } from '@event-every/scanner';

const REPEATS = Number(process.argv[2] ?? 1);
const TEXT_MODELS = (process.env.EVAL_MODELS ?? OWNER_MODELS['scan-text']).split(',').filter(Boolean);
const IMAGE_MODELS = (process.env.EVAL_IMAGE_MODELS ?? OWNER_MODELS['scan-image']).split(',').filter(Boolean);
const ONLY = (process.env.EVAL_ONLY ?? '').split(',').filter(Boolean);
const IMAGE_DIR = `${import.meta.dir}/eval-images`;
// The Worker sends the reader's zone and the admission instant; the eval pins both.
const CONTEXT = { nowMs: Date.parse('2026-09-15T16:00:00-04:00'), timeZone: 'America/New_York' } as const;
const CONCURRENCY = 6;

function apiKey(): string {
  const line = readFileSync(`${import.meta.dir}/../.env.local`, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('OPENROUTER_API_KEY='));
  if (!line) throw new Error('OPENROUTER_API_KEY missing from .env.local');
  return line.split('=').slice(1).join('=').trim().replace(/^"|"$/g, '');
}

/**
 * Wilson score interval. A bare "4/5 = 80%" invites a confidence the sample
 * cannot support; this reports the range the data actually allows.
 */
function wilson(passed: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.96;
  const p = passed / total;
  const d = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return [Math.max(0, (centre - spread) / d), Math.min(1, (centre + spread) / d)];
}

type Outcome = Readonly<{ schema: boolean; correct: boolean; why: string }>;

function readTemporal(candidate: unknown): { y?: number; m?: number; d?: number; hh?: number; mm?: number } {
  const temporal = (candidate as { temporal?: { value?: unknown } })?.temporal?.value as
    | { start?: { date?: { year?: number; month?: number; day?: number }; time?: { hour?: number; minute?: number } } }
    | null
    | undefined;
  const start = temporal?.start as
    | { kind?: string; year?: number | null; month?: number | null; day?: number | null; hour?: number | null; minute?: number | null;
        date?: { year?: number; month?: number; day?: number }; time?: { hour?: number; minute?: number } }
    | null | undefined;
  // Partial and date-only points carry their fields at the top level; the app
  // assumes the current year when the source omits it (scannerDraft.ts), so
  // the eval scores what the card will show, not what the model left blank.
  const y = start?.date?.year ?? start?.year ?? (start?.month != null && start?.day != null ? new Date().getFullYear() : undefined);
  return {
    y: y ?? undefined, m: start?.date?.month ?? start?.month ?? undefined, d: start?.date?.day ?? start?.day ?? undefined,
    hh: start?.time?.hour ?? start?.hour ?? undefined, mm: start?.time?.minute ?? start?.minute ?? undefined,
  };
}

function score(testCase: EvalCase, replay: unknown): Outcome {
  // Score what the review card will show: the app completes the year and
  // collapses an all-day midnight range before the card is built.
  const candidates = (replay as { candidates: readonly unknown[] }).candidates.map((c) => normalizeTemporal(c as EventCandidate, new Date()));
  if (process.env.EVAL_DUMP) console.log(`\n[${testCase.id}] ${JSON.stringify(candidates.map((c) => ({ title: (c as { title?: { value?: unknown } }).title?.value, temporal: (c as { temporal?: { value?: unknown } }).temporal?.value, issues: (c as { issues?: unknown }).issues })))}`);

  if (candidates.length !== testCase.expectCandidates) {
    // The negative cases live or die here: inventing an event out of "I cannot
    // make Tuesday" is the failure a schema check can never catch.
    return {
      schema: true,
      correct: false,
      why: `expected ${testCase.expectCandidates} candidate(s), got ${candidates.length}`,
    };
  }
  if (testCase.expectCandidates === 0) return { schema: true, correct: true, why: 'correctly found nothing' };

  const first = candidates[0];
  const title = String((first as { title?: { value?: unknown } })?.title?.value ?? '').toLowerCase();
  const when = readTemporal(first);

  if (testCase.expectTitle && !title.includes(testCase.expectTitle)) {
    return { schema: true, correct: false, why: `title "${title.slice(0, 30)}" lacks "${testCase.expectTitle}"` };
  }
  if (testCase.expectDate) {
    const { year, month, day } = testCase.expectDate;
    if (when.y !== year || when.m !== month || when.d !== day) {
      return { schema: true, correct: false, why: `date ${when.y}-${when.m}-${when.d} != ${year}-${month}-${day}` };
    }
  }
  if (testCase.expectTime) {
    const { hour, minute } = testCase.expectTime;
    if (when.hh !== hour || when.mm !== minute) {
      return { schema: true, correct: false, why: `time ${when.hh}:${when.mm} != ${hour}:${minute}` };
    }
  }
  if (testCase.expectNoTime && when.hh !== undefined) {
    return { schema: true, correct: false, why: `invented time ${when.hh}:${when.mm} for an all-day input` };
  }
  return { schema: true, correct: true, why: 'ok' };
}

async function runCase(model: string, testCase: EvalCase, key: string): Promise<Outcome> {
  const kind = testCase.image ? 'image' as const : 'text' as const;
  const source = { sourceId: randomUUID(), kind, contentHandle: randomUUID() };
  const transport = createEventEveryOpenRouterTransport({
    context: CONTEXT,
    invoke: async (providerBody) =>
      callOpenRouter({
        consumerKind: kind === 'image' ? 'scan_image' : 'scan_text',
        apiKey: key,
        providerBody,
        modelOverride: model,
        signal: AbortSignal.timeout(120_000),
      }),
  });
  const provider = kind === 'image'
    ? createOpenRouterVisionProvider({
      transport,
      resolve: async () => ({ sourceId: source.sourceId, kind: 'image' as const, dataUrl: `data:image/png;base64,${readFileSync(`${IMAGE_DIR}/${testCase.image}`).toString('base64')}` }),
    })
    : createOpenRouterTextLinkProvider({
      transport,
      resolve: async () => ({ sourceId: source.sourceId, kind: 'text' as const, text: testCase.text }),
    });

  let result;
  try {
    result = await scanSource({ kind, handle: source, provider } as Parameters<typeof scanSource>[0], { candidateIdFactory: randomUUID });
  } catch (error) {
    return { schema: false, correct: false, why: error instanceof Error ? error.message.slice(0, 60) : 'threw' };
  }
  try {
    return score(testCase, toDurableScanReplay({ source, ...result }));
  } catch (error) {
    return { schema: false, correct: false, why: `replay: ${error instanceof Error ? error.message.slice(0, 50) : '?'}` };
  }
}

const key = apiKey();
// Real scans from the owner's own history live in eval-images/real/, which is
// gitignored because the repo is public and the screenshots carry names and
// emails. Their answer key sits beside them and is merged in when present.
const REAL_CASES_PATH = `${IMAGE_DIR}/real/cases.json`;
const REAL_CASES: EvalCase[] = existsSync(REAL_CASES_PATH) ? JSON.parse(readFileSync(REAL_CASES_PATH, 'utf8')) as EvalCase[] : [];
const ALL_CASES = [...EVAL_CASES, ...REAL_CASES];
const selected = ALL_CASES.filter((c) => ONLY.length === 0 || ONLY.includes(c.id));
const textCases = selected.filter((c) => !c.image);
const imageCases = selected.filter((c) => c.image && existsSync(`${IMAGE_DIR}/${c.image}`));
if (selected.some((c) => c.image) && imageCases.length === 0) console.log('image cases skipped: run `node scripts/render-eval-images.mjs` first\n');

const plan: Array<{ model: string; cases: EvalCase[] }> = [
  ...TEXT_MODELS.map((model) => ({ model, cases: textCases })),
  ...IMAGE_MODELS.map((model) => ({ model, cases: imageCases })),
].filter((p) => p.cases.length > 0);

for (const { model, cases } of plan) {
  const jobs = cases.flatMap((c) => Array.from({ length: REPEATS }, () => c));
  console.log(`\n${cases[0]!.image ? 'IMAGE' : 'TEXT'} ${cases.length} cases x ${REPEATS} = ${jobs.length} runs`);
  const outcomes: { testCase: EvalCase; outcome: Outcome }[] = [];
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const slice = jobs.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(slice.map(async (c) => ({ testCase: c, outcome: await runCase(model, c, key) })));
    outcomes.push(...settled);
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  const schema = outcomes.filter((o) => o.outcome.schema).length;
  const correct = outcomes.filter((o) => o.outcome.correct).length;
  const [sl, sh] = wilson(schema, outcomes.length);
  const [cl, ch] = wilson(correct, outcomes.length);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  console.log(`${model}`);
  console.log(`  SCHEMA   ${schema}/${outcomes.length}  ${pct(schema / outcomes.length)}  (95% CI ${pct(sl)}-${pct(sh)})`);
  console.log(`  CORRECT  ${correct}/${outcomes.length}  ${pct(correct / outcomes.length)}  (95% CI ${pct(cl)}-${pct(ch)})`);

  const byCategory = new Map<string, { n: number; ok: number }>();
  for (const { testCase, outcome } of outcomes) {
    const row = byCategory.get(testCase.category) ?? { n: 0, ok: 0 };
    row.n += 1;
    if (outcome.correct) row.ok += 1;
    byCategory.set(testCase.category, row);
  }
  const weak = [...byCategory.entries()].filter(([, r]) => r.ok < r.n).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
  for (const [category, r] of weak) console.log(`    ${category.padEnd(14)} ${r.ok}/${r.n}`);
  for (const { testCase, outcome } of outcomes.filter((o) => !o.outcome.correct).slice(0, 6)) {
    console.log(`    ! ${testCase.id.padEnd(12)} ${outcome.why}`);
  }
  console.log();
}
