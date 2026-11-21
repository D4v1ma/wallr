// Third-person characters for the two original teams. Each body is one rigidly skinned mesh
// (~1k triangles, one draw call) on a 19-bone skeleton, animated procedurally: gait from speed,
// crouch/jump, aim pitch split across spine/chest/weapon, two-bone IK holding the weapon, death fall.
// Facing -Z like the camera; units ~ inches; feet at y = 0.

const TEAM = { RAIDERS: 0, WARDENS: 1 };
const TEAMS = [
  { id: 0, name: 'Raiders', short: 'RAI', color: '#e39a52' },
  { id: 1, name: 'Wardens', short: 'WAR', color: '#7cb2e6' },
];

// Atlas regions [x, y, w, h] in a 256px canvas.
const CH_RECT = {
  face: [0, 0, 64, 64], head: [64, 0, 64, 64], skin: [128, 0, 32, 32], glove: [160, 0, 32, 32], boot: [192, 0, 64, 32],
  hair: [128, 32, 64, 32], strap: [192, 32, 64, 32], torso: [0, 64, 128, 64], vest: [128, 64, 128, 64],
  pants: [0, 128, 128, 64], gear: [128, 128, 128, 64], sleeve: [0, 192, 128, 64], accent: [128, 192, 128, 64],
};

function chAtlas(team) {
  const R_ = team === TEAM.RAIDERS, P = new Pix(256), S = R_ ? 700 : 800;
  const region = (name, fn) => {
    const [rx, ry, rw, rh] = CH_RECT[name], c = [0, 0, 0];
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const i = ((ry + y) * 256 + rx + x) * 3;
      c[0] = P.d[i]; c[1] = P.d[i + 1]; c[2] = P.d[i + 2];
      fn(x / rw, y / rh, c, x, y);
      P.d[i] = c[0]; P.d[i + 1] = c[1]; P.d[i + 2] = c[2];
    }
  };
  const tone = (c, base, k) => { c[0] = base[0] * k; c[1] = base[1] * k; c[2] = base[2] * k; };
  const cloth = (base, seed, folds = 1) => (u, v, c, x, y) => {
    const n = fbm(u * 4 + seed, v * 4, 64, 64, 4, seed) - 0.5, g = hashi(x, y, seed) - 0.5;
    const fold = Math.sin((u * 5 + fbm(u * 2, v * 3, 64, 64, 3, seed + 1) * 2.4) * TAU) * 0.07 * folds;
    tone(c, base, 1 + n * 0.24 + g * 0.08 + fold);
  };
  const skinC = R_ ? [0.7, 0.53, 0.4] : [0.62, 0.47, 0.37];
  // skin, gloves, boots
  region('skin', (u, v, c, x, y) => tone(c, skinC, 0.95 + (hashi(x, y, S) - 0.5) * 0.06 + (fbm(u * 3, v * 3, 64, 64, 2, S) - 0.5) * 0.1));
  region('glove', cloth(R_ ? [0.3, 0.23, 0.16] : [0.2, 0.2, 0.22], S + 1, 0.4));
  region('boot', (u, v, c, x, y) => {
    let k = 0.9 + (fbm(u * 6, v * 3, 64, 64, 3, S + 2) - 0.5) * 0.3;
    if (v > 0.82) k *= 0.55;                      // sole
    if (u > 0.3 && u < 0.7 && v < 0.5 && (y % 5) < 1) k *= 0.6;   // laces
    tone(c, R_ ? [0.36, 0.25, 0.16] : [0.12, 0.12, 0.13], k);
  });
  // clothing
  region('torso', cloth(R_ ? [0.66, 0.58, 0.43] : [0.2, 0.24, 0.32], S + 3));
  region('sleeve', cloth(R_ ? [0.62, 0.55, 0.41] : [0.19, 0.23, 0.31], S + 4));
  region('pants', (u, v, c, x, y) => {
    cloth(R_ ? [0.47, 0.4, 0.3] : [0.23, 0.25, 0.28], S + 5)(u, v, c, x, y);
    if (R_ && u > 0.62 && u < 0.88 && v > 0.32 && v < 0.62) { const e = Math.min(u - 0.62, 0.88 - u, v - 0.32, 0.62 - v); c[0] *= e < 0.015 ? 0.6 : 0.92; c[1] *= e < 0.015 ? 0.6 : 0.92; c[2] *= e < 0.015 ? 0.6 : 0.92; }
  });
  region('hair', cloth(R_ ? [0.18, 0.14, 0.11] : [0.16, 0.17, 0.18], S + 6, 0.3));
  region('strap', (u, v, c, x, y) => { tone(c, R_ ? [0.3, 0.29, 0.2] : [0.18, 0.2, 0.22], 0.9 + (y % 4 < 1 ? -0.2 : 0) + (hashi(x, y, S) - 0.5) * 0.1); });
  // vest / chest rig with pouches and webbing
  region('vest', (u, v, c, x, y) => {
    cloth(R_ ? [0.38, 0.38, 0.27] : [0.31, 0.35, 0.4], S + 7, 0.4)(u, v, c, x, y);
    if (!R_ && (y % 9) < 2 && u > 0.08 && u < 0.92 && v > 0.35) { c[0] *= 0.62; c[1] *= 0.62; c[2] *= 0.62; }   // webbing rows
    if (!R_ && u > 0.32 && u < 0.68 && v > 0.08 && v < 0.24) { tone(c, [0.72, 0.7, 0.62], 0.95); }             // name tape
  });
  region('gear', (u, v, c, x, y) => {
    cloth(R_ ? [0.33, 0.31, 0.22] : [0.2, 0.22, 0.25], S + 8, 0.2)(u, v, c, x, y);
    const cu = (u * 4) % 1;
    if (v < 0.22 || cu < 0.04 || cu > 0.96) { c[0] *= 0.7; c[1] *= 0.7; c[2] *= 0.7; }  // flaps and seams
  });
  // head covering: wrap (raiders) / helmet cover (wardens)
  region('head', (u, v, c, x, y) => {
    if (R_) { const w = Math.sin((u * 3 + v * 2.2) * TAU) * 0.08; cloth([0.55, 0.49, 0.36], S + 9, 0.5)(u, v, c, x, y); c[0] *= 1 + w; c[1] *= 1 + w; c[2] *= 1 + w; }
    else { tone(c, [0.25, 0.28, 0.3], 0.92 + (fbm(u * 8, v * 8, 64, 64, 3, S + 9) - 0.5) * 0.25 + ((x + y) % 6 < 1 ? -0.06 : 0)); if (v > 0.84) { c[0] *= 0.7; c[1] *= 0.7; c[2] *= 0.7; } }
  });
  region('accent', (u, v, c, x, y) => {
    if (R_) { const chk = ((Math.floor(u * 16) + Math.floor(v * 16)) & 1) === 0; tone(c, chk ? [0.72, 0.64, 0.5] : [0.56, 0.27, 0.19], 0.92 + (hashi(x, y, S) - 0.5) * 0.12); }
    else { const lens = v > 0.3 && v < 0.7; tone(c, lens ? [0.85, 0.52, 0.18] : [0.12, 0.12, 0.13], lens ? 0.8 + (1 - Math.abs(u - 0.35) * 3) * 0.3 : 1); }
  });
  // face: skin, eyes, brows; lower face covered (scarf / balaclava)
  region('face', (u, v, c, x, y) => {
    tone(c, skinC, 0.97 + (fbm(u * 4, v * 4, 64, 64, 2, S + 10) - 0.5) * 0.12);
    const ex = Math.min(Math.abs(u - 0.31), Math.abs(u - 0.69));
    if (v > 0.36 && v < 0.47 && ex < 0.1) { const d = Math.hypot(ex / 0.1, (v - 0.415) / 0.055); if (d < 1) tone(c, d < 0.45 ? [0.08, 0.07, 0.06] : [0.84, 0.82, 0.78], d < 0.45 ? 1 : 0.9); }
    if (v > 0.29 && v < 0.33 && ex < 0.12) tone(c, R_ ? [0.18, 0.13, 0.1] : [0.2, 0.16, 0.13], 1);
    if (Math.abs(u - 0.5) < 0.04 && v > 0.45 && v < 0.6) { c[0] *= 0.85; c[1] *= 0.85; c[2] *= 0.85; }
    if (v > 0.58) { if (R_) { const chk = ((Math.floor(u * 10) + Math.floor(v * 10)) & 1) === 0; tone(c, chk ? [0.72, 0.64, 0.5] : [0.56, 0.27, 0.19], 0.9); } else tone(c, [0.15, 0.16, 0.17], 0.95 + (hashi(x, y, S) - 0.5) * 0.08); }
    if (v < 0.16) { if (R_) cloth([0.55, 0.49, 0.36], S + 9, 0.5)(u, v, c, x, y); else tone(c, [0.25, 0.28, 0.3], 0.9); }
  });
  // patches: an abstract chevron on the warden sleeve, a sun-disc mark on the raider rig
  if (!R_) P.stamp((ctx) => { ctx.beginPath(); ctx.moveTo(20, 214); ctx.lineTo(32, 204); ctx.lineTo(44, 214); ctx.lineTo(44, 220); ctx.lineTo(32, 210); ctx.lineTo(20, 220); ctx.closePath(); ctx.fill(); }, [0.72, 0.78, 0.86], 0.9);
  else P.stamp((ctx) => { ctx.beginPath(); ctx.arc(150, 84, 6, 0, TAU); ctx.fill(); }, [0.75, 0.45, 0.2], 0.8);
  return P.toCanvas();
}

// ---------------------------------------------------------------------------
// Geometry helpers (UVs remapped into atlas rects; each piece belongs to one bone)
const CH_BONES = [
  ['root', -1, 0, 0, 0], ['pelvis', 0, 0, 38, 0], ['spine', 1, 0, 42, 0], ['chest', 2, 0, 50, 0], ['neck', 3, 0, 60.5, 0], ['head', 4, 0, 63.5, 0],
  ['uArmL', 3, -8.6, 57.5, 0], ['fArmL', 6, -8.9, 47, 0], ['handL', 7, -9.1, 36.5, 0],
  ['uArmR', 3, 8.6, 57.5, 0], ['fArmR', 9, 8.9, 47, 0], ['handR', 10, 9.1, 36.5, 0],
  ['thighL', 1, -4, 37, 0], ['shinL', 12, -4, 19.5, 0], ['footL', 13, -4, 3, 0],
  ['thighR', 1, 4, 37, 0], ['shinR', 15, 4, 19.5, 0], ['footR', 16, 4, 3, 0],
  ['gun', 3, 5, 53, -7.5],
];
const CH_BONE = Object.fromEntries(CH_BONES.map((b, i) => [b[0], i]));

function chUV(geo, rect, faceRects) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const r = (faceRects && faceRects[Math.floor(i / 4)]) || rect;
    const [x, y, w, h] = CH_RECT[r];
    uv.setXY(i, (x + uv.getX(i) * w) / 256, 1 - (y + h) / 256 + uv.getY(i) * h / 256);
  }
  return geo;
}
function chBox(w, h, d, x, y, z, rect, rx = 0, faces) {
  const g = chUV(new THREE.BoxGeometry(w, h, d), rect, faces);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}
function chPrism(w, h, d, x, y, z, rect, seg = 10) {
  const g = chUV(new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1, false), rect);
  g.scale(w, h, d); g.translate(x, y, z);
  return g;
}
function chLimb(a, b, r0, r1, rect, seg = 10) {
  const g = chUV(new THREE.CylinderGeometry(r1, r0, 1, seg, 1, false), rect);
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  g.scale(1, len, 1); g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  g.translate(a[0], a[1], a[2]);
  return g;
}

// Body pieces in model space (bind pose) -> [geometry, boneName]
function chPieces(team) {
  const R_ = team === TEAM.RAIDERS, p = [];
  const add = (g, bone) => p.push([g, bone]);
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R', x = 4 * s;
    add(chBox(4.4, 4, 10.5, x, 2.1, -2.6, 'boot'), 'foot' + L);
    add(chLimb([x, 20, 0], [x, 3.5, 0], 2.7, 2.2, 'pants'), 'shin' + L);
    add(chLimb([x, 37.5, 0], [x, 19.5, 0], 3.6, 2.9, 'pants'), 'thigh' + L);
    add(chBox(4.6, 4.2, 5.2, 8.3 * s, 57.8, 0, 'sleeve'), 'chest');
    add(chLimb([8.6 * s, 58, 0], [8.9 * s, 47, 0], 2.55, 2.15, 'sleeve'), 'uArm' + L);
    add(chLimb([8.9 * s, 47, 0], [9.1 * s, 36.8, 0], 2.15, 1.75, R_ ? 'skin' : 'sleeve'), 'fArm' + L);
    add(chBox(3.2, 4.2, 1.9, 9.1 * s, 34.4, -0.2, 'glove'), 'hand' + L);
  }
  add(chPrism(14, 7.5, 9, 0, 37.8, 0, 'pants'), 'pelvis');
  add(chBox(14.6, 1.6, 9.6, 0, 41.4, 0, 'strap'), 'pelvis');
  add(chPrism(12.8, 8.6, 8, 0, 45.8, 0, 'torso'), 'spine');
  add(chPrism(15.4, 11.5, 9, 0, 55, 0, 'torso'), 'chest');
  add(chLimb([0, 59.5, 0], [0, 64, 0], 2.5, 2.4, R_ ? 'accent' : 'hair', 8), 'neck');
  add(chBox(7.6, 9.2, 8.6, 0, 68.6, -0.3, 'head', 0, [null, null, null, null, null, 'face']), 'head');
  if (R_) {
    add(chBox(13.2, 7.5, 2.6, 0, 50.5, -4.9, 'vest'), 'chest');
    for (const x of [-4, 0, 4]) add(chBox(3.6, 4.6, 2.2, x, 49.5, -6.6, 'gear'), 'chest');
    for (const x of [-4.2, 4.2]) add(chBox(2, 11, 9.4, x, 56, 0, 'strap'), 'chest');
    add(chBox(9, 10, 3.5, 0, 52, 6.4, 'gear'), 'chest');
    add(chPrism(8.6, 3.6, 9.4, 0, 72, -0.2, 'head'), 'head');
    add(chBox(2.5, 4, 1.5, 0, 69.5, 4.9, 'head'), 'head');
    add(chPrism(8.8, 4.0, 9.6, 0, 63.8, -0.4, 'accent'), 'head');
    for (const s of [-1, 1]) add(chBox(1.2, 4.5, 3.6, 7.5 * s, 27, 0, 'gear'), s < 0 ? 'thighL' : 'thighR');
  } else {
    add(chBox(12.8, 12.5, 2.4, 0, 51.5, -5.1, 'vest'), 'chest');
    add(chBox(12.8, 12.5, 2.4, 0, 51.5, 5.1, 'vest'), 'chest');
    add(chPrism(15.8, 6.2, 9.8, 0, 47, 0, 'vest'), 'spine');
    for (const x of [-4, 0, 4]) add(chBox(3.4, 4, 2, x, 47.8, -6.8, 'gear'), 'chest');
    add(chPrism(9.4, 4.4, 10.2, 0, 71.6, 0.1, 'head'), 'head');
    add(chPrism(8.2, 1.8, 8.8, 0, 74.6, 0.1, 'head'), 'head');
    add(chBox(7.2, 2.0, 1.2, 0, 70.2, -4.8, 'accent'), 'head');
    for (const s of [-1, 1]) add(chLimb([4.0 * s, 67.6, 0], [4.9 * s, 67.6, 0], 1.7, 1.7, 'gear', 8), 'head');
    for (const s of [-1, 1]) add(chBox(5, 4.5, 2.2, 4 * s, 20, -2.6, 'gear'), s < 0 ? 'shinL' : 'shinR');
  }
  return p;
}

function chGeometry(team) {
  const pieces = chPieces(team);
  const parts = pieces.map(([g]) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const si = new Uint16Array(total * 4), sw = new Float32Array(total * 4);
  let o = 0;
  parts.forEach((g, k) => {
    const c = g.attributes.position.count, b = CH_BONE[pieces[k][1]];
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    for (let i = 0; i < c; i++) { si[(o + i) * 4] = b; sw[(o + i) * 4] = 1; }
    o += c;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.computeBoundingSphere();
  geo.boundingSphere.radius = 60;
  return geo;
}

// Third-person weapons, gun space: barrel toward -Z. Vertex colours tint one shared texture.
function chWeaponGeo(id) {
  const P = [], tint = (g, c) => { const n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); P.push(g); };
  const M = [1, 1, 1], D = [0.55, 0.55, 0.58], T = [2.3, 1.95, 1.4];
  const box = (w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return g; };
  const cyl = (r, len, x, y, z, seg = 8) => { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g; };
  let muzzle = [0, 0, -2];
  if (id === 'rifle') {
    tint(box(1.3, 1.7, 12, 0, 0, 0), M); tint(cyl(0.35, 10, 0, 0.2, -11), M); tint(box(1.7, 1.7, 7, 0, 0.05, -9), T);
    tint(box(1.0, 4.2, 2.0, 0, -2.6, -3, 0.12), T); tint(box(1.0, 3.0, 1.4, 0, -2.0, 2.2, -0.3), D); tint(box(1.2, 2.6, 6.4, 0, -0.3, 8.6), D);
    tint(box(0.6, 0.6, 1.4, 0, 1.2, 2.5), M); tint(box(0.3, 1.2, 0.4, 0, 1.0, -12.4), M);
    muzzle = [0, 0.2, -16.4];
  } else if (id === 'pistol') {
    tint(box(1.0, 1.1, 7.0, 0, 0.6, -1.5), M); tint(box(0.95, 0.7, 6, 0, -0.1, -1.6), D); tint(box(1.05, 3.2, 1.5, 0, -1.6, 1.0, -0.3), D);
    muzzle = [0, 0.6, -5.2];
  } else if (id === 'knife') {
    tint(box(0.16, 1.1, 6.2, 0, 0.25, -4.1), [2.2, 2.2, 2.3]); tint(box(0.35, 1.9, 0.3, 0, 0, -0.9), M); tint(cyl(0.48, 4, 0, 0, 1.2, 8), D);
    muzzle = [0, 0.2, -7.2];
  } else if (id === 'smg') {
    tint(box(1.2, 1.5, 8, 0, 0, 0), M); tint(cyl(0.55, 4.4, 0, 0.1, -6.0), M); tint(cyl(0.28, 2.4, 0, 0.1, -9.2), M);
    tint(box(0.8, 4.4, 1.2, 0, -2.8, -0.8, 0.06), M); tint(box(1.0, 3.0, 1.4, 0, -2.0, 2.6, -0.3), D);
    tint(box(0.35, 0.35, 6.2, 0, 0.3, 7.0), M); tint(box(1.2, 2.2, 0.4, 0, -0.3, 10.1), M);
    muzzle = [0, 0.1, -10.6];
  } else if (id === 'shotgun') {
    const W = [2.2, 1.3, 0.75];
    tint(box(1.3, 1.8, 6.6, 0, 0, 0), M); tint(cyl(0.42, 17, 0, 0.4, -11.5), M); tint(cyl(0.38, 12, 0, -0.55, -9.5), M);
    tint(cyl(0.72, 5.6, 0, -0.55, -8.0), W); tint(box(1.0, 3.0, 1.4, 0, -2.0, 2.6, -0.3), W); tint(box(1.2, 2.1, 7.4, 0, -0.8, 7.6, 0.06), W);
    muzzle = [0, 0.4, -20.2];
  } else if (id === 'sniper') {
    tint(box(1.2, 1.5, 9, 0, 0, 0), M); tint(cyl(0.38, 21, 0, 0.1, -14.5), M); tint(cyl(0.55, 2.4, 0, 0.1, -26), M);
    tint(cyl(0.68, 11, 0, 2.2, -0.6), D); tint(cyl(0.95, 2.4, 0, 2.2, -6.2), D);
    tint(box(1.3, 1.6, 10, 0, -0.4, -8.6), T); tint(box(1.0, 3.0, 1.4, 0, -2.0, 2.6, -0.3), T); tint(box(1.2, 2.6, 9, 0, -0.9, 9.5), T);
    muzzle = [0, 0.1, -27.4];
  } else if (id === 'charge') {
    tint(box(5.4, 1.5, 3.4, 0, 0, 0), [2.9, 2.55, 1.85]); tint(box(5.5, 1.6, 0.45, 0, 0, -1.05), D); tint(box(5.5, 1.6, 0.45, 0, 0, 1.05), D);
    tint(box(2.7, 0.62, 2.1, 0.65, 1.05, 0.05), D); tint(box(1.2, 0.08, 0.6, 0.65, 1.38, -0.5), [1.6, 3.6, 2.0]);
    muzzle = [0, 1.5, 0];
  } else {
    const g = new THREE.CylinderGeometry(1.2, 1.2, 4.2, 10); tint(g, [1.0, 1.25, 0.85]);
    const t = new THREE.CylinderGeometry(0.55, 0.6, 1.0, 8); t.translate(0, 2.6, 0); tint(t, M);
  }
  return { geo: mergeColoredGeos(P), muzzle };
}
function mergeColoredGeos(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.computeBoundingSphere();
  return m;
}

// How each weapon is held: gun bone (chest space) and wrist IK targets (gun space).
const HOLDS = {
  rifle: { gun: [5.0, 2.6, -7.0], r: [0.7, -1.6, 4.2], l: [-0.3, -1.6, -6.6] },
  pistol: { gun: [1.4, 4.0, -15.5], r: [0.6, -1.2, 2.6], l: [-0.9, -1.6, 2.4] },
  knife: { gun: [6.2, -3.5, -9.0], r: [0.3, -0.6, 3.4], l: null },
  smoke: { gun: [6.0, -2.0, -8.0], r: [0.2, -1.6, 2.4], l: null },
  smg: { gun: [5.0, 2.6, -6.0], r: [0.7, -1.6, 4.4], l: [-0.3, -1.1, -5.2] },
  shotgun: { gun: [5.0, 2.6, -7.0], r: [0.7, -1.6, 4.4], l: [-0.3, -1.5, -8.0] },
  sniper: { gun: [5.0, 2.4, -7.5], r: [0.7, -1.6, 4.4], l: [-0.3, -1.4, -8.2] },
  charge: { gun: [0.5, -2.0, -11.0], r: [2.9, -0.9, 0.2], l: [-2.9, -0.9, 0.2] },
};

// Hitboxes: bone-local boxes with damage groups.
const HITBOXES = [
  ['head', [0, 5.2, -0.3], [4.0, 4.9, 4.4], 'head'], ['chest', [0, 5.2, 0], [7.6, 6.4, 5.2], 'chest'],
  ['spine', [0, 3.2, 0], [6.6, 4.6, 4.6], 'stomach'], ['pelvis', [0, -0.3, 0], [7.0, 3.8, 4.6], 'stomach'],
  ['uArmL', [0, -5.4, 0], [2.6, 5.6, 2.6], 'arm'], ['uArmR', [0, -5.4, 0], [2.6, 5.6, 2.6], 'arm'],
  ['fArmL', [0, -5.2, 0], [2.2, 5.4, 2.2], 'arm'], ['fArmR', [0, -5.2, 0], [2.2, 5.4, 2.2], 'arm'],
  ['thighL', [0, -8.8, 0], [3.6, 9.0, 3.6], 'leg'], ['thighR', [0, -8.8, 0], [3.6, 9.0, 3.6], 'leg'],
  ['shinL', [0, -8.3, 0], [2.9, 8.6, 2.9], 'leg'], ['shinR', [0, -8.3, 0], [2.9, 8.6, 2.9], 'leg'],
];

const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

class PlayerModel {
  constructor(team) {
    this.team = team;
    if (!PlayerModel.geos) PlayerModel.geos = {};
    if (!PlayerModel.geos[team]) PlayerModel.geos[team] = chGeometry(team);
    let mat;
    if (typeof document !== 'undefined' && R.textures) {
      if (!PlayerModel.tex) PlayerModel.tex = {};
      if (!PlayerModel.tex[team]) { const t = new THREE.CanvasTexture(chAtlas(team)); t.anisotropy = R.maxAniso; PlayerModel.tex[team] = t; }
      mat = new THREE.MeshLambertMaterial({ map: PlayerModel.tex[team], skinning: true });
    } else mat = new THREE.MeshLambertMaterial({ skinning: true });
    this.mat = mat;
    const bones = CH_BONES.map(([name]) => { const b = new THREE.Bone(); b.name = name; return b; });
    CH_BONES.forEach(([, parent, x, y, z], i) => {
      const pp = parent >= 0 ? CH_BONES[parent] : [0, 0, 0, 0, 0];
      bones[i].position.set(x - (parent >= 0 ? pp[2] : 0), y - (parent >= 0 ? pp[3] : 0), z - (parent >= 0 ? pp[4] : 0));
      if (parent >= 0) bones[parent].add(bones[i]);
    });
    this.bones = Object.fromEntries(CH_BONES.map(([name], i) => [name, bones[i]]));
    this.rest = Object.fromEntries(CH_BONES.map(([name], i) => [name, bones[i].position.clone()]));
    for (const n of ['spine', 'chest', 'head', 'pelvis', 'gun']) this.bones[n].rotation.order = 'YXZ';
    const mesh = new THREE.SkinnedMesh(PlayerModel.geos[team], mat);
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.rotation.order = 'YXZ';
    mesh.frustumCulled = false;
    this.mesh = mesh;
    // world weapons on the gun bone
    this.wmat = new THREE.MeshLambertMaterial({ map: R.textures ? R.textures.gun_metal : null, vertexColors: true });
    this.weapons = {}; this.muzzles = {};
    for (const id of ['rifle', 'pistol', 'knife', 'smoke', 'smg', 'shotgun', 'sniper', 'charge']) {
      if (!PlayerModel.wgeo) PlayerModel.wgeo = {};
      if (!PlayerModel.wgeo[id]) PlayerModel.wgeo[id] = chWeaponGeo(id);
      const { geo, muzzle } = PlayerModel.wgeo[id];
      const m = new THREE.Mesh(geo, this.wmat); m.visible = false;
      const a = new THREE.Object3D(); a.position.set(muzzle[0], muzzle[1], muzzle[2]); m.add(a);
      this.bones.gun.add(m); this.weapons[id] = m; this.muzzles[id] = a;
    }
    this.weaponId = 'rifle'; this.weapons.rifle.visible = true;
    // the charge rides on the back while its carrier holds something else
    this.pack = new THREE.Mesh(PlayerModel.wgeo.charge.geo, this.wmat);
    this.pack.position.set(0, -2.5, team === 0 ? 9.0 : 7.1); this.pack.rotation.set(Math.PI / 2, 0, 0); this.pack.visible = false;
    this.bones.chest.add(this.pack); this.carry = false;
    // animation state
    this.phase = 0; this.legYaw = 0; this.crouch = 0; this.air = 0; this.kick = 0; this.dead = 0; this.deathDir = 1; this.stepAcc = 0;
    this.v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.q = new THREE.Quaternion(); this.m4 = new THREE.Matrix4();
    this.light = [0.5, 0.5, 0.5];
  }

  setWeapon(id, carry = false) {
    this.carry = carry;
    this.pack.visible = carry && id !== 'charge';
    if (id === this.weaponId) return;
    for (const [k, m] of Object.entries(this.weapons)) m.visible = k === id;
    this.weaponId = id;
  }
  fire() { this.kick = 1; }

  // st: { x, y, z, yaw, pitch, vx, vz, ducked, onGround, alive }
  update(dt, st) {
    const B = this.bones, m = this.mesh;
    const sp = Math.hypot(st.vx, st.vz), moving = sp > 25 && st.alive;
    let rel = 0, back = false;
    if (moving) {
      rel = wrapAngle(Math.atan2(-st.vx, -st.vz) - st.yaw);
      if (Math.abs(rel) > Math.PI / 2 + 0.25) { back = true; rel = wrapAngle(rel - Math.PI); }
    }
    this.legYaw = damp(this.legYaw, moving ? clamp(rel, -1.0, 1.0) : 0, 8, dt);
    this.crouch = damp(this.crouch, st.ducked ? 1 : 0, 12, dt);
    this.air = damp(this.air, st.onGround ? 0 : 1, 10, dt);
    this.kick = damp(this.kick, 0, 14, dt);
    const run = smoothstep(120, 215, sp), cr = this.crouch;
    this.phase += (back ? -1 : 1) * sp * dt / lerp(30, 38, run);
    const amp = moving ? lerp(0.38, 0.7, run) * (1 - 0.4 * cr) : 0, s = Math.sin(this.phase), c = Math.cos(this.phase);
    const kneeAmp = moving ? lerp(0.35, 1.15, run) : 0;
    // legs
    const tBase = 1.2 * cr + 0.45 * this.air, kBase = 2.0 * cr + 0.9 * this.air;
    B.thighL.rotation.set(tBase + amp * s, 0, 0); B.shinL.rotation.set(-(kBase + kneeAmp * Math.max(0, c) + (moving ? 0.12 : 0)), 0, 0);
    B.thighR.rotation.set(tBase - amp * s, 0, 0); B.shinR.rotation.set(-(kBase + kneeAmp * Math.max(0, -c) + (moving ? 0.12 : 0)), 0, 0);
    B.footL.rotation.set(-(B.thighL.rotation.x + B.shinL.rotation.x) * 0.7, 0, 0);
    B.footR.rotation.set(-(B.thighR.rotation.x + B.shinR.rotation.x) * 0.7, 0, 0);
    // hips, torso, aim
    const bob = moving ? -Math.abs(s) * lerp(0.6, 1.5, run) : Math.sin(performance.now() * 0.0018) * 0.25;
    B.pelvis.position.set(this.rest.pelvis.x, this.rest.pelvis.y - 15.5 * cr - 3 * this.air + bob, this.rest.pelvis.z);
    B.pelvis.rotation.set(0, this.legYaw, 0);
    const p = clamp(st.pitch, -1.2, 1.2), lean = 0.16 * cr + 0.1 * run * (moving ? 1 : 0);
    B.spine.rotation.set(p * 0.25 - lean, -this.legYaw * 0.5, 0);
    B.chest.rotation.set(p * 0.3, -this.legYaw * 0.5, 0);
    B.head.rotation.set(p * 0.3, 0, 0);
    const hold = HOLDS[this.weaponId] || HOLDS.rifle;
    B.gun.position.set(hold.gun[0], hold.gun[1], hold.gun[2] + this.kick * 1.4);
    B.gun.rotation.set(p * 0.45 + lean + this.kick * 0.07, 0, 0);
    // arms: two-bone IK in chest space onto the weapon's grips
    B.gun.updateMatrix();
    this.armIK('R', hold.r);
    this.armIK('L', hold.l);
    // death: fall around the feet
    if (!st.alive) this.dead = Math.min(1, this.dead + dt / 0.7); else this.dead = 0;
    const f = smoothstep(0, 1, this.dead);
    if (f > 0) { B.shinL.rotation.x -= 0.7 * f; B.shinR.rotation.x -= 0.5 * f; B.thighL.rotation.x += 0.4 * f; }
    m.position.set(st.x, st.y - 1.5 * f, st.z);
    m.rotation.set(this.deathDir * 1.42 * f, st.yaw, 0.12 * f * this.deathDir);
  }

  armIK(side, grip) {
    const B = this.bones, up = B['uArm' + side], fo = B['fArm' + side], v = this.v;
    const S = v[0].copy(this.rest['uArm' + side]);
    const T = v[1];
    if (grip) T.set(grip[0], grip[1], grip[2]).applyMatrix4(B.gun.matrix);
    else T.set(side === 'L' ? -9.6 : 9.6, -14, 1.5);
    const L1 = 10.5, L2 = 10.5;
    const d = v[2].subVectors(T, S); let dist = d.length(); d.divideScalar(dist || 1);
    dist = clamp(dist, 1.5, L1 + L2 - 0.05);
    const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const pole = v[3].set(side === 'L' ? -1 : 1, -1.2, 0.4);
    pole.addScaledVector(d, -pole.dot(d)).normalize();
    const E = v[4].copy(S).addScaledVector(d, L1 * cosA).addScaledVector(pole, L1 * sinA);
    const DOWN = PlayerModel.DOWN;
    up.quaternion.setFromUnitVectors(DOWN, v[3].subVectors(E, S).normalize());
    const Tc = v[1].copy(S).addScaledVector(d, dist);
    const fe = v[2].subVectors(Tc, E).normalize().applyQuaternion(this.q.copy(up.quaternion).invert());
    fo.quaternion.setFromUnitVectors(DOWN, fe);
  }

  setLight(r, g, b) { this.light[0] = r; this.light[1] = g; this.light[2] = b; this.mat.color.setRGB(r, g, b); this.wmat.color.setRGB(r, g, b); }

  muzzleWorld(out) {
    const a = this.muzzles[this.weaponId];
    a.updateWorldMatrix(true, false);
    const e = a.matrixWorld.elements;
    out[0] = e[12]; out[1] = e[13]; out[2] = e[14];
    return out;
  }

  // Ray vs hitboxes (uses the last posed skeleton). Returns { t, group, bone } or null.
  hitTest(o, d, maxT) {
    const c = this.mesh.position;
    const ox = o[0] - c.x, oy = o[1] - (c.y + 36), oz = o[2] - c.z;
    const b = ox * d[0] + oy * d[1] + oz * d[2], cc = ox * ox + oy * oy + oz * oz - 52 * 52;
    if (b > 0 && cc > 0) return null;
    if (b * b - cc < 0) return null;
    this.mesh.updateMatrixWorld(true);
    let best = null;
    const inv = this.m4, lo = this.v[0], ld = this.v[1];
    for (const [bone, ctr, half, group] of HITBOXES) {
      inv.copy(this.bones[bone].matrixWorld).invert();
      lo.set(o[0], o[1], o[2]).applyMatrix4(inv);
      ld.set(d[0], d[1], d[2]).transformDirection(inv);
      const t = PlayerModel.slab(lo, ld, ctr, half, best ? best.t : maxT);
      if (t >= 0) best = { t, group, bone };
    }
    return best;
  }

  static slab(o, d, c, h, tmax) {
    let t0 = 0, t1 = tmax;
    for (let a = 0; a < 3; a++) {
      const oa = a === 0 ? o.x : a === 1 ? o.y : o.z, da = a === 0 ? d.x : a === 1 ? d.y : d.z;
      const lo = c[a] - h[a], hi = c[a] + h[a];
      if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return -1; continue; }
      let ta = (lo - oa) / da, tb = (hi - oa) / da;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    return t0;
  }
}
PlayerModel.DOWN = new THREE.Vector3(0, -1, 0);
