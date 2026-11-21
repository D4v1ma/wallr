// Headless checks for accounts on this device: creating and signing in, PINs, keeping each
// account's progress apart, saving when a match is recorded, recovering a match whose page closed
// mid-game, guests, moving Stage 6 progress into the first account, and blocked storage.
// Usage: node tools/node-account-check.mjs <path to three.js (UMD build)>
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const [threePath] = process.argv.slice(2);
globalThis.THREE = createRequire(import.meta.url)(threePath);
// an in-memory localStorage (the browser's, as far as this code can tell)
const mem = new Map();
let blocked = false;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { if (blocked) throw new Error('QuotaExceededError'); mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};
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
const api = new Function(`${src}\nreturn { Accounts, Profile, WELCOME_POINTS };`)();
const { Accounts, Profile } = api;
let ok = true; const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const keys = () => [...mem.keys()].filter((k) => k.startsWith('shortfuse.') && !k.startsWith('shortfuse.settings'));
const raw = (k) => JSON.parse(mem.get(k) || 'null');
const cfg = { map: 'kiln', mode: 'defuse', ranked: true, diff: 'hard', allies: 4, enemies: 5, len: 'standard' };
const st = { kills: 15, deaths: 10, hs: 5, dmg: 1900, rounds: 22, roundsWon: 16, plants: 1, defuses: 1, score: [16, 6] };

// 1) a device that already has Stage 6 progress, before accounts existed
mem.set('shortfuse.profile.v1', JSON.stringify({ xp: 5200, points: 940, elo: 1088, placed: 1, owned: { att: ['rifle:hush'], camo: ['tiger'] }, kit: { rifle: { muzzle: 'hush', camo: 'tiger' } }, history: [{ outcome: 'win' }] }));
Accounts.init();
check('first launch: no accounts yet, playing as a guest', Accounts.list.length === 0 && Accounts.guest && Accounts.storageOK && Profile.v.xp === 0);
check('the old progress is found, waiting for the first account', !!Accounts.legacy() && Accounts.legacy().xp === 5200);

// 2) names
check('callsigns: 2-16 characters, odd characters stripped', !Accounts.checkName('x').ok && Accounts.checkName('  <Ember>!! ').name === 'Ember' && Accounts.cleanName('A'.repeat(30)).length === 16);
check('PINs: 4-8 digits, typed twice', Accounts.checkPin('', '').ok && !Accounts.checkPin('12', '12').ok && !Accounts.checkPin('1234', '1235').ok && !Accounts.checkPin('12ab', '12ab').ok && Accounts.checkPin('123456', '123456').ok);

// 3) the first account takes the old progress
let r = await Accounts.create('Ember', '');
check('creating the first account signs it in and moves the old progress into it', r.ok && r.from === 'legacy' && !Accounts.guest && Accounts.cur.name === 'Ember' && Profile.v.xp === 5200 && Profile.v.kit.rifle.muzzle === 'hush', JSON.stringify({ from: r.from, xp: Profile.v.xp }));
check('...and the old copy is gone, the new one stored under the account', !mem.has('shortfuse.profile.v1') && raw(`shortfuse.profile.v1.${Accounts.cur.id}`).xp === 5200);
const ember = Accounts.cur;
r = await Accounts.create('ember', '');
check('a second account can’t reuse a callsign (any case)', !r.ok, r.msg);

// 4) a second account with a PIN
r = await Accounts.create('Nova', '4821');
const nova = Accounts.cur;
const idx = mem.get('shortfuse.accounts.v1');
check('a PIN is stored only as a salted hash', r.ok && nova.pin && nova.pin.hash.startsWith('s256:') && nova.pin.salt.length >= 8 && !idx.includes('4821'), nova.pin && nova.pin.hash.slice(0, 16));
check('the right PIN verifies, a wrong one doesn’t', (await Accounts.verify(nova, '4821')) && !(await Accounts.verify(nova, '1111')));
check('a new account starts fresh (level 1, 600 points)', Profile.v.xp === 0 && Profile.v.points === api.WELCOME_POINTS);

// 5) progress is saved when a match is recorded, per account
Profile.applyMatch(cfg, st, 'win', 'nova-m1');
const novaSaved = raw(`shortfuse.profile.v1.${nova.id}`);
check('finishing a match saves straight to this device', novaSaved.xp === Profile.v.xp && novaSaved.xp > 0 && novaSaved.history.length === 1 && novaSaved.lastMatchId === 'nova-m1' && Accounts.lastSaved > 0, `xp ${novaSaved.xp}`);
check('the account remembers when it last played', nova.lastPlayed > 0 && raw('shortfuse.accounts.v1').accounts.find((a) => a.id === nova.id).lastPlayed > 0);
Accounts.signIn(ember);
check('signing in to another account loads its own progress', Profile.v.xp === 5200 && Profile.v.history.length === 1 && Accounts.cur === ember);
Profile.buy('camo', 'web');
check('a purchase in the shop is saved at once', raw(`shortfuse.profile.v1.${ember.id}`).owned.camo.includes('web'));

// 6) reopening the game: the last account comes back with its progress
Accounts.init();
check('reopening: the account list and who played last are remembered', Accounts.list.length === 2 && Accounts.remembered && Accounts.remembered.name === 'Ember' && Accounts.guest);
Accounts.signIn(Accounts.remembered);
check('...and signing in restores everything', Profile.v.xp === 5200 && Profile.v.owned.camo.includes('web') && Profile.v.kit.rifle.camo === 'tiger');

// 7) the page closed mid-match before it could save: the last checkpoint is recorded on return
const before = Profile.v.xp, eloBefore = Profile.v.elo;
Accounts.checkpoint({ matchId: 'ember-m2', cfg, st: Object.assign({}, st, { score: [7, 5], rounds: 12, roundsWon: 7 }), outcome: 'left', at: Date.now() });
check('a checkpoint is kept on the device during a match', !!mem.get(`shortfuse.pending.v1.${ember.id}`));
Accounts.init();                                  // the page died; next launch
Accounts.signIn(Accounts.remembered);
check('next launch: the unfinished match is saved as left (XP, Elo, history)', Profile.v.xp > before && Profile.v.history[0].outcome === 'left' && Profile.v.lastMatchId === 'ember-m2' && Profile.v.elo !== eloBefore && !!Accounts.notice,
  `+${Profile.v.xp - before} XP, Elo ${Profile.v.elo - eloBefore}`);
check('...and the checkpoint is cleared', !mem.has(`shortfuse.pending.v1.${ember.id}`));
const xpNow = Profile.v.xp;
Accounts.checkpoint({ matchId: 'ember-m2', cfg, st, outcome: 'left', at: Date.now() });
Accounts.init(); Accounts.signIn(Accounts.remembered);
check('a match is never counted twice', Profile.v.xp === xpNow);

// 8) guests play without saving; their progress can become an account
Accounts.signOut();
const before8 = keys().length;
Profile.applyMatch(Object.assign({}, cfg, { ranked: false }), st, 'win', 'guest-m1');
check('a guest earns XP but nothing is written', Accounts.guest && Profile.v.xp > 0 && keys().length === before8 && !Accounts.saveProfile());
const guestXp = Profile.v.xp;
r = await Accounts.create('Ash', '', { fromGuest: true });
check('creating an account from a guest session keeps that progress', r.ok && r.from === 'guest' && Profile.v.xp === guestXp && raw(`shortfuse.profile.v1.${Accounts.cur.id}`).xp === guestXp);

// 9) managing an account
r = Accounts.rename('Nova');
check('renaming to a callsign already used here is refused', !r.ok, r.msg);
r = Accounts.rename('Ash Two');
check('renaming works and is saved', r.ok && raw('shortfuse.accounts.v1').accounts.some((a) => a.name === 'Ash Two'));
const novaNow = () => Accounts.list.find((a) => a.name === 'Nova');
Accounts.signIn(novaNow());
r = await Accounts.setPin('0000', '9999', '9999');
check('changing a PIN needs the current one', !r.ok, r.msg);
r = await Accounts.setPin('4821', '', '');
check('a PIN can be removed with the current PIN', r.ok && novaNow().pin === null);
r = await Accounts.setPin('', '1357', '1357');
check('...and added again', r.ok && (await Accounts.verify(novaNow(), '1357')));
r = await Accounts.remove(novaNow(), '2468');
check('deleting needs the PIN', !r.ok && !!novaNow(), r.msg);
r = await Accounts.remove(novaNow(), '1357');
check('deleting removes the account and its progress from this device', r.ok && !novaNow() && !mem.has(`shortfuse.profile.v1.${nova.id}`) && Accounts.guest);

// 10) damaged saves and blocked storage
mem.set(`shortfuse.profile.v1.${ember.id}`, '{not json');
Accounts.init(); Accounts.signIn(Accounts.list.find((a) => a.name === 'Ember'));
check('a damaged save loads as a fresh profile instead of breaking the game', Profile.v.xp === 0 && Profile.v.points === api.WELCOME_POINTS);
blocked = true;
Accounts.init();
r = await Accounts.create('Blocked', '');
check('storage blocked (private window): detected, and accounts refuse politely', !Accounts.storageOK && !r.ok, r.msg);
blocked = false;
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
