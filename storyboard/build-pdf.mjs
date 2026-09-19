import { chromium } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const shotsDir = process.argv[2];
const out = process.argv[3];
const title = process.argv[4] ?? 'Storyboard';

const shots = JSON.parse(readFileSync(path.join(shotsDir, 'captions.json'), 'utf8'));
const available = new Set(readdirSync(shotsDir));

const pages = shots.map((shot, index) => {
  if (!available.has(shot.file)) throw new Error(`missing shot ${shot.file}`);
  const data = readFileSync(path.join(shotsDir, shot.file)).toString('base64');
  const last = index === shots.length - 1;
  return `
  <section class="page">
    <header><span>${title}</span><span>${index + 1} of ${shots.length}</span></header>
    <p class="caption${last ? ' ending' : ''}">${shot.caption
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/^We see/, '<b>We see</b>')
      .replace(/Next, we will/, '<b>Next, we will</b>')
      .replace(/This will/, '<b>This will</b>')}</p>
    <div class="shot"><img src="data:image/png;base64,${data}" alt=""></div>
  </section>`;
}).join('\n');

const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #111; }
  .page { width: 297mm; height: 210mm; padding: 10mm 12mm 9mm; display: flex; flex-direction: column;
          page-break-after: always; break-after: page; background: #fff; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  header { display: flex; justify-content: space-between; font-size: 8pt; letter-spacing: .08em;
           text-transform: uppercase; color: #8a8a8a; padding-bottom: 4mm; }
  .shot { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;
          border: 1px solid #e4e4e4; background: #fbfbfb; }
  .shot img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  .caption { margin: 0 0 6mm; font-size: 12.5pt; line-height: 1.5; max-width: 250mm; }
  .caption b { font-weight: 650; }
  .caption.ending { border-left: 3px solid #111; padding-left: 5mm; }
</style></head><body>${pages}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({ path: out, width: '297mm', height: '210mm', printBackground: true });
await browser.close();
console.log(`wrote ${out} (${shots.length} pages)`);
