// Headless browser smoke test + screenshots. Serves cdnjs three.js r128 from a local copy.
// Usage: node tools/browser-check.mjs <three.min.js path> <out dir> [views...]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const [threePath, outDir = 'shots', ...only] = process.argv.slice(2);
const page_url = new URL('../index.html', import.meta.url).href + '?map=range';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(threePath) }));
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
const t0 = Date.now();
await page.goto(page_url);
try {
  await page.waitForFunction(() => window.__SF || document.querySelector('#load-note.err'), null, { timeout: 90000 });
} catch (e) {
  console.log('BOOT TIMEOUT. Loading label:', await page.evaluate(() => document.getElementById('load-label').textContent + ' ' + document.getElementById('load-pct').textContent));
  console.log(errors.filter((x) => !x.includes('GPU stall')).join('\n'));
  await browser.close(); process.exit(1);
}
const bootMs = Date.now() - t0;
const fatal = await page.evaluate(() => document.querySelector('#load-note.err')?.textContent || null);
if (fatal) { console.log('FATAL:', fatal); console.log(errors.join('\n')); await browser.close(); process.exit(1); }
await page.screenshot({ path: `${outDir}/00-menu.png` });
const info = await page.evaluate(() => ({ bake: __SF.Game.L.bakeStats, vmTris: __SF.Viewmodel.tris }));
console.log('boot ms', bootMs, JSON.stringify(info));
await page.evaluate(() => { __SF.play(); __SF.Settings.set('mode', 'skirmish'); __SF.Actors.removeBots(); });
const views = {
  spawn: [96, 0, -416, -90, -2],
  range: [176, 0, -400, -90, 0],
  hall: [-60, 0, 0, 90, -6],
  hall2: [-300, 0, 500, 120, 4],
  catwalk: [-500, 128, -580, 200, -18],
  yard: [1150, 0, 560, 140, 2],
  shed: [1060, 2, 210, -60, -4],
  crates: [-420, 0, 120, 160, -8],
};
for (const [name, v] of Object.entries(views)) {
  if (only.length && !only.includes(name)) continue;
  await page.evaluate((v) => __SF.setView(...v), v);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${name}.png` });
}
if (!only.length || only.includes('modes')) {
  for (const mode of ['box', 'stretch']) {
    await page.evaluate((m) => { __SF.Settings.set('aspect', m); __SF.setView(96, 0, -416, -90, -2); }, mode);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/mode-${mode}.png` });
  }
  await page.evaluate(() => __SF.Settings.set('aspect', 'wide'));
}
const stats = await page.evaluate(() => ({ calls: __SF.R.stats.calls, tris: __SF.R.stats.tris, cpu: __SF.Game.cpuMs }));
console.log('render stats', JSON.stringify(stats));
console.log(errors.length ? errors.slice(0, 30).join('\n') : 'no console errors');
await browser.close();
