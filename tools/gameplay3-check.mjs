// Stage 3 checks in Chromium: shooting bots, being killed and respawning, friendly fire, bots menu, team switch.
// Usage: node tools/gameplay3-check.mjs <three.min.js> <outdir>
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
let ok = true;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const ev = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
await ev(() => { __SF.Settings.set('mode', 'skirmish'); __SF.Actors.removeBots(); for (let i = 0; i < 3; i++) __SF.Actors.addBot(0); for (let i = 0; i < 2; i++) __SF.Actors.addBot(1); });
const n0 = await ev(() => __SF.Actors.list.map((a) => [a.name, a.team, a.isBot]));
check('skirmish lobby: you plus five bots, three a side', n0.length === 6 && n0.filter((a) => a[1] === 0).length === 3, JSON.stringify(n0));
// bots menu buttons
await page.click('#tab-bots');
await page.click('#bot-clear');
let c = await ev(() => __SF.Actors.list.length);
check('Remove all bots leaves only you', c === 1, `actors=${c}`);
await page.click('#bot-add-0'); await page.click('#bot-add-1');
const status = await page.textContent('#bot-status');
check('Add Raider / Add Warden buttons work', status.startsWith('1 Raider bot and 1 Warden bot'), status);
await page.mouse.move(640, 360);
await ev(() => { __SF.play(); __SF.Input.freeMouse = true; });
// 1) shoot an enemy bot held in place
await ev(() => {
  __SF.Game.botsFrozen = true;
  const me = __SF.Actors.me, enemy = __SF.Actors.list.find((a) => a.isBot && a.team !== me.team);
  __SF.place(me, 300, 0, 100, -90); __SF.place(enemy, 700, 0, 100, 90); window.__enemy = enemy;
  const p = __SF.Game.player; p.pitch = Math.atan2(enemy.player.pos[1] + 66 - (p.pos[1] + 64), 400);
});
await wait(1300);
for (let i = 0; i < 6; i++) { await page.mouse.down(); await wait(40); await page.mouse.up(); await wait(260); }
let r = await ev(() => ({ alive: window.__enemy.alive, hp: window.__enemy.health, feed: __SF.Actors.feed.map((f) => `${f.killer}>${f.victim}${f.hs ? ' HS' : ''}`), score: __SF.Actors.score.slice(), last: __SF.Game.lastHit }));
check('tapping the enemy kills it (headshots)', !r.alive && r.feed.some((f) => f.startsWith('You>')), JSON.stringify(r));
await page.screenshot({ path: `${out}/g3-kill.png` });
await wait(3300);
r = await ev(() => ({ alive: window.__enemy.alive, hp: window.__enemy.health }));
check('the bot respawns after 3 s with full health', r.alive && r.hp === 100, JSON.stringify(r));
// 2) friendly fire off: shooting a teammate does nothing
await ev(() => {
  const me = __SF.Actors.me, mate = __SF.Actors.list.find((a) => a.isBot && a.team === me.team);
  __SF.place(me, 300, 0, -40, -90); __SF.place(mate, 520, 0, -40, 90); window.__mate = mate; __SF.Game.player.pitch = 0;
});
await wait(500);
await page.mouse.down(); await wait(400); await page.mouse.up(); await wait(200);
r = await ev(() => ({ hp: window.__mate.health }));
check('friendly fire off: teammates take no damage', r.hp === 100, JSON.stringify(r));
// 3) an enemy bot kills you, then you respawn
// (teammate removed first so the duel is one on one)
await ev(() => {
  __SF.Settings.set('botSkill', 'hard'); __SF.Actors.removeBots();
  const me = __SF.Actors.me, enemy = __SF.Actors.addBot(1 - me.team); window.__enemy = enemy;
  __SF.place(me, 640, 0, 100, -90); __SF.place(enemy, 300, 0, 100, -90);
  __SF.Game.botsFrozen = false;
});
await page.waitForFunction(() => !__SF.Actors.me.alive, null, { timeout: 15000 }).catch(() => {});
r = await ev(() => ({ alive: __SF.Actors.me.alive, killer: __SF.Actors.me.killer && __SF.Actors.me.killer.name, msg: document.getElementById('hud-dead').textContent, hidden: document.getElementById('hud-dead').hidden, feed: __SF.Actors.feed.map((f) => `${f.killer}>${f.victim}`) }));
check('an enemy bot hunts you down; death message shows', !r.alive && !!r.killer && !r.hidden && r.msg.includes('Killed by'), JSON.stringify(r));
await page.screenshot({ path: `${out}/g3-dead.png` });
await wait(3400);
r = await ev(() => ({ alive: __SF.Actors.me.alive, hp: __SF.Actors.me.health, ammo: __SF.Game.weapon.ammo }));
check('you respawn with full health and ammo', r.alive && r.hp === 100 && r.ammo === 30, JSON.stringify(r));
// 4) scoreboard
await page.keyboard.down('Tab'); await wait(200);
const board = await ev(() => ({ hidden: document.getElementById('hud-board').hidden, rows: document.querySelectorAll('#hud-board tr').length }));
await page.screenshot({ path: `${out}/g3-board.png` });
await page.keyboard.up('Tab');
check('Tab shows the scoreboard', !board.hidden && board.rows >= 4, JSON.stringify(board));
// 5) team switch from the menu
await ev(() => { __SF.Settings.set('team', 0); });
r = await ev(() => ({ team: __SF.Actors.me.team, x: __SF.Game.player.pos[0] }));
check('switching to the Raiders respawns you on their side', r.team === 0 && r.x < -500, JSON.stringify(r));
// 6) perf with a full lobby fighting
await ev(() => { __SF.Settings.set('team', 1); __SF.Actors.removeBots(); for (let i = 0; i < 3; i++) __SF.Actors.addBot(0); for (let i = 0; i < 2; i++) __SF.Actors.addBot(1); });
await wait(6000);
const perf = await ev(() => ({ cpu: +__SF.Game.cpuMs.toFixed(2), calls: __SF.R.stats.calls, tris: __SF.R.stats.tris, score: __SF.Actors.score }));
check('frame cost with 5 bots fighting stays under 5 ms CPU', perf.cpu < 5, JSON.stringify(perf));
check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
await browser.close();
