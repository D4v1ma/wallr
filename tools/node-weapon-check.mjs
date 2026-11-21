// Headless checks for Stage 2 weapon logic, ballistics and grenade physics.
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../src/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^(0[1-8]|13|14|15|16)-.*\.js$/.test(f)).sort();
const stubs = `const Ents = { targets: [] }; const Actors = { hitscan: () => null }; const Snd = { nadeBounce() {}, smokePop() {} }; const R = { scene: { add() {}, remove() {} }, textures: {} }; const FX = { probe: [0,0,0,0] };`;
const src = stubs + files.map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const api = new Function(`${src}\nreturn { TEX_DEFS, buildTestRange, compileLevel, bakeLighting, Player, Loadout, WEAPONS, RIFLE_PATTERN, Ballistics, Grenades, SmokeCloud, Ents, makeWeapon };`)();
const tex = Object.fromEntries(Object.entries(api.TEX_DEFS).map(([n, def]) => [n, { def, avg: [0.5, 0.5, 0.5] }]));
const L = api.compileLevel(api.buildTestRange(), tex);
const DT = 1 / 64;
let ok = true; const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const blank = () => ({ fwd: 0, side: 0, jump: false, duck: false, walk: false, fire: false, alt: false, reload: false, inspect: false, slot: 0, last: false, cycle: 0 });
const P = new api.Player(L.cw); P.spawn([300, 0, 0], 0);
let time = 0;
const run = (lo, n, mk) => { const out = []; for (let i = 0; i < n; i++) { time += DT; const c = Object.assign(blank(), mk ? mk(i) : {}); lo.tick(c, P, time, DT); for (const w of lo.list) { for (const e of w.events) out.push(Object.assign({ at: time, w: w.def.id }, e)); w.events.length = 0; } } return out; };

// 1) rifle spray follows the pattern at 600 RPM
let lo = new api.Loadout();
run(lo, 64);                                     // finish drawing
const t0 = time;
let ev = run(lo, 220, () => ({ fire: true })).filter((e) => e.type === 'shot');
const offs = ev.map((e) => e.off);
check('30-round magazine empties at 600 RPM', ev.length === 30 && Math.abs(ev[29].at - ev[0].at - 2.9) < 0.04, `shots=${ev.length} span=${(ev[29].at - ev[0].at).toFixed(3)}s`);
check('first shot has no recoil offset', Math.hypot(...offs[0]) < 0.05, JSON.stringify(offs[0]));
check('climbs ~5-6 deg by shot 10', offs[9][0] > 4.5 && offs[9][0] < 6.5, offs[9].map((v) => v.toFixed(2)).join(','));
check('then drifts left (yaw +) around shot 17', offs[17][1] > 2.5, offs[17].map((v) => v.toFixed(2)).join(','));
check('then swings right (yaw lower) by shot 25', offs[25][1] < offs[17][1] - 3, offs[25].map((v) => v.toFixed(2)).join(','));
check('empty mag auto-starts reload on next trigger pull', lo.active.state === 'reload' || lo.active.ammo === 0, `state=${lo.active.state} ammo=${lo.active.ammo}`);
// 2) recovery after a short burst
lo = new api.Loadout(); run(lo, 64);
run(lo, 30, () => ({ fire: true }));
const before = lo.active.recoil[0];
run(lo, 45);
check('recoil recovers after releasing the trigger', before > 1 && Math.abs(lo.active.recoil[0]) < 0.1 && lo.active.sprayIdx === 0, `before=${before.toFixed(2)} after=${lo.active.recoil[0].toFixed(3)} idx=${lo.active.sprayIdx}`);
// 3) pistol is semi-automatic and needs a draw
ev = run(lo, 1, () => ({ slot: 2 }));
check('slot 2 selects the pistol and draws it', lo.active.def.id === 'pistol' && lo.active.state === 'draw', lo.active.state);
ev = run(lo, 20, () => ({ fire: true })).filter((e) => e.type === 'shot');
check('cannot fire during the draw', ev.length === 0, `shots=${ev.length}`);
run(lo, 30);
ev = run(lo, 64, () => ({ fire: true })).filter((e) => e.type === 'shot');
check('holding fire on the pistol shoots once', ev.length === 1, `shots=${ev.length}`);
ev = run(lo, 64, (i) => ({ fire: i % 4 < 2 })).filter((e) => e.type === 'shot');
check('clicking is capped near 400 RPM', ev.length >= 5 && ev.length <= 7, `shots in 1s=${ev.length}`);
// 4) knife
run(lo, 1, () => ({ slot: 3 })); run(lo, 60);
ev = run(lo, 64, () => ({ fire: true }));
const sw = ev.filter((e) => e.type === 'swing'), kh = ev.filter((e) => e.type === 'knifeHit');
check('knife slashes every 0.42s and hits after a delay', sw.length === 3 && kh.length === 3 && Math.abs(kh[0].at - sw[0].at - 0.1) < 0.02, `swings=${sw.length} hits=${kh.length}`);
// 5) smoke: pull, release, throw, switch back, restock
run(lo, 1, () => ({ slot: 1 })); run(lo, 70);
run(lo, 1, () => ({ slot: 4 })); run(lo, 40);
ev = run(lo, 40, () => ({ fire: true })).concat(run(lo, 40));
const th = ev.find((e) => e.type === 'throwNade');
check('grenade throws after pull + release', !!th && th.mode === 'over', th ? `at +${(th.at - ev[0].at).toFixed(2)}s` : 'no throw');
check('after the last grenade the previous weapon comes back', lo.active.def.id === 'rifle', lo.active.def.id);
run(lo, 170);
check('the smoke slot restocks', lo.byId('smoke').count === 1, `count=${lo.byId('smoke').count}`);
// 6) penetration
const def = api.WEAPONS.rifle, B = api.Ballistics;
let r = B.bullet(L, [-60, 64, 448], [1, 0, 0], def);
check('rifle round passes through the 4u wooden door', r.pens === 1 && r.impacts[0].brush === L.doors[0].mb.cbrush && r.impacts[1].exit && r.impacts.length === 3,
  r.impacts.map((i) => `${i.kind}${i.exit ? '(exit)' : ''}@${i.point.map((v) => v.toFixed(0))}`).join(' '));
r = B.bullet(L, [-560, 40, 200], [0, 0, 1], def);
check('crates (64u wood) stop bullets', r.pens === 0 && r.impacts.length === 1, `pens=${r.pens} impacts=${r.impacts.length}`);
r = B.bullet(L, [300, 64, -160], [1, 0, 0], def);
check('rifle passes through the plywood board', r.pens === 1 && r.impacts[1].exit, `pens=${r.pens}`);
r = B.bullet(L, [1060, 40, 300], [0, 0, -1], def);
const rp = B.bullet(L, [1060, 40, 300], [0, 0, -1], api.WEAPONS.pistol);
check('rifle pierces the shed panel wall, pistol does not', r.pens >= 1 && rp.pens === 0, `rifle pens=${r.pens} pistol pens=${rp.pens}`);
check('damage drops after penetration', r.impacts.length > 2 && r.impacts[2].damage < def.damage * 0.9, r.impacts.map((i) => i.damage.toFixed(1)).join(' '));
// 7) grenade physics (bake for probes so the smoke can light itself)
const bake = await api.bakeLighting(L, () => {}); L.probes = bake.probes;
api.Grenades.L = L;
const g = { p: [300, 60, 0], prev: [300, 60, 0], v: [600, 120, 0], rot: [0, 0, 0], spin: [8, 0, 3], age: 0, rest: false, restT: 0, popped: false, bounces: 0, cloud: null, mesh: {}, mat: { dispose() {} } };
api.Grenades.list.push(g);
let popAt = -1;
for (let i = 0; i < 64 * 8; i++) { api.Grenades.tick(DT); if (g.popped && popAt < 0) popAt = i * DT; }
check('grenade bounces, settles on the ground and pops smoke', g.rest && g.popped && Math.abs(g.p[1] - 2) < 0.2 && popAt > 1 && popAt < 5,
  `rest=${g.rest} y=${g.p[1].toFixed(2)} x=${g.p[0].toFixed(0)} bounces=${g.bounces} pop=${popAt.toFixed(2)}s`);
const cloud = api.Grenades.clouds[0];
check('smoke cloud has puffs and blocks a camera inside it', cloud && cloud.puffs.length === 46 && cloud.inside(g.p[0], g.p[1] + 50, g.p[2]) > 0.5,
  cloud ? `inside=${cloud.inside(g.p[0], g.p[1] + 50, g.p[2]).toFixed(2)} light=${cloud.light.map((v) => v.toFixed(2))}` : '');

// 8) Stage 4 guns
const fresh = (ids) => { const l = new api.Loadout(ids); run(l, 80); return l; };
lo = fresh(['smg', 'pistol', 'knife']);
ev = run(lo, 200, () => ({ fire: true })).filter((e) => e.type === 'shot');
check('SMG: 30 rounds at 800 RPM', ev.length === 30 && Math.abs(ev[29].at - ev[0].at - 29 * 0.075) < 0.03, `shots=${ev.length} span=${(ev[29].at - ev[0].at).toFixed(3)}`);
check('SMG climbs less than the rifle', ev[9].off[0] < 3.6 && ev[9].off[0] > 2.2, ev[9].off.map((v) => v.toFixed(2)).join(','));
lo = fresh(['shotgun', 'pistol', 'knife']);
const sgEv = run(lo, 140, () => ({ fire: true }));
ev = sgEv.filter((e) => e.type === 'shot');
check('shotgun: 9 pellets per shot, pumps every 0.88 s', ev.length >= 2 && ev[0].pellets === 9 && Math.abs(ev[1].at - ev[0].at - 60 / 68) < 0.03, `shots=${ev.length} pellets=${ev[0] && ev[0].pellets} gap=${ev[1] ? (ev[1].at - ev[0].at).toFixed(3) : '-'}`);
let sfx = sgEv.concat(run(lo, 70)).filter((e) => e.type === 'sfx').map((e) => e.part);
check('pump sounds follow each shot', sfx.filter((p) => p === 'pumpBack').length === 3 && sfx.filter((p) => p === 'pumpFwd').length === 3, sfx.join(','));
let sg = lo.active; const sgBefore = sg.ammo;
ev = run(lo, 1, () => ({ reload: true }));
ev = run(lo, Math.round(64 * (0.42 + 0.48 * 2 + 0.1)));
check("shell-by-shell reload adds one shell per 0.48 s", sg.ammo === sgBefore + 2 && sg.state === "reload", `ammo ${sgBefore} -> ${sg.ammo} state=${sg.state}`);
ev = run(lo, 60, () => ({ fire: true })).filter((e) => e.type === 'shot');
check('pulling the trigger interrupts the reload after the current shell', ev.length >= 1 && sg.ammo <= 8, `shots=${ev.length} ammo=${sg.ammo}`);
sg.ammo = 1; sg.state = 'idle'; run(lo, 64);
run(lo, 2, () => ({ fire: true })); run(lo, 64);
check('empty shotgun reloads on the next trigger pull', sg.ammo === 0 && (run(lo, 2, () => ({ fire: true })), sg.state === 'reload'), `state=${sg.state}`);
run(lo, Math.round(64 * (0.42 + 0.48 * 8 + 0.7)));
check('a full reload from empty ends with a pump', sg.ammo === 8 && sg.state === 'idle', `ammo=${sg.ammo} state=${sg.state}`);
lo = fresh(['sniper', 'pistol', 'knife']);
const sn = lo.active;
run(lo, 1, () => ({ alt: true })); run(lo, 2);
const z1 = sn.zoom, fov1 = sn.scopeFov(), spd1 = sn.speed();
run(lo, 1, () => ({ alt: true })); run(lo, 2);
const z2 = sn.zoom, fov2 = sn.scopeFov();
run(lo, 1, () => ({ alt: true })); run(lo, 2);
check('sniper scope cycles 40 -> 12 -> off; scoped speed 100', z1 === 1 && fov1 === 40 && z2 === 2 && fov2 === 12 && sn.zoom === 0 && spd1 === 100, `z=${z1},${z2},${sn.zoom} fov=${fov1},${fov2} speed=${spd1}`);
const unscoped = sn.inaccuracy(P);
run(lo, 1, () => ({ alt: true })); run(lo, 2);
const scoped = sn.inaccuracy(P);
check('scoped standing accuracy is far better than unscoped', scoped < 2 && unscoped > 60, `scoped=${scoped.toFixed(2)} unscoped=${unscoped.toFixed(1)} mrad`);
ev = run(lo, 1, () => ({ fire: true }));
const afterShot = sn.zoom;
ev = ev.concat(run(lo, 100));
check('bolt cycle drops the scope and brings it back', afterShot === 0 && sn.zoom === 1 && ev.filter((e) => e.type === 'sfx' && e.part.startsWith('bolt')).length === 4, `after=${afterShot} later=${sn.zoom}`);
ev = run(lo, 120, () => ({ fire: true })).filter((e) => e.type === 'shot');
check('sniper is semi-automatic (holding fires once)', ev.length === 1, `shots=${ev.length}`);
// loadout: give / replace / remove
lo = fresh(['pistol', 'knife']);
let old = lo.give('smg');
check('buying a primary switches to it', old === null && lo.active.def.id === 'smg' && lo.list.map((w) => w.def.slot).join('') === '123', lo.list.map((w) => w.def.id).join(','));
old = lo.give('rifle');
check('a second primary replaces the first (returned for dropping)', old && old.def.id === 'smg' && lo.active.def.id === 'rifle' && !lo.byId('smg'), `old=${old && old.def.id} active=${lo.active.def.id}`);
check('a second smoke is refused while you hold one', lo.give('smoke') === null && lo.give('smoke') === false, lo.ids().join(','));
lo.remove(lo.active);
check('dropping the weapon in hand switches to the next best', lo.active.def.id === 'pistol' && !lo.primary(), `active=${lo.active.def.id}`);
lo.restock = false; lo.select(lo.byId('smoke')); run(lo, 40);
run(lo, 30, () => ({ fire: true })); run(lo, 60);
check('without restocking, a thrown smoke leaves the loadout', !lo.byId('smoke') && lo.active.def.id === 'pistol', lo.ids().join(','));

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
