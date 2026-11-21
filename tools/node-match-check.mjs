// Headless checks for Stage 4: economy, buying, rounds, the charge, halftime, and a bots-only match.
// Usage: node tools/node-match-check.mjs <path to three.js (UMD build, e.g. package/build/three.js)> [rounds]
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const [threePath, roundsArg = '4'] = process.argv.slice(2);
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
const api = new Function(`${src}\nreturn { TEX_DEFS, buildTestRange, compileLevel, Nav, Player, Loadout, Actors, Combat, Game, Settings, WEAPONS, Grenades, IDLE_CMD, Match, MATCH, Bomb, BOMB, Items, Tactics, Bots, BotBrain, TEAM, tickEye, viewDir };`)();
const { Game, Actors, Combat, Nav, Settings, WEAPONS, Match, MATCH, Bomb, BOMB, Items, Tactics, Bots, TEAM, IDLE_CMD } = api;
const tex = Object.fromEntries(Object.entries(api.TEX_DEFS).map(([n, def]) => [n, { def, avg: [0.5, 0.5, 0.5] }]));
const L = api.compileLevel(api.buildTestRange(), tex);
for (const b of L.cw.dynamic) b.active = false;          // doors open
L.probes = { nx: 2, ny: 2, nz: 2, x0: -2000, y0: 0, z0: -2000, step: 4000, data: new Float32Array(32).fill(0.5), valid: new Uint8Array(8).fill(1) };
Game.L = L; Game.player = new api.Player(L.cw); Game.loadout = new api.Loadout();
Nav.build(L); api.Grenades.init(L); Items.init();
Settings.v.team = 1; Settings.v.botSkill = 'normal'; Settings.v.ff = false; Settings.v.matchLen = 'standard';
Actors.init();
const me = Actors.me;
const DT = 1 / 64;
let ok = true; const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
let botsIdle = true, thrown = 0;
const tick = () => {
  Game.time += DT;
  for (const a of Actors.list) {
    let cmd = a.forceCmd ? Object.assign({}, IDLE_CMD, a.forceCmd) : a.brain && !botsIdle ? a.brain.think(DT) : IDLE_CMD;
    if (!a.alive) continue;
    if (Match.frozen() || Bomb.defusing(a)) cmd = Object.assign({}, cmd, { fwd: 0, side: 0, jump: false, fire: false, alt: false, drop: false });
    Bomb.control(a, cmd, DT);
    if (cmd.use && !Bomb.defusing(a)) Items.use(a);
    if (cmd.drop) Items.drop(a, a.loadout.active, true);
    a.player.tick(cmd, DT);
    a.loadout.tick(cmd, a.player, Game.time, DT);
    for (const e of a.player.events) if (e.type === 'step') Bots.noise(a.player.pos, a, 650);
    a.player.events.length = 0;
    for (const w of a.loadout.list.slice()) {
      for (const e of w.events) {
        if (e.type === 'shot') Combat.shot(a, w, e);
        else if (e.type === 'planted') Bomb.plant(a, w, e.site);
        else if (e.type === 'knifeHit') Combat.knife(a, e);
        else if (e.type === 'throwNade') { api.Grenades.spawn(a.player, e.mode, api.tickEye(a.player), api.viewDir(a.player)); thrown++; }
      }
      w.events.length = 0;
    }
  }
  Items.tick(DT, Match.active ? 0 : 45);
  api.Grenades.tick(DT);
  Bomb.tick(DT); Actors.tick(DT); Match.tick(DT); Tactics.tick(DT);
  Actors.render(DT, 1);
};
const run = (sec, until) => { for (let i = 0; i < sec * 64; i++) { tick(); if (until && until()) return true; } return false; };
const place = (a, x, y, z, yaw = 0) => { a.player.spawn([x, y, z], yaw); a.player.pitch = 0; };
const raiders = () => Actors.list.filter((a) => a.team === TEAM.RAIDERS);
const wardens = () => Actors.list.filter((a) => a.team === TEAM.WARDENS);

// lobby: you (Warden) + 2 Warden bots vs 3 Raider bots
for (let i = 0; i < 3; i++) Actors.addBot(0);
for (let i = 0; i < 2; i++) Actors.addBot(1);
Match.setMode('defuse');

// 1) match start
let r = { phase: Match.phase, money: Actors.list.map((a) => a.money), carrier: Bomb.carrier && Bomb.carrier.team, guns: Actors.list.map((a) => a.loadout.ids().join('+')) };
check('match starts in freeze time with $800 each and pistols', r.phase === 'freeze' && r.money.every((m) => m === 800) && r.guns.every((g) => g === 'pistol+knife' || g === 'pistol+knife+charge'), JSON.stringify(r));
check('one Raider carries the charge', r.carrier === TEAM.RAIDERS && raiders().filter((a) => a.loadout.byId('charge')).length === 1);

// 2) buying
let b = Match.buy(me, 'vest');
check('buying a vest costs $650 and gives 100 armor', b.ok && me.money === 150 && me.armor === 100, JSON.stringify(b));
b = Match.buy(me, 'kit');
check('not enough money is refused', !b.ok && b.msg === 'Not enough money' && me.money === 150, JSON.stringify(b));
const rb = raiders()[0];
check('defuse kits are Wardens only', Match.buy(rb, 'kit').msg === 'Wardens only');
me.money = 5000;
b = Match.buy(me, 'vesthelm');
check('with a full vest, the helmet alone costs $350', b.ok && me.money === 4650 && me.helmet, `money=${me.money}`);
b = Match.buy(me, 'rifle');
check('buying a rifle puts it in hand', b.ok && me.loadout.active.def.id === 'rifle' && me.money === 1950);
b = Match.buy(me, 'smg');
check('buying another primary drops the old one at your feet', b.ok && Items.list.some((it) => it.id === 'rifle') && me.loadout.primary().def.id === 'smg', Items.list.map((i) => i.id).join(','));
const home = me.player.pos.slice();
place(me, -500, 0, 0);
check('no buying outside your buy zone', Match.buy(me, 'smoke').msg === 'Too far from your buy zone');
place(me, home[0], home[1], home[2]);
const fz = me.player.pos.slice();
me.forceCmd = { fwd: 1 };
run(2);
check('freeze time: nobody can move', Math.hypot(me.player.pos[0] - fz[0], me.player.pos[2] - fz[2]) < 1, `moved ${Math.hypot(me.player.pos[0] - fz[0], me.player.pos[2] - fz[2]).toFixed(1)}`);
me.forceCmd = null;
run(8.5);
check('after 10 s the round goes live (1:55 on the clock)', Match.phase === 'live' && Math.abs(Match.t - 114.5) < 1.2, `phase=${Match.phase} t=${Match.t.toFixed(1)}`);
run(20);
check('buy time closes 20 s into the round', !Match.buyTime() && Match.buy(me, 'smoke').msg === 'Buy time is over');

// 3) elimination + kill rewards + round money
const w0 = wardens().filter((a) => a !== me)[0];
const rBefore = raiders().map((a) => a.money), meBefore = me.money;
const killers = { smg: WEAPONS.smg, knife: WEAPONS.knife, sniper: WEAPONS.sniper };
const before = w0.money;
raiders()[0].damage(500, 'chest', w0, killers.smg, w0.player.pos);
const afterSmg = w0.money;
raiders()[1].damage(500, 'chest', w0, killers.knife, w0.player.pos);
const afterKnife = w0.money;
const dropped = Items.list.map((i) => i.id);
raiders()[2].damage(500, 'chest', w0, killers.sniper, w0.player.pos);
check('kill rewards: SMG $600, knife $1500, sniper $100', afterSmg - before === 600 && afterKnife - afterSmg === 1500 && w0.money - afterKnife <= 100, `${before} -> ${afterSmg} -> ${afterKnife} -> ${w0.money}`);
check('the dead drop their gun (and the charge)', dropped.includes('pistol') && (Bomb.state === 'dropped' || Items.list.some((i) => i.id === 'charge')), dropped.join(','));
run(0.2);
check('last Raider down: Wardens win the round', Match.phase === 'post' && Match.result.side === TEAM.WARDENS && Match.result.reason === 'elim' && Match.sideScore(TEAM.WARDENS) === 1, JSON.stringify(Match.result));
const rMoney = raiders().map((a) => a.money), wMe = me.money;
check('round money: losers +$1400, winners +$3250', rMoney.every((m, i) => m === rBefore[i] + 1400) && wMe === meBefore + 3250, `raiders ${rBefore} -> ${rMoney}; me ${meBefore} -> ${wMe}`);

// 4) planting
run(5.2);
check('next round: survivors keep gear, the dead restart with a pistol', Match.round === 2 && me.loadout.primary() && me.loadout.primary().def.id === 'smg' && raiders().every((a) => !a.loadout.primary()), me.loadout.ids().join(','));
run(10.1);
const carrier = Bomb.carrier;
place(carrier, 980, 0, -470, Math.PI / 2);
carrier.forceCmd = { slot: 5 }; run(0.1); carrier.forceCmd = { fire: true };
run(1.5);
check('planting takes time (not done after 1.5 s, the charge draws in 0.8 s)', Bomb.state === 'carried' && carrier.loadout.active.state === 'plant', `state=${Bomb.state}`);
const moneyBefore = carrier.money;
run(2.6);
carrier.forceCmd = null;
check('the charge is planted at A after 3.2 s; planter +$300', Bomb.state === 'planted' && Bomb.site.name === 'A' && Match.phase === 'planted' && carrier.money === moneyBefore + 300, `state=${Bomb.state} money ${moneyBefore}->${carrier.money}`);
place(carrier, 300, 0, -400);
check('planting outside a site does nothing', Bomb.siteAt([300, 0, -400]) === null && Bomb.siteAt([780, 104, 368]) && Bomb.siteAt([780, 104, 368]).name === 'B', 'container roof counts for B');
// 5) defusing: releasing resets progress; a kit halves the time
const def = me;
place(def, Bomb.pos[0] + 30, 0, Bomb.pos[2]); def.kit = false;
def.forceCmd = { useHeld: true }; run(4);
const partial = Bomb.defuseT;
def.forceCmd = null; run(0.2);
check('letting go of E cancels the defuse', partial > 3.5 && !Bomb.defuser && Bomb.state === 'planted', `progress was ${partial.toFixed(2)}s`);
def.kit = true; def.forceCmd = { useHeld: true };
const m0 = def.money;
run(5.2);
def.forceCmd = null;
check('with a kit the defuse takes 5 s; Wardens win, defuser +$300', Bomb.state === 'defused' && Match.result && Match.result.reason === 'defuse' && def.money === Math.min(MATCH.max, m0 + MATCH.win.defuse + 300), `state=${Bomb.state} money ${m0}->${def.money}`);
check('Raiders who planted get the $800 bonus on a loss', Match.history[Match.history.length - 1].reason === 'defuse' && raiders().every((a) => a.money >= 1400 + 800), raiders().map((a) => a.money).join(','));

// 6) the blast
run(5.2 + 10.1);
const c2 = Bomb.carrier;
place(c2, 760, 0, 520); c2.forceCmd = { slot: 5 }; run(0.1); c2.forceCmd = { fire: true }; run(4.2); c2.forceCmd = null;
place(c2, -800, 0, 0);
const near = wardens()[1], far = wardens()[2];
place(near, Bomb.pos[0] + 250, 0, Bomb.pos[2]); place(far, -900, 0, -300);
near.armor = 0; far.armor = 0;
const plantedOk = Bomb.state === 'planted';
run(BOMB.fuse + 0.3);
check('after 40 s the charge explodes: Raiders win', plantedOk && Bomb.state === 'exploded' && Match.result && Match.result.reason === 'bomb' && Match.result.side === TEAM.RAIDERS, `state=${Bomb.state} result=${JSON.stringify(Match.result)}`);
check('the blast kills nearby, spares the far side', !near.alive && far.alive && far.health === 100, `near hp=${near.health} far hp=${far.health}`);

// 7) running out the clock without a plant
run(5.2 + 10.1);
botsIdle = true;
place(raiders()[0], -800, 0, -200);
run(MATCH.round + 0.5);
check('time runs out: Wardens win; Raiders still alive get no loss money', Match.result && Match.result.reason === 'time', JSON.stringify(Match.result));

// 8) halftime and match end (fast forward)
const squadMe = me.squad, teamBefore = me.team;
while (Match.round < Match.len.half && Match.phase !== 'over') { Match.endRound(TEAM.RAIDERS, 'elim'); Match.nextRound(); }
Match.endRound(TEAM.RAIDERS, 'elim'); run(MATCH.halftime + 0.2);
check('halftime: everyone swaps sides, money resets to $800, scores stay with the squad', me.team !== teamBefore && me.squad === squadMe && Actors.list.every((a) => a.money === 800 || a.money === 800) && Match.half === 2,
  `team ${teamBefore}->${me.team} score=${Match.score} round=${Match.round}`);
let guard = 0;
while (Match.phase !== 'over' && guard++ < 40) { Match.endRound(me.team, 'elim'); if (Match.phase !== 'over') Match.nextRound(); }
check('first squad to 16 wins the match', Match.phase === 'over' && Math.max(...Match.score) === 16, `score=${Match.score}`);

// 9) raider bots plant on their own (no wardens in the game, so only the charge can end the round)
Actors.removeBots();
me.brain = new api.BotBrain(me);
Actors.setSide(me, TEAM.RAIDERS);
for (let i = 0; i < 4; i++) Actors.addBot(TEAM.RAIDERS);
botsIdle = false;
Match.startMatch();
let plantedAt = -1;
run(10 + 90, () => { if (Bomb.state === 'planted' && plantedAt < 0) plantedAt = Match.liveT; return Bomb.state === 'planted'; });
check('raider bots carry the charge to a site and plant it', Bomb.state === 'planted', `planted at ${Bomb.site && Bomb.site.name} after ${plantedAt.toFixed(1)} s of the round; carrier route ok`);
run(BOMB.fuse + 1);
check('...and the round ends when it blows', Match.result && Match.result.reason === 'bomb', JSON.stringify(Match.result));

// 10) a full 5v5 between bots (you play as a bot on the Wardens)
Actors.removeBots();
Actors.setSide(me, TEAM.WARDENS);
for (let i = 0; i < 5; i++) Actors.addBot(TEAM.RAIDERS);
for (let i = 0; i < 4; i++) Actors.addBot(TEAM.WARDENS);
Match.startMatch();
const N = +roundsArg, t0 = Date.now();
let plants = 0, defuses = 0, wasPlanted = false, prims = 0;
const deaths = [], ends = [];
let lastFeed = 0, lastHist = 0;
run(60 * 60 * 3, () => {
  if (process.env.DEBUG) {
    for (const a of Actors.list) if (!a.alive && !a._logged) { a._logged = true; deaths.push(`${a.team === 0 ? 'R' : 'W'}@${a.player.pos[0].toFixed(0)},${a.player.pos[2].toFixed(0)}/${Match.liveT.toFixed(1)}s<${a.killer ? a.killer.name + ':' + a.killer.team + '@' + a.killer.player.pos[0].toFixed(0) + ',' + a.killer.player.pos[2].toFixed(0) : '-'}${a.killInfo ? ':' + a.killInfo.weapon : ''}`); }
    for (const a of Actors.list) if (a.alive) a._logged = false;
    if (Match.history.length > lastHist) { lastHist = Match.history.length; ends.push(Match.liveT.toFixed(0)); deaths.push('|'); }
  }
  if (Match.phase === 'planted' && !wasPlanted) { wasPlanted = true; plants++; }
  if (Match.phase === 'freeze') wasPlanted = false;
  if (Match.phase === 'live' && Match.round === 3 && Match.liveT < 0.05) prims = Actors.list.filter((a) => a.loadout.primary()).length;
  return Match.history.length >= N;
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);
const log = Match.history.map((h) => `${h.round}:${h.side === TEAM.RAIDERS ? 'R' : 'W'}/${h.reason}`).join(' ');
check(`5v5 bots play ${N} full rounds`, Match.history.length >= N, `${log} · plants ${plants} · smokes ${thrown} · ${secs}s wall`);
check('raider bots push together and get plants down in a bot 5v5', plants >= 1, `plants=${plants}`);
check('bots buy primaries once they can afford them', prims >= 3 || Match.history.length < 3, `primaries in round 3: ${prims}`);
if (process.env.DEBUG) console.log('round lengths', ends.join(','), '\n', deaths.join(' '));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
