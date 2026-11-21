// Gameplay checks in a real browser: shooting, decals, plates, door, keyboard movement, reload.
// Usage: node tools/gameplay-check.mjs <three.min.js> <outdir>
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
await page.evaluate(() => { __SF.play(); __SF.Settings.set('mode', 'skirmish'); __SF.Actors.removeBots(); });
let ok = true;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const ev = (f, a) => page.evaluate(f, a);

// 1) spread board: 12 still shots at 256u, then 12 while "moving"
await ev(() => __SF.setView(160, 0, -160, -90, 0));
await page.waitForTimeout(300);
await ev(() => __SF.fire(12));
const d1 = await ev(() => __SF.FX.decals.next);
check('decals: entry + exit through the board + the wall behind (Stage 2 penetration)', d1 === 36, `decals=${d1}`);
const still = await ev(() => __SF.Game.weapon.inaccuracy(__SF.Game.player));
await ev(() => { const p = __SF.Game.player; p.vel = [0, 0, 225]; });
const moving = await ev(() => __SF.Game.weapon.inaccuracy(__SF.Game.player));
check('moving is far less accurate than standing', moving > still * 8, `still=${still.toFixed(1)} mrad, running=${moving.toFixed(1)} mrad`);
await ev(() => { __SF.Game.player.vel = [0, 0, 0]; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/g-spread.png` });

// 2) steel plate: aim at the 256u plate in lane 2 (416, 52, -416)
await ev(() => { __SF.setView(176, 0, -416, -90, Math.atan2(52 - 64, 240) * 180 / Math.PI); __SF.Game.weapon.fireInacc = 0; __SF.Game.weapon.punch = [0, 0]; });
await ev(() => __SF.fire(1));
const plate = await ev(() => ({ hits: __SF.Ents.stats.hits, state: __SF.Ents.targets.find((t) => t.c[0] === 416 && t.c[2] === -416).state }));
check('plate knocked down', plate.hits === 1 && plate.state === 'falling', JSON.stringify(plate));
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/g-plate.png` });

// 3) door: face the hall door from inside and press E
await ev(() => __SF.setView(-60, 0, 448, -90, 0));
await page.waitForTimeout(200);
await page.keyboard.press('KeyE');
await page.waitForTimeout(1200);
const door = await ev(() => __SF.Ents.doors.map((d) => +d.angle.toFixed(2)));
check('hall door swings open with E', Math.abs(door[0]) > 1.5, `angles=${door}`);
await page.screenshot({ path: `${out}/g-door.png` });
// close it again and shoot it: the hole must live in the door's own decal set
await page.keyboard.press('KeyE');
await page.waitForTimeout(1200);
await ev(() => { __SF.setView(-80, 0, 470, -90, 0); __SF.fire(1); });
const dd = await ev(() => ({ pens: __SF.Game.lastHit.pens, decals: __SF.Ents.doors[0].decals.next, angle: __SF.Ents.doors[0].angle }));
check('door closes and takes its own bullet holes (both faces)', dd.pens === 1 && dd.decals === 2 && dd.angle === 0, JSON.stringify(dd));

// 4) keyboard movement: hold W for 1.2s
await ev(() => __SF.setView(300, 0, -40, -90, 0));
await page.keyboard.down('KeyW');
await page.waitForTimeout(1200);
const mv = await ev(() => ({ x: __SF.Game.player.pos[0], speed: __SF.Game.player.speed(), gap: __SF.Viewmodel ? document.getElementById('xh').style.getPropertyValue('--xg') : '' }));
await page.keyboard.up('KeyW');
check('W moves the player at run speed', mv.x > 450 && Math.abs(mv.speed - 225) < 2, JSON.stringify(mv));
await ev(() => { __SF.Game.weapon.ammo = 12; });
check('crosshair opens while running', parseFloat(mv.gap) > 30, `gap=${mv.gap}`);

// 5) reload
await page.keyboard.press('KeyR');
await page.waitForTimeout(150);
const r0 = await ev(() => __SF.Game.weapon.state);
await page.waitForTimeout(2600);
const r1 = await ev(() => ({ ammo: __SF.Game.weapon.ammo, reserve: __SF.Game.weapon.reserve, state: __SF.Game.weapon.state }));
check('reload refills the magazine', r0 === 'reload' && r1.ammo === 30 && r1.reserve === 72, JSON.stringify(r1));

// 6) jump with Space
await page.keyboard.press('Space');
await page.waitForTimeout(250);
const air = await ev(() => ({ y: __SF.Game.player.pos[1], ground: __SF.Game.player.onGround }));
check('Space jumps', air.y > 30 && !air.ground, JSON.stringify(air));

// 7) frame cost
const perf = await ev(() => ({ cpu: __SF.Game.cpuMs, calls: __SF.R.stats.calls, tris: __SF.R.stats.tris }));
check('CPU frame cost under 4 ms', perf.cpu < 4, JSON.stringify(perf));
check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
await browser.close();
