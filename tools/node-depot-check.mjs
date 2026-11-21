// Headless checks for the Saltpan Depot map: navigation coverage, route timings, spawn sightlines,
// bots walking every route with the real movement code, and full bot rounds of defuse.
// Usage: node tools/node-depot-check.mjs <path to three.js (UMD build)> [rounds]
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const [threePath, roundsArg = '6'] = process.argv.slice(2);
globalThis.THREE = createRequire(import.meta.url)(threePath);
const dir = new URL('../src/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^(0[1-8]|13|14|15|16|17|20|21|22|23|24|25|26|27)-.*\.js$/.test(f)).sort();
const stubs = `
const noop = () => {};
const Snd = new Proxy({}, { get: () => noop });
const HUD = { hurt: noop, note: noop };
const R = { scene: null, textures: null, maxAniso: 1 };
const FX = { L: null, probe: [0, 0, 0, 0], lightAt: (x, y, z, o) => o, explosion: noop };
const DLights = { add: noop };
const Ents = { targets: [], doors: [], doorInReach: () => null, tick: noop };
const Game = { L: null, player: null, loadout: null, time: 0, shake: 0 };`;
const src = stubs + files.map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const api = new Function(`${src}\nreturn { TEX_DEFS, MAPS, compileLevel, Nav, Player, Loadout, Actors, Combat, Game, Settings, Grenades, IDLE_CMD, Match, Bomb, Items, Tactics, Bots, BotBrain, TEAM, tickEye, viewDir, makeTrace, MASK_SHOT, PM, CONTENTS };`)();
const { Game, Actors, Combat, Nav, Settings, Match, Bomb, Items, Tactics, Bots, TEAM, IDLE_CMD } = api;
const tex = Object.fromEntries(Object.entries(api.TEX_DEFS).map(([n, def]) => [n, { def, avg: [0.5, 0.5, 0.5] }]));
const map = api.MAPS.depot.build();
const L = api.compileLevel(map, tex);
L.probes = { nx: 2, ny: 2, nz: 2, x0: -2000, y0: 0, z0: -2000, step: 4000, data: new Float32Array(32).fill(0.5), valid: new Uint8Array(8).fill(1) };
Game.L = L; Game.player = new api.Player(L.cw); Game.loadout = new api.Loadout();
Nav.build(L); api.Grenades.init(L); Items.init();
let ok = true; const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const links = Nav.nodes.reduce((n, a) => n + a.links.length, 0);
check('navigation graph builds', Nav.nodes.length > 3000 && Nav.ms < 3000, `${Nav.nodes.length} nodes, ${links} links, ${Nav.ms} ms`);

// 1) every named place and every tactical spot is reachable from both spawns
const rs = L.teamSpawns[0][0].pos, ws = L.teamSpawns[1][0].pos;
const pathLen = (p) => { let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return d; };
const T = L.tactics, spots = [];
for (const h of L.hotspots) spots.push([h.name, h.pos]);
for (const [n, r] of Object.entries(T.routes)) { spots.push([`${n} stack`, r.stack]); spots.push([`${n} via`, r.via]); }
for (const [s, d] of Object.entries(T.sites)) for (const k of ['hold', 'plant', 'smoke']) d[k].forEach((p, i) => spots.push([`${s} ${k} ${i}`, p]));
const bad = [];
for (const [name, p] of spots) {
  const a = Nav.path(rs[0], rs[1], rs[2], p[0], p[1], p[2]), b = Nav.path(ws[0], ws[1], ws[2], p[0], p[1], p[2]);
  const end = a && a[a.length - 1];
  if (!a || !b || Math.hypot(end.x - p[0], end.z - p[2]) > 80 || Math.abs(end.y - p[1]) > 40) bad.push(name);
}
check(`all ${spots.length} places and tactical spots reachable from both spawns`, bad.length === 0, bad.join(', '));

// 2) route timings at 250 u/s (Wardens should get to each site well before Raiders)
const secs = (a, b) => { const p = Nav.path(a[0], a[1], a[2], b[0], b[1], b[2]); return p ? pathLen(p) / 250 : Infinity; };
const A = T.sites.A.plant[0], B = T.sites.B.plant[0], times = {};
for (const [n, r] of Object.entries(T.routes)) times[n] = secs(rs, r.via) + secs(r.via, T.siteRoutes.A.includes(n) ? A : B);
const wA = secs(ws, A), wB = secs(ws, B), rot = secs(A, B);
console.log(`      Raiders: ${Object.entries(times).map(([n, t]) => `${n} ${t.toFixed(1)}s`).join(' · ')} | Wardens: A ${wA.toFixed(1)}s B ${wB.toFixed(1)}s | A↔B ${rot.toFixed(1)}s`);
check('Wardens reach each site at least 4 s before the fastest Raider route', wA + 4 < Math.min(times.cut, times.office) && wB + 4 < Math.min(times.culvert, times.alley));
check('Raider routes take 9-18 s and the sites are 5-12 s apart for Wardens', Object.values(times).every((t) => t > 9 && t < 18) && rot > 5 && rot < 12);

// 3) no sightline between the two spawn areas
const tr = api.makeTrace();
let seen = 0;
for (const a of L.teamSpawns[0]) for (const b of L.teamSpawns[1]) {
  L.cw.trace(tr, a.pos[0], a.pos[1] + 64, a.pos[2], b.pos[0], b.pos[1] + 64, b.pos[2], 0, 0, 0, api.MASK_SHOT);
  if (tr.fraction >= 1) seen++;
}
check('no sightline between any Raider spawn and any Warden spawn', seen === 0, `${seen} clear lines`);
let mid = 0, tried = 0; const midEx = [];
const fits = (x, z) => [[-17, -17], [17, -17], [-17, 17], [17, 17], [0, 0]].every(([dx, dz]) => !L.cw.pointContents(x + dx, 40, z + dz, api.CONTENTS.SOLID));
for (let x = -200; x <= 500; x += 70) for (let z = -280; z <= 280; z += 70) for (const b of L.teamSpawns[0]) {
  if (!fits(x, z)) continue;
  tried++;
  L.cw.trace(tr, x, 64, z, b.pos[0], b.pos[1] + 64, b.pos[2], 0, 0, 0, api.MASK_SHOT);
  if (tr.fraction >= 1) { mid++; if (mid <= 4) midEx.push(`(${x},${z})->(${b.pos[0]},${b.pos[2]})`); }
}
check('nobody standing in the plaza (mid) can see a Raider spawn point', mid === 0, `${mid}/${tried} clear lines ${midEx.join(' ')}`);

// 4) walk each route with the real movement code (a bot following A* + string pulling)
Settings.v.team = 1; Settings.v.botSkill = 'normal'; Actors.init();
Actors.me.alive = false;                     // nobody to fight while walking routes
const walker = Actors.addBot(0);
const walk = (from, via, to, limit = 60) => {
  walker.player.spawn(from.slice(), 0); walker.alive = true; walker.health = 100; walker.brain.reset();
  walker.brain.setOrder({ kind: 'goto', pos: to.slice(), via: via ? via.slice() : null });
  for (let i = 0; i < limit * 64; i++) {
    Game.time += 1 / 64;
    const cmd = walker.brain.think(1 / 64);
    walker.player.tick(cmd, 1 / 64); walker.loadout.tick(cmd, walker.player, Game.time, 1 / 64);
    walker.player.events.length = 0; for (const w of walker.loadout.list) w.events.length = 0;
    const p = walker.player.pos;
    if (Math.hypot(p[0] - to[0], p[2] - to[2]) < 90 && Math.abs(p[1] - to[1]) < 40) return i / 64;
  }
  return -1;
};
for (const [n, r] of Object.entries(T.routes)) {
  const site = T.siteRoutes.A.includes(n) ? 'A' : 'B', to = T.sites[site].plant[0];
  const t = walk(rs, r.via, to);
  check(`a bot walks ${n} route to ${site}`, t > 0, t > 0 ? `${t.toFixed(1)} s` : `stuck at ${walker.player.pos.map((v) => v.toFixed(0))}`);
}
for (const site of ['A', 'B']) {
  const t = walk(ws, null, T.sites[site].hold[0]);
  check(`a bot walks from the Warden spawn to ${site}`, t > 0, t > 0 ? `${t.toFixed(1)} s` : `stuck at ${walker.player.pos.map((v) => v.toFixed(0))}`);
}
const tAB = walk(T.sites.A.hold[0], null, T.sites.B.hold[0]);
check('a bot rotates from A to B along the service road', tAB > 0, tAB > 0 ? `${tAB.toFixed(1)} s` : `stuck at ${walker.player.pos.map((v) => v.toFixed(0))}`);

// 5) bots play defuse rounds on the map (you play as a bot on the Wardens)
Actors.removeBots();
const me = Actors.me;
me.alive = true; me.brain = new api.BotBrain(me);
for (let i = 0; i < 5; i++) Actors.addBot(TEAM.RAIDERS);
for (let i = 0; i < 4; i++) Actors.addBot(TEAM.WARDENS);
Match.setMode('defuse');
const tick = () => {
  const DT = 1 / 64;
  Game.time += DT;
  for (const a of Actors.list) {
    let cmd = a.brain.think(DT);
    if (!a.alive) continue;
    if (Match.frozen() || Bomb.defusing(a)) cmd = Object.assign({}, cmd, { fwd: 0, side: 0, jump: false, fire: false, alt: false, drop: false });
    Bomb.control(a, cmd, DT);
    a.player.tick(cmd, DT);
    a.loadout.tick(cmd, a.player, Game.time, DT);
    for (const e of a.player.events) if (e.type === 'step') Bots.noise(a.player.pos, a, 650);
    a.player.events.length = 0;
    for (const w of a.loadout.list.slice()) {
      for (const e of w.events) {
        if (e.type === 'shot') Combat.shot(a, w, e);
        else if (e.type === 'planted') Bomb.plant(a, w, e.site);
        else if (e.type === 'knifeHit') Combat.knife(a, e);
        else if (e.type === 'throwNade') api.Grenades.spawn(a.player, e.mode, api.tickEye(a.player), api.viewDir(a.player));
      }
      w.events.length = 0;
    }
  }
  Items.tick(DT, 0); api.Grenades.tick(DT); Bomb.tick(DT); Actors.tick(DT); Match.tick(DT); Tactics.tick(DT); Actors.render(DT, 1);
};
const N = +roundsArg, t0 = Date.now();
let plants = 0, was = false, guard = 0;
while (Match.history.length < N && guard++ < 64 * 60 * 40) {
  tick();
  if (Match.phase === 'planted' && !was) { was = true; plants++; }
  if (Match.phase === 'freeze') was = false;
}
const log = Match.history.map((h) => `${h.round}:${h.side === TEAM.RAIDERS ? 'R' : 'W'}/${h.reason}`).join(' ');
check(`bots play ${N} rounds on Saltpan Depot`, Match.history.length >= N, `${log} · plants ${plants} · ${((Date.now() - t0) / 1000).toFixed(1)}s wall`);
check('the charge gets planted in bot rounds', plants >= 1, `plants=${plants}`);
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
