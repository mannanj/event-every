/**
 * Builds a text-path twin of the real-image eval set: OCR every image with
 * Tesseract and write the result as cases the existing scan-reliability runner
 * can score, so the OCR route is measured with the same answer key and the same
 * scorer as the vision route.
 *
 *   bun scripts/ocr-real-images.ts
 *   EVAL_REAL_DIR=ocr bun scripts/measure-scan-reliability.ts 1
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const IMAGE_DIR = `${import.meta.dir}/eval-images`;
const SOURCE = `${IMAGE_DIR}/real/cases.json`;
const OUT_DIR = `${IMAGE_DIR}/ocr`;

type EvalCase = { id: string; image?: string; text: string; [key: string]: unknown };

const cases: EvalCase[] = JSON.parse(readFileSync(SOURCE, 'utf8'));
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

/** Mean per-word confidence Tesseract reports, the free signal a cascade would gate on. */
function meanConfidence(path: string): number {
  const tsv = execFileSync('tesseract', [path, 'stdout', 'tsv'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const scores: number[] = [];
  for (const line of tsv.split('\n').slice(1)) {
    const columns = line.split('\t');
    if (columns.length < 12) continue;
    const confidence = Number(columns[10]);
    if (Number.isFinite(confidence) && confidence >= 0 && columns[11].trim()) scores.push(confidence);
  }
  return scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length;
}

const report: Record<string, unknown>[] = [];
const out: EvalCase[] = [];

for (const testCase of cases) {
  if (!testCase.image) continue;
  const path = `${IMAGE_DIR}/${testCase.image}`;
  const startedAt = Date.now();
  let text = '';
  try {
    text = execFileSync('tesseract', [path, 'stdout'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { text = ''; }
  const ms = Date.now() - startedAt;
  const confidence = text.trim() ? meanConfidence(path) : 0;
  const cleaned = text.replace(/\n{3,}/g, '\n\n').trim();
  report.push({ id: testCase.id, ms, confidence: Math.round(confidence * 10) / 10, chars: cleaned.length, describedAs: testCase.text });
  const { image: _image, ...rest } = testCase;
  // An empty OCR result still has to be scored: it is exactly what a cascade
  // would hand the text scanner if it did not gate on confidence.
  out.push({ ...rest, text: cleaned || '(no text)' });
}

writeFileSync(`${OUT_DIR}/cases.json`, `${JSON.stringify(out, null, 2)}\n`);
writeFileSync(`${OUT_DIR}/ocr-report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${out.length} cases written to ${OUT_DIR}/cases.json`);
console.log(`ocr total ${report.reduce((sum, r) => sum + (r.ms as number), 0)} ms, mean ${Math.round(report.reduce((sum, r) => sum + (r.ms as number), 0) / report.length)} ms/image`);
for (const row of report) console.log(`${row.id}  conf ${String(row.confidence).padStart(5)}  ${String(row.chars).padStart(5)} chars  ${String(row.ms).padStart(5)} ms`);
