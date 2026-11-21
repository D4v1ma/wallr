// Headless checks for Stage 6 progression: levels and points, the shop, attachments changing weapon
// stats, camos, XP and Elo rewards (ranked vs casual, difficulty, leaving early), profile sanitising.
// Usage: node tools/node-profile-check.mjs <path to three.js (UMD build)>
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const [threePath] = process.argv.slice(2);
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
const api = new Function(`${src}\nreturn { WEAPONS, ATTACHMENTS, CAMOS, ARMORY_GUNS, Arsenal, Profile, Rewards, LEVELS, RANKS, rankFor, DIFFS, PLACEMENTS, BOT_SKILL, Loadout, attPrice };`)();
const { WEAPONS, Arsenal, Profile, Rewards, LEVELS, RANKS, rankFor, DIFFS, PLACEMENTS } = api;
let ok = true; const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// --- a fresh profile
Profile.v = Profile.blank();
check('a new profile starts at level 1 with 600 points, 1000 Elo, unranked', Profile.level().level === 1 && Profile.v.points === 600 && Profile.v.elo === 1000 && Profile.rank() === -1);
check('levels: 800 XP to level 2, the need grows, every level pays points (+500 every 10th)',
  LEVELS.of(799).level === 1 && LEVELS.of(800).level === 2 && LEVELS.need(5) > LEVELS.need(2) && LEVELS.points(2) === 160 && LEVELS.points(10) === LEVELS.points(9) + 10 + 500,
  `need(1..5)=${[1, 2, 3, 4, 5].map((l) => LEVELS.need(l))}`);
check('ranks: Spark I below 700, Flint II at 1000, Short Fuse at 2400', RANKS[rankFor(500)].name === 'Spark I' && RANKS[rankFor(1000)].name === 'Flint II' && RANKS[rankFor(2400)].name === 'Short Fuse', `${RANKS.length} ranks`);
check('four bot difficulties, expert included', ['easy', 'normal', 'hard', 'expert'].every((d) => DIFFS[d] && api.BOT_SKILL[d]));

// --- the shop: attachments per gun, camos for every gun
let r = Profile.buy('att', 'choke', 'rifle');
check('an attachment that does not fit is refused', !r.ok, r.msg);
r = Profile.buy('att', 'hush', 'rifle');
check('buying the Hush Can for the Kestrel AR costs 450 points', r.ok && Profile.v.points === 150 && Profile.owns('att', 'rifle:hush'), r.msg);
check('owning it for one gun does not unlock it for another', !Profile.owns('att', 'smg:hush'));
r = Profile.buy('att', 'hush', 'rifle');
check('buying it twice is refused', !r.ok, r.msg);
r = Profile.buy('camo', 'tiger');
check('not enough points is refused', !r.ok && Profile.v.points === 150, r.msg);
check('attachment prices scale per gun (pistol cheaper, sniper dearer)', api.attPrice('hush', 'pistol') < api.attPrice('hush', 'rifle') && api.attPrice('hush', 'sniper') > api.attPrice('hush', 'rifle'));
check('only owned attachments can be equipped', !Profile.equip('rifle', 'mag', 'extmag') && Profile.equip('rifle', 'muzzle', 'hush'));

// --- attachments change the local player's weapon defs
const stock = WEAPONS.rifle, d1 = Arsenal.def('rifle');
check('suppressed rifle: quiet, small flash, 6% less damage', d1 !== stock && d1.suppressed && d1.noise === 600 && near(d1.damage, stock.damage * 0.94) && d1.flash < stock.flash * 0.3,
  `dmg ${d1.damage.toFixed(2)} noise ${d1.noise} flash ${d1.flash.toFixed(2)}`);
check('the stock def is untouched', stock.damage === 33 && !stock.suppressed);
check('same kit, same def object (cached)', Arsenal.def('rifle') === d1);
const ext = Arsenal.def('rifle', { mag: 'extmag' }), quick = Arsenal.def('rifle', { mag: 'quick' });
check('Long Mag: 40 rounds, 12% slower reload, viewmodel plays it slower', ext.mag === 40 && near(ext.reload.time, stock.reload.time * 1.12) && near(ext.reloadRate, 1 / 1.12) && ext.maxSpeed === stock.maxSpeed - 5);
check('Quick Mag: 22% faster reload, 27 rounds', quick.mag === 27 && near(quick.reload.time, stock.reload.time * 0.78));
check('mag sizes per gun: pistol 20, SMG 40, shotgun tube 10, sniper 13',
  Arsenal.def('pistol', { mag: 'extmag' }).mag === 20 && Arsenal.def('smg', { mag: 'extmag' }).mag === 40 && Arsenal.def('shotgun', { mag: 'extmag' }).mag === 10 && Arsenal.def('sniper', { mag: 'extmag' }).mag === 13);
const grip = Arsenal.def('rifle', { grip: 'grip' }), p9 = stock.recoil.pattern[9], g9 = grip.recoil.pattern[9];
check('Vertical Grip: 30% less sideways recoil, same climb', near(g9[1], p9[1] * 0.7) && near(g9[0], p9[0]));
check('Fieldglass: wider scope zoom on the Osprey', Arsenal.def('sniper', { optic: 'glass' }).scope[0] > WEAPONS.sniper.scope[0]);
const choke = Arsenal.def('shotgun', { muzzle: 'choke' });
check('Full Choke tightens the Bison spread by 28%', near(choke.pelletSpread, WEAPONS.shotgun.pelletSpread * 0.72));
check('stats for the loadout screen reflect attachments', Arsenal.stats(ext).find((s) => s.id === 'mag').v === 40 && Arsenal.stats(stock).find((s) => s.id === 'mag').v === 30);
// the player's loadout resolves bought guns through the profile
const lo = new api.Loadout(['pistol', 'knife'], (id) => Arsenal.def(id));
lo.give('rifle', true);
check('a rifle bought by the player comes with the equipped attachments', lo.byId('rifle').def.suppressed && lo.byId('rifle').ammo === 30);
const botLo = new api.Loadout(['pistol', 'knife']);
botLo.give('rifle', true);
check('bots carry stock guns', !botLo.byId('rifle').def.suppressed);

// --- camos unlock for every gun
Profile.v.points = 5000;
r = Profile.buy('camo', 'tiger');
check('a camo unlocks for every gun', r.ok && Profile.equip('smg', 'camo', 'tiger') && Profile.equip('sniper', 'camo', 'tiger') && Arsenal.def('smg').kit.camo === 'tiger');
check('a camo is cosmetic: same stats', Arsenal.def('smg').damage === WEAPONS.smg.damage && Arsenal.def('smg').kitSig.endsWith('|tiger'));
check('every camo paints a tileable 256 px pattern', Object.values(api.CAMOS).every((c) => typeof c.paint === 'function' && c.price > 0));

// --- XP and Elo
const avg = { kills: 18, deaths: 14, hs: 6, dmg: 2200, rounds: 25, roundsWon: 16, plants: 2, defuses: 1 };
const cfg = (o) => Object.assign({ map: 'depot', mode: 'defuse', ranked: false, diff: 'normal', allies: 4, enemies: 5, len: 'standard' }, o);
const xpC = Rewards.xp(cfg({}), avg, 'win'), xpR = Rewards.xp(cfg({ ranked: true }), avg, 'win'), xpH = Rewards.xp(cfg({ diff: 'hard' }), avg, 'win');
const expectBase = 18 * 100 + 6 * 30 + 2200 * 0.5 + 16 * 60 + 2 * 80 + 120 + 600 + 400;
check('XP: eliminations, headshots, damage, rounds, objectives, win and completion', xpC.base === expectBase && xpC.total === expectBase, `${xpC.total}`);
check('XP: hard bots ×1.25, ranked ×1.25', xpH.total === Math.round(expectBase * 1.25) && xpR.total === Math.round(expectBase * 1.25));
check('XP: leaving early drops the win and completion bonuses', Rewards.xp(cfg({}), avg, 'left').base === expectBase - 1000);
const eRw = Rewards.elo(cfg({ ranked: true }), avg, 'win', 1050, 5), eCw = Rewards.elo(cfg({}), avg, 'win', 1050, 5);
const eRl = Rewards.elo(cfg({ ranked: true }), avg, 'loss', 1050, 5), eCl = Rewards.elo(cfg({}), avg, 'loss', 1050, 5);
check('Elo: a ranked win is worth far more than a casual win', eRw.delta > 3 * eCw.delta && eCw.delta > 0, `ranked +${eRw.delta}, casual +${eCw.delta}`);
check('Elo: losses cost rating, ranked more than casual', eRl.delta < eCl.delta && eCl.delta <= 0, `ranked ${eRl.delta}, casual ${eCl.delta}`);
const quiet = Object.assign({}, avg, { kills: 4, hs: 0, dmg: 700, deaths: 20, plants: 0, defuses: 0 });
check('Elo: eliminations and damage count (a strong game beats a quiet one)', Rewards.elo(cfg({ ranked: true }), avg, 'loss', 1050, 5).delta > Rewards.elo(cfg({ ranked: true }), quiet, 'loss', 1050, 5).delta);
check('Elo: beating hard bots pays more than beating easy ones', Rewards.elo(cfg({ ranked: true, diff: 'hard' }), avg, 'win', 1000, 5).delta > Rewards.elo(cfg({ ranked: true, diff: 'easy' }), avg, 'win', 1000, 5).delta);
check('Elo: placement matches move twice as far', Rewards.elo(cfg({ ranked: true }), avg, 'win', 1050, 0).delta > 1.6 * eRw.delta);
check('Elo: leaving a ranked match counts as a loss', Rewards.elo(cfg({ ranked: true }), Object.assign({}, avg, { kills: 0, dmg: 0, deaths: 0, hs: 0, plants: 0, defuses: 0 }), 'left', 1050, 5).delta < 0);
check('Elo: facing five bots alone rates the opponents higher', Rewards.oppRating(cfg({ allies: 0 })) > Rewards.oppRating(cfg({})));

// --- a whole ranked match folded into the profile
Profile.v = Profile.blank();
const res = Profile.applyMatch(cfg({ ranked: true, diff: 'hard' }), avg, 'win');
check('applyMatch: XP added, level-ups pay points', Profile.v.xp === res.xp.total && res.ups.length >= 2 && Profile.v.points === 600 + res.ups.reduce((n, u) => n + u.points, 0), `level ${res.lv1.level}, +${res.ups.reduce((n, u) => n + u.points, 0)} points`);
check('applyMatch: Elo and placement count, history and stats recorded', Profile.v.elo === 1000 + res.elo.delta && Profile.v.placed === 1 && Profile.v.history.length === 1 && Profile.v.stats.wins === 1 && Profile.v.stats.kills === 18, `Elo ${Profile.v.elo}`);
for (let i = 0; i < PLACEMENTS - 1; i++) Profile.applyMatch(cfg({ ranked: true, diff: 'hard' }), avg, 'win');
check(`after ${PLACEMENTS} ranked matches you have a rank`, Profile.rank() >= 0, RANKS[Profile.rank()] && RANKS[Profile.rank()].name);
const skirm = Profile.applyMatch(cfg({ mode: 'skirmish' }), { kills: 10, deaths: 3, hs: 2, dmg: 900, rounds: 0, roundsWon: 0, plants: 0, defuses: 0 }, 'practice');
check('skirmish pays practice XP and never touches Elo or match history', skirm.elo === null && skirm.xp.total === Math.round((10 * 40 + 900 * 0.2)) && Profile.v.history.length === PLACEMENTS);

// --- sanitising saved data
const junk = Profile.sanitize({ xp: 'lots', points: -5, owned: { att: ['rifle:hush', 'rifle:nope', 'pistol:choke'], camo: ['tiger', 'unknown'] },
  kit: { rifle: { muzzle: 'hush', mag: 'extmag', camo: 'gilded' }, smg: { camo: 'tiger' } }, elo: 99999, history: [null, 3, { outcome: 'win' }] });
check('saved data is sanitised: unknown items, unowned kit and bad numbers dropped',
  junk.xp === 0 && junk.points === 0 && junk.owned.att.join() === 'rifle:hush' && junk.owned.camo.join() === 'tiger' && junk.kit.rifle.muzzle === 'hush' && junk.kit.rifle.mag === null && junk.kit.rifle.camo === null && junk.kit.smg.camo === 'tiger' && junk.elo === 5000 && junk.history.length === 1,
  JSON.stringify({ att: junk.owned.att, kit: junk.kit.rifle, elo: junk.elo }));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
