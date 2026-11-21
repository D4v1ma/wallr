// Stage 4 screenshots: sites, the blast, round and match banners, bots with bought guns, drops.
// Usage: node tools/stage4-shots.mjs <three.min.js> <outdir>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, mkdirSync } from 'node:fs';
const [threePath, out = 'shots'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(threePath) }));
await page.route('https://fonts.**', (r) => r.abort());
await page.goto(new URL('../index.html', import.meta.url).href);
await page.waitForFunction(() => window.__SF, null, { timeout: 120000 });
const ev = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
await ev(() => { __SF.play(); __SF.Input.freeMouse = true; __SF.Settings.set('showHints', false); __SF.Game.botsFrozen = true; __SF.Match.t = 0.05; });
await wait(600);
// the two sites
await ev(() => { __SF.spectate([700, 120, -150], 135, -14); });
await wait(500); await shot('s4-site-a');
await ev(() => { __SF.spectate([520, 150, 250], -125, -16); });
await wait(500); await shot('s4-site-b');
// planted charge at B, seen from above, then the blast
await ev(() => {
  const B = __SF.Bomb, c = B.carrier, w = c.loadout.byId('charge');
  __SF.place(c, 760, 0, 540, 0); B.plant(c, w, B.siteByName('B')); __SF.place(c, -900, 0, -300, 0);
  for (const a of __SF.Actors.list) if (a.team === 1) __SF.place(a, 1150 + Math.random() * 60, 0, -200 + Math.random() * 100, 90);
  __SF.spectate([700, 190, 230], -160, -32);
});
await wait(700); await shot('s4-planted');
await ev(() => { __SF.Bomb.timer = 0.05; __SF.spectate([420, 160, 230], -120, -10); });
await wait(260); await shot('s4-blast');
await wait(1300); await shot('s4-blast-smoke');
await wait(900);
await ev(() => __SF.spectate(null));
await wait(200); await shot('s4-round-end');
// a later round with bought guns: let the bots play
await ev(() => {
  __SF.Game.botsFrozen = false; __SF.Match.startMatch();
  for (const a of __SF.Actors.list) a.money = 6000;
  __SF.Match.t = 1.5;
});
await page.waitForFunction(() => __SF.Match.phase === 'live', null, { timeout: 20000 });
await wait(7000);
await ev(() => {
  const r = __SF.Actors.list.find((a) => a.team === 0 && a.alive && !a.isMe) || __SF.Actors.list.find((a) => a.alive && !a.isMe);
  __SF.spectate(null, 0, 0, r, [70, 60, 90]);
  __SF.Game.spectate.yaw = Math.atan2(70, 90); __SF.Game.spectate.pitch = -0.25;
});
await wait(1500); await shot('s4-bots');
const kit = await ev(() => __SF.Actors.list.map((a) => `${a.name}:${a.loadout.ids().join('+')}:${a.money}`));
await wait(5000);
const items = await ev(() => __SF.Items.list.map((i) => `${i.id}@${i.p.map((v) => v.toFixed(0)).join(',')}`));
if (items.length) {
  await ev(() => { const it = __SF.Items.list[0]; __SF.spectate([it.p[0] + 70, it.p[1] + 70, it.p[2] + 70], 45, -35); });
  await wait(500); await shot('s4-drops');
}
// match point: the final banner
await ev(() => { __SF.spectate(null); const M = __SF.Match; M.score = [15, 12]; M.endRound(__SF.Actors.me.team, 'defuse'); });
await wait(400); await shot('s4-match-end');
console.log(JSON.stringify({ kit, items, errs }, null, 1));
await browser.close();
