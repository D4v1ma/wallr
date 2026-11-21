// Stage 3 harness: live skirmish frames, scoreboard, killfeed and frame cost.
// Usage: node tools/stage3-shots.mjs <three.min.js> <outdir>
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
await page.mouse.move(640, 360);
const info0 = await page.evaluate(() => { __SF.play(); __SF.Input.freeMouse = true; __SF.Settings.set('mode', 'skirmish'); __SF.Actors.removeBots(); for (let i = 0; i < 3; i++) __SF.Actors.addBot(0); for (let i = 0; i < 2; i++) __SF.Actors.addBot(1); return { nav: __SF.Nav.nodes.length, navMs: __SF.Nav.ms, actors: __SF.Actors.list.map((a) => `${a.name}:${a.team}`) }; });
console.log('boot', JSON.stringify(info0));
// spectate while bots fight: the player is parked out of play
await page.evaluate(() => { const me = __SF.Actors.me; me.alive = false; me.deadT = -1e9; __SF.spectate([150, 260, 560], -40, -32); });
for (let i = 0; i < 2; i++) { await page.waitForTimeout(4000); await page.screenshot({ path: `${out}/live-${i}.png` }); }
// third-person chase cams behind two bots
const names = await page.evaluate(() => __SF.Actors.list.filter((a) => a.isBot).map((a) => a.name));
for (const [i, nm] of [[2, names[0]], [3, names[3]]]) {
  await page.evaluate((nm) => { const a = __SF.Actors.list.find((x) => x.name === nm); __SF.spectate(null, 0, -14, a, [0, 0, 0]); window.__chase = a; }, nm);
  for (let k = 0; k < 30; k++) {
    await page.evaluate(() => { const a = window.__chase, sv = __SF.Game.spectate; const y = a.player.yaw; sv.off = [Math.sin(y) * 120 + Math.cos(y) * 30, 96, Math.cos(y) * 120 - Math.sin(y) * 30]; sv.yaw = y; });
    await page.waitForTimeout(100);
  }
  await page.screenshot({ path: `${out}/live-${i}.png` });
}
await page.evaluate(() => __SF.spectate(null));
const st = await page.evaluate(() => ({ score: __SF.Actors.score, rows: __SF.Actors.list.map((a) => `${a.name} ${a.kills}/${a.deaths} ${a.alive ? a.health + 'hp' : 'dead'}`), feed: __SF.Actors.feed.length,
  cpu: +__SF.Game.cpuMs.toFixed(2), calls: __SF.R.stats.calls, tris: __SF.R.stats.tris }));
console.log(JSON.stringify(st));
// back in the game as a player: respawn and look around, then the scoreboard
await page.evaluate(() => { const me = __SF.Actors.me; __SF.Game.player.noclip = false; me.deadT = 0; me.spawn(); });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/live-player.png` });
await page.keyboard.down('Tab'); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/live-board.png` });
await page.keyboard.up('Tab');
console.log(errs.length ? errs.slice(0, 8).join('\n') : 'no page errors');
await browser.close();
