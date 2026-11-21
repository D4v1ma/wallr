// Stage 5 checks in Chromium: Saltpan Depot loads by default, radar + location names, enemy spotting,
// weapon icons in the killfeed, planting on Platform 2, switching maps, frame cost with 10 players.
// Usage: node tools/gameplay5-check.mjs <three.min.js> <outdir>
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
let ok = true;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const ev = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
const t0 = Date.now();
await page.goto(new URL('../index.html', import.meta.url).href);
await page.waitForFunction(() => window.__SF, null, { timeout: 180000 });
const load = Date.now() - t0;
let r = await ev(() => ({ map: __SF.Game.L.name, lux: __SF.Game.L.bakeStats.luxels, bake: __SF.Game.L.bakeStats.ms, nav: __SF.Nav.nodes.length, sites: __SF.Game.L.sites.map((s) => s.name).join('') }));
check('Saltpan Depot is the default map; loads with both sites', r.map === 'Saltpan Depot' && r.sites === 'AB' && r.lux < 200000, `${JSON.stringify(r)} in ${(load / 1000).toFixed(1)} s`);
await page.mouse.move(640, 360);
await ev(() => { __SF.play(); __SF.Input.freeMouse = true; __SF.Game.botsFrozen = true; __SF.Match.t = 0.05; });
await page.waitForFunction(() => __SF.Match.phase === 'live', null, { timeout: 8000 });

// radar + location names
const places = {};
for (const [name, x, y, z] of [['Platform 2', 900, 0, -1000], ['Shed 4', 900, 0, 1200], ['Culvert', -300, -48, 1240], ['Weighbridge', 150, 0, -550]]) {
  await ev(([x, y, z]) => __SF.place(__SF.Actors.me, x, y, z, 90), [x, y, z]);
  await wait(250);
  places[name] = await page.textContent('#hud-place');
}
check('the location under the radar follows you', Object.entries(places).every(([n, v]) => v === n), JSON.stringify(places));
const px = await ev(() => { const c = document.getElementById('hud-radar'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return { n, w: c.width }; });
check('the radar draws the map', px.n > px.w * px.w * 0.6, JSON.stringify(px));
await page.screenshot({ path: `${out}/g5-radar.png`, clip: { x: 0, y: 0, width: 260, height: 260 } });

// spotting: an enemy in plain view shows up, one behind a wall does not
const spot = await ev(async () => {
  const me = __SF.Actors.me, foe = __SF.Actors.list.find((a) => a.team !== me.team && a.isBot);
  __SF.place(me, 1300, 0, -1000, 90); __SF.Game.player.pitch = 0;           // on the platform looking west
  __SF.place(foe, 900, 0, -1000, -90);
  await new Promise((res) => setTimeout(res, 500));
  const seen = __SF.Radar.spotted.has(foe);
  __SF.place(foe, 900, 0, 1200, -90);                                         // in Shed 4, far behind walls
  await new Promise((res) => setTimeout(res, 1600));
  return { seen, later: __SF.Radar.spotted.has(foe) };
});
check('enemies appear on the radar when your team sees them, not through walls', spot.seen && !spot.later, JSON.stringify(spot));

// weapon icons in the killfeed
await ev(() => { const me = __SF.Actors.me, foe = __SF.Actors.list.find((a) => a.team !== me.team && a.isBot && a.alive); foe.damage(500, 'head', me, __SF.Game.weapon.def, me.player.pos); });
await wait(200);
r = await ev(() => ({ img: document.querySelectorAll('#hud-feed img.wi').length, icons: Object.keys(__SF.Actors.me ? window.__SF.Game : {}).length }));
check('the killfeed shows a weapon icon', r.img >= 1, JSON.stringify(r));
await page.screenshot({ path: `${out}/g5-feed.png` });

// planting on Platform 2
await ev(() => { __SF.Settings.set('team', 0); });
await page.waitForFunction(() => __SF.Match.phase === 'freeze', null, { timeout: 5000 });
await ev(() => {
  const me = __SF.Actors.me, B = __SF.Bomb;
  if (B.carrier && B.carrier !== me) { const w = B.carrier.loadout.byId('charge'); B.carrier.loadout.remove(w, false); }
  if (!me.loadout.byId('charge')) B.assign(me);
  __SF.Match.t = 0.05;
});
await page.waitForFunction(() => __SF.Match.phase === 'live', null, { timeout: 5000 });
await ev(() => __SF.place(__SF.Actors.me, 820, 0, -1000, 90));
await page.keyboard.press('Digit5'); await wait(1000);
// hold until it lands (game time can run slower than real time on a software renderer)
await page.mouse.down();
await page.waitForFunction(() => __SF.Bomb.state === 'planted', null, { timeout: 15000 }).catch(() => {});
await page.mouse.up(); await wait(300);
r = await ev(() => ({ state: __SF.Bomb.state, site: __SF.Bomb.site && __SF.Bomb.site.name, place: document.getElementById('hud-place').textContent }));
check('you can plant the charge on Platform 2 (site A)', r.state === 'planted' && r.site === 'A' && r.place === 'Platform 2', JSON.stringify(r));
await page.screenshot({ path: `${out}/g5-planted.png` });

// frame cost with 10 players in a live round
await ev(() => { __SF.Settings.set('team', 1); __SF.Game.botsFrozen = false; });
await page.waitForFunction(() => __SF.Match.phase === 'freeze', null, { timeout: 5000 });
await ev(() => { __SF.Match.t = 0.05; });
await wait(9000);
r = await ev(() => { const G = __SF.Game; return { js60: +(G.prepMs + G.tickMs * 64 / 60).toFixed(2), tick: +G.tickMs.toFixed(2), prep: +G.prepMs.toFixed(2), calls: __SF.R.stats.calls, tris: __SF.R.stats.tris, alive: __SF.Actors.list.filter((a) => a.alive).length }; });
check('10 players on Saltpan Depot: game JavaScript for a 60 FPS frame under 3 ms', r.js60 < 3, JSON.stringify(r));

// switching maps reloads into Hall B; ?map= overrides the saved choice
await ev(() => __SF.Settings.set('map', 'range'));
await page.waitForFunction(() => window.__SF && __SF.Game.L && __SF.Game.L.name === 'Hall B', null, { timeout: 180000 }).catch(() => {});
r = await ev(() => ({ map: window.__SF && __SF.Game.L && __SF.Game.L.name }));
check('choosing Hall B in the Match tab reloads into the range', r.map === 'Hall B', JSON.stringify(r));
await ev(() => __SF.Settings.set('map', 'depot')).catch(() => {});
check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
await browser.close();
