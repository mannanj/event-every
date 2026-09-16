// Renders the image eval cases as PNGs into scripts/eval-images/. Run with node.
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = new URL('./eval-images/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PAGES = {
  'meet-invite': { w: 440, h: 170, html: `<div style="padding:12px;font:13px/1.55 -apple-system,Helvetica,Arial;color:#222">Google Meeting info:<br>Civic Signal<br>Tuesday, September 22 · 7:00 – 8:30pm<br>Time zone: America/New_York<br>Google Meet joining info<br>Video call link: https://meet.google.com/odi-xddv-kez<br>Or dial: (US) +1 254-218-5862 PIN: 199 901 399#<br>More phone numbers: https://tel.meet/odi-xddv-kez?pin=2308079664797</div>` },
  'gig-poster': { w: 480, h: 640, html: `<div style="width:480px;height:640px;background:#111;color:#f5e9c8;font-family:Georgia,serif;text-align:center;padding-top:60px;box-sizing:border-box"><div style="font-size:54px;letter-spacing:4px">MIDNIGHT<br>SIGNAL</div><div style="font-size:18px;margin-top:24px;letter-spacing:2px">with Paper Wings + Coastal Static</div><div style="font-size:30px;margin-top:60px">FRIDAY OCTOBER 2</div><div style="font-size:22px;margin-top:10px">DOORS 8PM · SHOW 9PM</div><div style="font-size:18px;margin-top:60px">The Empty Bottle<br>1035 N Western Ave, Chicago</div><div style="font-size:16px;margin-top:20px">$15 · 21+</div></div>` },
  'text-message': { w: 360, h: 300, html: `<div style="width:360px;height:300px;background:#fff;font:16px -apple-system,Helvetica;padding:16px;box-sizing:border-box"><div style="text-align:center;color:#888;font-size:12px">Today 4:12 PM</div><div style="background:#e9e9eb;border-radius:18px;padding:10px 14px;max-width:80%;margin-top:12px">Dinner Saturday Sept 19 at 7:30pm at Lupa? Sam and Priya are in</div><div style="background:#1f8fff;color:#fff;border-radius:18px;padding:10px 14px;max-width:70%;margin:12px 0 0 auto">yes! see you there</div></div>` },
  'all-day-notice': { w: 440, h: 200, html: `<div style="padding:20px;font:15px/1.6 Helvetica,Arial;color:#222;border:2px solid #333;margin:10px"><b>Company offsite</b><br>Friday March 20 2026<br>Napa Valley, all day<br>Transport leaves from the office. RSVP to Dana.</div>` },
};
const browser = await chromium.launch();
for (const [name, spec] of Object.entries(PAGES)) {
  const page = await browser.newPage({ viewport: { width: spec.w, height: spec.h }, deviceScaleFactor: 2 });
  await page.setContent(`<html><body style="margin:0;background:#fff">${spec.html}</body></html>`);
  writeFileSync(`${OUT}${name}.png`, await page.screenshot({ type: 'png' }));
  await page.close();
  console.log('rendered', name);
}
await browser.close();
