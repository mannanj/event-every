/** Cards the app actually exported wrong. Verification must flag the bad field. */
import { readFileSync } from 'node:fs';
import { verifyFields } from './judgments';
interface KnownWrong { id: string; text: string; referenceDate: string; extracted: { title: string; startDate: string; startTime: string | null; location: string | null }; expectLow: string[] }
const cases = JSON.parse(readFileSync('scripts/typesafe/data/known-wrong.json', 'utf8')) as KnownWrong[];
for (const c of cases) {
  const v = await verifyFields(c.text, c.referenceDate, c.extracted);
  const flagged = (['date', 'time', 'location'] as const).filter((k) => v[k] !== null && (v[k] as number) < 0.35);
  const ok = c.expectLow.every((k) => flagged.includes(k as 'date')) && flagged.length === c.expectLow.length;
  console.log(`${c.id} date=${v.date.toFixed(2)} time=${v.time?.toFixed(2)} location=${v.location?.toFixed(2)} flagged=[${flagged}] expected=[${c.expectLow}] ${ok ? 'CAUGHT' : 'MISSED'}`);
}
