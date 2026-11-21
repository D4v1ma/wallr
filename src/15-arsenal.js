// Attachments and camos. The profile's per-gun choices turn into modified weapon defs for the local
// player (bots carry stock guns). Attachments are bought per gun; camos unlock for every gun.
// Camo patterns are generated on canvas (tileable) and box-projected onto the viewmodel.

const ATT_SLOTS = [
  { id: 'muzzle', name: 'Muzzle' }, { id: 'optic', name: 'Optic' }, { id: 'mag', name: 'Magazine' }, { id: 'grip', name: 'Grip / stock' },
];
const ARMORY_GUNS = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'];          // the buy-menu guns
const GUN_PRICE_K = { pistol: 0.7, smg: 0.9, shotgun: 0.9, rifle: 1, sniper: 1.1 };

function scaleRecoil(d, v, h) {
  d.recoil = Object.assign({}, d.recoil, { pattern: d.recoil.pattern.map(([p, y]) => [p * v, y * h]) });
}
// Reload k times as long; the viewmodel plays its reload clips 1/k as fast to match.
function scaleReload(d, k) {
  if (d.shellReload) d.shellReload = Object.assign({}, d.shellReload, { start: d.shellReload.start * k, each: d.shellReload.each * k, shellMarks: d.shellReload.shellMarks.map(([t, s]) => [t * k, s]) });
  else d.reload = Object.assign({}, d.reload, { time: d.reload.time * k, empty: d.reload.empty * k, marks: d.reload.marks.map(([t, s]) => [t * k, s]), emptyMarks: d.reload.emptyMarks.map(([t, s]) => [t * k, s]) });
  d.reloadRate = (d.reloadRate || 1) / k;
}

const ATTACHMENTS = {
  hush: { slot: 'muzzle', name: 'Hush Can', kind: 'Suppressor', guns: ['pistol', 'smg', 'rifle', 'sniper'], price: 450,
    pros: ['Enemies hear your shots from about a third as far', 'Almost no muzzle flash'], cons: ['−6% damage', 'Slightly more damage falloff'],
    apply(d) { d.suppressed = true; d.noise = 600; d.flash *= 0.22; d.damage *= 0.94; d.rangeMod = Math.max(0.5, d.rangeMod - 0.02); } },
  brake: { slot: 'muzzle', name: 'Ridge Brake', kind: 'Compensator', guns: ['pistol', 'smg', 'rifle', 'shotgun'], price: 350,
    pros: ['−18% vertical recoil', '−15% view kick'], cons: ['Bigger muzzle flash', 'Louder: heard 20% farther'],
    apply(d) { scaleRecoil(d, 0.82, 1); d.kick *= 0.85; d.flash *= 1.35; d.noise = (d.noise || 1700) * 1.2; } },
  choke: { slot: 'muzzle', name: 'Full Choke', kind: 'Choke', guns: ['shotgun'], price: 300,
    pros: ['−28% pellet spread'], cons: ['+0.15 s draw time'],
    apply(d) { d.pelletSpread *= 0.72; d.drawTime += 0.15; } },
  pip: { slot: 'optic', name: 'Pip Reflex', kind: 'Red dot', guns: ['pistol', 'smg', 'rifle', 'shotgun'], price: 350,
    pros: ['−15% standing and crouched inaccuracy'], cons: ['+0.08 s draw time'],
    apply(d) { d.inStand *= 0.85; d.inCrouch *= 0.85; d.drawTime += 0.08; } },
  halo: { slot: 'optic', name: 'Halo Holo', kind: 'Holographic sight', guns: ['smg', 'rifle', 'shotgun'], price: 450,
    pros: ['−10% standing inaccuracy', '−10% inaccuracy on the move'], cons: ['+0.12 s draw time'],
    apply(d) { d.inStand *= 0.9; d.inCrouch *= 0.9; d.inMove *= 0.9; d.drawTime += 0.12; } },
  glass: { slot: 'optic', name: 'Fieldglass 4×', kind: 'Low-power scope', guns: ['sniper'], price: 300,
    pros: ['Wider view through the scope', '+15 move speed while scoped'], cons: ['Less magnification', '+30% scoped inaccuracy'],
    apply(d) { d.scope = [55, 28]; d.scopedSpeed += 15; d.inScoped *= 1.3; d.inScopedCrouch *= 1.3; } },
  extmag: { slot: 'mag', name: 'Long Mag', names: { shotgun: 'Long Tube' }, kind: 'Extended magazine', guns: ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'], price: 400,
    pros: ['+33% rounds per magazine'], prosBy: { shotgun: ['+2 shells in the tube'] }, cons: ['+12% reload time', '−5 move speed'],
    apply(d) { d.mag = d.shellReload ? d.mag + 2 : Math.round(d.mag * 1.34); d.maxSpeed -= 5; scaleReload(d, 1.12); } },
  quick: { slot: 'mag', name: 'Quick Mag', names: { shotgun: 'Side Saddle' }, kind: 'Fast-reload magazine', guns: ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'], price: 350,
    pros: ['−22% reload time'], cons: ['Fewer rounds per magazine'], consBy: { shotgun: ['−1 shell in the tube'] },
    apply(d) { scaleReload(d, 0.78); d.mag = d.shellReload ? d.mag - 1 : d.mag - Math.max(1, Math.round(d.mag * 0.1)); } },
  hollow: { slot: 'mag', name: 'Hollow Points', kind: 'Expanding rounds', guns: ['pistol', 'smg', 'rifle', 'sniper'], price: 450,
    pros: ['+10% damage'], cons: ['−15% armor penetration', '−20% wall penetration'],
    apply(d) { d.damage *= 1.1; d.armorPen *= 0.85; d.penetration *= 0.8; } },
  grip: { slot: 'grip', name: 'Vertical Grip', kind: 'Foregrip', guns: ['smg', 'rifle'], price: 350,
    pros: ['−30% sideways recoil', 'Spray resets 15% faster'], cons: ['−5 move speed'],
    apply(d) { scaleRecoil(d, 1, 0.7); d.recoil.recover *= 1.15; d.recoil.jitter *= 0.85; d.maxSpeed -= 5; } },
  laser: { slot: 'grip', name: 'Laser Module', kind: 'Laser', guns: ['pistol', 'smg', 'shotgun', 'rifle'], price: 400,
    pros: ['−20% inaccuracy while moving', '−20% in the air and on landing'], cons: ['+0.05 s draw time'],
    apply(d) { d.inMove *= 0.8; d.inAir *= 0.8; d.inLand *= 0.8; d.drawTime += 0.05; } },
  skeleton: { slot: 'grip', name: 'Skeleton Stock', kind: 'Light stock', guns: ['smg', 'shotgun', 'rifle', 'sniper'], price: 300,
    pros: ['+10 move speed', '−20% draw time'], cons: ['+10% vertical recoil', '+10% view kick'],
    apply(d) { d.maxSpeed += 10; if (d.scopedSpeed) d.scopedSpeed += 5; d.drawTime *= 0.8; scaleRecoil(d, 1.1, 1); d.kick *= 1.1; } },
  stipple: { slot: 'grip', name: 'Stippled Grip', kind: 'Grip texture', guns: ['pistol'], price: 250,
    pros: ['−12% recoil', '−10% inaccuracy from firing'], cons: ['+0.05 s draw time'],
    apply(d) { scaleRecoil(d, 0.88, 0.88); d.inFire *= 0.9; d.drawTime += 0.05; } },
};
for (const [id, a] of Object.entries(ATTACHMENTS)) a.id = id;

const attName = (attId, gun) => { const a = ATTACHMENTS[attId]; return a ? (a.names && a.names[gun]) || a.name : ''; };
const attPrice = (attId, gun) => Math.round(ATTACHMENTS[attId].price * (GUN_PRICE_K[gun] || 1) / 10) * 10;
const attFits = (attId, gun) => !!ATTACHMENTS[attId] && ATTACHMENTS[attId].guns.includes(gun);
const attPros = (a, gun) => (a.prosBy && a.prosBy[gun]) || a.pros;
const attCons = (a, gun) => (a.consBy && a.consBy[gun]) || a.cons;

// ---------------------------------------------------------------------------
// Camos: one painter per pattern on a 256 px tile; `shine`/`spec` set the gun material.
// ---------------------------------------------------------------------------
const CAMO_TIERS = { standard: 'Standard', rare: 'Rare', elite: 'Elite', legend: 'Legendary' };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// Layered blotches: each layer paints its colour where fbm(seed) exceeds its threshold.
function camoBlotch(P, base, layers, scale, wobble = 0.35) {
  const N = P.w;
  P.map((x, y, c) => {
    let col = base;
    for (const [rgb, thr, seed, sc] of layers) {
      const s = (sc || scale), u = x / N * s, v = y / N * s;
      const w = fbm(u * 2 + 3, v * 2 + 7, s * 2, s * 2, 2, seed + 50) * wobble;
      const n = fbm(u + w, v - w, s, s, 4, seed);
      if (n > thr) col = mixc(col, rgb, smoothstep(thr, thr + 0.012, n));
    }
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
  });
}
function camoGrime(P, k = 0.1, seed = 9) {
  const N = P.w;
  P.map((x, y, c) => {
    const g = 1 - k * 0.5 + k * fbm(x / N * 8, y / N * 8, 8, 8, 3, seed) + (hashi(x, y, seed) - 0.5) * k * 0.35;
    c[0] *= g; c[1] *= g; c[2] *= g;
  });
}
const CAMOS = {
  field: { name: 'Fieldworks', tier: 'standard', price: 150, shine: 14, spec: 0.06,
    paint(P) { camoBlotch(P, [0.42, 0.43, 0.29], [[[0.35, 0.27, 0.17], 0.52, 11], [[0.2, 0.25, 0.14], 0.57, 23], [[0.08, 0.08, 0.07], 0.63, 37]], 3); camoGrime(P, 0.12); } },
  dune: { name: 'Dune Drift', tier: 'standard', price: 150, shine: 12, spec: 0.05,
    paint(P) {
      const N = P.w;
      P.map((x, y, c) => {
        const w = fbm(x / N * 3, y / N * 3, 3, 3, 3, 71), s = Math.sin((y / N * 4 + w * 1.6) * TAU) * 0.5 + 0.5;
        let col = mixc([0.75, 0.64, 0.46], [0.86, 0.78, 0.6], smoothstep(0.45, 0.55, s));
        if (fbm(x / N * 4, y / N * 4, 4, 4, 4, 72) > 0.6) col = [0.54, 0.41, 0.27];
        c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
      });
      camoGrime(P, 0.1);
    } },
  grid: { name: 'Gridlock', tier: 'standard', price: 150, shine: 18, spec: 0.08,
    paint(P) {
      const N = P.w, cell = 8, cols = [[0.22, 0.23, 0.25], [0.38, 0.39, 0.41], [0.55, 0.56, 0.57], [0.3, 0.33, 0.38]];
      P.map((x, y, c) => {
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell), M = N / cell;
        const n = fbm(cx / M * 4, cy / M * 4, 4, 4, 3, 81) + (hashi(cx, cy, 82) - 0.5) * 0.18;
        const col = cols[clamp(Math.floor((n - 0.28) * 9), 0, 3)];
        c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
      });
      camoGrime(P, 0.08);
    } },
  night: { name: 'Nightfall', tier: 'standard', price: 200, shine: 30, spec: 0.14,
    paint(P) { camoBlotch(P, [0.07, 0.07, 0.08], [[[0.13, 0.12, 0.17], 0.5, 91], [[0.17, 0.18, 0.24], 0.6, 92]], 2, 0.6); camoGrime(P, 0.08); } },
  frost: { name: 'Hoarfrost', tier: 'rare', price: 300, shine: 20, spec: 0.1,
    paint(P) {
      const N = P.w, o = [0, 0, 0], cols = [[0.9, 0.92, 0.94], [0.72, 0.76, 0.8], [0.52, 0.58, 0.64], [0.33, 0.38, 0.45]];
      P.map((x, y, c) => {
        worley(x / N * 6, y / N * 6, 6, 101, o);
        const col = cols[Math.floor(o[2] * 4) % 4], edge = smoothstep(0.0, 0.06, o[1] - o[0]);
        c[0] = col[0] * (0.82 + 0.18 * edge); c[1] = col[1] * (0.82 + 0.18 * edge); c[2] = col[2] * (0.85 + 0.15 * edge);
      });
      camoGrime(P, 0.06);
    } },
  tiger: { name: 'Ember Stripe', tier: 'rare', price: 300, shine: 22, spec: 0.1,
    paint(P) {
      const N = P.w;
      P.map((x, y, c) => {
        const w = fbm(x / N * 2, y / N * 4, 2, 4, 4, 111), s = Math.sin((x / N * 6 + w * 2.2) * TAU);
        const k = smoothstep(0.35, 0.55, s * 0.5 + 0.5 + (fbm(x / N * 8, y / N * 8, 8, 8, 2, 112) - 0.5) * 0.4);
        const col = mixc([0.86, 0.4, 0.1], [0.06, 0.05, 0.04], k);
        c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
      });
      camoGrime(P, 0.1);
    } },
  web: { name: 'Crimson Web', tier: 'rare', price: 400, shine: 26, spec: 0.12,
    paint(P) {
      const N = P.w, o = [0, 0, 0];
      P.map((x, y, c) => {
        worley(x / N * 5, y / N * 5, 5, 121, o);
        const line = 1 - smoothstep(0.015, 0.05, o[1] - o[0]), base = 0.32 + 0.12 * fbm(x / N * 4, y / N * 4, 4, 4, 3, 122);
        const col = mixc([base, base * 0.12, base * 0.1], [0.04, 0.03, 0.03], line);
        c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
      });
    } },
  hex: { name: 'Hexcore', tier: 'elite', price: 550, shine: 40, spec: 0.22,
    paint(P) {
      const N = P.w, sz = N / 8;
      P.map((x, y, c) => {
        // hex grid: distance to the nearest cell centre in axial coords
        const q = (x * 2 / 3) / sz, r = (-x / 3 + Math.sqrt(3) / 3 * y) / sz;
        let rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r);
        const dx = Math.abs(rx - q), dy = Math.abs(ry - r), dz = Math.abs(rz + q + r);
        if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz;
        const fx = q - rx, fy = r - ry, d = Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fx + fy));
        const glow = smoothstep(0.38, 0.49, d), pulse = hashi(rx & 255, ry & 255, 131);
        const base = mixc([0.04, 0.12, 0.14], [0.07, 0.2, 0.22], pulse);
        const col = mixc(base, [0.25, 0.9, 0.95], glow * 0.85);
        c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
      });
    } },
  carbon: { name: 'Carbon Weave', tier: 'elite', price: 550, shine: 60, spec: 0.35,
    paint(P) {
      const N = P.w, t = 8;
      P.map((x, y, c) => {
        const cx = Math.floor(x / t), cy = Math.floor(y / t), fx = (x % t) / t, fy = (y % t) / t;
        const over = (cx + cy) % 2 === 0, sheen = over ? Math.sin(fx * Math.PI) : Math.sin(fy * Math.PI);
        const v = 0.07 + 0.09 * sheen + (hashi(x, y, 141) - 0.5) * 0.02;
        c[0] = v; c[1] = v * 1.02; c[2] = v * 1.08;
      });
    } },
  cobalt: { name: 'Cobalt Anodize', tier: 'elite', price: 800, shine: 85, spec: 0.55,
    paint(P) {
      const N = P.w;
      P.map((x, y, c) => {
        const streak = fbm(x / N * 64, y / N * 2, 64, 2, 2, 151) * 0.16, v = fbm(x / N * 3, y / N * 3, 3, 3, 3, 152) * 0.12;
        c[0] = 0.07 + streak * 0.5; c[1] = 0.17 + streak + v * 0.5; c[2] = 0.52 + streak + v;
      });
    } },
  flare: { name: 'Signal Flare', tier: 'elite', price: 800, shine: 34, spec: 0.16,
    paint(P) {
      const N = P.w;
      P.map((x, y, c) => {
        const s = ((x + y) / N * 4) % 1, k = s < 0.5 ? 0 : 1;
        const col = k ? [0.95, 0.93, 0.88] : [0.98, 0.38, 0.05];
        c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
      });
      camoGrime(P, 0.12, 161);
    } },
  gilded: { name: 'Gilded Scroll', tier: 'legend', price: 1500, shine: 90, spec: 0.75,
    paint(P) {
      const N = P.w;
      P.map((x, y, c) => {
        const u = x / N * TAU * 4, v = y / N * TAU * 4;
        const curl = Math.sin(u + Math.sin(v) * 1.6) * Math.cos(v + Math.cos(u) * 1.6);
        const engr = smoothstep(0.82, 0.9, Math.abs(curl)) * 0.55, gl = fbm(x / N * 4, y / N * 4, 4, 4, 3, 171) * 0.18;
        c[0] = (0.78 + gl) * (1 - engr); c[1] = (0.58 + gl * 0.8) * (1 - engr); c[2] = (0.22 + gl * 0.3) * (1 - engr * 0.8);
      });
    } },
};
for (const [id, c] of Object.entries(CAMOS)) c.id = id;

// ---------------------------------------------------------------------------
const Arsenal = {
  cache: new Map(), camoCanvases: {}, camoTex: {},

  // The profile's choice for one gun: { muzzle, optic, mag, grip, camo } (missing = none).
  kitFor(gun) {
    const k = (typeof Profile !== 'undefined' && Profile.v && Profile.v.kit[gun]) || {};
    return { muzzle: k.muzzle || null, optic: k.optic || null, mag: k.mag || null, grip: k.grip || null, camo: k.camo || null };
  },
  // Weapon def for the local player: the stock def with the equipped attachments applied.
  def(id, kit) {
    const base = WEAPONS[id];
    if (!base || base.kind !== 'gun' || !ARMORY_GUNS.includes(id)) return base;
    kit = kit || this.kitFor(id);
    const sig = [id, kit.muzzle, kit.optic, kit.mag, kit.grip, kit.camo].join('|');
    if (sig === id + '|||||') return base;
    let d = this.cache.get(sig);
    if (d) return d;
    d = Object.assign({}, base, { recoil: Object.assign({}, base.recoil) });
    const baseDraw = d.drawTime;
    for (const slot of ATT_SLOTS) {
      const a = ATTACHMENTS[kit[slot.id]];
      if (a && a.slot === slot.id && a.guns.includes(id)) a.apply(d);
    }
    d.drawRate = baseDraw / d.drawTime;
    d.kit = kit; d.kitSig = sig;
    this.cache.set(sig, d);
    return d;
  },

  // Numbers for the loadout screen (bigger is better except reload).
  stats(d) {
    const p10 = patternAt(d.recoil.pattern, 9), rec = Math.hypot(p10[0], p10[1]) + d.recoil.jitter * 4 + d.kick * 1.5;
    return [
      { id: 'dmg', name: 'Damage', v: d.damage * (d.pellets || 1), max: 240, fmt: (v) => Math.round(v) },
      { id: 'rpm', name: 'Fire rate', v: d.rpm, max: 900, fmt: (v) => `${Math.round(v)} rpm` },
      { id: 'acc', name: 'Accuracy', v: clamp(1 - (d.spread + d.inStand) / 12, 0, 1) * 100, max: 100, fmt: (v) => Math.round(v) },
      { id: 'move', name: 'Moving accuracy', v: clamp(1 - (d.inMove) / 280, 0, 1) * 100, max: 100, fmt: (v) => Math.round(v) },
      { id: 'rec', name: 'Recoil control', v: clamp(1 - rec / 14, 0, 1) * 100, max: 100, fmt: (v) => Math.round(v) },
      { id: 'mob', name: 'Mobility', v: d.maxSpeed, max: 260, fmt: (v) => `${Math.round(v)} u/s` },
      { id: 'rel', name: 'Reload', v: d.shellReload ? d.shellReload.start + d.shellReload.each * d.mag : d.reload.time, max: 5, fmt: (v) => `${v.toFixed(2)} s`, lower: true },
      { id: 'mag', name: 'Magazine', v: d.mag, max: 45, fmt: (v) => `${Math.round(v)}` },
    ];
  },

  // Tileable camo canvas (generated once, on demand).
  camoCanvas(id) {
    if (this.camoCanvases[id]) return this.camoCanvases[id];
    const c = CAMOS[id];
    if (!c) return null;
    const P = new Pix(256);
    c.paint(P);
    return (this.camoCanvases[id] = P.toCanvas());
  },
  camoTexture(id) {
    if (this.camoTex[id]) return this.camoTex[id];
    const cv = this.camoCanvas(id);
    if (!cv || typeof THREE === 'undefined') return null;
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = R.maxAniso || 1;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    return (this.camoTex[id] = t);
  },
};
