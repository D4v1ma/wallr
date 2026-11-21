// Stage 5 screenshots: a tour of Saltpan Depot from fixed camera spots (free camera, no HUD hints).
// Usage: node tools/stage5-shots.mjs <three.min.js> <outdir> [names,comma,separated]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, mkdirSync } from 'node:fs';
const [threePath, out = 'shots', only = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(threePath) }));
await page.route('https://fonts.**', (r) => r.abort());
const t0 = Date.now();
await page.goto(new URL('../index.html', import.meta.url).href);
await page.waitForFunction(() => window.__SF, null, { timeout: 180000 });
const loadMs = Date.now() - t0;
const info = await page.evaluate(() => ({ map: __SF.Game.L.name, bake: __SF.Game.L.bakeStats, nav: __SF.Nav.nodes.length, navMs: __SF.Nav.ms }));
await page.evaluate(() => { __SF.play(); __SF.Input.freeMouse = true; __SF.Settings.set('showHints', false); __SF.Game.botsFrozen = true; for (const a of __SF.Actors.list) if (a.isBot) __SF.place(a, 0, -400, 0, 0); });
// [x, y, z] camera and [x, y, z] point to look at
const spots = {
  'spawn-raiders': [[-1900, 100, -440], [-1400, 40, 100]], 'north-yard': [[-1900, 120, -1400], [-1200, 0, -700]], 'rail-cut': [[-1100, 40, -1300], [0, -20, -1350]],
  'a-from-cut': [[450, 20, -1350], [1200, 0, -1100]], 'a-platform': [[540, 100, -800], [1200, 0, -1250]], 'a-hut': [[900, 110, -820], [1260, 50, -1150]],
  'scales-from-window': [[470, 220, -660], [800, 40, -760]], 'scales-yard': [[1300, 100, -740], [600, 40, -400]], 'office-ground': [[-150, 70, -340], [300, 50, -700]],
  'office-upstairs': [[440, 220, -340], [-100, 180, -700]], 'plaza': [[-180, 90, -280], [450, 40, 250]], 'street': [[-1320, 70, 100], [-200, 40, -40]],
  'alley': [[230, 80, 330], [450, 40, 980]], 'shed-west-door': [[530, 80, 920], [1200, 40, 1200]], 'shed-from-bay': [[1330, 90, 950], [600, 40, 1100]],
  'culvert': [[-880, 10, 1240], [400, -20, 1240]], 'sluice-yard': [[-1900, 110, 600], [-1000, 0, 1300]], 'service-road': [[1500, 90, -1400], [1500, 40, 0]],
  'warden-yard': [[1900, 100, 440], [1400, 40, -200]], 'overview': [[0, 2400, 0], [0, 0, 0.01]],
};
for (const [name, [p, q]] of Object.entries(spots)) {
  if (only && !only.split(',').includes(name)) continue;
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  const yaw = Math.atan2(-dx, -dz) * 180 / Math.PI, pitch = Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI;
  await page.evaluate(([p, yaw, pitch]) => { __SF.spectate(p, yaw, pitch); }, [p, yaw, pitch]);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/d-${name}.png` });
}
console.log(JSON.stringify({ loadMs, info, errs }));
await browser.close();
