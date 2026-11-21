// Stage 6 browser checks: main menu, Create Game, loadout and shop, an in-place map switch, a ranked
// match with attachments, the results screen, career, the pause menu, and the phone layout.
// Usage: node tools/gameplay6-check.mjs <three.min.js path> <screenshot dir>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const [threePath, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const route = async (page) => {
  await page.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(threePath) }));
  await page.route('https://fonts.**', (r) => r.abort());
};
let ok = true;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await route(page);
await page.goto(new URL('../index.html', import.meta.url).href);
await page.waitForFunction(() => window.__SF && __SF.Game.state === 'menu', null, { timeout: 240000 });
const ev = (f, a) => page.evaluate(f, a);
const vis = (sel) => page.isVisible(sel);

// 0) first run on this device: create an account (callsign + PIN)
check('first launch asks you to create an account (or play as a guest)', await vis('#scr-newacct') && await vis('#scr-newacct [data-act="acct-guest"]'));
await page.screenshot({ path: `${out}/g6-newacct.png` });
await page.fill('#acct-name', 'T');
await page.click('[data-act="acct-create"]');
check('a one-letter callsign is refused with a message', /2 to 16/.test(await page.textContent('#acct-err')));
await page.fill('#acct-name', 'Tester');
await page.fill('#acct-pin', '2580'); await page.fill('#acct-pin2', '2580');
await page.press('#acct-pin2', 'Enter');
await page.waitForFunction(() => __SF.Menu.cur === 'home', null, { timeout: 10000 });
const acct = await ev(() => ({ name: __SF.Accounts.cur && __SF.Accounts.cur.name, me: __SF.Actors.me.name, keys: Object.keys(localStorage).filter((k) => k.startsWith('shortfuse.')), edges: [...__SF.Input.edges] }));
check('creating the account signs you in; you play under your callsign', acct.name === 'Tester' && acct.me === 'Tester' && acct.keys.some((k) => k.startsWith('shortfuse.profile.v1.')), JSON.stringify(acct));
check('typing in the form doesn’t leak keys into the game', acct.edges.length === 0, JSON.stringify(acct.edges));

// 1) main menu
check('boots into the main menu over the map', await vis('#scr-home') && await ev(() => __SF.Game.state === 'menu' && !!__SF.Game.L));
const card = await page.textContent('#home-card');
check('profile card: account, rank, level, XP, points, saved on this device', /Tester/.test(card) && /UNRANKED|Unranked/.test(card) && /Level 1/.test(card) && /600/.test(card) && /Saved on this device/.test(card), card.replace(/\s+/g, ' ').slice(0, 160));

// 2) Create Game: map, ranked, hard bots
await page.click('#btn-play');
check('Play opens Create Game with every map', await vis('#scr-create') && (await page.$$('.mapcard')).length >= 4);
await page.click('.mapcard[data-v="kiln"]');
await page.click('.seg button[data-k="ranked"][data-v="true"]');
await page.click('.seg button[data-k="diff"][data-v="hard"]');
const cfg = await ev(() => __SF.Menu.cfg);
check('ranked locks 5v5 and friendly fire off', cfg.ranked === true && cfg.allies === 4 && cfg.enemies === 5 && cfg.ff === false && cfg.map === 'kiln' && cfg.diff === 'hard', JSON.stringify(cfg));
check('the summary previews Elo for a win and a loss', /win \+\d+/.test(await page.textContent('#scr-create .summary')));
await page.screenshot({ path: `${out}/g6-create.png` });

// 3) loadout before the match: buy and equip a suppressor for the rifle
await page.click('[data-act="create-next"]');
check('Next opens the loadout for this match', await vis('#scr-armory') && /LOADOUT FOR THIS MATCH/i.test(await page.textContent('#arm-title')));
await page.click('#arm-guns button[data-v="rifle"]');
await page.click('.chip[data-slot="muzzle"][data-v="hush"]');
await page.click('#arm-detail [data-act="buy"]');
const owned = await ev(() => ({ pts: __SF.Profile.v.points, kit: __SF.Profile.v.kit.rifle.muzzle }));
check('buying in the loadout spends points and equips it', owned.pts === 150 && owned.kit === 'hush', JSON.stringify(owned));
check('the 3D preview renders the gun', await ev(() => __SF.ArmoryView.running && !!__SF.ArmoryView.cur));
await page.screenshot({ path: `${out}/g6-loadout.png` });

// 4) Start: Kilnworks is built in place (no page reload), then Deploy
await ev(() => { window.__marker = 42; });
await page.click('[data-act="start"]');
await page.waitForFunction(() => __SF.Menu.cur === 'ready', null, { timeout: 240000 });
const st = await ev(() => ({ marker: window.__marker, map: __SF.Game.L.key, n: __SF.Actors.list.length, skill: __SF.Settings.v.botSkill, ranked: __SF.Session.cfg.ranked, phase: __SF.Match.phase }));
check('the new map loads in place and the match is set up', st.marker === 42 && st.map === 'kiln' && st.n === 10 && st.skill === 'hard' && st.ranked && st.phase === 'freeze', JSON.stringify(st));
await ev(() => { __SF.play(); __SF.Input.freeMouse = true; __SF.Game.botsFrozen = true; });
await ev(() => { const me = __SF.Actors.me; me.money = 9000; __SF.Match.buy(me, 'rifle'); });
await page.waitForTimeout(1200);
const rifle = await ev(() => { const w = __SF.Game.loadout.active; return { id: w.def.id, supp: !!w.def.suppressed, att: __SF.Viewmodel.models.rifle.att.hush.visible }; });
check('the rifle bought in the match carries the suppressor (stats and viewmodel)', rifle.id === 'rifle' && rifle.supp && rifle.att, JSON.stringify(rifle));
await page.screenshot({ path: `${out}/g6-ingame.png` });

// 5) pause menu
await ev(() => { __SF.Game.state = 'playing'; });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Esc opens the pause menu with a ranked warning', await vis('#scr-pause') && await vis('#pause-warn'));
await page.click('[data-act="resume"]');
await ev(() => { __SF.play(); __SF.Input.freeMouse = true; });

// 6) the match ends: results, XP, points, Elo
await ev(() => {
  const M = __SF.Match, me = __SF.Actors.me;
  me.kills = 20; me.deaths = 9; me.hs = 7; me.dmg = 2400; me.plants = 1;
  for (let i = 0; i < 40 && M.phase !== 'over'; i++) { M.endRound(me.team, 'elim'); if (M.phase !== 'over') M.nextRound(); }
});
await page.waitForFunction(() => __SF.Game.state === 'results', null, { timeout: 20000 });
await page.waitForTimeout(1600);
const res = await ev(() => { const v = __SF.Profile.v; return { xp: v.xp, points: v.points, elo: v.elo, placed: v.placed, hist: v.history.length, title: document.querySelector('#scr-results h2').textContent }; });
check('results: victory, XP, level-up points, a placement match with Elo gained', res.title === 'Victory' && res.xp > 4000 && res.points > 150 && res.elo > 1000 && res.placed === 1 && res.hist === 1, JSON.stringify(res));
const stored = await ev(() => { const id = __SF.Accounts.cur.id; const p = JSON.parse(localStorage.getItem('shortfuse.profile.v1.' + id)); return { xp: p.xp, hist: p.history.length, line: document.querySelector('#scr-results .saved').textContent }; });
check('finishing the match saved it to the account on this device', stored.xp === res.xp && stored.hist === 1 && /Saved on this device/.test(stored.line), JSON.stringify(stored));
await page.screenshot({ path: `${out}/g6-results.png` });
await page.click('#scr-results [data-act="home"]');
await page.click('#scr-home [data-go="career"]');
check('career lists the match', (await page.$$('table.hist tbody tr')).length === 1);
await page.screenshot({ path: `${out}/g6-career.png` });
await page.click('#scr-career [data-back]');
check('back returns to the main menu', await vis('#scr-home'));

// 7) exiting mid-match by closing/reloading the page still saves the match
page.on('dialog', (d) => d.accept().catch(() => {}));
await ev(() => { __SF.Session.begin(Object.assign({}, __SF.Session.cfg, { map: 'kiln' })); __SF.play(); __SF.Input.freeMouse = true; __SF.Game.botsFrozen = true; __SF.Match.phase = 'live'; __SF.Actors.me.kills = 3; __SF.Actors.me.dmg = 420; });
const xpBeforeExit = await ev(() => __SF.Profile.v.xp);
await page.reload();
await page.waitForFunction(() => window.__SF && __SF.Game.state === 'menu', null, { timeout: 240000 });
check('reopening with a PIN account shows Who’s playing? with the PIN field', await vis('#scr-account') && await vis('#acct-pinin'));
await page.screenshot({ path: `${out}/g6-account.png` });
await page.fill('#acct-pinin', '1111'); await page.press('#acct-pinin', 'Enter');
await page.waitForTimeout(300);
check('a wrong PIN is refused', /Wrong PIN/.test(await page.textContent('#scr-account')) && await ev(() => __SF.Accounts.guest));
await page.fill('#acct-pinin', '2580'); await page.press('#acct-pinin', 'Enter');
await page.waitForFunction(() => __SF.Menu.cur === 'home', null, { timeout: 10000 });
const after = await ev(() => { const v = __SF.Profile.v; return { xp: v.xp, hist: v.history.map((h) => h.outcome), kills: v.stats.kills, map: __SF.Game.L.key }; });
check('the match left by closing the page was saved (as left, with its XP)', after.xp > xpBeforeExit && after.hist[0] === 'left' && after.hist.length === 2 && after.map === 'kiln', JSON.stringify(after));

// 8) switching account, guests
await page.click('#home-card [data-act="acct-switch"]');
check('Switch goes back to Who’s playing?', await vis('#scr-account') && (await page.$$('.acard-main')).length === 1);
await page.click('[data-act="acct-guest"]');
const guest = await ev(() => ({ guest: __SF.Accounts.guest, me: __SF.Actors.me.name, card: document.querySelector('#home-card').textContent }));
check('playing as a guest: nothing is saved, and the card offers an account', guest.guest && guest.me === 'You' && /Guest/.test(guest.card) && /Create account/i.test(guest.card), guest.card.replace(/\s+/g, ' ').slice(0, 80));
check('no page errors', errs.length === 0, errs.join(' | '));
await page.close();

// 9) phone layout: menus fit without sideways scrolling
const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
const ph = await ctx.newPage();
await route(ph);
await ph.goto(new URL('../index.html?map=range', import.meta.url).href);
await ph.waitForFunction(() => window.__SF && __SF.Game.state === 'menu', null, { timeout: 240000 });
const fits = () => ph.evaluate(() => { const s = document.querySelector('#sf-overlay [id^="scr-"]:not([hidden])'); return { over: Math.max(document.documentElement.scrollWidth, s.scrollWidth) - innerWidth, h: s.scrollHeight, vh: innerHeight }; });
const f1 = await fits();
await ph.screenshot({ path: `${out}/g6-phone-home.png` });
await ph.evaluate(() => __SF.Menu.openCreate());
const f2 = await fits();
await ph.screenshot({ path: `${out}/g6-phone-create.png` });
await ph.evaluate(() => __SF.Menu.openArmory('shop', false));
await ph.waitForTimeout(500);
const f3 = await fits();
await ph.screenshot({ path: `${out}/g6-phone-shop.png` });
check('phone: home, Create Game and the shop fit the width', f1.over <= 0 && f2.over <= 0 && f3.over <= 0, JSON.stringify([f1, f2, f3]));
await browser.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
