// Stage 2 gameplay checks in Chromium with real key/mouse events.
// Usage: node tools/gameplay2-check.mjs <three.min.js> <outdir>
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
await page.waitForFunction(() => window.__SF, null, { timeout: 90000 });
await page.mouse.move(640, 360);
await page.evaluate(() => { __SF.play(); __SF.Input.freeMouse = true; __SF.Settings.set('mode', 'skirmish'); __SF.Actors.removeBots(); });
let ok = true;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const ev = (f, a) => page.evaluate(f, a);
const active = () => ev(() => ({ id: __SF.Game.weapon.def.id, state: __SF.Game.weapon.state, anim: __SF.Game.weapon.anim }));
const wait = (ms) => page.waitForTimeout(ms);

await ev(() => __SF.setView(300, 0, -40, -90, 0));
await wait(1200);
// weapon selection
await page.keyboard.press('Digit2'); await wait(150);
let a = await active();
check('2 selects the pistol (drawing)', a.id === 'pistol' && a.state === 'draw', JSON.stringify(a));
await page.keyboard.press('Digit3'); await wait(150);
a = await active(); check('3 selects the knife', a.id === 'knife', a.id);
await page.keyboard.press('KeyQ'); await wait(150);
a = await active(); check('Q returns to the last weapon', a.id === 'pistol', a.id);
await page.mouse.wheel(0, 120); await wait(150);
a = await active(); check('mouse wheel cycles to the next weapon', a.id === 'knife', a.id);
const speeds = await ev(() => ({ knife: __SF.Game.player.maxSpeed }));
check('knife raises max speed to 250', speeds.knife === 250, JSON.stringify(speeds));
// pistol: semi-auto click
await page.keyboard.press('Digit2'); await wait(800);
await page.mouse.down(); await wait(400); await page.mouse.up(); await wait(100);
let p = await ev(() => __SF.Game.weapon.ammo);
check('pistol fires one round per click', p === 14, `ammo=${p}`);
// inspect
await wait(300);
await page.keyboard.press('KeyF'); await wait(150);
a = await active(); check('F plays the inspect animation', a.anim === 'inspect' && a.state === 'inspect', JSON.stringify(a));
// knife slash + stab on the hall wall
await ev(() => __SF.setView(-990, 0, 0, 90, 0));
await page.keyboard.press('Digit3'); await wait(900);
const d0 = await ev(() => __SF.FX.decals.next);
await page.mouse.down(); await wait(300); await page.mouse.up(); await wait(200);
let k = await ev(() => ({ decals: __SF.FX.decals.next, hit: __SF.Game.lastHit && __SF.Game.lastHit.what }));
check('knife slash marks the brick wall', k.decals > d0 && k.hit === 'brick', JSON.stringify(k));
await wait(500);
await page.mouse.down({ button: 'right' }); await wait(150);
a = await active(); await page.mouse.up({ button: 'right' });
check('Mouse 2 stabs', a.anim === 'stab', a.anim);
// penetration through the closed hall door from inside
await wait(900);
await page.keyboard.press('Digit1'); await wait(1100);
await ev(() => __SF.setView(-80, 0, 470, -90, 0));
await wait(200);
await page.mouse.down(); await wait(40); await page.mouse.up(); await wait(150);
const pen = await ev(() => ({ last: __SF.Game.lastHit, doorDecals: __SF.Ents.doors[0].decals.next }));
check('rifle shot penetrates the wooden door', pen.last && pen.last.pens >= 1 && pen.doorDecals >= 2, JSON.stringify(pen));
// smoke grenade: hold, release, cloud appears
await ev(() => __SF.setView(300, 0, 200, -90, 10));
await page.keyboard.press('Digit4'); await wait(900);
await page.mouse.down(); await wait(500); await page.mouse.up(); await wait(800);
const g1 = await ev(() => ({ nades: __SF.Grenades.list.length, active: __SF.Game.weapon.def.id }));
check('smoke grenade thrown, previous weapon returns', g1.nades === 1 && g1.active === 'rifle', JSON.stringify(g1));
await wait(4200);
const g2 = await ev(() => ({ clouds: __SF.Grenades.clouds.length, puffs: __SF.FX.smoke.n }));
check('smoke cloud deploys and renders puffs', g2.clouds === 1 && g2.puffs > 30, JSON.stringify(g2));
await page.screenshot({ path: `${out}/g2-smoke.png` });
// rifle spray: 600 RPM full auto consumes ammo and ejects casings
await ev(() => { __SF.setView(160, 0, -160, -90, 0); __SF.Game.weapon.ammo = 30; });
await wait(200);
const s0 = await ev(() => __SF.FX.shells.list.length);
await page.mouse.down(); await wait(1000); await page.mouse.up();
const s1 = await ev(() => ({ ammo: __SF.Game.weapon.ammo, shells: __SF.FX.shells.list.length })); s1.shells -= s0;
check('full-auto spray ~10 rounds/s with casings', s1.ammo <= 22 && s1.ammo >= 18 && s1.shells >= 8, JSON.stringify(s1));
const perf = await ev(() => ({ cpu: +__SF.Game.cpuMs.toFixed(2), calls: __SF.R.stats.calls, tris: __SF.R.stats.tris }));
check('CPU frame cost under 4 ms with effects active', perf.cpu < 4, JSON.stringify(perf));
check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
await browser.close();
