// Stage 2 visual harness: every viewmodel idle + mid-animation, spray effects, smoke.
// Usage: node tools/stage2-shots.mjs <three.min.js> <outdir> [groups...]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, mkdirSync } from 'node:fs';
const [threePath, out = 'shots', ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const want = (g) => !only.length || only.includes(g);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(threePath) }));
await page.route('https://fonts.**', (r) => r.abort());
await page.goto(new URL('../index.html', import.meta.url).href + '?map=range');
await page.waitForFunction(() => window.__SF, null, { timeout: 90000 });
await page.evaluate(() => { __SF.play(); __SF.Input.freeMouse = true; __SF.Settings.set('mode', 'skirmish'); __SF.Actors.removeBots(); });
const ev = (f, a) => page.evaluate(f, a);
const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${name}.png` }); };
const posed = async (name, id, anim, t, state, view = [700, 0, -560, 0, 6]) => {
  await ev(([id, anim, t, state, view]) => {
    __SF.Game.freeze = false; __SF.select(id); __SF.setView(...view); const w = __SF.Game.loadout.active;
    w.state = 'idle'; __SF.Game.freeze = true; __SF.pose(anim, t, state);
  }, [id, anim, t, state, view]);
  await shot(name);
};
if (want('idle')) for (const id of ['rifle', 'pistol', 'knife', 'smoke']) await posed(`vm-${id}`, id, 'idle', 0, 'idle');
if (want('anim')) {
  await posed('rifle-reload-a', 'rifle', 'reload', 0.8, 'reload');
  await posed('rifle-reload-b', 'rifle', 'reload', 1.3, 'reload');
  await posed('rifle-inspect', 'rifle', 'inspect', 1.2, 'inspect');
  await posed('pistol-reload', 'pistol', 'reload', 0.7, 'reload');
  await posed('pistol-inspect', 'pistol', 'inspect', 0.9, 'inspect');
  await posed('knife-slash', 'knife', 'slashL', 0.13, 'attack');
  await posed('knife-inspect', 'knife', 'inspect', 1.0, 'inspect');
  await posed('smoke-pull', 'smoke', 'pullOver', 0.2, 'pull');
}
if (want('spray')) {
  await page.mouse.move(480, 270);
  await page.waitForTimeout(100);
  await ev(() => { __SF.Game.freeze = false; __SF.select('rifle'); __SF.setView(160, 0, -160, -90, 0); const w = __SF.Game.loadout.active; w.state = 'idle'; w.ammo = 30; });
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/spray-mid.png` });
  await page.waitForTimeout(2400);
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/spray-board.png` });
  const st = await ev(() => ({ shells: __SF.FX.shells.list.length, decals: __SF.FX.decals.next, tracers: __SF.FX.tracers.list.length, ammo: __SF.Game.weapon.ammo }));
  console.log('spray', JSON.stringify(st));
  await ev(() => __SF.setView(330, 0, -160, -90, 0));
  await shot('spray-board-close');
  await ev(() => __SF.setView(150, 0, -200, 150, -55));
  await shot('spray-casings');
}
if (want('smoke')) {
  await page.mouse.move(480, 270); await page.waitForTimeout(100);
  await ev(() => { __SF.Game.freeze = false; __SF.select('smoke'); __SF.setView(300, 0, 300, -90, 2); });
  await page.waitForTimeout(800);
  await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up();  // (mouse already parked: no look delta)
  await page.waitForTimeout(4500);
  await ev(() => __SF.setView(260, 0, 420, -60, 0));
  await shot('smoke-outside');
  const c = await ev(() => { const g = __SF.Grenades.clouds[0]; return g ? g.p : null; });
  console.log('cloud at', JSON.stringify(c));
  if (c) { await ev((c) => __SF.setView(c[0] - 40, c[1], c[2], -90, 0), c); await shot('smoke-inside'); }
  await ev((c) => __SF.setView(c[0] - 420, 0, c[2], -90, 0), c);
  await shot('smoke-far');
}
console.log(errs.length ? errs.slice(0, 8).join('\n') : 'no page errors');
await browser.close();
