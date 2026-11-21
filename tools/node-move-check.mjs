// Headless movement checks against the real test map.
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../src/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^(0[1-8]|13)-.*\.js$/.test(f)).sort();
const src = files.map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const api = new Function(`${src}\nreturn { TEX_DEFS, buildTestRange, compileLevel, Player, PM };`)();
const tex = Object.fromEntries(Object.entries(api.TEX_DEFS).map(([n, def]) => [n, { def, avg: [0.5, 0.5, 0.5] }]));
const L = api.compileLevel(api.buildTestRange(), tex);
const DT = 1 / 64;
const cmd = (o = {}) => Object.assign({ fwd: 0, side: 0, jump: false, jumpHeld: false, duck: false, walk: false, fire: false }, o);
const P = new api.Player(L.cw);
const run = (n, c, each) => { for (let i = 0; i < n; i++) { P.tick(typeof c === 'function' ? c(i) : c, DT); if (each) each(i); } };
const fmt = (v) => v.map((x) => x.toFixed(1)).join(', ');
let ok = true; const check = (name, cond, info) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok &&= cond; };

// 1) run speed
P.spawn([96, 0, -416], -Math.PI / 2); run(96, cmd({ fwd: 1 }));
check('run speed caps at 225', Math.abs(P.speed() - 225) < 1, `speed=${P.speed().toFixed(1)} pos=${fmt(P.pos)}`);
// walk + duck speeds
P.spawn([96, 0, -300], -Math.PI / 2); run(96, cmd({ fwd: 1, walk: true }));
check('walk speed 52%', Math.abs(P.speed() - 117) < 1.5, `speed=${P.speed().toFixed(1)}`);
P.spawn([96, 0, -200], -Math.PI / 2); run(96, cmd({ fwd: 1, duck: true }));
check('crouch speed 34%', Math.abs(P.speed() - 76.5) < 1.5, `speed=${P.speed().toFixed(1)} ground=${P.onGround} ducked=${P.ducked} pos=${fmt(P.pos)} stamina=${P.stamina.toFixed(1)}`);
// 2) jump height
P.spawn([300, 0, -100], 0); run(4, cmd()); let maxY = 0;
run(1, cmd({ jump: true })); run(80, cmd(), () => { maxY = Math.max(maxY, P.pos[1]); });
check('standing jump height ~57', Math.abs(maxY - 57) < 1.5, `apex=${maxY.toFixed(2)} landed=${P.onGround}`);
// 3) steps
for (const [x0, h, expect] of [[128, 16, true], [224, 18, true], [320, 20, false]]) {
  P.spawn([x0, 0, 618], 0); let top = 0; run(60, cmd({ fwd: 1 }), () => { top = Math.max(top, P.pos[1]); });
  const up = top > h - 0.5;
  check(`step ${h} ${expect ? 'climbs' : 'blocks'}`, up === expect, `max y=${top.toFixed(2)} z=${P.pos[2].toFixed(1)}`);
}
// 4) jump boxes: approach from the north moving south (yaw = PI)
function boxTry(x, crouch) {
  P.spawn([x, 0, 470], Math.PI); run(30, cmd({ fwd: 1 }));
  let t = 0; run(1, cmd({ fwd: 1, jump: true }));
  run(90, (i) => cmd({ fwd: 1, duck: crouch && i > 6 && i < 60 }));
  return P.pos[1];
}
check('48 box: plain jump lands on top', boxTry(-832, false) > 47, `y=${P.pos[1].toFixed(1)}`);
check('64 box: plain jump fails', boxTry(-736, false) < 1, `y=${P.pos[1].toFixed(1)}`);
check('64 box: crouch-jump lands on top', boxTry(-736, true) > 63, `y=${P.pos[1].toFixed(1)}`);
check('72 box: crouch-jump fails', boxTry(-640, true) < 1, `y=${P.pos[1].toFixed(1)}`);
// 5) stairs to catwalk (walk west up the stairs)
P.spawn([-150, 0, -592], Math.PI / 2); run(160, cmd({ fwd: 1 }));
check('stairs reach catwalk height 128', Math.abs(P.pos[1] - 128) < 1, `pos=${fmt(P.pos)}`);
// 6) ramp up to catwalk (walk north up the ramp)
P.spawn([-976, 0, -100], 0); run(160, cmd({ fwd: 1 }));
check('ramp reaches catwalk', P.pos[1] > 127, `pos=${fmt(P.pos)}`);
// 7) wall collision: run into the north courtyard wall
P.spawn([600, 0, -560], 0); run(120, cmd({ fwd: 1 }));
check('north wall stops player (z >= -623.9)', P.pos[2] > -624.1 && P.pos[2] < -600, `z=${P.pos[2].toFixed(3)}`);
// 8) strafe-run diagonal into the wall slides along it
P.spawn([600, 0, -560], -Math.PI / 4); run(120, cmd({ fwd: 1 }));
check('slides along wall', P.pos[0] > 700, `pos=${fmt(P.pos)}`);
// 9) cannot walk through the closed door (hall door at x 14..18, z 416..480)
P.spawn([-60, 0, 448], -Math.PI / 2); run(120, cmd({ fwd: 1 }));
check('closed door blocks', P.pos[0] < 0, `x=${P.pos[0].toFixed(2)}`);
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
