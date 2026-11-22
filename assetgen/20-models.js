// Third-person characters for the two original teams (assetgen fork: smooth lofted bodies weighted
// across the joints, detailed team gear, a 512 px atlas). One skinned mesh on a 19-bone skeleton, animated procedurally: gait from speed,
// crouch/jump, aim pitch split across spine/chest/weapon, two-bone IK holding the weapon, death fall.
// Facing -Z like the camera; units ~ inches; feet at y = 0.

const TEAM = { RAIDERS: 0, WARDENS: 1 };
const TEAMS = [
  { id: 0, name: 'Raiders', short: 'RAI', color: '#e39a52' },
  { id: 1, name: 'Wardens', short: 'WAR', color: '#7cb2e6' },
];

// Atlas regions [x, y, w, h] in a 512 px canvas (assetgen: higher resolution, more regions).
const CH_SIZE = 512;
const CH_RECT = {
  skin: [0, 0, 64, 64], face: [64, 0, 128, 128], hair: [192, 0, 64, 64], glove: [256, 0, 64, 64], boot: [320, 0, 128, 64], strap: [448, 0, 64, 64],
  metal: [0, 64, 64, 64], dark: [192, 64, 64, 64], accent: [256, 64, 128, 64], rubber: [384, 64, 128, 64],
  shirt: [0, 128, 256, 128], pants: [256, 128, 256, 128],
  vest: [0, 256, 256, 128], gear: [256, 256, 256, 128],
  helmet: [0, 384, 128, 128], wrap: [128, 384, 128, 128], pack: [256, 384, 256, 128],
};

// Team looks. Raiders: desert three-colour camo, coyote chest rig, sand head wrap and shemagh,
// sleeves rolled up. Wardens: navy twill, charcoal trousers, grey-blue plate carrier, helmet,
// balaclava and amber goggles.
function chAtlas(team) {
  const R_ = team === TEAM.RAIDERS, S = R_ ? 700 : 800, N = CH_SIZE, P = new Pix(N);
  const region = (name, fn) => {
    const [rx, ry, rw, rh] = CH_RECT[name], c = [0, 0, 0];
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const i = ((ry + y) * N + rx + x) * 3;
      c[0] = P.d[i]; c[1] = P.d[i + 1]; c[2] = P.d[i + 2];
      fn(x / rw, y / rh, c, x, y, rw, rh);
      P.d[i] = c[0]; P.d[i + 1] = c[1]; P.d[i + 2] = c[2];
    }
  };
  const tone = (c, base, k) => { c[0] = base[0] * k; c[1] = base[1] * k; c[2] = base[2] * k; };
  // woven cloth: twill diagonal, soft folds, mottling (u wraps round a limb; periods are whole numbers)
  const cloth = (base, seed, folds = 1, twill = 1) => (u, v, c, x, y) => {
    const n = fbm(u * 8, v * 4, 8, 4, 4, seed) - 0.5, g = hashi(x, y, seed) - 0.5;
    const fold = Math.sin((v * 6 + fbm(u * 3, v * 2, 3, 2, 3, seed + 1) * 2.4) * TAU) * 0.05 * folds;
    const tw = ((x + y) % 4 < 2 ? -0.025 : 0.025) * twill;
    tone(c, base, 1 + n * 0.2 + g * 0.06 + fold + tw);
  };
  // three-colour desert camo (tileable)
  const camo = (base, seed, cols) => (u, v, c, x, y) => {
    cloth(base, seed, 0.8)(u, v, c, x, y);
    const a = fbm(u * 12, v * 6, 12, 6, 4, seed + 11), b = fbm(u * 12, v * 6, 12, 6, 4, seed + 23);
    const k = c[0] / base[0];
    if (a > 0.57) tone(c, cols[0], k * (0.96 + (a - 0.57) * 0.3));
    else if (b > 0.58) tone(c, cols[1], k);
  };
  const skinC = R_ ? [0.62, 0.45, 0.33] : [0.58, 0.43, 0.34];
  region('skin', (u, v, c, x, y) => tone(c, skinC, 0.95 + (hashi(x, y, S) - 0.5) * 0.05 + (fbm(u * 3, v * 3, 3, 3, 2, S) - 0.5) * 0.1));
  region('hair', cloth(R_ ? [0.16, 0.12, 0.1] : [0.14, 0.14, 0.15], S + 6, 0.2, 0));
  region('glove', (u, v, c, x, y) => {
    cloth(R_ ? [0.42, 0.33, 0.23] : [0.12, 0.12, 0.13], S + 1, 0.3)(u, v, c, x, y);
    if (!R_ && v > 0.55 && v < 0.75 && (x % 16) > 3) { c[0] *= 1.6; c[1] *= 1.6; c[2] *= 1.6; }   // knuckle pads
  });
  region('boot', (u, v, c, x, y) => {
    let k = 0.9 + (fbm(u * 6, v * 3, 6, 3, 3, S + 2) - 0.5) * 0.25;
    if (v > 0.8) k *= 0.5;                                          // sole
    if (u > 0.38 && u < 0.62 && v < 0.6 && (y % 6) < 1.5) k *= 0.55;  // laces
    tone(c, R_ ? [0.52, 0.41, 0.28] : [0.11, 0.11, 0.12], k);
  });
  region('strap', (u, v, c, x, y) => tone(c, R_ ? [0.36, 0.33, 0.24] : [0.2, 0.22, 0.25], 0.9 + ((y % 4) < 1 ? -0.18 : 0) + (hashi(x, y, S) - 0.5) * 0.08));
  region('metal', (u, v, c, x, y) => tone(c, [0.42, 0.42, 0.43], 0.9 + (hashi(x, y, S + 3) - 0.5) * 0.1 + (fbm(u * 4, v * 4, 4, 4, 3, S + 4) - 0.5) * 0.2));
  region('dark', (u, v, c, x, y) => tone(c, [0.09, 0.09, 0.1], 0.95 + (hashi(x, y, S + 5) - 0.5) * 0.1));
  region('rubber', (u, v, c, x, y) => tone(c, [0.13, 0.13, 0.13], 0.92 + (fbm(u * 8, v * 4, 8, 4, 3, S + 6) - 0.5) * 0.2));
  region('accent', (u, v, c, x, y) => {
    if (R_) { const chk = ((Math.floor(u * 16) + Math.floor(v * 8)) & 1) === 0; tone(c, chk ? [0.76, 0.68, 0.54] : [0.58, 0.26, 0.19], 0.92 + (hashi(x, y, S) - 0.5) * 0.1); }
    else { const lens = v > 0.25 && v < 0.75; tone(c, lens ? [0.9, 0.55, 0.16] : [0.1, 0.1, 0.11], lens ? 0.75 + (1 - Math.abs(u - 0.35) * 2.5) * 0.35 : 1); }
  });
  if (R_) {
    region('shirt', camo([0.55, 0.46, 0.32], S + 3, [[0.42, 0.33, 0.22], [0.64, 0.57, 0.42]]));
    region('pants', camo([0.48, 0.41, 0.29], S + 5, [[0.36, 0.29, 0.19], [0.58, 0.51, 0.38]]));
    region('vest', cloth([0.4, 0.35, 0.26], S + 7, 0.4));
    region('gear', (u, v, c, x, y) => {
      cloth([0.38, 0.33, 0.24], S + 8, 0.2)(u, v, c, x, y);
      if (v < 0.25) { c[0] *= 0.82; c[1] *= 0.82; c[2] *= 0.82; }            // flaps
      if (v > 0.25 && v < 0.28) { c[0] *= 0.6; c[1] *= 0.6; c[2] *= 0.6; }
    });
    region('wrap', (u, v, c, x, y) => {
      cloth([0.55, 0.48, 0.36], S + 9, 1.6)(u, v, c, x, y);
      const w = Math.sin((u * 3 + v * 4 + fbm(u * 2, v * 2, 2, 2, 2, S + 10)) * TAU) * 0.08;
      c[0] *= 1 + w; c[1] *= 1 + w; c[2] *= 1 + w;
    });
    region('pack', (u, v, c, x, y) => {
      cloth([0.5, 0.44, 0.32], S + 12, 0.5)(u, v, c, x, y);
      if (Math.abs(v - 0.3) < 0.012 || Math.abs(u - 0.5) < 0.006) { c[0] *= 0.6; c[1] *= 0.6; c[2] *= 0.6; }   // seams
    });
    region('helmet', cloth([0.5, 0.44, 0.32], S + 13, 0.5));
  } else {
    region('shirt', (u, v, c, x, y) => {
      cloth([0.2, 0.25, 0.34], S + 3, 1.0)(u, v, c, x, y);
      const rip = ((x % 16) < 1 || (y % 16) < 1) ? 0.92 : 1;                  // ripstop grid
      c[0] *= rip; c[1] *= rip; c[2] *= rip;
    });
    region('pants', cloth([0.22, 0.23, 0.25], S + 5, 1.0));
    region('vest', (u, v, c, x, y) => {
      cloth([0.25, 0.28, 0.33], S + 7, 0.3)(u, v, c, x, y);
      if ((y % 12) < 3 && u > 0.06 && u < 0.94) { c[0] *= 0.66; c[1] *= 0.66; c[2] *= 0.66; }   // MOLLE webbing rows
      if (u > 0.36 && u < 0.64 && v > 0.06 && v < 0.2) tone(c, [0.74, 0.74, 0.68], 0.95);        // name tape
    });
    region('gear', (u, v, c, x, y) => {
      cloth([0.2, 0.22, 0.26], S + 8, 0.2)(u, v, c, x, y);
      if (v < 0.25) { c[0] *= 0.8; c[1] *= 0.8; c[2] *= 0.8; }
      if (v > 0.25 && v < 0.28) { c[0] *= 0.55; c[1] *= 0.55; c[2] *= 0.55; }
    });
    region('helmet', (u, v, c, x, y) => tone(c, [0.26, 0.29, 0.32], 0.9 + (fbm(u * 10, v * 10, 10, 10, 3, S + 9) - 0.5) * 0.25 + ((x + y) % 7 < 1 ? -0.05 : 0)));
    region('wrap', (u, v, c, x, y) => tone(c, [0.13, 0.14, 0.15], 0.9 + (hashi(x, y, S + 14) - 0.5) * 0.12 + ((x % 3) < 1 ? -0.06 : 0)));   // knit
    region('pack', (u, v, c, x, y) => tone(c, [0.12, 0.13, 0.14], 0.9 + (fbm(u * 6, v * 6, 6, 6, 3, S + 12) - 0.5) * 0.2));   // radio
  }
  // face (front of the head): skin, eyes, brows, nose and mouth; lower face covered
  region('face', (u, v, c, x, y) => {
    tone(c, skinC, 0.96 + (fbm(u * 4, v * 4, 4, 4, 2, S + 10) - 0.5) * 0.12);
    const ex = Math.min(Math.abs(u - 0.34), Math.abs(u - 0.66));
    if (v > 0.4 && v < 0.5 && ex < 0.085) {
      const d = Math.hypot(ex / 0.085, (v - 0.45) / 0.045);
      if (d < 1) tone(c, d < 0.42 ? [0.06, 0.05, 0.05] : d < 0.6 ? [0.3, 0.22, 0.15] : [0.86, 0.84, 0.8], 1);
    }
    if (v > 0.34 && v < 0.375 && ex < 0.1) tone(c, R_ ? [0.18, 0.13, 0.1] : [0.2, 0.17, 0.14], 1);   // brows
    if (Math.abs(u - 0.5) < 0.05 && v > 0.48 && v < 0.62) { const k = 0.9 - (0.05 - Math.abs(u - 0.5)) * 2; c[0] *= k; c[1] *= k; c[2] *= k; }   // nose shading
    if (v > 0.6) {   // shemagh / balaclava over the mouth and jaw
      if (R_) { const chk = ((Math.floor(u * 12) + Math.floor(v * 12)) & 1) === 0; tone(c, chk ? [0.76, 0.68, 0.54] : [0.58, 0.26, 0.19], 0.9 + (hashi(x, y, S) - 0.5) * 0.08); }
      else tone(c, [0.13, 0.14, 0.15], 0.92 + (hashi(x, y, S) - 0.5) * 0.1 + ((x % 3) < 1 ? -0.05 : 0));
    }
    if (v < 0.22) { if (R_) tone(c, [0.74, 0.67, 0.53], 0.9); else tone(c, [0.13, 0.14, 0.15], 0.92); }
  });
  // team marks: a chevron on the warden sleeve area, a sun disc on the raider rig
  if (!R_) P.stamp((ctx) => { ctx.beginPath(); ctx.moveTo(40, 206); ctx.lineTo(64, 186); ctx.lineTo(88, 206); ctx.lineTo(88, 218); ctx.lineTo(64, 198); ctx.lineTo(40, 218); ctx.closePath(); ctx.fill(); }, [0.72, 0.78, 0.86], 0.9);
  else P.stamp((ctx) => { ctx.beginPath(); ctx.arc(128, 300, 10, 0, TAU); ctx.fill(); }, [0.78, 0.46, 0.2], 0.8);
  return P.toCanvas();
}

const CH_BONES = [
  ['root', -1, 0, 0, 0], ['pelvis', 0, 0, 38, 0], ['spine', 1, 0, 42, 0], ['chest', 2, 0, 50, 0], ['neck', 3, 0, 60.5, 0], ['head', 4, 0, 63.5, 0],
  ['uArmL', 3, -8.6, 57.5, 0], ['fArmL', 6, -8.9, 47, 0], ['handL', 7, -9.1, 36.5, 0],
  ['uArmR', 3, 8.6, 57.5, 0], ['fArmR', 9, 8.9, 47, 0], ['handR', 10, 9.1, 36.5, 0],
  ['thighL', 1, -4, 37, 0], ['shinL', 12, -4, 19.5, 0], ['footL', 13, -4, 3, 0],
  ['thighR', 1, 4, 37, 0], ['shinR', 15, 4, 19.5, 0], ['footR', 16, 4, 3, 0],
  ['gun', 3, 5, 53, -7.5],
];
const CH_BONE = Object.fromEntries(CH_BONES.map((b, i) => [b[0], i]));

// ---------------------------------------------------------------------------
// Body mesh. The bind pose is upright with the arms hanging, so torso, legs and arms are lofted
// tubes of horizontal rings; each ring is weighted across the nearest joints (smooth hips, knees,
// waist, shoulders, elbows, neck). Head, hands, boots and gear are rigid pieces on one bone.
// UVs follow three.js (v up) inside the atlas rects; the exporter flips v for Godot.
class ChMesh {
  constructor() { this.P = []; this.N = []; this.U = []; this.I = []; this.W = []; }
  static uv(rect, u, v) {
    const [x, y, w, h] = CH_RECT[rect];
    return [(x + clamp(u, 0.002, 0.998) * w) / CH_SIZE, 1 - (y + h) / CH_SIZE + clamp(v, 0.002, 0.998) * h / CH_SIZE];
  }
  static weights(w) {
    const list = w.map(([b, k]) => [typeof b === 'number' ? b : CH_BONE[b], k]).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = list.reduce((t, e) => t + e[1], 0) || 1;
    while (list.length < 4) list.push([0, 0]);
    return list.map(([b, k]) => [b, k / s]);
  }
  push(p, n, uv, w) {
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.U.push(uv[0], uv[1]);
    for (const [b, k] of w) { this.I.push(b); this.W.push(k); }
  }
  // A rigid piece (three.js geometry already in model space): UVs box-projected and scaled to fill
  // the rect, all vertices on one bone (or the given weights).
  rigid(g, rect, bone) {
    g = g.index ? g.toNonIndexed() : g;
    boxUV(g, 1);
    const uv = g.attributes.uv.array;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < uv.length; i += 2) { u0 = Math.min(u0, uv[i]); u1 = Math.max(u1, uv[i]); v0 = Math.min(v0, uv[i + 1]); v1 = Math.max(v1, uv[i + 1]); }
    const su = Math.max(u1 - u0, 1e-4), sv = Math.max(v1 - v0, 1e-4), w = ChMesh.weights(Array.isArray(bone) ? bone : [[bone, 1]]);
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    for (let i = 0; i < P.length / 3; i++) {
      this.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], ChMesh.uv(rect, (uv[i * 2] - u0) / su, (uv[i * 2 + 1] - v0) / sv), w);
    }
  }
  // Lofted tube. rings: [{ y, x, z, rx, rz, w, front, back, sq }] by increasing y. u wraps round
  // (front at u = 0), v runs up the tube.
  loft(rings, rect, o = {}) {
    const seg = o.seg || 16, nR = rings.length, grid = [];
    for (let i = 0; i < nR; i++) {
      const r = rings[i], ex = 2 / (r.sq || o.sq || 2), row = [];
      for (let j = 0; j <= seg; j++) {
        const th = (j / seg) * TAU, s = Math.sin(th), c = Math.cos(th);
        const px = (r.x || 0) + r.rx * Math.sign(s) * Math.pow(Math.abs(s), ex);
        let pz = (r.z || 0) - r.rz * Math.sign(c) * Math.pow(Math.abs(c), ex);
        if (r.front && c > 0) pz -= r.front * c * c;
        if (r.back && c < 0) pz += r.back * c * c;
        row.push([px, r.y, pz]);
      }
      grid.push(row);
    }
    const cen = (i) => [rings[i].x || 0, rings[i].y, rings[i].z || 0];
    const nrm = (i, j) => {
      const a = grid[i][(j + 1) % seg], b = grid[i][(j - 1 + seg) % seg];
      const up = grid[Math.min(nR - 1, i + 1)][j], dn = grid[Math.max(0, i - 1)][j];
      const t = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], l = [up[0] - dn[0], up[1] - dn[1], up[2] - dn[2]];
      let n = [l[1] * t[2] - l[2] * t[1], l[2] * t[0] - l[0] * t[2], l[0] * t[1] - l[1] * t[0]];
      const p = grid[i][j], c = cen(i), rad = [p[0] - c[0], 0, p[2] - c[2]];
      if (n[0] * rad[0] + n[2] * rad[2] < 0) n = [-n[0], -n[1], -n[2]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      return [n[0] / len, n[1] / len, n[2] / len];
    };
    const V = (i, j) => ({ p: grid[i][j], n: nrm(i, j % seg), uv: ChMesh.uv(rect, j / seg, (o.v0 ?? 0) + ((o.v1 ?? 1) - (o.v0 ?? 0)) * i / (nR - 1)), w: ChMesh.weights(rings[i].w) });
    // winding: outward-facing counter-clockwise (three.js), checked on the first quad
    const a0 = grid[0][0], b0 = grid[0][1], c0 = grid[1][0];
    const fn = [(b0[1] - a0[1]) * (c0[2] - a0[2]) - (b0[2] - a0[2]) * (c0[1] - a0[1]), (b0[2] - a0[2]) * (c0[0] - a0[0]) - (b0[0] - a0[0]) * (c0[2] - a0[2]), (b0[0] - a0[0]) * (c0[1] - a0[1]) - (b0[1] - a0[1]) * (c0[0] - a0[0])];
    const flip = fn[0] * (a0[0] - (rings[0].x || 0)) + fn[2] * (a0[2] - (rings[0].z || 0)) < 0;
    const tri = (A, B, C) => { if (flip) { const t = B; B = C; C = t; } for (const q of [A, B, C]) this.push(q.p, q.n, q.uv, q.w); };
    for (let i = 0; i < nR - 1; i++) for (let j = 0; j < seg; j++) {
      const A = V(i, j), B = V(i, j + 1), C = V(i + 1, j), D = V(i + 1, j + 1);
      tri(A, B, C); tri(B, D, C);
    }
    const cap = (i, down) => {
      const c = cen(i), n = [0, down ? -1 : 1, 0], w = ChMesh.weights(rings[i].w), m = { p: c, n, uv: ChMesh.uv(rect, 0.5, i === 0 ? 0.02 : 0.98), w };
      for (let j = 0; j < seg; j++) {
        const A = { p: grid[i][j], n, uv: m.uv, w }, B = { p: grid[i][j + 1], n, uv: m.uv, w };
        if (down !== flip) for (const q of [m, B, A]) this.push(q.p, q.n, q.uv, q.w); else for (const q of [m, A, B]) this.push(q.p, q.n, q.uv, q.w);
      }
    };
    if (o.capBottom) cap(0, true);
    if (o.capTop) cap(nR - 1, false);
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.U), 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(this.I), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(this.W), 4));
    g.computeBoundingSphere();
    g.boundingSphere.radius = 60;
    return g;
  }
}

// rounded box with few segments (gear pieces), and a band round a lofted section
const crb = (w, h, d, x, y, z, r, rx = 0, ry = 0, rz = 0) => xf(rbox(w, h, d, r, 1), x, y, z, rx, ry, rz);
const vlathe = (pts, seg, x, y, z) => lathe(pts, seg).rotateX(-Math.PI / 2).translate(x, y, z);   // axis +Y

function chGeometry(team) {
  const R_ = team === TEAM.RAIDERS, M = new ChMesh();
  // pelvis / hips (trousers) and torso (shirt)
  M.loft([
    { y: 33.6, rx: 6.2, rz: 4.2, w: [['pelvis', 1]] },
    { y: 36.4, rx: 7.1, rz: 4.8, back: 0.7, w: [['pelvis', 1]] },
    { y: 39.4, rx: 7.0, rz: 4.6, back: 0.4, w: [['pelvis', 0.65], ['spine', 0.35]] },
    { y: 41.2, rx: 6.7, rz: 4.4, w: [['pelvis', 0.35], ['spine', 0.65]] },
  ], 'pants', { seg: 20, sq: 2.4, capBottom: true });
  M.loft([
    { y: 40.4, rx: 6.75, rz: 4.45, w: [['pelvis', 0.45], ['spine', 0.55]] },
    { y: 43.0, rx: 6.5, rz: 4.25, w: [['spine', 1]] },
    { y: 46.0, rx: 6.9, rz: 4.5, front: 0.3, w: [['spine', 0.55], ['chest', 0.45]] },
    { y: 49.6, rx: 7.6, rz: 4.9, front: 0.6, w: [['chest', 1]] },
    { y: 53.6, rx: 8.0, rz: 5.0, front: 0.5, w: [['chest', 1]] },
    { y: 57.0, rx: 8.3, rz: 4.5, w: [['chest', 1]] },
    { y: 59.2, rx: 6.6, rz: 3.9, w: [['chest', 1]] },
    { y: 60.4, rx: 3.6, rz: 3.2, w: [['chest', 0.6], ['neck', 0.4]] },
  ], 'shirt', { seg: 20, sq: 2.6, capTop: true });
  // neck (scarf / balaclava)
  M.loft([
    { y: 59.4, rx: 3.3, rz: 3.1, w: [['chest', 0.7], ['neck', 0.3]] },
    { y: 61.4, rx: 2.6, rz: 2.7, w: [['neck', 1]] },
    { y: 63.4, rx: 2.5, rz: 2.6, w: [['neck', 0.6], ['head', 0.4]] },
    { y: 65.0, rx: 2.4, rz: 2.5, w: [['head', 1]] },
  ], 'wrap', { seg: 14 });
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R', T = 'thigh' + L, Sh = 'shin' + L, F = 'foot' + L, U = 'uArm' + L, A = 'fArm' + L, H = 'hand' + L;
    // leg: ankle -> knee -> hip
    M.loft([
      { y: 4.0, x: 4.0 * s, rx: 2.1, rz: 2.2, w: [[Sh, 1]] },
      { y: 8.0, x: 4.0 * s, rx: 2.3, rz: 2.5, w: [[Sh, 1]] },
      { y: 12.5, x: 4.0 * s, z: 0.35, rx: 2.85, rz: 3.15, w: [[Sh, 1]] },
      { y: 17.4, x: 4.0 * s, rx: 2.7, rz: 2.95, w: [[Sh, 0.75], [T, 0.25]] },
      { y: 19.5, x: 4.0 * s, z: -0.2, rx: 2.8, rz: 3.05, w: [[Sh, 0.5], [T, 0.5]] },
      { y: 21.6, x: 4.05 * s, rx: 2.95, rz: 3.2, w: [[T, 0.75], [Sh, 0.25]] },
      { y: 26.0, x: 4.1 * s, rx: 3.3, rz: 3.6, w: [[T, 1]] },
      { y: 31.0, x: 4.15 * s, rx: 3.7, rz: 4.05, w: [[T, 1]] },
      { y: 35.0, x: 4.15 * s, rx: 3.9, rz: 4.25, w: [[T, 0.8], ['pelvis', 0.2]] },
      { y: 38.0, x: 3.9 * s, rx: 3.7, rz: 4.1, w: [[T, 0.5], ['pelvis', 0.5]] },
    ], 'pants', { seg: 14 });
    // forearm (skin on the rolled-up raider sleeves) and upper arm
    M.loft([
      { y: 37.0, x: 9.1 * s, rx: 1.5, rz: 1.62, w: [[A, 0.6], [H, 0.4]] },
      { y: 39.5, x: 9.05 * s, rx: 1.72, rz: 1.84, w: [[A, 1]] },
      { y: 43.0, x: 9.0 * s, rx: 2.0, rz: 2.15, w: [[A, 1]] },
      { y: 45.5, x: 8.95 * s, rx: 2.1, rz: 2.25, w: [[A, 0.8], [U, 0.2]] },
      { y: 47.0, x: 8.9 * s, rx: 2.1, rz: 2.22, w: [[A, 0.5], [U, 0.5]] },
    ], R_ ? 'skin' : 'shirt', { seg: 12, v0: 0, v1: 0.4 });
    M.loft([
      { y: 46.6, x: 8.9 * s, rx: 2.12, rz: 2.24, w: [[A, 0.55], [U, 0.45]] },
      { y: 48.6, x: 8.9 * s, rx: 2.18, rz: 2.32, w: [[U, 0.8], [A, 0.2]] },
      { y: 52.6, x: 8.8 * s, rx: 2.45, rz: 2.6, w: [[U, 1]] },
      { y: 56.0, x: 8.7 * s, rx: 2.75, rz: 2.9, w: [[U, 0.85], ['chest', 0.15]] },
      { y: 58.8, x: 8.2 * s, rx: 2.55, rz: 2.75, w: [[U, 0.5], ['chest', 0.5]] },
      { y: 60.2, x: 7.4 * s, rx: 1.3, rz: 1.5, w: [['chest', 1]] },
    ], 'shirt', { seg: 12, v0: 0.4, v1: 1 });
    if (R_) M.rigid(new THREE.TorusGeometry(2.3, 0.5, 8, 16).rotateX(Math.PI / 2).translate(8.92 * s, 47.0, 0), 'shirt', [[U, 0.5], [A, 0.5]]);   // rolled cuff
    // glove: back of the hand, curled fingers, thumb
    const hx = 9.15 * s;
    M.rigid(crb(1.5, 3.2, 2.6, hx, 34.4, -0.2, 0.62), 'glove', H);
    M.rigid(crb(1.65, 1.8, 2.35, hx - 0.12 * s, 32.4, -0.5, 0.65, 0.3), 'glove', H);
    M.rigid(limb([hx - 0.5 * s, 35.2, -1.25], [hx - 0.85 * s, 33.4, -2.0], 0.44, 0.36, 8), 'glove', H);
    M.rigid(vlathe([[1.75, -0.6], [1.85, 0.0], [1.8, 1.2]], 12, hx, 36.2, 0), R_ ? 'glove' : 'dark', [[H, 0.5], [A, 0.5]]);   // cuff
    // boot: upper profile, rubber sole, shaft round the ankle
    M.rigid(prof([[2.75, 0.6], [-6.3, 0.6], { q: [-8.0, 0.7, -7.7, 2.0] }, { q: [-7.2, 3.1, -4.1, 3.5] }, [-1.6, 5.5], [2.55, 5.7], [2.95, 2.4]], 4.4, 0.7, 4 * s), 'boot', F);
    M.rigid(prof([[2.9, 0.0], [-6.5, 0.0], { q: [-8.35, 0.05, -8.05, 1.0] }, [3.0, 1.0]], 4.6, 0.3, 4 * s), 'rubber', F);
    M.loft([
      { y: 4.2, x: 4.0 * s, rx: 2.55, rz: 2.75, w: [[F, 0.5], [Sh, 0.5]] },
      { y: 7.8, x: 4.0 * s, rx: 2.55, rz: 2.7, w: [[Sh, 1]] },
      { y: 8.6, x: 4.0 * s, rx: 2.45, rz: 2.6, w: [[Sh, 1]] },
    ], 'boot', { seg: 14, capTop: true });
  }
  // head: a deformed sphere (jaw, cheeks, nose, brow), ears
  const hg = new THREE.SphereGeometry(1, 30, 22).toNonIndexed(), hp = hg.attributes.position.array;
  for (let i = 0; i < hp.length; i += 3) {
    let x = hp[i], y = hp[i + 1], z = hp[i + 2];
    if (y < -0.1) { const k = 1 - (-0.1 - y) * 0.42; x *= k; if (z < 0) z *= 1 - (-0.1 - y) * 0.2; }       // jaw and chin taper
    if (z < -0.55) z = -0.55 + (z + 0.55) * 0.75;                                                          // flatter face
    z -= 0.17 * Math.exp(-((x / 0.13) ** 2) - (((y + 0.12) / 0.24) ** 2)) * (z < 0 ? 1 : 0);              // nose
    z -= 0.06 * Math.exp(-(((y - 0.18) / 0.08) ** 2)) * (z < -0.3 ? 1 : 0);                               // brow
    hp[i] = x * 3.75; hp[i + 1] = y * 4.6 + 68.4; hp[i + 2] = z * 4.25 - 0.15;
  }
  hg.computeVertexNormals();
  // front faces take the face rect (frontal projection), the rest the hair rect
  {
    const N = hg.attributes.normal.array, w = ChMesh.weights([['head', 1]]);
    for (let t = 0; t < hp.length / 9; t++) {
      let nz = 0; for (let k = 0; k < 3; k++) nz += N[(t * 3 + k) * 3 + 2];
      const front = nz / 3 < -0.3;
      for (let k = 0; k < 3; k++) {
        const v = t * 3 + k, p = [hp[v * 3], hp[v * 3 + 1], hp[v * 3 + 2]], n = [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]];
        const uv = front ? ChMesh.uv('face', 0.5 + p[0] / 7.6, (p[1] - 63.8) / 9.2) : ChMesh.uv('hair', 0.5 + Math.atan2(p[0], p[2]) / TAU, (p[1] - 63.8) / 9.6);
        M.push(p, n, uv, w);
      }
    }
  }
  for (const s of [-1, 1]) M.rigid(crb(0.7, 1.9, 1.3, 3.65 * s, 68.2, 0.4, 0.3), 'skin', 'head');
  // belt with a buckle (both teams)
  M.loft([{ y: 39.9, rx: 7.25, rz: 4.85, back: 0.4, w: [['pelvis', 1]] }, { y: 41.5, rx: 7.05, rz: 4.7, w: [['pelvis', 0.6], ['spine', 0.4]] }], 'strap', { seg: 20, sq: 2.4 });
  M.rigid(crb(1.7, 1.4, 0.5, 0, 40.7, -5.0, 0.2), 'metal', 'pelvis');
  if (!R_) {
    // Wardens: helmet with NVG mount and rails, goggles, plate carrier, mag pouches, radio, knee pads
    M.rigid(vlathe([[4.85, 0.0], [4.95, 0.5], [4.75, 2.4], [4.1, 4.1], [2.9, 5.4], [1.3, 6.0], [0.0, 6.1]], 22, 0, 68.6, 0.25), 'helmet', 'head');
    M.rigid(crb(1.9, 1.3, 0.9, 0, 72.0, -4.55, 0.3), 'metal', 'head');
    for (const s of [-1, 1]) M.rigid(crb(0.45, 0.75, 4.2, 4.6 * s, 70.0, 0.2, 0.18), 'dark', 'head');
    M.rigid(crb(6.6, 1.8, 1.1, 0, 69.3, -3.85, 0.5), 'accent', 'head');
    M.rigid(new THREE.TorusGeometry(4.15, 0.32, 6, 22).rotateX(Math.PI / 2).translate(0, 69.4, 0.1), 'strap', 'head');
    M.rigid(crb(12.8, 12.4, 2.4, 0, 51.4, -5.0, 0.9), 'vest', 'chest');
    M.rigid(crb(12.8, 12.8, 2.4, 0, 51.6, 5.0, 0.9), 'vest', 'chest');
    for (const s of [-1, 1]) {
      M.rigid(crb(2.2, 6.4, 8.8, 7.2 * s, 48.2, 0, 0.8), 'vest', 'chest');
      M.rigid(crb(2.4, 1.1, 10.8, 4.6 * s, 59.0, 0, 0.45), 'vest', 'chest');
      M.rigid(crb(3.4, 3.6, 1.6, 4.0 * s, 18.6, -2.65, 0.8), 'rubber', 'shin' + (s < 0 ? 'L' : 'R'));
      M.rigid(crb(2.4, 3.8, 2.0, 7.1 * s, 39.2, -1.0, 0.5), 'gear', 'pelvis');
    }
    for (const x of [-4.1, 0, 4.1]) { M.rigid(crb(3.3, 4.4, 2.0, x, 47.4, -6.9, 0.45), 'gear', 'chest'); M.rigid(crb(3.4, 1.0, 2.2, x, 49.5, -6.95, 0.3), 'gear', 'chest'); }
    M.rigid(crb(2.6, 5.2, 1.7, -3.6, 53.0, 7.0, 0.4), 'pack', 'chest');
    M.rigid(limb([-3.9, 55.4, 7.2], [-4.6, 66.0, 8.4], 0.18, 0.12, 6), 'dark', 'chest');
  } else {
    // Raiders: head wrap with a tail, shemagh round the neck, chest rig, backpack, cargo pockets
    M.rigid(vlathe([[4.4, 0.0], [4.75, 1.0], [4.65, 2.7], [3.95, 4.3], [2.45, 5.3], [0.0, 5.6]], 22, 0, 68.4, 0.1), 'wrap', 'head');
    M.rigid(crb(2.6, 2.4, 1.8, 0.6, 71.0, 4.2, 0.8), 'wrap', 'head');
    M.rigid(limb([0.8, 70.4, 4.4], [1.7, 63.2, 5.8], 1.0, 0.55, 8), 'wrap', 'head');
    M.rigid(new THREE.TorusGeometry(3.25, 1.35, 8, 20).rotateX(Math.PI / 2).translate(0, 61.4, -0.2), 'accent', [['neck', 0.5], ['chest', 0.5]]);
    M.rigid(crb(5.0, 3.6, 1.2, 0, 59.2, -3.9, 0.55), 'accent', 'chest');
    M.rigid(crb(12.4, 7.4, 2.2, 0, 50.0, -5.0, 0.8), 'vest', 'chest');
    for (const x of [-4.0, 0, 4.0]) { M.rigid(crb(3.2, 4.2, 2.0, x, 49.4, -6.6, 0.45), 'gear', 'chest'); M.rigid(crb(3.3, 0.9, 2.2, x, 51.4, -6.65, 0.3), 'gear', 'chest'); }
    for (const s of [-1, 1]) {
      M.rigid(limb([4.4 * s, 53.6, -5.4], [4.7 * s, 59.6, -0.4], 0.55, 0.55, 8), 'strap', 'chest');
      M.rigid(limb([4.7 * s, 59.6, -0.4], [4.2 * s, 50.0, 5.4], 0.55, 0.55, 8), 'strap', 'chest');
      M.rigid(crb(1.3, 4.8, 3.8, 7.05 * s, 27.5, 0.1, 0.5), 'pants', 'thigh' + (s < 0 ? 'L' : 'R'));
      M.rigid(crb(1.6, 5.0, 3.2, 5.2 * s, 49.2, 7.3, 0.6), 'pack', 'chest');
    }
    M.rigid(crb(9.6, 11.0, 4.4, 0, 51.6, 7.4, 1.2), 'pack', 'chest');
    M.rigid(crb(9.8, 2.0, 4.8, 0, 56.8, 7.4, 0.8), 'pack', 'chest');
  }
  return M.toGeometry();
}

// Third-person weapons: the viewmodel guns themselves (hands and flash left out), one surface per
// viewmodel material, in gun space (barrel toward -Z), at 0.85 scale to suit the characters' reach.
const CH_GUN_SCALE = 0.85;
function chWeaponGeo(id) {
  const M = vmMaterials(), names = new Map(Object.entries(M).map(([k, m]) => [m, k]));
  const fn = { rifle: buildRifleVM, pistol: buildPistolVM, knife: buildKnifeVM, smoke: buildSmokeVM, smg: buildSmgVM, shotgun: buildShotgunVM, sniper: buildSniperVM, charge: buildChargeVM }[id] || buildSmokeVM;
  const m = fn(M);
  m.root.updateMatrixWorld(true);
  const skip = new Set();
  for (const k of ['left', 'right', 'finger', 'shell']) if (m.parts[k]) m.parts[k].traverse((o) => skip.add(o));
  if (m.flash) m.flash.traverse((o) => skip.add(o));
  const by = new Map();
  m.root.traverse((o) => {
    if (!o.isMesh || skip.has(o)) return;
    const name = names.get(o.material);
    if (!name || name === 'glove' || name === 'sleeve' || name === 'flash') return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld).scale(CH_GUN_SCALE, CH_GUN_SCALE, CH_GUN_SCALE);
    if (!by.has(name)) by.set(name, []);
    by.get(name).push(g);
  });
  const surfaces = [...by.entries()].map(([mat, list]) => ({ mat, geo: mergeGeos(list) }));
  const anchor = m.anchors.muzzle || m.anchors.tip;
  const muzzle = (anchor ? anchor.getWorldPosition(new THREE.Vector3()).toArray() : id === 'charge' ? [0, 1.5, 0] : [0, 0, -2]).map((v) => v * CH_GUN_SCALE);
  return { surfaces, muzzle, geo: mergeGeos(surfaces.map((s) => s.geo)) };   // geo: the whole gun (weapon icons)
}

// How each weapon is held: gun bone (chest space) and wrist IK targets (gun space).
// Long guns sit with the stock in the shoulder pocket and the sights near chin height.
const HOLDS = {
  rifle: { gun: [5.2, 8.0, -9.9], r: [0.5, -2.1, 4.9], l: [-0.6, -1.7, -4.6] },
  pistol: { gun: [1.4, 6.5, -15.0], r: [0.5, -1.2, 2.5], l: [-0.8, -1.5, 2.3] },
  knife: { gun: [6.2, -3.5, -9.5], r: [0.3, -0.5, 3.8], l: null },
  smoke: { gun: [6.0, -2.0, -8.0], r: [0.2, -1.4, 2.1], l: null },
  smg: { gun: [5.2, 8.0, -7.7], r: [0.5, -2.1, 4.9], l: [-0.6, -1.5, -2.6] },
  shotgun: { gun: [5.2, 8.0, -9.1], r: [0.5, -2.1, 4.9], l: [-0.6, -1.9, -4.7] },
  sniper: { gun: [5.2, 7.6, -10.1], r: [0.5, -2.1, 4.9], l: [-0.6, -1.6, -6.4] },
  charge: { gun: [0.5, -2.0, -11.0], r: [2.5, -0.8, 0.2], l: [-2.5, -0.8, 0.2] },
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
  // Admin x-ray: the body drawn in a flat colour wherever a wall is in front of it.
  setXray(on) {
    if (!on && !this.xray) return;
    if (!this.xray) {
      const mat = new THREE.MeshBasicMaterial({ color: this.team === 0 ? 0xff8a3d : 0x5fb4ff, skinning: true, transparent: true, opacity: 0.6, depthWrite: false, depthFunc: THREE.GreaterDepth });
      this.xray = new THREE.SkinnedMesh(this.mesh.geometry, mat);
      this.xray.bind(this.mesh.skeleton, this.mesh.bindMatrix);
      this.xray.frustumCulled = false; this.xray.renderOrder = 20;
      this.mesh.add(this.xray);
    }
    this.xray.visible = on;
  }

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
