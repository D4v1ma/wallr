// Screenshots of the Stage 4 viewmodels in key poses (idle, pump, shell load, bolt, scope, plant).
// Usage: node tools/stage4-vm-shots.mjs <three.min.js> <outdir>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, mkdirSync } from 'node:fs';
const [threePath, out = 'shots'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(threePath) }));
await page.route('https://fonts.**', (r) => r.abort());
await page.goto(new URL('../index.html', import.meta.url).href);
await page.waitForFunction(() => window.__SF, null, { timeout: 120000 });
await page.evaluate(() => { __SF.play(); __SF.Input.freeMouse = true; __SF.Actors.removeBots(); __SF.Game.freeze = true; __SF.setView(300, 0, 100, -90, -4); });
const shot = async (name, fn, arg) => {
  await page.evaluate(fn, arg);
  await page.evaluate(() => { __SF.Game.freeze = false; }); await page.waitForTimeout(120); await page.evaluate(() => { __SF.Game.freeze = true; });
  await page.evaluate(fn, arg);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const poses = [
  ['smg-idle', 'smg', null], ['smg-reload', 'smg', ['reload', 0.75, 'reload']], ['smg-knob', 'smg', ['reloadEmpty', 1.98, 'reload']],
  ['sg-idle', 'shotgun', null], ['sg-pump', 'shotgun', ['fire', 0.36]], ['sg-load', 'shotgun', ['reloadShell', 0.28, 'reload']], ['sg-pouch', 'shotgun', ['reloadShell', 0.16, 'reload']],
  ['sn-idle', 'sniper', null], ['sn-bolt', 'sniper', ['fire', 0.62]], ['sn-boltup', 'sniper', ['fire', 0.45]], ['sn-reload', 'sniper', ['reload', 0.9, 'reload']],
  ['ch-idle', 'charge', null], ['ch-plant', 'charge', ['plant', 1.05, 'plant']],
];
for (const [name, id, pose] of poses) {
  await shot(name, ([id, pose]) => {
    if (!__SF.Game.loadout.byId(id)) __SF.give(id); else __SF.select(id);
    const w = __SF.Game.loadout.active; if (w.state === 'draw') { w.state = 'idle'; w.anim = 'idle'; }
    if (pose) __SF.pose(pose[0], pose[1], pose[2]);
  }, [id, pose]);
}
// scope views
await page.evaluate(() => { __SF.select('sniper'); const w = __SF.Game.loadout.active; w.state = 'idle'; w.anim = 'idle'; w.zoom = 1; __SF.Game.freeze = false; });
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/sn-scope1.png` });
await page.evaluate(() => { __SF.Game.loadout.active.zoom = 2; });
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/sn-scope2.png` });
console.log('errors', JSON.stringify(errs));
await browser.close();
