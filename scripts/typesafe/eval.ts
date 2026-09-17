/**
 * Scores the three judgments against a dataset file in the BRIEF.md schema.
 *   bun scripts/typesafe/eval.ts <dataset.json> [a|b|c ...]
 * Writes <dataset>.results.json next to the input.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { usage } from './client';
import { judgeTimed, pickTitle, titleMatches, verifyFields } from './judgments';

interface Case {
  id: string; source: string; text: string; referenceDate: string;
  truth: { title: string; titleAccept?: string[]; date: string; time: string | null; location: string | null; allDay: boolean };
  hard: string;
}

const [path, ...only] = process.argv.slice(2);
if (!path) throw new Error('usage: bun scripts/typesafe/eval.ts <dataset.json> [a|b|c]');
const cases = JSON.parse(readFileSync(path, 'utf8')) as Case[];
const want = new Set(only);
const run = (k: string) => !want.size || want.has(k);

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
function shiftTime(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(':').map(Number); return `${String((h + hours + 24) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
const WRONG_LOCATIONS = ['Room 2A', 'The Grand Hall', 'Zoom', 'Central Park', 'Main Office'];

const results: Record<string, unknown>[] = [];
const fails: string[] = [];
let aPass = 0, aTotal = 0, bPass = 0, bTotal = 0, cPass = 0, cTotal = 0;

for (const c of cases) {
  const row: Record<string, unknown> = { id: c.id, source: c.source, hard: c.hard };
  try {
    if (run('a')) {
      const p = await judgeTimed(c.text, c.truth.date, c.truth.time);
      const ok = (p >= 0.5) === !c.truth.allDay;
      aTotal += 1; if (ok) aPass += 1; else fails.push(`A ${c.id} p=${p.toFixed(2)} allDay=${c.truth.allDay} | ${c.hard}`);
      row.timed = { p, ok };
    }
    if (run('b')) {
      const base = { title: c.truth.title, startDate: c.truth.date, startTime: c.truth.time, location: c.truth.location };
      const variants: Array<{ label: string; extracted: typeof base; corrupted: 'date' | 'time' | 'location' | null }> = [
        { label: 'correct', extracted: base, corrupted: null },
        { label: 'bad-date', extracted: { ...base, startDate: shiftDate(c.truth.date, 3) }, corrupted: 'date' },
      ];
      if (c.truth.time) variants.push({ label: 'bad-time', extracted: { ...base, startTime: shiftTime(c.truth.time, 2) }, corrupted: 'time' });
      if (c.truth.location) variants.push({ label: 'bad-loc', extracted: { ...base, location: WRONG_LOCATIONS.find((w) => w !== c.truth.location)! }, corrupted: 'location' });
      const verdicts: Record<string, unknown> = {};
      for (const v of variants) {
        const verdict = await verifyFields(c.text, c.referenceDate, v.extracted);
        verdicts[v.label] = verdict;
        for (const k of ['date', 'time', 'location'] as const) {
          const p = verdict[k]; if (p === null) continue;
          const ok = (p >= 0.5) === (k !== v.corrupted);
          bTotal += 1; if (ok) bPass += 1; else fails.push(`B ${c.id} ${v.label} ${k}=${p.toFixed(2)} | ${c.hard}`);
        }
      }
      row.verify = verdicts;
    }
    if (run('c')) {
      const pick = await pickTitle(c.text);
      const ok = pick.choice !== 'none of these' && titleMatches(pick.choice, c.truth.titleAccept ?? [c.truth.title]);
      cTotal += 1; if (ok) cPass += 1; else fails.push(`C ${c.id} picked "${pick.choice}" conf=${pick.confidence.toFixed(2)} want "${c.truth.title}" (${pick.candidates.length} cands) | ${c.hard}`);
      row.title = { ...pick, ok };
    }
  } catch (err) {
    row.error = String(err); fails.push(`ERR ${c.id} ${String(err)}`);
  }
  results.push(row);
}

const out = path.replace(/\.json$/, '.results.json');
writeFileSync(out, JSON.stringify({ summary: { a: [aPass, aTotal], b: [bPass, bTotal], c: [cPass, cTotal], usage }, fails, results }, null, 2));
console.log(fails.join('\n'));
console.log(`\nA all-day ${aPass}/${aTotal}   B verify ${bPass}/${bTotal}   C title ${cPass}/${cTotal}   ${usage.calls} calls ${usage.tokens} tokens ${usage.ms}ms -> ${out}`);
