// wallr browser checks: wallbang rounds (X, the unlock wait, the count, through a real wall),
// scoping in (Mouse 2), the admin passcode (noclip, unlimited rounds and money, x-ray, radar) and
// admin matches not counting.
// Usage: node tools/gameplay7-check.mjs <three.min.js path> <screenshot dir>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [threePath, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(threePath) }));
await page.route('https://fonts.**', (r) => r.abort());
await page.goto(new URL('../index.html', import.meta.url).href + '?map=range');
await page.waitForFunction(() => window.__SF && __SF.Game.state === 'menu', null, { timeout: 240000 });
let ok = true;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const ev = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
check('the game is called wallr', (await page.title()) === 'wallr' && /wallr/i.test(await page.textContent('#sf-title')));

// a skirmish: you (Wardens) and one Raider bot, frozen in place
await page.click('[data-act="acct-guest"]');
await ev(() => { __SF.Session.begin({ map: 'range', mode: 'skirmish', ranked: false, diff: 'normal', team: '1', allies: 0, enemies: 1, len: 'standard', ff: false }); __SF.play(); __SF.Input.freeMouse = true; __SF.Game.botsFrozen = true; __SF.Settings.set('showHints', false); });
await wait(300);
// 1) the wait, then loading a round with X
await page.keyboard.press('KeyX');
await wait(250);
let r = await ev(() => ({ armed: __SF.Wallbang.armed(__SF.Actors.me), unlock: __SF.Wallbang.unlockIn(__SF.Actors.me), hud: document.getElementById('hud-wb').textContent, note: document.getElementById('hud-note').textContent }));
check('X does nothing until wallbang rounds unlock (10 s); the HUD counts down', !r.armed && r.unlock > 0 && /unlocks in \d+ s/.test(r.hud) && /unlock/.test(r.note), JSON.stringify(r));
await ev(() => { __SF.Actors.me.aliveT = 10.5; });
await wait(200);
await page.keyboard.press('KeyX');
await wait(250);
r = await ev(() => ({ armed: __SF.Wallbang.armed(__SF.Actors.me), hud: document.getElementById('hud-wb').textContent, pips: document.querySelectorAll('#hud-wb .wb-p i.on').length, xh: document.getElementById('xh').className }));
check('after 10 s, X loads a round: ARMED on the HUD, 3 left, the crosshair marks it', r.armed && /ARMED/.test(r.hud) && r.pips === 3 && /wb/.test(r.xh), JSON.stringify(r));
await page.screenshot({ path: `${out}/g7-armed.png` });
await page.keyboard.press('KeyX');
await wait(150);
check('X again unloads it', await ev(() => !__SF.Wallbang.armed(__SF.Actors.me)));

// 2) through a wall: a normal shot stops, a wallbang round goes through and kills
await ev(() => {
  const me = __SF.Actors.me, enemy = __SF.Actors.list.find((a) => a.isBot); window.__enemy = enemy;
  __SF.place(me, 300, 0, 300, 90); __SF.place(enemy, -200, 0, 300, -90); enemy.armor = 0; enemy.helmet = false;
  const p = __SF.Game.player; p.pitch = Math.atan2(enemy.player.pos[1] + 50 - (p.pos[1] + 64), 500);
  __SF.select('rifle');
  const w = __SF.Game.loadout.active; w.state = 'idle'; w.anim = 'idle';
});
await wait(300);
r = await ev(() => { const hp = window.__enemy.health; __SF.fire(1, true); return { before: hp, after: window.__enemy.health, last: __SF.Game.lastHit }; });
check('a normal rifle shot stops in the hall wall', r.after === r.before, JSON.stringify({ hp: r.after, hit: r.last && r.last.what }));
await ev(() => { window.__enemy.health = 100; __SF.Actors.me.wbArmed = false; const e = window.__enemy, p = __SF.Game.player; p.pitch = Math.atan2(e.player.pos[1] + 66 - (p.pos[1] + 64), 500); });
await page.keyboard.press('KeyX');
await wait(150);
r = await ev(() => {
  const me = __SF.Actors.me;
  __SF.fire(1, false);
  return { alive: window.__enemy.alive, hp: window.__enemy.health, left: __SF.Wallbang.charges(me), armed: __SF.Wallbang.armed(me), walls: __SF.Game.lastHit && __SF.Game.lastHit.pens, feed: __SF.Actors.feed.map((f) => `${f.killer}>${f.victim}${f.wb ? ' WB' : ''}`) };
});
await wait(200);
const badge = await page.$$('.hud-feed .wbk');
check('the wallbang round goes through the wall and drops the enemy (head); one round used', !r.alive && r.left === 2 && r.walls >= 1 && !r.armed && r.feed.some((f) => f.endsWith(' WB')) && badge.length >= 1, JSON.stringify(r));
await page.screenshot({ path: `${out}/g7-wallbang.png` });
r = await ev(() => { const me = __SF.Actors.me; me.wbCharges = 0; return __SF.Wallbang.toggle(me); });
check('with none left, X won’t load another', r === 'empty', r);

// 3) scoping in with Mouse 2
await ev(() => { const me = __SF.Actors.me; __SF.place(me, 300, 0, 100, 90); __SF.Game.player.pitch = 0; window.__fov0 = __SF.R.camera.fov; window.__in0 = __SF.Game.loadout.active.inaccuracy(__SF.Game.player); });
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'right' });
await wait(700);
r = await ev(() => { const w = __SF.Game.loadout.active; return { ads: w.ads, fov0: window.__fov0, fov: __SF.R.camera.fov, in0: window.__in0, in1: w.inaccuracy(__SF.Game.player), speed: w.speed(), base: w.def.maxSpeed, xh: document.getElementById('xh').style.opacity }; });
check('holding Mouse 2 scopes in: a slight zoom, a little more accurate, slower, crosshair hidden', r.ads === 1 && r.fov < r.fov0 * 0.92 && r.in1 < r.in0 * 0.85 && r.speed < r.base && r.xh === '0', JSON.stringify(r));
await page.screenshot({ path: `${out}/g7-ads.png` });
await page.mouse.up({ button: 'right' });
await wait(500);
check('letting go scopes out', await ev(() => __SF.Game.loadout.active.ads === 0 && Math.abs(__SF.R.camera.fov - window.__fov0) < 0.5));

// 4) admin: noclip refused before, a wrong code, the right code, then the powers
await page.keyboard.press('KeyV');
await wait(150);
check('without admin, V doesn’t give noclip', await ev(() => !__SF.Game.player.noclip));
await ev(() => { __SF.Game.state = 'paused'; __SF.Menu.show('settings', false); });
await page.fill('#admin-code', 'let me in');
await page.press('#admin-code', 'Enter');
await wait(400);
check('a wrong admin passcode is refused', /Wrong passcode/.test(await page.textContent('#admin-box')) && await ev(() => !__SF.Admin.on));
await page.fill('#admin-code', 'Breach-Every-Wall');
await page.press('#admin-code', 'Enter');
await wait(400);
r = await ev(() => ({ on: __SF.Admin.on, me: __SF.Actors.me.admin, box: document.getElementById('admin-box').textContent }));
check('the right passcode makes you an admin (any letter case)', r.on && r.me && /Admin powers on/.test(r.box), r.box.slice(0, 80));
await page.screenshot({ path: `${out}/g7-admin-settings.png` });
await ev(() => { __SF.play(); __SF.Input.freeMouse = true; });
await page.keyboard.press('KeyV');
await wait(150);
r = await ev(() => { const me = __SF.Actors.me; me.aliveT = 0; return { noclip: __SF.Game.player.noclip, charges: __SF.Wallbang.charges(me), unlock: __SF.Wallbang.unlockIn(me), toggle: __SF.Wallbang.toggle(me), hud: document.getElementById('hud-wb').textContent }; });
check('admin: V flies, wallbang rounds unlimited with no wait', r.noclip && r.charges === Infinity && r.unlock === 0 && r.toggle === 'armed', JSON.stringify(r));
await page.keyboard.press('KeyV');
// x-ray and radar: an enemy hidden behind the wall
await ev(() => { const me = __SF.Actors.me, e = window.__enemy; __SF.place(me, 300, 0, 300, 90); __SF.Game.player.pitch = 0; __SF.place(e, -200, 0, 300, -90); });
await wait(700);
r = await ev(() => { const e = window.__enemy; return { xray: !!(e.model.xray && e.model.xray.visible), spotted: __SF.Radar.spotted.has(e) }; });
check('admin sees enemies through walls (x-ray) and on the radar', r.xray && r.spotted, JSON.stringify(r));
await page.screenshot({ path: `${out}/g7-xray.png` });
// infinite money in a defuse match, and the match doesn't count
await ev(() => { __SF.Session.begin({ map: 'range', mode: 'defuse', ranked: false, diff: 'normal', team: '1', allies: 0, enemies: 1, len: 'short', ff: false }); __SF.play(); __SF.Input.freeMouse = true; __SF.Game.botsFrozen = true; });
await wait(300);
r = await ev(() => { const me = __SF.Actors.me; const b = __SF.Match.buy(me, 'sniper'); return { ok: b.ok, money: me.money, cash: document.getElementById('hud-cash').textContent, tag: document.getElementById('hud-tag').textContent }; });
check('admin: unlimited money (buying costs nothing, the HUD shows ∞)', r.ok && r.money === 16000 && r.cash === '∞' && /ADMIN/.test(r.tag), JSON.stringify(r));
const xp0 = await ev(() => __SF.Profile.v.xp);
await ev(() => { const M = __SF.Match, me = __SF.Actors.me; me.kills = 9; for (let i = 0; i < 20 && M.phase !== 'over'; i++) { M.endRound(me.team, 'elim'); if (M.phase !== 'over') M.nextRound(); } });
await page.waitForFunction(() => __SF.Game.state === 'results', null, { timeout: 20000 });
r = await ev(() => ({ xp: __SF.Profile.v.xp, hist: __SF.Profile.v.history.length, text: document.getElementById('scr-results').textContent }));
check('a match with admin powers on records nothing', r.xp === xp0 && r.hist === 0 && /Admin match/.test(r.text), JSON.stringify({ xp: r.xp, hist: r.hist }));
await page.screenshot({ path: `${out}/g7-admin-results.png` });
check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
await browser.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
