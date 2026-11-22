// PBR materials for the Godot version (assetgen/ feeds tools/godot-export.mjs only; the browser
// build in src/ is untouched). Every world material is a tileable 512 px set made from seeded
// noise: a height field in world units, albedo (sRGB), roughness and metalness. The normal map and
// ambient occlusion are derived from the height, so bumps, cavities and colour always agree.
// Height is in level units over a tile of `world` units, so normal strength matches the scale the
// texture is used at.

const PBR_SIZE = 512;

class PTex {
  constructor(world, n = PBR_SIZE) {
    this.n = n; this.world = world;
    const N = n * n;
    this.h = new Float32Array(N);              // height, level units
    this.c = new Float32Array(N * 3);          // albedo, sRGB 0..1
    this.r = new Float32Array(N).fill(0.85);   // roughness
    this.m = new Float32Array(N);              // metalness
  }
  each(fn) {
    const n = this.n;
    for (let y = 0, i = 0; y < n; y++) for (let x = 0; x < n; x++, i++) fn(x, y, i, x / n, y / n);
    return this;
  }
  set(i, r, g, b) { const o = i * 3; this.c[o] = r; this.c[o + 1] = g; this.c[o + 2] = b; }
  setc(i, c, k = 1) { const o = i * 3; this.c[o] = c[0] * k; this.c[o + 1] = c[1] * k; this.c[o + 2] = c[2] * k; }
  mul(i, k) { const o = i * 3; this.c[o] *= k; this.c[o + 1] *= k; this.c[o + 2] *= k; }
  mix(i, c, t) { if (t <= 0) return; const o = i * 3; this.c[o] += (c[0] - this.c[o]) * t; this.c[o + 1] += (c[1] - this.c[o + 1]) * t; this.c[o + 2] += (c[2] - this.c[o + 2]) * t; }
}

// --- tileable noise at integer frequencies (u, v in 0..1) ---
const PW3 = [0, 0, 0];
const tn = (u, v, f, oct, s) => fbm(u * f, v * f, f, f, oct, s);
const tn2 = (u, v, fx, fy, oct, s) => fbm(u * fx, v * fy, fx, fy, oct, s);
const tw = (u, v, f, s) => worley(u * f, v * f, f, s, PW3);
const pmix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Separable box blur with wrap-around (w x h).
function blurWrap(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[row + ((x % w) + w) % w];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s * k;
      s += src[row + (x + r + 1) % w] - src[row + (((x - r) % w) + w) % w];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[(((y % h) + h) % h) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s * k;
      s += tmp[((y + r + 1) % h) * w + x] - tmp[((((y - r) % h) + h) % h) * w + x];
    }
  }
  return out;
}

// Anti-aliased disc into a mask (wraps).
function stampDisc(m, n, cx, cy, r, v = 1) {
  const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1), y0 = Math.floor(cy - r - 1), y1 = Math.ceil(cy + r + 1);
  for (let y = y0; y <= y1; y++) {
    const yy = ((y % n) + n) % n;
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy), a = clamp(r + 0.5 - d, 0, 1) * v;
      if (a <= 0) continue;
      const i = yy * n + (((x % n) + n) % n);
      if (a > m[i]) m[i] = a;
    }
  }
}

// Wandering cracks (random walks that taper and sometimes branch).
function crackMask(n, seed, count, len, width = 1, wander = 0.6) {
  const m = new Float32Array(n * n), rnd = mulberry32(seed), walkers = [];
  for (let c = 0; c < count; c++) walkers.push([rnd() * n, rnd() * n, rnd() * TAU, len * (0.5 + rnd()), width * (0.7 + rnd() * 0.6)]);
  while (walkers.length) {
    let [x, y, a, L, w] = walkers.pop();
    for (let s = 0; s < L; s++) {
      a += (rnd() - 0.5) * wander;
      x += Math.cos(a); y += Math.sin(a);
      stampDisc(m, n, x, y, Math.max(0.35, w * (1 - s / L * 0.75)));
      if (rnd() < 0.012 && walkers.length < 64) walkers.push([x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), (L - s) * 0.5, w * 0.6]);
    }
  }
  return m;
}

// Straight scratches (thin, mostly one direction).
function scratchMask(n, seed, count, len, dir = null, width = 0.6) {
  const m = new Float32Array(n * n), rnd = mulberry32(seed);
  for (let c = 0; c < count; c++) {
    let x = rnd() * n, y = rnd() * n;
    const a = dir === null ? rnd() * TAU : dir + (rnd() - 0.5) * 0.5, L = len * (0.3 + rnd());
    const w = width * (0.6 + rnd() * 0.8), v = 0.5 + rnd() * 0.5;
    for (let s = 0; s < L; s++) { x += Math.cos(a); y += Math.sin(a); stampDisc(m, n, x, y, w, v * Math.sin(Math.PI * s / L)); }
  }
  return m;
}

// Dome (rivet, bead): height of a unit sphere cap at distance d of radius r.
const dome = (d, r) => (d < r ? Math.sqrt(1 - (d * d) / (r * r)) : 0);

// Normal map, ambient occlusion and the three canvases (albedo sRGB, normal, ORM = AO/rough/metal).
function pbrFinish(T, o = {}) {
  const { n, h, c, r, m } = T, px = T.world / n;
  const blurA = blurWrap(h, n, n, Math.max(2, Math.round(n / 128)));
  const blurB = blurWrap(h, n, n, Math.max(4, Math.round(n / 40)));
  const aoK = o.ao ?? 1.4, cav = o.cavity ?? 0.55, ns = o.normal ?? 1;
  const alb = makeCanvas(n), nrm = makeCanvas(n), orm = makeCanvas(n);
  const ca = alb.getContext('2d'), cn = nrm.getContext('2d'), co = orm.getContext('2d');
  const ia = ca.createImageData(n, n), inm = cn.createImageData(n, n), io = co.createImageData(n, n);
  let ar = 0, ag = 0, ab = 0;
  for (let y = 0; y < n; y++) {
    const ym = ((y + n - 1) % n) * n, yp = ((y + 1) % n) * n, y0 = y * n;
    for (let x = 0; x < n; x++) {
      const xm = (x + n - 1) % n, xp = (x + 1) % n, i = y0 + x;
      // Sobel on the height (wrapping)
      const tl = h[ym + xm], tc = h[ym + x], tr = h[ym + xp], ml = h[y0 + xm], mr = h[y0 + xp], bl = h[yp + xm], bc = h[yp + x], br = h[yp + xp];
      const dx = ((tr + 2 * mr + br) - (tl + 2 * ml + bl)) / (8 * px) * ns;
      const dy = ((bl + 2 * bc + br) - (tl + 2 * tc + tr)) / (8 * px) * ns;
      // OpenGL convention (green = +V up the image), as Godot expects
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const d = Math.max(0, (blurA[i] - h[i]) * 0.55 + (blurB[i] - h[i]) * 0.45);
      const ao = clamp(1 - d * aoK, 0.3, 1);
      const k = 1 - (1 - ao) * cav, q = i * 4, o3 = i * 3;
      const cr = clamp(c[o3] * k, 0, 1), cg = clamp(c[o3 + 1] * k, 0, 1), cb = clamp(c[o3 + 2] * k, 0, 1);
      ia.data[q] = cr * 255; ia.data[q + 1] = cg * 255; ia.data[q + 2] = cb * 255; ia.data[q + 3] = 255;
      inm.data[q] = (nx * 0.5 + 0.5) * 255; inm.data[q + 1] = (ny * 0.5 + 0.5) * 255; inm.data[q + 2] = (nz * 0.5 + 0.5) * 255; inm.data[q + 3] = 255;
      io.data[q] = ao * 255; io.data[q + 1] = clamp(r[i], 0.02, 1) * 255; io.data[q + 2] = clamp(m[i], 0, 1) * 255; io.data[q + 3] = 255;
      ar += cr; ag += cg; ab += cb;
    }
  }
  ca.putImageData(ia, 0, 0); cn.putImageData(inm, 0, 0); co.putImageData(io, 0, 0);
  const N = n * n;
  return { albedo: alb, normal: nrm, orm, avg: [ar / N, ag / N, ab / N], world: T.world };
}

// Normal + ORM for a texture that has no PBR generator (signs, crates, doors...): height from
// luminance, roughness by surface type. Edges clamp (these textures cover a whole face).
const PBR_SURF = { concrete: [0.9, 0.0, 0.5], brick: [0.88, 0.0, 0.6], plaster: [0.9, 0.0, 0.4], wood: [0.72, 0.0, 0.7], metal: [0.5, 0.0, 0.35],
  sand: [0.97, 0.0, 0.5], tile: [0.3, 0.0, 0.4], cloth: [0.98, 0.0, 0.6], paper: [0.95, 0.0, 0.2] };
function pbrDerive(canvas, surf, world = 64) {
  const w = canvas.width, hh = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, w, hh).data;
  const [rough, metal, bump] = PBR_SURF[surf] || PBR_SURF.concrete;
  const L = new Float32Array(w * hh);
  for (let i = 0; i < w * hh; i++) L[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const Lb = blurWrap(L, w, hh, 1), Lw = blurWrap(L, w, hh, 6), px = world / w;
  const nrm = makeCanvas(w, hh), orm = makeCanvas(w, hh);
  const inm = nrm.getContext('2d').createImageData(w, hh), io = orm.getContext('2d').createImageData(w, hh);
  const at = (x, y) => Lb[clamp(y, 0, hh - 1) * w + clamp(x, 0, w - 1)] * bump;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, q = i * 4;
    const dx = (at(x + 1, y) - at(x - 1, y)) / (2 * px), dy = (at(x, y + 1) - at(x, y - 1)) / (2 * px);
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    inm.data[q] = (nx * 0.5 + 0.5) * 255; inm.data[q + 1] = (ny * 0.5 + 0.5) * 255; inm.data[q + 2] = (nz * 0.5 + 0.5) * 255; inm.data[q + 3] = 255;
    const ao = clamp(1 - Math.max(0, Lw[i] - L[i]) * 0.9, 0.55, 1);
    io.data[q] = ao * 255; io.data[q + 1] = clamp(rough + (0.5 - L[i]) * 0.12, 0.05, 1) * 255; io.data[q + 2] = metal * 255; io.data[q + 3] = 255;
  }
  nrm.getContext('2d').putImageData(inm, 0, 0); orm.getContext('2d').putImageData(io, 0, 0);
  return { normal: nrm, orm };
}

// ------------------------------------------------------------------------------------------
// Masonry
// ------------------------------------------------------------------------------------------

// Running-bond bricks: bevelled faces, recessed mortar, chipped arrises, soot and salt bloom.
function pbrBrick(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n;
  const rows = o.rows ?? 16, cols = o.cols ?? 4, rowH = n / rows, bw = n / cols, mort = o.mortar ?? Math.max(3, rowH * 0.16);
  const pal = o.pal ?? [[0.56, 0.27, 0.18], [0.5, 0.23, 0.16], [0.62, 0.32, 0.21], [0.46, 0.21, 0.15], [0.6, 0.37, 0.26]];
  const mcol = o.mortarCol ?? [0.62, 0.6, 0.55], soot = o.soot ?? 0, bloom = o.bloom ?? 0.15;
  const chips = crackMask(n, seed + 40, 18, 22, 1.6, 1.4);
  T.each((x, y, i, u, v) => {
    const row = Math.floor(y / rowH), ly = y + 0.5 - row * rowH;
    const off = (row & 1) ? bw / 2 + (hashi(row, 0, seed) - 0.5) * bw * 0.1 : 0;
    const xs = ((x + off) % n + n) % n, col = Math.floor(xs / bw), lx = xs + 0.5 - col * bw;
    const id = hashi(col % cols, row, seed);
    const e = Math.min(lx, bw - lx, ly, rowH - ly) - mort / 2;
    const dirt = tn(u, v, 4, 4, seed + 3), grain = hashi(x, y, seed + 1) - 0.5;
    if (e > 0) {
      const bev = smoothstep(0, 2.6, e) * (1 - chips[i] * 0.85);
      const face = (tn(u, v, 48, 3, seed + 2) - 0.5) * 0.2 + grain * 0.03;
      const tilt = (id - 0.5) * 0.35 * ((lx / bw) - 0.5) + (hashi(col, row, seed + 9) - 0.5) * 0.08;
      T.h[i] = 0.75 * bev + face * bev + tilt;
      const base = pal[Math.floor(id * pal.length) % pal.length];
      const mott = 0.86 + tn(u, v, 24, 3, seed + 4) * 0.22 + grain * 0.07 + (hashi(col, row, seed + 5) - 0.5) * 0.14;
      T.setc(i, base, mott * (0.92 + dirt * 0.16));
      // darker burnt ends on some bricks
      if (hashi(col, row, seed + 6) > 0.7) T.mul(i, 1 - 0.25 * smoothstep(bw * 0.25, 0, Math.min(lx, bw - lx)));
      T.r[i] = 0.82 + grain * 0.1;
      if (chips[i] > 0.2) T.mix(i, pmix(base, [0.75, 0.6, 0.5], 0.35), chips[i] * 0.5);
    } else {
      const sand = tn(u, v, 96, 2, seed + 7);
      T.h[i] = 0.08 + sand * 0.1 + grain * 0.02;
      T.setc(i, mcol, 0.82 + sand * 0.28 + grain * 0.1);
      T.r[i] = 0.96;
    }
    // salt bloom (efflorescence) creeping out of the joints, soot from above
    const salt = smoothstep(0.62, 0.85, tn(u, v, 8, 4, seed + 11)) * bloom;
    if (salt > 0) T.mix(i, [0.88, 0.86, 0.8], salt * smoothstep(4, -1, e) * 0.9 + salt * 0.25);
    if (soot > 0) {
      const sk = soot * (0.55 + 0.45 * tn2(u, v, 16, 2, 4, seed + 12)) * (0.6 + 0.4 * dirt);
      T.mul(i, 1 - clamp(sk, 0, 0.8) * 0.75);
      T.r[i] = Math.min(1, T.r[i] + sk * 0.05);
    }
  });
  return pbrFinish(T, { ao: 1.3, cavity: 0.6 });
}

// Cast concrete: pores, formwork seams and tie holes, water staining, blotches.
function pbrConcrete(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n;
  const base = o.base ?? [0.55, 0.54, 0.5], seams = o.seams ?? true, ties = o.ties ?? true, streak = o.streaks ?? 0.25;
  const pores = new Float32Array(n * n), rnd = mulberry32(seed + 1);
  for (let k = 0; k < (o.pores ?? 900); k++) stampDisc(pores, n, rnd() * n, rnd() * n, 0.6 + rnd() * rnd() * 2.4, 0.6 + rnd() * 0.4);
  const cracks = crackMask(n, seed + 2, o.cracks ?? 2, 140, 0.8);
  const tieR = n / 64, tiesAt = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  T.each((x, y, i, u, v) => {
    const blot = tn(u, v, 4, 5, seed) - 0.5, mid = tn(u, v, 16, 3, seed + 3) - 0.5, fine = tn(u, v, 96, 2, seed + 4) - 0.5;
    const grain = hashi(x, y, seed + 5) - 0.5;
    let hgt = fine * 0.3 + mid * 0.35 + (tn(u, v, 192, 2, seed + 8) - 0.5) * 0.12 - pores[i] * 0.6 - cracks[i] * 0.6;
    let k = 1 + blot * 0.24 + mid * 0.1 + grain * 0.06;
    if (seams) {
      const sy = Math.min(Math.abs(y - 0), Math.abs(y - n / 2), Math.abs(y - n)), sx = Math.min(x, n - x);
      if (sy < 2.5) { hgt += 0.25 * (1 - sy / 2.5); k *= 1.04; }                 // formwork joint ridge
      if (sx < 1.5) { hgt -= 0.2; k *= 0.92; }
    }
    if (ties) {
      for (const [tx, ty] of tiesAt) {
        const d = Math.hypot(x + 0.5 - tx * n, y + 0.5 - ty * n);
        if (d < tieR * 2.2) {
          const ring = smoothstep(tieR * 2.2, tieR * 1.4, d);
          hgt -= 0.15 * ring;
          if (d < tieR) { hgt -= 1.2 * smoothstep(tieR, tieR * 0.6, d); k *= 0.45; }
          k *= 1 - 0.08 * ring;
        }
      }
    }
    const run = streak * smoothstep(0.45, 0.9, tn2(u, v, 28, 2, 3, seed + 6)) * (0.5 + 0.5 * tn(u, v, 4, 3, seed + 7));
    k *= 1 - run * 0.45;
    T.h[i] = hgt;
    T.set(i, base[0] * k, base[1] * k, base[2] * k * (1 + blot * 0.04));
    T.r[i] = 0.88 + fine * 0.1 - run * 0.1;
    if (cracks[i] > 0) T.mul(i, 1 - cracks[i] * 0.5);
  });
  return pbrFinish(T, { ao: 1.6, cavity: 0.5 });
}

// Floor slab: saw-cut joints, trowel marks, cracks, oil stains (glossier), aggregate.
function pbrConcreteFloor(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n, base = o.base ?? [0.52, 0.51, 0.48];
  const cracks = crackMask(n, seed + 2, 3, 180, 0.9, 0.5);
  T.each((x, y, i, u, v) => {
    const blot = tn(u, v, 4, 5, seed) - 0.5, mid = tn(u, v, 12, 3, seed + 1) - 0.5, grain = hashi(x, y, seed + 3) - 0.5;
    const swirl = Math.sin((tn(u, v, 6, 3, seed + 4) * 18 + u * 6) * TAU) * 0.5 + 0.5;
    const agg = tw(u, v, 96, seed + 5); const stone = smoothstep(0.32, 0.18, PW3[0]) * (PW3[2] > 0.6 ? 1 : 0);
    let hgt = swirl * 0.06 + mid * 0.16 + stone * 0.12 + (tn(u, v, 160, 2, seed + 7) - 0.5) * 0.1 - cracks[i] * 0.45;
    let k = 1 + blot * 0.22 + mid * 0.08 + grain * 0.05 + (stone ? (hashi(x, y, seed + 6) - 0.4) * 0.25 : 0);
    const jx = Math.min(x, n - x), jy = Math.min(y, n - y);
    if (jx < 2 || jy < 2) { hgt -= 0.6; k *= 0.55; }
    else if (jx < 3.5 || jy < 3.5) { hgt -= 0.1; k *= 0.9; }
    const oil = smoothstep(0.55, 0.85, tn(u, v, 6, 4, seed + 9)) * 0.8;
    k *= 1 - oil * 0.22;
    T.h[i] = hgt;
    T.set(i, base[0] * k * (1 + oil * 0.04), base[1] * k, base[2] * k * (1 - oil * 0.06));
    T.r[i] = 0.8 - oil * 0.35 + swirl * 0.05;
    if (cracks[i] > 0) T.mul(i, 1 - cracks[i] * 0.55);
  });
  return pbrFinish(T, { ao: 1.4, cavity: 0.5 });
}

// Stucco plaster with hairline cracks and patches fallen away to the brick underneath.
function pbrPlaster(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n, base = o.base ?? [0.76, 0.71, 0.62];
  const cracks = crackMask(n, seed + 1, o.cracks ?? 2, 90, 0.5, 0.9);
  T.each((x, y, i, u, v) => {
    const bump = tn(u, v, 64, 3, seed + 2), big = tn(u, v, 8, 4, seed + 3), grain = hashi(x, y, seed + 4) - 0.5;
    const loss = smoothstep(0.7, 0.74, tn(u, v, 5, 5, seed + 5)) * (o.loss ?? 0);
    let hgt = bump * 0.45 + big * 0.25 + (tn(u, v, 160, 2, seed + 8) - 0.5) * 0.1 - cracks[i] * 0.35;
    let col = base;
    let k = 0.9 + big * 0.18 + grain * 0.05 + (bump - 0.5) * 0.08;
    const dirt = smoothstep(0.5, 0.95, tn2(u, v, 12, 2, 3, seed + 6)) * 0.3;
    k *= 1 - dirt * 0.35;
    if (loss > 0) {
      // exposed brick under the render: courses of small bricks, recessed
      const rowH = n / 32, row = Math.floor(y / rowH), ly = y - row * rowH, off = (row & 1) * n / 32, lx = ((x + off) % (n / 16));
      const mort = ly < 2 || lx < 2;
      const brick = mort ? [0.55, 0.52, 0.46] : pmix([0.55, 0.28, 0.2], [0.45, 0.22, 0.16], hashi(Math.floor((x + off) / (n / 16)), row, seed + 7));
      col = pmix(col, brick, loss);
      hgt = hgt * (1 - loss) + (-1.2 + (mort ? -0.15 : 0)) * loss;
      // ragged rim
      const rim = smoothstep(0.7, 0.72, tn(u, v, 5, 5, seed + 5)) - loss;
      k *= 1 - rim * 0.3;
    }
    T.h[i] = hgt;
    T.setc(i, col, k);
    T.r[i] = 0.92 - loss * 0.05;
    if (cracks[i] > 0) T.mul(i, 1 - cracks[i] * 0.25);
  });
  return pbrFinish(T, { ao: 1.5, cavity: 0.55 });
}

// ------------------------------------------------------------------------------------------
// Wood
// ------------------------------------------------------------------------------------------

// Planks running along U: grain, knots, gaps, nail heads, per-board tone and wear.
function pbrPlanks(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n, base = o.base ?? [0.56, 0.38, 0.22];
  const boards = o.boards ?? 6, bh = n / boards, varnish = o.varnish ?? 0;
  T.each((x, y, i, u, v) => {
    const b = Math.floor(y / bh), ly = y + 0.5 - b * bh;
    const len = n / (o.cuts ?? 2), xo = (x + Math.floor(hashi(b, 0, seed) * n)) % n, cut = Math.floor(xo / len), lx = xo % len + 0.5;
    const id = hashi(b, cut, seed + 1);
    const gy = v * boards;
    const warp = tn2(u, v, 4, boards * 2, 3, seed + 2 + b) * 0.8;
    const grainLine = Math.sin((gy * 9 + warp * 6 + id * 13) * TAU) * 0.5 + 0.5;
    const fine = tn2(u, v, 2, 128, 2, seed + 3) - 0.5;
    // knot: a dark eye with grain swirling round it
    const kd = Math.hypot((lx - (0.3 + id * 0.4) * len) / 1.6, ly - bh * 0.5) / (bh * 0.22);
    const knot = id > 0.55 ? smoothstep(1, 0.2, kd) : 0;
    const edge = Math.min(ly, bh - ly), end = Math.min(lx, len - lx);
    const gap = smoothstep(0, 1.8, edge) * smoothstep(0, 1.8, end);
    let hgt = gap * 0.5 + (grainLine - 0.5) * 0.1 + fine * 0.1 - knot * 0.12 + (id - 0.5) * 0.1;
    let k = (0.78 + id * 0.35) * (0.86 + grainLine * 0.16 + fine * 0.1) * (1 - knot * 0.45);
    k *= 0.82 + 0.18 * smoothstep(0, 4, edge);
    const wear = smoothstep(0.55, 0.8, tn(u, v, 6, 4, seed + 4));
    T.h[i] = hgt;
    T.setc(i, pmix(base, [base[0] * 1.25, base[1] * 1.2, base[2] * 1.1], wear * 0.4), k);
    T.r[i] = clamp(0.78 - varnish * 0.4 + wear * 0.12 + fine * 0.08, 0.2, 1);
    // nails near the board ends
    for (const nx0 of [len * 0.06, len * 0.94]) {
      const d = Math.hypot(lx - nx0, ly - bh * 0.5);
      if (d < 2.4) { T.h[i] += dome(d, 2.4) * 0.15; T.set(i, 0.22, 0.2, 0.19); T.m[i] = 0.7; T.r[i] = 0.55; }
    }
    if (gap < 0.5) T.mul(i, 0.35 + gap);
  });
  return pbrFinish(T, { ao: 1.2, cavity: 0.5 });
}

// Plywood sheet: rotary-cut veneer figure, face patches, screw holes at the edges.
function pbrPlywood(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n, base = o.base ?? [0.74, 0.6, 0.42];
  T.each((x, y, i, u, v) => {
    const warp = tn(u, v, 3, 4, seed) * 2.5;
    const fig = Math.sin((v * 10 + warp + tn2(u, v, 2, 24, 3, seed + 1) * 0.8) * TAU) * 0.5 + 0.5;
    const fine = tn2(u, v, 4, 160, 2, seed + 2) - 0.5;
    const patchC = tw(u, v, 6, seed + 3), patch = PW3[2] > 0.88 ? smoothstep(0.24, 0.2, PW3[0]) : 0;
    const k = (0.84 + fig * 0.18 + fine * 0.08) * (1 - patch * 0.08);
    T.h[i] = fig * 0.04 + fine * 0.03 - patch * 0.02;
    T.setc(i, patch ? pmix(base, [0.8, 0.66, 0.46], 0.6) : base, k);
    T.r[i] = 0.8 + fine * 0.08;
    // seam and screws along the sheet edge (sheets are 1/2 tile)
    const sx = Math.min(x % (n / 2), n / 2 - (x % (n / 2)));
    if (sx < 1.2) { T.h[i] -= 0.3; T.mul(i, 0.55); }
    for (let sy = n / 16; sy < n; sy += n / 8) for (const cx of [6, n / 2 + 6, n / 2 - 6, n - 6]) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - sy);
      if (d < 2.6) { T.h[i] -= 0.15 * (1 - d / 2.6); T.set(i, 0.3, 0.29, 0.27); T.m[i] = 0.6; T.r[i] = 0.5; }
    }
  });
  return pbrFinish(T, { ao: 1.0, cavity: 0.4 });
}

// ------------------------------------------------------------------------------------------
// Metal
// ------------------------------------------------------------------------------------------

// Paint over steel: chips and scratches show the metal, rust blooms out of the chips.
function paintWear(T, i, u, v, seed, paint, chipAmt, rustAmt, chip) {
  const rustN = tn(u, v, 24, 3, seed + 31);
  if (chip > 0.02) {
    const bare = chip;
    const rust = smoothstep(0.35, 0.75, rustN) * rustAmt;
    const metalCol = [0.48, 0.48, 0.47];
    const rustCol = pmix([0.42, 0.2, 0.09], [0.55, 0.3, 0.14], rustN);
    T.mix(i, pmix(metalCol, rustCol, rust), bare);
    T.m[i] = Math.max(T.m[i], bare * (1 - rust));
    T.r[i] = lerp(T.r[i], lerp(0.42, 0.92, rust), bare);
    T.h[i] -= bare * 0.08;
  }
}

// Corrugated sheet (containers, sheds, roofs, hangar): ribs along V, paint or bare galvanised.
function pbrCorrugated(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n;
  const paint = o.paint, ribs = o.ribs ?? 10, depth = o.depth ?? 2.2, vertical = o.vertical ?? true;
  const scratches = scratchMask(n, seed + 1, 40, 60, vertical ? Math.PI / 2 : 0, 0.5);
  const dents = new Float32Array(n * n), rnd = mulberry32(seed + 2);
  for (let k = 0; k < 6; k++) stampDisc(dents, n, rnd() * n, rnd() * n, 8 + rnd() * 18, 0.3 + rnd() * 0.5);
  const dentB = blurWrap(dents, n, n, 6);
  T.each((x, y, i, u, v) => {
    const a = (vertical ? u : v) * ribs;
    const prof = Math.cos(a * TAU) * 0.5 + 0.5;          // 1 on the crest
    const crestish = Math.pow(prof, 0.7);
    const along = vertical ? v : u, across = vertical ? u : v;
    const runs = smoothstep(0.5, 0.95, tn2(vertical ? u : v, along, vertical ? ribs * 3 : 2, vertical ? 2 : ribs * 3, 3, seed + 3));
    const grain = hashi(x, y, seed + 4) - 0.5;
    T.h[i] = (crestish - 0.5) * depth - dentB[i] * 1.2;
    if (paint) {
      const fade = tn(u, v, 4, 4, seed + 5);
      T.setc(i, paint, (0.88 + fade * 0.2 + grain * 0.04) * (1 - runs * 0.25) * (0.94 + crestish * 0.08));
      T.r[i] = 0.5 + fade * 0.15;
      // rust streaks run down from the seams and fixings
      const streak = smoothstep(0.55, 0.9, tn2(across, along, ribs * 2, 3, 3, seed + 6)) * (o.rust ?? 0.5);
      T.mix(i, [0.42, 0.22, 0.1], streak * 0.55);
      T.r[i] += streak * 0.25;
      const chip = Math.max(scratches[i] * 0.9, smoothstep(0.72, 0.8, tn(u, v, 20, 4, seed + 7)) * crestish * (o.chips ?? 0.7));
      paintWear(T, i, u, v, seed, paint, 1, o.rust ?? 0.5, chip);
    } else {
      // galvanised zinc: spangle, white rust, darker oxidised runs
      const sp = tw(u, v, 40, seed + 8), spangle = PW3[2];
      const base = 0.5 + spangle * 0.08 + grain * 0.03;
      const white = smoothstep(0.6, 0.85, tn(u, v, 10, 4, seed + 9)) * 0.6;
      T.set(i, base, base * 1.01, base * 1.02);
      T.mix(i, [0.74, 0.74, 0.72], white);
      T.mix(i, [0.36, 0.34, 0.32], runs * 0.4);
      T.m[i] = 1 - white * 0.7 - runs * 0.3;
      T.r[i] = 0.42 + spangle * 0.12 + white * 0.4 + runs * 0.2;
      const rust = smoothstep(0.68, 0.82, tn(u, v, 12, 4, seed + 10)) * (o.rust ?? 0.3);
      T.mix(i, [0.45, 0.24, 0.11], rust); T.m[i] *= 1 - rust; T.r[i] = lerp(T.r[i], 0.95, rust);
    }
  });
  return pbrFinish(T, { ao: 0.6, cavity: 0.35 });
}

// Painted steel panels with seams, rivet rows, scratches, edge wear and grime.
function pbrPanel(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n, paint = o.paint ?? [0.35, 0.39, 0.33];
  const P = o.panels ?? 2, ps = n / P, rivetR = 2.8;
  const scr = scratchMask(n, seed + 1, 70, 40, null, 0.45);
  T.each((x, y, i, u, v) => {
    const lx = x % ps, ly = y % ps, e = Math.min(lx, ps - lx, ly, ps - ly);
    const fade = tn(u, v, 4, 4, seed + 2), grain = hashi(x, y, seed + 3) - 0.5;
    let hgt = smoothstep(0, 3, e) * 0.4 + (tn(u, v, 32, 2, seed + 4) - 0.5) * 0.03;
    T.setc(i, paint, 0.88 + fade * 0.2 + grain * 0.03);
    T.r[i] = 0.45 + fade * 0.15;
    // rivets along the seams
    const rs = ps / 8;
    for (const [cx, cy] of [[Math.round(lx / rs) * rs, 6], [6, Math.round(ly / rs) * rs], [Math.round(lx / rs) * rs, ps - 6], [ps - 6, Math.round(ly / rs) * rs]]) {
      const d = Math.hypot(lx - cx, ly - cy);
      if (d < rivetR) { hgt += dome(d, rivetR) * 0.6; }
    }
    const grime = smoothstep(4, 0, e) * 0.45 + smoothstep(0.5, 0.95, tn(u, v, 6, 4, seed + 5)) * 0.22 + smoothstep(0.55, 0.9, tn2(u, v, 24, 3, 3, seed + 8)) * 0.15;
    T.mul(i, 1 - grime * 0.35);
    T.r[i] += grime * 0.25;
    const edgeWear = smoothstep(5, 2, e) * smoothstep(0.45, 0.7, tn(u, v, 40, 3, seed + 6));
    const chip = Math.max(scr[i] * 0.85, edgeWear, smoothstep(0.78, 0.84, tn(u, v, 16, 4, seed + 7)) * (o.chips ?? 0.8));
    T.h[i] = hgt;
    paintWear(T, i, u, v, seed, paint, 1, o.rust ?? 0.4, chip);
    if (e < 1.2) { T.h[i] -= 0.3; T.mul(i, 0.45); }
  });
  return pbrFinish(T, { ao: 1.0, cavity: 0.5 });
}

// Bare steel plate: brushed streaks, mill scale, scratches, small dents.
function pbrSteel(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n, base = o.base ?? [0.56, 0.57, 0.58];
  const scr = scratchMask(n, seed + 1, 160, 50, null, 0.4);
  T.each((x, y, i, u, v) => {
    const brush = tn2(u, v, 2, 256, 2, seed + 2) - 0.5;
    const scale = smoothstep(0.5, 0.9, tn(u, v, 6, 5, seed + 3)) * 0.45;
    const grain = hashi(x, y, seed + 4) - 0.5;
    T.h[i] = brush * 0.06 - scr[i] * 0.08 + (tn(u, v, 8, 3, seed + 5) - 0.5) * 0.5 + (tn(u, v, 64, 2, seed + 9) - 0.5) * 0.06;
    const k = 0.92 + brush * 0.1 + grain * 0.03;
    T.setc(i, pmix(base, [0.26, 0.26, 0.27], scale * 0.7), k);
    T.m[i] = 1 - scale * 0.6;
    T.r[i] = 0.38 + scale * 0.35 + Math.abs(brush) * 0.2 - scr[i] * 0.15;
    const rust = smoothstep(0.7, 0.85, tn(u, v, 10, 4, seed + 6)) * (o.rust ?? 0.25);
    T.mix(i, [0.4, 0.21, 0.1], rust); T.m[i] *= 1 - rust; T.r[i] = lerp(T.r[i], 0.9, rust);
    if (scr[i] > 0) T.mix(i, [0.75, 0.75, 0.76], scr[i] * 0.4);
  });
  return pbrFinish(T, { ao: 0.6, cavity: 0.3 });
}

// Diamond tread plate: raised lozenge beads, polished where walked on, dirt in the valleys.
function pbrDiamond(seed, o = {}) {
  const T = new PTex(o.world ?? 96), n = T.n, cells = o.cells ?? 12, cs = n / cells;
  T.each((x, y, i, u, v) => {
    const cy = Math.floor(y / cs), off = (cy & 1) * cs / 2, lx = ((x + off) % cs) - cs / 2, ly = (y % cs) - cs / 2;
    const flip = (cy & 1) ? -1 : 1;
    // lozenge rotated 45 degrees, elongated
    const a = (lx + ly * flip) * 0.7071, b = (lx * flip - ly) * 0.7071;
    const d = Math.hypot(a / (cs * 0.36), b / (cs * 0.1));
    const bead = d < 1 ? Math.sqrt(1 - d * d) : 0;
    const dirt = smoothstep(0.45, 0.9, tn(u, v, 8, 4, seed + 1)) * (1 - bead) * 0.55;
    const grain = hashi(x, y, seed + 2) - 0.5;
    T.h[i] = bead * 0.9 + (tn(u, v, 24, 2, seed + 3) - 0.5) * 0.05;
    const polish = bead * smoothstep(0.4, 0.75, tn(u, v, 4, 4, seed + 4));
    T.set(i, 0.5 + grain * 0.03, 0.51 + grain * 0.03, 0.52 + grain * 0.03);
    T.mix(i, [0.3, 0.27, 0.23], dirt * 0.8);
    T.m[i] = 1 - dirt * 0.8;
    T.r[i] = lerp(0.55, 0.28, polish) + dirt * 0.35;
    const rust = smoothstep(0.7, 0.85, tn(u, v, 10, 4, seed + 5)) * 0.3 * (1 - bead);
    T.mix(i, [0.42, 0.22, 0.1], rust); T.m[i] *= 1 - rust;
  });
  return pbrFinish(T, { ao: 0.9, cavity: 0.4 });
}

// ------------------------------------------------------------------------------------------
// Ground
// ------------------------------------------------------------------------------------------

// Sand: wind ripples, pebbles, darker damp patches.
function pbrSand(seed, o = {}) {
  const T = new PTex(o.world ?? 192), n = T.n, base = o.base ?? [0.72, 0.64, 0.48];
  T.each((x, y, i, u, v) => {
    const warp = tn(u, v, 4, 4, seed) * 1.4;
    const rip = Math.sin((u * 3 + v * 26 + warp * 3) * TAU) * 0.5 + 0.5;
    const g = tn(u, v, 128, 2, seed + 1), big = tn(u, v, 3, 4, seed + 2);
    const pb = tw(u, v, 48, seed + 3), peb = PW3[2] > 0.82 ? dome(PW3[0], 0.28) : 0;
    const damp = smoothstep(0.55, 0.8, tn(u, v, 5, 5, seed + 4)) * (o.damp ?? 0.6);
    T.h[i] = rip * 0.25 * (1 - damp) + g * 0.08 + big * 0.4 + peb * 0.5;
    const mid = tn(u, v, 10, 4, seed + 6), grit = tn(u, v, 48, 2, seed + 7);
    const k = 0.8 + big * 0.22 + (mid - 0.5) * 0.3 + (g - 0.5) * 0.2 + (grit - 0.5) * 0.12 + (hashi(x, y, seed + 5) - 0.5) * 0.1;
    T.setc(i, pmix(base, [0.6, 0.55, 0.46], smoothstep(0.45, 0.75, mid) * 0.5), k * (1 - damp * 0.3));
    const sm = tw(u, v, 96, seed + 8);
    if (PW3[2] > 0.9 && PW3[0] < 0.22) { T.h[i] += dome(PW3[0], 0.22) * 0.4; T.mix(i, PW3[2] > 0.95 ? [0.36, 0.33, 0.3] : [0.78, 0.74, 0.66], 0.7); }
    if (peb > 0) T.mix(i, pmix([0.45, 0.42, 0.38], [0.66, 0.6, 0.52], PW3[1]), Math.min(1, peb * 2));
    T.r[i] = 0.97 - damp * 0.25;
  });
  return pbrFinish(T, { ao: 0.8, cavity: 0.45 });
}

// Sun-cracked clay: curled plates between deep cracks, dusty crust.
function pbrClay(seed, o = {}) {
  const T = new PTex(o.world ?? 192), n = T.n, base = o.base ?? [0.66, 0.45, 0.31];
  T.each((x, y, i, u, v) => {
    const wv = tw(u + tn(u, v, 8, 3, seed) * 0.03, v, 7, seed + 1), edge = PW3[1] - PW3[0], id = PW3[2];
    const crack = smoothstep(0.045, 0.008, edge);
    const curl = smoothstep(0.25, 0.04, edge) * 0.4;
    const fine = tn(u, v, 64, 3, seed + 2);
    T.h[i] = curl + fine * 0.1 - crack * 1.4 + (id - 0.5) * 0.3;
    const k = (0.86 + id * 0.12 + (fine - 0.5) * 0.2 + (tn(u, v, 20, 3, seed + 3) - 0.5) * 0.15) * (1 - crack * 0.55);
    T.setc(i, pmix(base, [0.76, 0.62, 0.48], smoothstep(0.5, 0.8, fine) * 0.5), k);
    T.r[i] = 0.95;
  });
  return pbrFinish(T, { ao: 1.0, cavity: 0.6 });
}

// Packed snow: soft drifts, wind scallops, footprints of the crew, blue in the hollows.
function pbrSnow(seed, o = {}) {
  const T = new PTex(o.world ?? 224), n = T.n;
  T.each((x, y, i, u, v) => {
    const drift = tn(u, v, 3, 5, seed), scal = tn(u, v, 12, 3, seed + 1), fine = tn(u, v, 96, 2, seed + 2);
    const ridge = Math.abs(Math.sin((v * 7 + drift * 2) * TAU)) * 0.3;
    const hgt = drift * 5 + scal * 1.6 + fine * 0.15 + ridge * 0.8;
    T.h[i] = hgt;
    const hollow = smoothstep(0.55, 0.3, drift * 0.7 + scal * 0.3);
    const k = 0.9 + (fine - 0.5) * 0.1 + (scal - 0.5) * 0.12;
    T.set(i, 0.8 * k, 0.83 * k, 0.88 * k);
    T.mix(i, [0.6, 0.68, 0.82], hollow * 0.5);
    const ice = smoothstep(0.72, 0.85, tn(u, v, 6, 4, seed + 3));
    T.mix(i, [0.66, 0.73, 0.8], ice * 0.55);
    // wind-blown grit in patches, and the odd dark speck
    T.mul(i, 1 - smoothstep(0.68, 0.9, tn(u, v, 24, 3, seed + 5)) * 0.16 - (hashi(x, y, seed + 6) > 0.994 ? 0.22 : 0));
    T.r[i] = 0.72 - ice * 0.45 + (hashi(x, y, seed + 4) > 0.985 ? -0.5 : 0);  // glints
  });
  return pbrFinish(T, { ao: 0.6, cavity: 0.45, normal: 1.8 });
}

// Asphalt: stone aggregate in bitumen, alligator cracking, darker patch repairs.
function pbrAsphalt(seed, o = {}) {
  const T = new PTex(o.world ?? 192), n = T.n;
  const cracks = crackMask(n, seed + 1, 6, 200, 0.9, 0.9);
  T.each((x, y, i, u, v) => {
    const agg = tw(u, v, 110, seed + 2), stone = smoothstep(0.42, 0.25, PW3[0]), sid = PW3[2];
    const alli = tw(u, v, 10, seed + 3), aedge = smoothstep(0.05, 0.01, PW3[1] - PW3[0]) * smoothstep(0.62, 0.78, tn(u, v, 4, 4, seed + 4));
    const patch = smoothstep(0.66, 0.68, tn(u, v, 3, 3, seed + 5)) * 0.6;
    const wear = tn(u, v, 6, 4, seed + 6);
    const crack = Math.max(cracks[i], aedge);
    T.h[i] = stone * 0.7 * (1 - patch * 0.5) - crack * 0.7 + wear * 0.15 + (tn(u, v, 220, 1, seed + 7) - 0.5) * 0.1;
    const bit = 0.2 + wear * 0.08;
    const sc = 0.32 + sid * 0.3;
    let k = lerp(bit, sc, stone * (0.6 + wear * 0.4) * (1 - patch * 0.7));
    k *= 1 - patch * 0.25;
    T.set(i, k * 1.0, k * 0.99, k * 0.97);
    T.r[i] = 0.9 - stone * 0.15 - patch * 0.1;
    if (crack > 0) T.mul(i, 1 - crack * 0.6);
  });
  return pbrFinish(T, { ao: 1.2, cavity: 0.5 });
}

// Rail ballast / gravel: angular stones with deep gaps.
function pbrBallast(seed, o = {}) {
  const T = new PTex(o.world ?? 64), n = T.n;
  T.each((x, y, i, u, v) => {
    const w1 = tw(u + tn(u, v, 6, 2, seed) * 0.02, v, o.cells ?? 13, seed + 1);
    const f1 = PW3[0], f2 = PW3[1], id = PW3[2];
    const gap = f2 - f1;
    const top = Math.pow(clamp(1 - f1 * 1.2, 0, 1), 0.6);
    const facet = tn(u, v, 48, 2, seed + 2);
    T.h[i] = top * 2.2 + facet * 0.3 - smoothstep(0.16, 0.0, gap) * 1.2;
    const tone = (0.34 + id * 0.3 + (facet - 0.5) * 0.12) * (0.75 + top * 0.3);
    const warm = hashi(Math.floor(id * 1000), 1, seed) > 0.55 ? 0.07 : hashi(Math.floor(id * 1000), 2, seed) > 0.8 ? -0.03 : 0;
    T.set(i, tone + warm, tone + warm * 0.55, tone - warm * 0.3);
    if (gap < 0.1) T.mul(i, 0.25 + gap * 7.5);
    T.r[i] = 0.88 - (facet - 0.5) * 0.1;
  });
  return pbrFinish(T, { ao: 0.25, cavity: 0.6 });
}

// Granite outcrop: sharp facets, cracks, lichen and frost.
function pbrRock(seed, o = {}) {
  const T = new PTex(o.world ?? 256), n = T.n, base = o.base ?? [0.47, 0.48, 0.5];
  const cracks = crackMask(n, seed + 1, 4, 120, 0.6, 0.7);
  T.each((x, y, i, u, v) => {
    const w1 = tw(u, v, 5, seed + 2), facetH = 1 - PW3[0] * 1.4, fid = PW3[2];
    const w2 = tw(u, v, 14, seed + 3), small = 1 - PW3[0];
    const grit = tn(u, v, 128, 2, seed + 4), speck = hashi(x, y, seed + 5);
    T.h[i] = facetH * 7 + small * 1.8 + grit * 0.4 - cracks[i] * 2.5;
    let k = 0.82 + fid * 0.22 + (grit - 0.5) * 0.16;
    T.setc(i, base, k);
    if (speck > 0.93) T.mix(i, [0.82, 0.8, 0.78], 0.5);
    else if (speck < 0.05) T.mix(i, [0.15, 0.15, 0.16], 0.5);
    const lichen = smoothstep(0.6, 0.78, tn(u, v, 18, 5, seed + 6)) * smoothstep(0.35, 0.8, grit) * (o.lichen ?? 0.6);
    T.mix(i, pmix([0.55, 0.58, 0.32], [0.7, 0.66, 0.38], grit), lichen * 0.75);
    const frost = smoothstep(0.62, 0.85, tn(u, v, 12, 5, seed + 7) * 0.7 + facetH * 0.35) * (o.frost ?? 0);
    T.mix(i, [0.86, 0.89, 0.93], frost * 0.7);
    T.r[i] = 0.8 - frost * 0.2 + lichen * 0.1;
    if (cracks[i] > 0) T.mul(i, 1 - cracks[i] * 0.3);
  });
  return pbrFinish(T, { ao: 0.5, cavity: 0.5 });
}

// ------------------------------------------------------------------------------------------
// Misc
// ------------------------------------------------------------------------------------------

// Glazed tiles: bevelled squares, grout lines, a few cracked or stained tiles.
function pbrTiles(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n, base = o.base ?? [0.64, 0.62, 0.57], cnt = o.count ?? 4, ts = n / cnt;
  const cracks = crackMask(n, seed + 1, 3, 70, 0.6, 0.8);
  T.each((x, y, i, u, v) => {
    const tx = Math.floor(x / ts), ty = Math.floor(y / ts), lx = x + 0.5 - tx * ts, ly = y + 0.5 - ty * ts;
    const e = Math.min(lx, ts - lx, ly, ts - ly) - 1.8, id = hashi(tx, ty, seed + 2);
    const grime = smoothstep(0.5, 0.85, tn(u, v, 5, 4, seed + 3));
    if (e > 0) {
      const bev = smoothstep(0, 3, e);
      T.h[i] = bev * 0.5 + (tn(u, v, 16, 2, seed + 4) - 0.5) * 0.02;
      T.setc(i, base, (0.92 + id * 0.12) * (1 - grime * 0.15));
      T.r[i] = 0.12 + grime * 0.35 + (id > 0.9 ? 0.2 : 0);
      if (cracks[i] > 0 && id > 0.5) { T.mul(i, 1 - cracks[i] * 0.6); T.h[i] -= cracks[i] * 0.3; }
    } else {
      T.h[i] = 0;
      T.setc(i, [0.48, 0.46, 0.42], 0.85 - grime * 0.25);
      T.r[i] = 0.95;
    }
  });
  return pbrFinish(T, { ao: 1.0, cavity: 0.4 });
}

// Hazard stripes painted on concrete, scuffed by tyres.
function pbrHazard(seed, o = {}) {
  const T = new PTex(o.world ?? 64), n = T.n;
  T.each((x, y, i, u, v) => {
    const s = ((u + v) * 4) % 1, yellow = s < 0.5;
    const wear = smoothstep(0.58, 0.78, tn2(u, v, 4, 24, 4, seed + 1) * 0.8 + tn(u, v, 32, 3, seed + 5) * 0.2 + (hashi(x, y, seed) - 0.5) * 0.12);
    const conc = 0.5 + (tn(u, v, 32, 3, seed + 2) - 0.5) * 0.12;
    T.h[i] = (1 - wear) * 0.08 + (tn(u, v, 64, 2, seed + 3) - 0.5) * 0.25;
    const paint = yellow ? [0.86, 0.66, 0.1] : [0.07, 0.07, 0.07];
    T.setc(i, paint, 0.92 + tn(u, v, 8, 3, seed + 4) * 0.12);
    T.mix(i, [conc, conc * 0.98, conc * 0.94], wear);
    T.r[i] = lerp(0.55, 0.9, wear);
  });
  return pbrFinish(T, { ao: 0.8, cavity: 0.4 });
}

// Burlap sandbags: basket weave of coarse fibres.
function pbrBurlap(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n, base = o.base ?? [0.6, 0.5, 0.33], f = o.threads ?? 56;
  T.each((x, y, i, u, v) => {
    const a = u * f, b = v * f;
    const wx = Math.sin(a * Math.PI), wy = Math.sin(b * Math.PI);
    const over = ((Math.floor(a) + Math.floor(b)) & 1) === 0;
    const thread = over ? Math.abs(wy) * (0.6 + 0.4 * Math.abs(wx)) : Math.abs(wx) * (0.6 + 0.4 * Math.abs(wy));
    const fuzz = tn(u, v, 256, 1, seed + 1);
    const dirt = smoothstep(0.4, 0.95, tn(u, v, 5, 4, seed + 2)) * 0.6;
    T.h[i] = thread * 0.5 + fuzz * 0.05;
    T.setc(i, base, (0.75 + thread * 0.3 + (fuzz - 0.5) * 0.15) * (1 - dirt * 0.3));
    T.r[i] = 0.98;
  });
  return pbrFinish(T, { ao: 1.4, cavity: 0.6 });
}

// The PBR set: texture name -> generator (and the world size its UVs use).
const PBR_DEFS = {
  concrete:       { world: 128, gen: () => pbrConcrete(11) },
  concrete_plain: { world: 128, gen: () => pbrConcrete(12, { base: [0.58, 0.57, 0.53], seams: false, ties: false, streaks: 0.12, pores: 500 }) },
  concrete_floor: { world: 160, gen: () => pbrConcreteFloor(13, { world: 160 }) },
  brick:          { world: 128, gen: () => pbrBrick(14) },
  plaster:        { world: 128, gen: () => pbrPlaster(15) },
  plaster_warm:   { world: 128, gen: () => pbrPlaster(79, { base: [0.8, 0.67, 0.52] }) },
  wood_floor:     { world: 128, gen: () => pbrPlanks(16, { varnish: 0.4 }) },
  timber:         { world: 96, gen: () => pbrPlanks(73, { world: 96, base: [0.33, 0.24, 0.16], boards: 5 }) },
  plywood:        { world: 128, gen: () => pbrPlywood(17) },
  diamond:        { world: 96, gen: () => pbrDiamond(18) },
  container:      { world: 128, gen: () => pbrCorrugated(19, { paint: [0.6, 0.18, 0.12] }) },
  container_blue: { world: 128, gen: () => pbrCorrugated(29, { paint: [0.17, 0.31, 0.46] }) },
  roof:           { world: 128, gen: () => pbrCorrugated(20, { ribs: 8, vertical: false, rust: 0.35 }) },
  shed:           { world: 128, gen: () => pbrCorrugated(74, { paint: [0.47, 0.5, 0.47], rust: 0.6 }) },
  shed_roof:      { world: 128, gen: () => pbrCorrugated(75, { ribs: 8, vertical: false, rust: 0.55 }) },
  hangar:         { world: 128, gen: () => pbrCorrugated(113, { paint: [0.68, 0.7, 0.71], rust: 0.25, chips: 0.4 }) },
  panel:          { world: 128, gen: () => pbrPanel(21) },
  paint_white:    { world: 128, gen: () => pbrPanel(114, { paint: [0.76, 0.78, 0.78], rust: 0.3 }) },
  paint_orange:   { world: 128, gen: () => pbrPanel(115, { paint: [0.82, 0.37, 0.12], rust: 0.3 }) },
  steel:          { world: 128, gen: () => pbrSteel(22) },
  rail:           { world: 28, gen: () => pbrPanel(23, { world: 28, panels: 1, paint: [0.86, 0.64, 0.12], chips: 1.2, rust: 0.5 }) },
  sand:           { world: 192, gen: () => pbrSand(24) },
  clay:           { world: 192, gen: () => pbrClay(103) },
  snow:           { world: 224, gen: () => pbrSnow(111) },
  asphalt:        { world: 192, gen: () => pbrAsphalt(71) },
  ballast:        { world: 64, gen: () => pbrBallast(72) },
  tiles:          { world: 128, gen: () => pbrTiles(25) },
  hazard:         { world: 64, gen: () => pbrHazard(26) },
  sandbag:        { world: 128, gen: () => pbrBurlap(27) },
  rock:           { world: 256, gen: () => pbrRock(112, { frost: 0.6 }) },
  firebrick:      { world: 128, gen: () => pbrBrick(101, { pal: [[0.42, 0.2, 0.13], [0.36, 0.17, 0.12], [0.48, 0.25, 0.16], [0.3, 0.15, 0.11]], mortarCol: [0.42, 0.39, 0.35], soot: 0.55, bloom: 0.05 }) },
  brick_yellow:   { world: 128, gen: () => pbrBrick(102, { pal: [[0.72, 0.6, 0.4], [0.66, 0.55, 0.36], [0.78, 0.66, 0.45], [0.62, 0.5, 0.33], [0.7, 0.56, 0.38]], mortarCol: [0.62, 0.6, 0.55], soot: 0.12, bloom: 0.25 }) },
};

// ------------------------------------------------------------------------------------------
// Weapon materials (replace the browser's 256 px gun textures): fine and uniform, because the
// viewmodels map them at close range. Normal maps are derived from them by the exporter.
// ------------------------------------------------------------------------------------------
function auxGun(seed, base, o = {}) {
  const n = 512, P = new Pix(n);
  P.map((x, y, c) => {
    const u = x / n, v = y / n;
    const fine = tn(u, v, 128, 2, seed) - 0.5, mid = tn(u, v, 12, 3, seed + 1) - 0.5, grain = hashi(x, y, seed + 2) - 0.5;
    let k = 1 + fine * (o.fine ?? 0.12) + mid * (o.mid ?? 0.1) + grain * (o.grain ?? 0.08);
    if (o.stipple && hashi(x >> 1, y >> 1, seed + 3) > 0.7) k *= 0.86;
    c[0] = base[0] * k; c[1] = base[1] * k; c[2] = base[2] * k;
  });
  if (o.scratches) {
    const rnd = mulberry32(seed + 9);
    P.stamp((ctx) => {
      ctx.lineCap = 'round';
      for (let i = 0; i < o.scratches; i++) {
        const x = rnd() * n, y = rnd() * n, a = rnd() * TAU, l = 6 + rnd() * 30;
        ctx.globalAlpha = 0.2 + rnd() * 0.5; ctx.lineWidth = 0.5 + rnd() * 0.8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    }, o.scratchCol || [0.45, 0.45, 0.46], 0.5);
  }
  return P.toCanvas();
}
function auxWood(seed) {
  const n = 512, P = new Pix(n);
  P.map((x, y, c) => {
    const u = x / n, v = y / n;
    const warp = tn2(u, v, 2, 6, 3, seed) * 3.0;
    const ring = Math.sin((u * 26 + warp) * Math.PI) * 0.5 + 0.5;
    const pores = hashi(x, y >> 2, seed + 1) > 0.9 ? -0.08 : 0;
    const k = 0.74 + ring * 0.2 + (tn2(u, v, 8, 48, 3, seed + 2) - 0.5) * 0.16 + pores + (hashi(x, y, seed + 3) - 0.5) * 0.03;
    c[0] = 0.42 * k; c[1] = 0.24 * k; c[2] = 0.12 * k;
  });
  return P.toCanvas();
}
const PBR_AUX = {
  gun_metal: () => auxGun(60, [0.2, 0.205, 0.215], { fine: 0.14, mid: 0.08, scratches: 40 }),
  gun_poly: () => auxGun(61, [0.095, 0.095, 0.1], { fine: 0.18, mid: 0.06, stipple: true }),
  gun_tan: () => auxGun(62, [0.55, 0.47, 0.34], { fine: 0.1, mid: 0.08, grain: 0.06 }),
  gun_wood: () => auxWood(69),
};

// ------------------------------------------------------------------------------------------
// Materials added for the large maps
// ------------------------------------------------------------------------------------------
// Salt crust on the evaporation pans: polygonal crust plates with raised rims, crystals, damp
// darker patches that are glossier.
function pbrSalt(seed, o = {}) {
  const T = new PTex(o.world ?? 192), n = T.n;
  T.each((x, y, i, u, v) => {
    const w1 = tw(u, v, 9, seed + 1), edge = PW3[1] - PW3[0], id = PW3[2];
    const rim = smoothstep(0.06, 0.0, edge);
    const fine = tn(u, v, 96, 2, seed + 2), big = tn(u, v, 4, 4, seed + 3);
    const damp = smoothstep(0.55, 0.8, tn(u, v, 5, 4, seed + 4)) * (o.damp ?? 0.7);
    T.h[i] = rim * 0.5 + fine * 0.15 + (id - 0.5) * 0.15 + big * 0.2;
    const k = 0.9 + id * 0.08 + (fine - 0.5) * 0.1 + rim * 0.08 + (hashi(x, y, seed + 5) > 0.985 ? 0.15 : 0);
    T.set(i, 0.88 * k, 0.86 * k, 0.82 * k);
    T.mix(i, [0.62, 0.6, 0.56], damp * 0.55);
    T.r[i] = 0.82 - damp * 0.5 - (hashi(x, y, seed + 6) > 0.97 ? 0.4 : 0);
  });
  return pbrFinish(T, { ao: 0.8, cavity: 0.4 });
}
// Packed earth with tyre ruts, pebbles and dry cracks.
function pbrDirt(seed, o = {}) {
  const T = new PTex(o.world ?? 192), n = T.n, base = o.base ?? [0.46, 0.38, 0.29];
  const cracks = crackMask(n, seed + 1, 4, 140, 0.6, 1.0);
  T.each((x, y, i, u, v) => {
    const big = tn(u, v, 3, 5, seed + 2), mid = tn(u, v, 14, 3, seed + 3), fine = tn(u, v, 96, 2, seed + 4);
    const rut = Math.max(0, Math.cos((u * 2 + tn(u, v, 2, 3, seed + 5) * 0.3) * TAU * 2)) ** 6 * 0.6;
    const peb = tw(u, v, 40, seed + 6), stone = PW3[2] > 0.86 ? dome(PW3[0], 0.3) : 0;
    T.h[i] = big * 1.2 + mid * 0.3 + fine * 0.1 - rut * 0.6 + stone * 0.5 - cracks[i] * 0.4;
    const k = 0.82 + big * 0.2 + (mid - 0.5) * 0.22 + (fine - 0.5) * 0.12;
    T.setc(i, base, k * (1 - rut * 0.15));
    if (stone > 0) T.mix(i, [0.55, 0.52, 0.48], Math.min(1, stone * 2));
    T.r[i] = 0.95 - rut * 0.1;
    if (cracks[i] > 0) T.mul(i, 1 - cracks[i] * 0.35);
  });
  return pbrFinish(T, { ao: 1.0, cavity: 0.5 });
}
// Cobblestones (granite setts) with sandy joints.
function pbrCobble(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n, rows = o.rows ?? 10, rh = n / rows;
  T.each((x, y, i, u, v) => {
    const row = Math.floor(y / rh), ly = y + 0.5 - row * rh, off = hashi(row, 0, seed) * n;
    const xs = (x + off) % n, bw = rh * 1.35, col = Math.floor(xs / bw), lx = xs + 0.5 - col * bw, cols = Math.floor(n / bw);
    const id = hashi(col % cols, row, seed + 1);
    const e = Math.min(lx, bw - lx, ly, rh - ly);
    const dom = smoothstep(0, rh * 0.28, e);
    const fine = tn(u, v, 64, 3, seed + 2);
    if (e > 2) {
      T.h[i] = dom * 1.3 + fine * 0.15 + (id - 0.5) * 0.3;
      T.setc(i, pmix([0.44, 0.43, 0.42], [0.55, 0.5, 0.45], id), 0.85 + fine * 0.25);
      T.r[i] = 0.7 - dom * 0.2;
    } else {
      T.h[i] = 0;
      T.setc(i, [0.42, 0.38, 0.31], 0.8 + fine * 0.2);
      T.r[i] = 0.95;
    }
  });
  return pbrFinish(T, { ao: 1.2, cavity: 0.55 });
}
// Clay roof tiles (pantiles) in overlapping courses.
function pbrRoofTiles(seed, o = {}) {
  const T = new PTex(o.world ?? 128), n = T.n, rows = o.rows ?? 8, cols = o.cols ?? 6, rh = n / rows, cw = n / cols;
  T.each((x, y, i, u, v) => {
    const row = Math.floor(y / rh), ly = (y - row * rh) / rh, lx = (x % cw) / cw;
    const id = hashi(Math.floor(x / cw), row, seed);
    const wave = Math.sin(lx * Math.PI) ** 0.7;
    T.h[i] = wave * 1.2 + ly * 0.8 - (ly > 0.94 ? 1.2 : 0);
    const k = (0.78 + id * 0.24) * (0.7 + ly * 0.35) * (0.9 + wave * 0.12);
    T.setc(i, pmix([0.6, 0.29, 0.18], [0.5, 0.3, 0.22], hashi(Math.floor(x / cw), row, seed + 1)), k);
    const lichen = smoothstep(0.65, 0.8, tn(u, v, 8, 4, seed + 2)) * 0.5;
    T.mix(i, [0.45, 0.46, 0.32], lichen);
    T.r[i] = 0.75;
  });
  return pbrFinish(T, { ao: 1.4, cavity: 0.5 });
}
// Blue ice / packed frozen snow, glossy with trapped bubbles and scratches.
function pbrIce(seed, o = {}) {
  const T = new PTex(o.world ?? 192), n = T.n;
  const scr = scratchMask(n, seed + 1, 60, 70, null, 0.5);
  T.each((x, y, i, u, v) => {
    const big = tn(u, v, 3, 5, seed + 2), mid = tn(u, v, 12, 3, seed + 3);
    T.h[i] = big * 0.8 + mid * 0.2 - scr[i] * 0.05;
    const k = 0.85 + big * 0.15;
    T.set(i, 0.62 * k, 0.74 * k, 0.86 * k);
    T.mix(i, [0.86, 0.9, 0.95], smoothstep(0.55, 0.8, mid) * 0.5 + scr[i] * 0.4);
    T.r[i] = 0.12 + mid * 0.15 + scr[i] * 0.3;
  });
  return pbrFinish(T, { ao: 0.4, cavity: 0.3 });
}
Object.assign(PBR_DEFS, {
  salt:       { world: 192, surf: 'sand', gen: () => pbrSalt(131) },
  dirt:       { world: 192, surf: 'sand', gen: () => pbrDirt(132) },
  cobble:     { world: 128, surf: 'concrete', gen: () => pbrCobble(133) },
  roof_tiles: { world: 128, surf: 'tile', gen: () => pbrRoofTiles(134) },
  ice:        { world: 192, surf: 'tile', gen: () => pbrIce(135) },
});
