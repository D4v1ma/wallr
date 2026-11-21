// Headless navigation checks: graph build time/size, connectivity and walkable paths.
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../src/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^(0[1-8]|13|21)-.*\.js$/.test(f)).sort();
const src = files.map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const api = new Function(`${src}\nreturn { TEX_DEFS, buildTestRange, compileLevel, Nav, Player };`)();
const tex = Object.fromEntries(Object.entries(api.TEX_DEFS).map(([n, def]) => [n, { def, avg: [0.5, 0.5, 0.5] }]));
const L = api.compileLevel(api.buildTestRange(), tex);
const Nav = api.Nav.build(L);
let ok = true; const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= !!cond; };
const links = Nav.nodes.reduce((n, a) => n + a.links.length, 0), jumps = Nav.nodes.reduce((n, a) => n + a.links.filter((l) => l.jump).length, 0);
check('graph builds quickly', Nav.ms < 2500, `${Nav.nodes.length} nodes, ${links} links (${jumps} jump), ${Nav.ms} ms`);
const pathLen = (p) => p ? p.length : -1;
const route = (name, a, b, cond) => {
  const p = Nav.path(...a, ...b);
  const end = p && p[p.length - 1];
  check(name, p && cond(p) && Math.hypot(end.x - b[0], end.z - b[2]) < 60, p ? `${p.length} waypoints, ends at ${[end.x, end.y, end.z].map((v) => v.toFixed(0))}` : 'no path');
  return p;
};
route('hall floor -> catwalk (stairs or ramp)', [-600, 0, 100], [-700, 128, -580], (p) => p.some((n) => n.y > 120));
route('yard -> container roof (crate hops)', [400, 0, 200], [800, 104, 368], (p) => p.some((n) => n.jump) && p[p.length - 1].y > 100);
route('raider side -> warden side', [-900, 0, 0], [1150, 0, -100], (p) => p.length > 20);
route('yard -> inside the shed (through the door gap)', [900, 0, 160], [1120, 2, 160], (p) => true);
const roof = Nav.nodes.filter((n) => n.y > 300).length;
check('no stranded nodes on the roof or wall caps', roof === 0, `roof nodes=${roof}`);
// walk a bot along a path with the real movement code
const P = new api.Player(L.cw); P.spawn([-600, 0, 100], 0);
const path = Nav.path(-600, 0, 100, -700, 128, -580);
let i = 0, ticks = 0;
while (i < path.length && ticks < 64 * 30) {
  const n = path[i], dx = n.x - P.pos[0], dz = n.z - P.pos[2];
  if (Math.hypot(dx, dz) < 24 && Math.abs(n.y - P.pos[1]) < 30) { i++; continue; }
  P.yaw = Math.atan2(-dx, -dz);
  P.tick({ fwd: 1, side: 0, jump: n.jump && Math.hypot(dx, dz) < 60 && P.onGround, duck: false, walk: false }, 1 / 64);
  ticks++;
}
check('movement code follows the path onto the catwalk', i >= path.length && P.pos[1] > 120, `reached ${i}/${path.length} in ${(ticks / 64).toFixed(1)}s, pos=${P.pos.map((v) => v.toFixed(0))}`);
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
