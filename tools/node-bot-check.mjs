// Headless checks for actors, damage, hitboxes and bot behaviour (loads three.js r128 for the skeleton math).
// Usage: node tools/node-bot-check.mjs <path to three.js (UMD build, e.g. package/build/three.js)>
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const [threePath] = process.argv.slice(2);
globalThis.THREE = createRequire(import.meta.url)(threePath);
const dir = new URL('../src/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^(0[1-8]|13|14|15|16|20|21|22|23)-.*\.js$/.test(f)).sort();
const stubs = `
const noop = () => {};
const Snd = new Proxy({}, { get: () => noop });
const HUD = { hurt: noop, note: noop };
const R = { scene: null, textures: null, maxAniso: 1 };
const FX = { L: null, probe: [0, 0, 0, 0], lightAt: (x, y, z, o) => o };
const Ents = { targets: [], doors: [], doorInReach: () => null, tick: noop };
const Game = { L: null, player: null, loadout: null, time: 0 };`;
const src = stubs + files.map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const api = new Function(`${src}\nreturn { TEX_DEFS, buildTestRange, compileLevel, Nav, Player, Loadout, Actors, Actor, Combat, Game, Settings, WEAPONS, SmokeCloud, Grenades, IDLE_CMD };`)();
const { Game, Actors, Combat, Nav, Settings, WEAPONS } = api;
const tex = Object.fromEntries(Object.entries(api.TEX_DEFS).map(([n, def]) => [n, { def, avg: [0.5, 0.5, 0.5] }]));
const L = api.compileLevel(api.buildTestRange(), tex);
for (const b of L.cw.dynamic) b.active = false;          // doors open for these tests
L.probes = { nx: 2, ny: 2, nz: 2, x0: -2000, y0: 0, z0: -2000, step: 4000, data: new Float32Array(32).fill(0.5), valid: new Uint8Array(8).fill(1) };
Game.L = L; Game.player = new api.Player(L.cw); Game.loadout = new api.Loadout();
Nav.build(L); api.Grenades.L = L;
Settings.v.team = 1; Settings.v.botSkill = 'normal'; Settings.v.ff = false;
Actors.init();
const DT = 1 / 64;
let ok = true; const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const place = (a, x, y, z, yaw) => { a.player.spawn([x, y, z], yaw); a.player.pitch = 0; a.alive = true; a.health = 100; a.armor = 100; a.helmet = true; };
const pose = () => Actors.render(DT, 1);
const me = Actors.me;
// shooting log
const shots = [];
const step = (n, opts = {}) => {
  for (let i = 0; i < n; i++) {
    Game.time += DT;
    for (const a of Actors.list) {
      if (!a.alive) continue;
      const cmd = a.brain ? a.brain.think(DT) : api.IDLE_CMD;
      if ((a.brain && !opts.botStatic) || opts.meMoves) a.player.tick(cmd, DT);
      if (a.brain || opts.meMoves) a.loadout.tick(cmd, a.player, Game.time, DT);
      for (const w of a.loadout.list) { for (const e of w.events) if (e.type === 'shot') { shots.push({ t: Game.time, who: a.name }); Combat.shot(a, w, e); } w.events.length = 0; }
      a.player.events.length = 0;
    }
    if (!opts.noRespawn) Actors.tick(DT); else for (const a of Actors.list) a.hurtT = 0;
    pose();
  }
};

// 1) damage model
place(me, 600, 0, 0, 0); const bot = Actors.addBot(0);
let d = me.damage(33, 'chest', bot, WEAPONS.rifle, [0, 0, 0]);
check('rifle chest hit vs armor: ~26 to health, armor dents', d === 26 && me.armor === 96, `dealt=${d} hp=${me.health} armor=${me.armor}`);
place(me, 600, 0, 0, 0);
d = me.damage(33, 'head', bot, WEAPONS.rifle, [0, 0, 0]);
check('rifle headshot kills through a helmet', !me.alive && d >= 100, `dealt=${d}`);
place(me, 600, 0, 0, 0);
d = me.damage(35, 'head', bot, WEAPONS.pistol, [0, 0, 0]);
check('pistol headshot vs helmet does not one-shot', me.alive && d > 60 && d < 100, `dealt=${d} hp=${me.health}`);
place(me, 600, 0, 0, 0);
d = me.damage(33, 'leg', bot, WEAPONS.rifle, [0, 0, 0]);
check('legs ignore armor and take 0.75x', d === 25 && me.armor === 100, `dealt=${d}`);
// 2) hitboxes on a posed model
place(me, 600, 0, 0, Math.PI / 2); pose();
// shots from behind (+X side) so the arms holding the rifle are not in the way
const hit = (y, z = 0) => { const h = me.model.hitTest([900, y, z], [-1, 0, 0], 2000); return h ? h.group : 'miss'; };
check('hitboxes: head / chest / stomach / leg / miss', hit(66) === 'head' && hit(52) === 'chest' && hit(40) === 'stomach' && hit(28, 4) === 'leg' && hit(80) === 'miss',
  `66:${hit(66)} 52:${hit(52)} 40:${hit(40)} 28:${hit(28, 4)} 80:${hit(80)}`);
const front = me.model.hitTest([300, 52, 0], [1, 0, 0], 2000);
check('from the front, the arms holding the rifle cover the chest', front && front.group === 'arm', front ? front.group : 'miss');
// 3) bot finds and kills a target standing in the open
place(me, 700, 0, 100, Math.PI / 2); place(bot, 300, 0, 100, -Math.PI / 2); bot.brain.reset(); shots.length = 0;
let t0 = Game.time; step(64 * 6, { noRespawn: true });
const first = shots.find((s) => s.who === bot.name);
check('bot reacts after a human-like delay, then kills', first && first.t - t0 > 0.2 && !me.alive, `first shot +${first ? (first.t - t0).toFixed(2) : '-'}s, target alive=${me.alive}, shots=${shots.length}`);
// 4) walls block sight
place(me, -200, 0, 300, -Math.PI / 2); place(bot, 300, 0, 300, Math.PI / 2); bot.brain.reset(); shots.length = 0;
step(64 * 3, { noRespawn: true, botStatic: true });
check('no sight or shots through the hall wall (bot held in place)', shots.length === 0 && me.alive && !bot.brain.target, `shots=${shots.length}`);
// 5) smoke blocks sight
place(me, 900, 0, 100, Math.PI / 2); place(bot, 300, 0, 100, -Math.PI / 2); bot.brain.reset(); shots.length = 0;
const cloud = new api.SmokeCloud(L, [600, 0, 100], 77); cloud.t = 4; api.Grenades.clouds.push(cloud);
step(64 * 3, { noRespawn: true, botStatic: true });
check('no sight or shots through a smoke cloud (bot held in place)', shots.length === 0 && me.alive && !bot.brain.target, `shots=${shots.length}`);
api.Grenades.clouds.length = 0;
// 6) roaming without enemies around
me.alive = false; me.deadT = -1e9;
place(bot, -600, 0, 100, 0); bot.brain.reset();
let travelled = 0, prev = bot.player.pos.slice(), stuckMax = 0;
for (let s = 0; s < 64 * 20; s += 32) {
  step(32, { noRespawn: true });
  travelled += Math.hypot(bot.player.pos[0] - prev[0], bot.player.pos[2] - prev[2]); prev = bot.player.pos.slice();
  stuckMax = Math.max(stuckMax, bot.brain.stuckT);
}
check('bot roams the map between hotspots', travelled > 1500, `travelled ${travelled.toFixed(0)}u in 20s, worst stuck ${stuckMax.toFixed(1)}s, now at ${bot.player.pos.map((v) => v.toFixed(0))}`);
// 7) bot vs bot duel
const w = Actors.addBot(1);
place(bot, 200, 0, -40, -Math.PI / 2); place(w, 900, 0, -40, Math.PI / 2); bot.brain.reset(); w.brain.reset(); shots.length = 0;
step(64 * 8, { noRespawn: true });
check('bot duel ends with one side dead', bot.alive !== w.alive, `raider alive=${bot.alive} (${bot.health}hp) warden alive=${w.alive} (${w.health}hp), shots=${shots.length}`);
check('killfeed and score updated', Actors.feed.length > 0 && Actors.score[0] + Actors.score[1] > 0, JSON.stringify(Actors.score));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
