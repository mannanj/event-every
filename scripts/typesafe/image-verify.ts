/**
 * Field verification read straight off the screenshot, against the same questions read off a
 * one-line human summary of it. Runs on the private real cases (gitignored, macOS `sips` for sizing).
 *   bun scripts/typesafe/image-verify.ts            (pinned model)
 *   TYPESAFE_MODEL=jev-1.14.0 bun scripts/typesafe/image-verify.ts
 * Writes scripts/eval-images/real/image-verify.<model>.results.json; prints only aggregates and ids.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ask, MODEL, noul, usage, type ImageAsset } from './client';
import { calendarState, verifyQuestions, type Extracted } from './judgments';

interface RealCase {
  id: string; image: string; text: string; expectCandidates: number;
  expectDate?: { year: number; month: number; day: number }; expectTime?: { hour: number; minute: number };
}

const ROOT = 'scripts/eval-images';
const cases = (JSON.parse(readFileSync(`${ROOT}/real/cases.json`, 'utf8')) as RealCase[]).filter((c) => c.expectCandidates > 0 && c.expectDate);
const scratch = mkdtempSync(path.join(tmpdir(), 'image-verify-'));

/** TypeSafe rejects images outside 256-1568 px a side and never resizes, so shrink the long edge and pad short ones. */
function prepared(file: string): ImageAsset {
  const out = path.join(scratch, path.basename(file));
  const run = (args: string[]) => { const r = Bun.spawnSync(['sips', ...args, file, '--out', out]); if (r.exitCode !== 0) throw new Error(r.stderr.toString()); };
  run(['-Z', '1568']);
  const dims = Bun.spawnSync(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', out]).stdout.toString();
  const w = Number(/pixelWidth: (\d+)/.exec(dims)?.[1]); const h = Number(/pixelHeight: (\d+)/.exec(dims)?.[1]);
  if (w < 280 || h < 280) {
    const r = Bun.spawnSync(['sips', '--padToHeightWidth', String(Math.max(h, 280)), String(Math.max(w, 280)), '--padColor', 'FFFFFF', out]);
    if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  }
  return { type: 'image', format: 'png', data_base64: readFileSync(out).toString('base64') };
}

const pad = (n: number) => String(n).padStart(2, '0');
function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
function shiftTime(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(':').map(Number); return `${pad((h + hours + 24) % 24)}:${pad(m)}`;
}

// tz-shift is the shipped bug: 10:30 Eastern exported as 06:30. day-month-swap is the 09/12 reading.
function variants(c: RealCase): Array<{ label: string; extracted: Extracted; corrupted: 'date' | 'time' | null }> {
  const { year, month, day } = c.expectDate!;
  const date = `${year}-${pad(month)}-${pad(day)}`;
  const time = c.expectTime ? `${pad(c.expectTime.hour)}:${pad(c.expectTime.minute)}` : null;
  const base: Extracted = { title: '', startDate: date, startTime: time, location: null };
  const out: Array<{ label: string; extracted: Extracted; corrupted: 'date' | 'time' | null }> = [
    { label: 'correct', extracted: base, corrupted: null },
    { label: 'bad-date', extracted: { ...base, startDate: shiftDate(date, 3) }, corrupted: 'date' },
  ];
  if (day <= 12 && day !== month) out.push({ label: 'day-month-swap', extracted: { ...base, startDate: `${year}-${pad(day)}-${pad(month)}` }, corrupted: 'date' });
  if (time) {
    out.push({ label: 'bad-time', extracted: { ...base, startTime: shiftTime(time, 2) }, corrupted: 'time' });
    out.push({ label: 'tz-shift', extracted: { ...base, startTime: shiftTime(time, -4) }, corrupted: 'time' });
  }
  return out;
}

type Arm = 'image' | 'summary';
const tally: Record<Arm, { pass: number; total: number; falseAlarm: number; missed: number; byLabel: Record<string, [number, number]> }> = {
  image: { pass: 0, total: 0, falseAlarm: 0, missed: 0, byLabel: {} },
  summary: { pass: 0, total: 0, falseAlarm: 0, missed: 0, byLabel: {} },
};
const rows: Record<string, unknown>[] = [];
const fails: string[] = [];
const control = { pass: 0, total: 0 };
const assets = new Map(cases.map((c) => [c.id, prepared(`${ROOT}/${c.image}`)]));
const sameDay = (a: RealCase, b: RealCase) => JSON.stringify(a.expectDate) === JSON.stringify(b.expectDate);

for (const [i, c] of cases.entries()) {
  const ref = crypto.randomUUID();
  const asset = assets.get(c.id)!;
  const row: Record<string, unknown> = { id: c.id };
  const all = variants(c);
  // Ten days before the true date, the same for every variant, so the state cannot hint which is right.
  const referenceDate = shiftDate(all[0].extracted.startDate, -10);
  for (const v of all) {
    const calendar = calendarState(referenceDate, v.extracted.startDate);
    const arms: Record<Arm, () => ReturnType<typeof ask>> = {
      image: () => ask({ image: ref, referenceDate, calendar, extracted: v.extracted }, verifyQuestions(v.extracted, 'image'), { [ref]: asset }),
      summary: () => ask({ text: c.text, referenceDate, calendar, extracted: v.extracted }, verifyQuestions(v.extracted)),
    };
    for (const arm of Object.keys(arms) as Arm[]) {
      let a: Awaited<ReturnType<typeof ask>>;
      try { a = await arms[arm](); } catch (err) { fails.push(`ERR ${c.id} ${v.label} ${arm} ${String(err).slice(0, 160)}`); continue; }
      const verdict = { date: noul(a.date_ok), time: v.extracted.startTime ? noul(a.time_ok) : null };
      row[`${arm}:${v.label}`] = verdict;
      for (const k of ['date', 'time'] as const) {
        const p = verdict[k]; if (p === null) continue;
        const ok = (p >= 0.5) === (k !== v.corrupted);
        const t = tally[arm]; t.total += 1;
        const bucket = (t.byLabel[`${v.label}:${k}`] ??= [0, 0]); bucket[1] += 1;
        if (ok) { t.pass += 1; bucket[0] += 1; continue; }
        if (k === v.corrupted) t.missed += 1; else t.falseAlarm += 1;
        fails.push(`${arm} ${c.id} ${v.label} ${k}=${p.toFixed(2)}`);
      }
    }
  }
  // Control: this case's right fields against another event's screenshot must read as wrong,
  // or the arm is answering from the fields alone.
  const other = [...cases.slice(i + 1), ...cases.slice(0, i)].find((o) => !sameDay(o, c))!;
  const right = all[0].extracted;
  try {
    const a = await ask({ image: ref, referenceDate, calendar: calendarState(referenceDate, right.startDate), extracted: right }, verifyQuestions(right, 'image'), { [ref]: assets.get(other.id)! });
    const verdict = { date: noul(a.date_ok), time: right.startTime ? noul(a.time_ok) : null, image: other.id };
    row['control:other-image'] = verdict;
    for (const p of [verdict.date, verdict.time]) {
      if (p === null) continue;
      control.total += 1;
      if (p < 0.5) control.pass += 1; else fails.push(`control ${c.id} on ${other.id} p=${p.toFixed(2)}`);
    }
  } catch (err) { fails.push(`ERR ${c.id} control ${String(err).slice(0, 160)}`); }
  rows.push(row);
}

const out = `${ROOT}/real/image-verify.${MODEL}.results.json`;
writeFileSync(out, JSON.stringify({ model: MODEL, tally, control, usage, fails, rows }, null, 2));
for (const f of fails) console.log(f);
for (const arm of Object.keys(tally) as Arm[]) {
  const t = tally[arm];
  console.log(`\n${arm}: ${t.pass}/${t.total}  correct flagged wrong ${t.falseAlarm}  wrong passed ${t.missed}`);
  for (const [k, [p, n]] of Object.entries(t.byLabel)) console.log(`  ${k.padEnd(22)} ${p}/${n}`);
}
console.log(`\ncontrol (another event's screenshot): ${control.pass}/${control.total} read as wrong`);
console.log(`\n${MODEL}  ${cases.length} cases  ${usage.calls} calls ${usage.tokens} tokens ${usage.ms}ms -> ${out}`);
