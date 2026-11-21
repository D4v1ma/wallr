// Stage 4 checks in Chromium: new guns, drops and pickups, buying, rounds, the charge.
// Usage: node tools/gameplay4-check.mjs <three.min.js> <outdir> [section]
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
await page.goto(new URL('../index.html', import.meta.url).href + '?map=range');
await page.waitForFunction(() => window.__SF, null, { timeout: 120000 });
let ok = true;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const ev = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
const want = (s) => !only || only.split(',').includes(s);
await page.mouse.move(640, 360);
await ev(() => { __SF.play(); __SF.Input.freeMouse = true; });

if (want('items')) {
  await ev(() => { __SF.Settings.set('mode', 'skirmish'); __SF.Actors.removeBots(); __SF.setView(640, 0, -40, -90, 0); __SF.give('smg'); });
  await wait(300);
  await page.keyboard.press('KeyG');
  await wait(1500);
  let r = await ev(() => ({ n: __SF.Items.list.length, rest: __SF.Items.list[0] && __SF.Items.list[0].rest, y: __SF.Items.list[0] && __SF.Items.list[0].p[1], held: __SF.Game.loadout.ids(), x: __SF.Items.list[0] && __SF.Items.list[0].p[0] }));
  check('G throws the SMG; it lands on the ground', r.n === 1 && r.rest && r.y < 4 && r.x > 680 && !r.held.includes('smg'), JSON.stringify(r));
  await page.screenshot({ path: `${out}/g4-drop.png` });
  await ev(() => { const it = __SF.Items.list[0]; __SF.setView(it.p[0] - 60, 0, it.p[2], -90, 0); });
  await page.keyboard.down('KeyW'); await wait(700); await page.keyboard.up('KeyW'); await wait(200);
  r = await ev(() => ({ n: __SF.Items.list.length, held: __SF.Game.loadout.ids(), active: __SF.Game.weapon.def.id }));
  check('walking over it picks it up into the empty slot and switches to it', r.n === 0 && r.held.includes('smg') && r.active === 'smg', JSON.stringify(r));
  // swap with E: drop a sniper on the floor in front of you and look at it
  await ev(() => { __SF.setView(640, 0, -40, -90, 0); __SF.give('sniper'); __SF.give('smg'); });
  await ev(() => { const a = __SF.Actors.me, w = a.loadout.byId('smg'); __SF.Items.drop(a, a.loadout.active, true); });
  await wait(1200);
  r = await ev(() => ({ held: __SF.Game.loadout.ids(), items: __SF.Items.list.map((i) => i.id) }));
  await ev(() => { const it = __SF.Items.list[0], p = __SF.Game.player; __SF.give('rifle'); __SF.setView(it.p[0] - 70, 0, it.p[2], -90, -35); });
  await wait(300);
  const prompt = await page.textContent('#hud-prompt');
  await page.keyboard.press('KeyE'); await wait(400);
  r = await ev(() => ({ held: __SF.Game.loadout.ids(), items: __SF.Items.list.map((i) => i.id) }));
  check('E swaps the rifle in hand for the weapon on the floor', prompt.includes('swap for') && r.held.includes('smg') && r.items.includes('rifle'), `${prompt} ${JSON.stringify(r)}`);
  await ev(() => { __SF.Items.clear(); for (let i = 0; i < 5; i++) __SF.Actors.addBot(0); for (let i = 0; i < 4; i++) __SF.Actors.addBot(1); __SF.Settings.set('mode', 'defuse'); });
}

if (want('round')) {
  await ev(() => { __SF.Game.botsFrozen = true; __SF.Match.startMatch(); });
  await wait(400);
  let r = await ev(() => ({ n: __SF.Actors.list.length, mode: __SF.Settings.v.mode, phase: __SF.Match.phase, cash: document.getElementById('hud-cash').textContent, clock: document.querySelector('#hud-score em') && document.querySelector('#hud-score em').textContent, alive: document.querySelectorAll('#hud-alive i.on').length, tag: document.getElementById('hud-tag').textContent }));
  check('defuse is the default: 5v5, freeze time, $800, clock and alive pips on the HUD', r.n === 10 && r.mode === 'defuse' && r.phase === 'freeze' && r.cash === '800' && /^0:(0\d|10)$/.test(r.clock) && r.alive === 10, JSON.stringify(r));
  await page.keyboard.press('KeyB'); await wait(250);
  r = await ev(() => ({ open: !document.getElementById('buy-menu').hidden, items: document.querySelectorAll('#buy-menu button').length, disabled: Array.from(document.querySelectorAll('#buy-menu button:disabled')).map((b) => b.dataset.id) }));
  check('B opens the buy menu; unaffordable items are greyed out', r.open && r.items === 9 && r.disabled.includes('rifle') && r.disabled.includes('sniper') && !r.disabled.includes('vest'), JSON.stringify(r));
  await page.keyboard.press('Digit6'); await wait(300);
  await page.screenshot({ path: `${out}/g4-buy.png` });
  r = await ev(() => ({ money: __SF.Actors.me.money, armor: __SF.Actors.me.armor, delta: document.getElementById('hud-cashd').textContent, msg: document.querySelector('#buy-menu .msg').textContent }));
  check('6 buys a vest: $650 off, 100 armor, "−$650" flashes by the money', r.money === 150 && r.armor === 100 && r.delta === '−$650' && r.msg === 'Bought Vest', JSON.stringify(r));
  await page.keyboard.press('KeyB'); await wait(150);
  const p0 = await ev(() => __SF.Game.player.pos.slice());
  await page.keyboard.down('KeyW'); await wait(800); await page.keyboard.up('KeyW');
  const p1 = await ev(() => __SF.Game.player.pos.slice());
  check('freeze time: you cannot move yet', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) < 1, `moved ${Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(1)}`);
  await page.waitForFunction(() => __SF.Match.phase === 'live', null, { timeout: 15000 });
  await wait(300);
  r = await ev(() => ({ banner: document.querySelector('#hud-banner h2') && document.querySelector('#hud-banner h2').textContent, clock: document.querySelector('#hud-score em').textContent }));
  check('the round goes live with a "Go" banner and 1:55 on the clock', r.banner === 'Go' && /^1:5[45]$/.test(r.clock), JSON.stringify(r));
  await page.screenshot({ path: `${out}/g4-live.png` });
}

if (want('bomb')) {
  // you as a Raider with the charge, dropped into site A once the round is live
  await ev(() => { __SF.Settings.set('team', 0); __SF.Game.botsFrozen = true; });
  await page.waitForFunction(() => __SF.Match.phase === 'freeze', null, { timeout: 5000 });
  await ev(() => {
    const me = __SF.Actors.me, B = __SF.Bomb;
    if (B.carrier && B.carrier !== me) { const w = B.carrier.loadout.byId('charge'); B.carrier.loadout.remove(w, false); }
    if (!me.loadout.byId('charge')) B.assign(me);
    __SF.Match.t = 0.05;
  });
  await page.waitForFunction(() => __SF.Match.phase === 'live', null, { timeout: 5000 });
  await ev(() => { __SF.place(__SF.Actors.me, 1000, 0, -470, 120); });
  await page.keyboard.press('Digit5'); await wait(1000);
  let r = await ev(() => ({ prompt: document.getElementById('hud-prompt').textContent, carry: document.getElementById('hud-carry').className }));
  check('in site A with the charge: plant prompt and a blinking charge icon', r.prompt === 'Hold Mouse 1 to plant the charge' && r.carry === 'carry site', JSON.stringify(r));
  await page.mouse.down(); await wait(1600);
  r = await ev(() => ({ bar: document.getElementById('hud-progress').hidden ? null : document.getElementById('hud-progress-label').textContent, w: parseFloat(document.getElementById('hud-progress-bar').style.width) }));
  await page.screenshot({ path: `${out}/g4-planting.png` });
  check('holding fire shows the planting progress', r.bar === 'Planting the charge' && r.w > 30 && r.w < 70, JSON.stringify(r));
  await wait(1900); await page.mouse.up(); await wait(400);
  r = await ev(() => ({ state: __SF.Bomb.state, site: __SF.Bomb.site && __SF.Bomb.site.name, clock: document.querySelector('#hud-score em').className, banner: document.querySelector('#hud-banner h2') && document.querySelector('#hud-banner h2').textContent, held: __SF.Game.weapon.def.id, money: __SF.Actors.me.money }));
  check('planted: the clock turns into a pulsing CHARGE, banner, $300 for the planter', r.state === 'planted' && r.site === 'A' && r.clock === 'planted' && r.banner === 'Charge planted at A' && r.held !== 'charge' && r.money === 1100, JSON.stringify(r));
  await ev(() => { __SF.Game.player.pitch = -0.6; });
  await wait(500);
  await page.screenshot({ path: `${out}/g4-planted.png` });
  // a Warden bot standing on it, defusing without a kit; then the fuse runs out instead (we pull it away)
  await ev(() => { __SF.Match.t = 99; const B = __SF.Bomb; B.timer = 1.5; __SF.place(__SF.Actors.me, B.pos[0] - 300, 0, B.pos[2] + 200, 60); });
  await wait(2200);
  r = await ev(() => ({ state: __SF.Bomb.state, reason: __SF.Match.result && __SF.Match.result.reason, side: __SF.Match.result && __SF.Match.result.side, banner: document.querySelector('#hud-banner h2') && document.querySelector('#hud-banner h2').textContent }));
  await page.screenshot({ path: `${out}/g4-blast.png` });
  check('the charge goes off: Raiders win, banner says so', r.state === 'exploded' && r.reason === 'bomb' && r.side === 0 && r.banner === 'Raiders win', JSON.stringify(r));
  // defusing as a Warden
  await ev(() => { __SF.Settings.set('team', 1); });
  await page.waitForFunction(() => __SF.Match.phase === 'freeze', null, { timeout: 5000 });
  await ev(() => { __SF.Match.t = 0.05; });
  await page.waitForFunction(() => __SF.Match.phase === 'live', null, { timeout: 5000 });
  await ev(() => {
    const B = __SF.Bomb, c = B.carrier, w = c.loadout.byId('charge'), site = B.siteByName('B');
    __SF.place(c, 780, 0, 520, 0); B.plant(c, w, site); __SF.place(c, -900, 0, -300, 0);
    __SF.place(__SF.Actors.me, 800, 0, 520, 90); __SF.Game.player.pitch = -0.9;
  });
  await wait(300);
  const pr = await page.textContent('#hud-prompt');
  await page.keyboard.down('KeyE'); await wait(4000);
  r = await ev(() => ({ bar: document.getElementById('hud-progress-label').textContent, f: __SF.Bomb.defuseT }));
  await page.screenshot({ path: `${out}/g4-defusing.png` });
  check('as a Warden: "Hold E to defuse", progress bar while holding', pr === 'Hold E to defuse the charge (10 s)' && r.bar === 'Defusing' && r.f > 3, `${pr} ${JSON.stringify(r)}`);
  await wait(6400); await page.keyboard.up('KeyE'); await wait(300);
  r = await ev(() => ({ state: __SF.Bomb.state, reason: __SF.Match.result && __SF.Match.result.reason, sub: document.querySelector('#hud-banner p') && document.querySelector('#hud-banner p').textContent }));
  check('10 s later the charge is defused: Wardens win', r.state === 'defused' && r.reason === 'defuse' && r.sub === 'the charge was defused', JSON.stringify(r));
  await page.screenshot({ path: `${out}/g4-defused.png` });
}

if (want('spectate')) {
  await page.waitForFunction(() => __SF.Match.phase === 'freeze', null, { timeout: 9000 });
  await ev(() => { __SF.Match.t = 0.05; __SF.Game.botsFrozen = true; });
  await page.waitForFunction(() => __SF.Match.phase === 'live', null, { timeout: 5000 });
  await ev(() => { const me = __SF.Actors.me, foe = __SF.Actors.list.find((a) => a.team !== me.team); me.damage(500, 'chest', foe, __SF.Game.weapon.def, foe.player.pos); });
  await wait(3000);
  let r = await ev(() => ({ msg: document.getElementById('hud-dead').textContent, t: __SF.Game.specTarget && __SF.Game.specTarget.name, drop: __SF.Items.list.map((i) => i.id) }));
  await page.screenshot({ path: `${out}/g4-spectate.png` });
  check('dead: your gun drops and the camera follows a living teammate', !!r.t && r.msg.includes('Spectating') && r.drop.length >= 1, JSON.stringify(r));
  await page.mouse.down(); await wait(80); await page.mouse.up(); await wait(200);
  const t2 = await ev(() => __SF.Game.specTarget && __SF.Game.specTarget.name);
  check('Mouse 1 switches to the next teammate', t2 && t2 !== r.t, `${r.t} -> ${t2}`);
  await page.keyboard.down('Tab'); await wait(200);
  r = await ev(() => ({ cols: document.querySelectorAll('#hud-board table:first-of-type th').length, hist: document.querySelectorAll('#hud-board .hist i').length, money: document.querySelector('#hud-board tr.me td:last-child') && document.querySelector('#hud-board tr.me td:last-child').textContent }));
  await page.screenshot({ path: `${out}/g4-board.png` });
  await page.keyboard.up('Tab');
  check('scoreboard shows money and the round history', r.cols === 5 && r.hist >= 1 && /^\$/.test(r.money || ''), JSON.stringify(r));
}

if (want('skirmish')) {
  await ev(() => { __SF.Settings.set('mode', 'skirmish'); });
  await wait(300);
  const r = await ev(() => ({ active: __SF.Match.active, alive: __SF.Actors.list.every((a) => a.alive), restock: __SF.Game.loadout.restock, ids: __SF.Game.loadout.ids(), range: !document.getElementById('hud-range').hidden }));
  check('Skirmish mode brings back Stage 3 rules: respawns, full kit, range stats', !r.active && r.alive && r.restock && r.ids.includes('rifle') && r.range, JSON.stringify(r));
  await ev(() => { __SF.Settings.set('mode', 'defuse'); });
}

if (want('perf')) {
  await ev(() => { __SF.Game.botsFrozen = false; __SF.Match.startMatch(); __SF.Match.t = 0.05; });
  await wait(9000);
  const perf = await ev(() => { const G = __SF.Game; return { frame: +G.cpuMs.toFixed(2), render: +G.renderMs.toFixed(2), tick: +G.tickMs.toFixed(2), prep: +G.prepMs.toFixed(2), js60: +(G.prepMs + G.tickMs * 64 / 60).toFixed(2), calls: __SF.R.stats.calls, tris: __SF.R.stats.tris, alive: __SF.Actors.list.filter((a) => a.alive).length }; });
  check('10 players in a live round: game JavaScript for a 60 FPS frame under 3 ms (one 64 Hz tick + frame prep)', perf.js60 < 3, JSON.stringify(perf));
}

check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
await browser.close();
