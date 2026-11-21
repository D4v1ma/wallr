// Tiling world textures, 256x256, generated from seeded noise.
// Convention: canvas top = world "up" on walls (three.js flips Y on upload).

function texConcrete(seed, base = [0.53, 0.52, 0.49], opt = {}) {
  const W = 256, P = new Pix(W);
  const streaks = opt.streaks ?? 0.16;
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const blot = fbm(u * 4, v * 4, 4, 4, 5, seed) - 0.5;
    const mid = fbm(u * 16, v * 16, 16, 16, 3, seed + 1) - 0.5;
    const grain = hashi(x, y, seed + 2) - 0.5;
    const streak = fbm(u * 32, v * 3, 32, 3, 3, seed + 3) - 0.5;
    let k = 1 + blot * 0.3 + mid * 0.12 + grain * 0.08 + streak * streaks;
    const pit = hashi(x, y, seed + 4);
    if (pit > 0.988) k *= 0.7; else if (pit < 0.005) k *= 1.12;
    if (opt.seams) {
      if (y < 2 || y > W - 2) k *= 0.78;
      else if (y === 2) k *= 1.06;
      if (x < 1 || x > W - 2) k *= 0.86;
    }
    c[0] = base[0] * k; c[1] = base[1] * k; c[2] = base[2] * k * (1 + blot * 0.05);
  });
  if (opt.ties) {
    const holes = [[64, 64], [192, 64], [64, 192], [192, 192]];
    P.stamp((ctx) => { ctx.lineWidth = 1.6; for (const [hx, hy] of holes) { ctx.beginPath(); ctx.arc(hx, hy + 1, 5.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); } }, [0.85, 0.84, 0.8], 0.3);
    P.stamp((ctx) => { for (const [hx, hy] of holes) { ctx.beginPath(); ctx.arc(hx, hy, 3.6, 0, TAU); ctx.fill(); } }, [0.1, 0.1, 0.1], 0.8);
  }
  return P.toCanvas();
}

function texConcreteFloor(seed) {
  const W = 256, P = new Pix(W), base = [0.5, 0.49, 0.46];
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const blot = fbm(u * 4, v * 4, 4, 4, 5, seed) - 0.5;
    const mid = fbm(u * 12, v * 12, 12, 12, 3, seed + 1) - 0.5;
    const grain = hashi(x, y, seed + 2) - 0.5;
    let k = 1 + blot * 0.26 + mid * 0.1 + grain * 0.07;
    const oil = fbm(u * 6, v * 6, 6, 6, 4, seed + 9);
    let warm = 0;
    if (oil > 0.6) { k *= 1 - (oil - 0.6) * 1.5; warm = (oil - 0.6) * 0.15; }
    // slab joints at the tile edges (128 units)
    if (x < 2 || y < 2) k *= 0.5;
    else if (x === 2 || y === 2) k *= 1.1;
    c[0] = base[0] * k * (1 + warm); c[1] = base[1] * k; c[2] = base[2] * k * (1 - warm);
  });
  const rnd = mulberry32(seed);
  P.shade((ctx) => {
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 256, y = rnd() * 256, a = rnd() * TAU, l = 6 + rnd() * 22;
      ctx.globalAlpha = 0.25 + rnd() * 0.5; ctx.lineWidth = 0.6 + rnd() * 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
  }, 0.8);
  return P.toCanvas();
}

function texBrick(seed) {
  const W = 256, rows = 8, rowH = 32, bw = 64, mortar = 4, P = new Pix(W);
  const pal = [[0.56, 0.28, 0.18], [0.5, 0.24, 0.16], [0.62, 0.33, 0.21], [0.45, 0.21, 0.14], [0.66, 0.4, 0.27], [0.53, 0.3, 0.22]];
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const row = Math.floor(y / rowH);
    const off = (row & 1) * (bw / 2);
    const xs = (x + off) % W;
    const bx = Math.floor(xs / bw);
    const lx = xs % bw, ly = y % rowH;
    const dirt = 0.9 + 0.2 * fbm(u * 4, v * 4, 4, 4, 4, seed + 3);
    const grain = hashi(x, y, seed + 1) - 0.5;
    if (ly < mortar || lx < mortar) {
      const n = fbm(u * 64, v * 64, 64, 64, 2, seed + 2);
      let k = (0.82 + n * 0.3) * dirt;
      if (ly < mortar && ly < 2) k *= 0.62;            // shadow under the brick above
      if (lx < mortar && ly >= mortar && lx < 2) k *= 0.8;
      c[0] = 0.6 * k; c[1] = 0.58 * k; c[2] = 0.53 * k;
      return;
    }
    const id = hashi(bx, row, seed);
    const col = pal[Math.floor(id * pal.length)];
    const bl = fbm(u * 16, v * 16, 16, 16, 3, seed + 4) - 0.5;
    let k = (1 + bl * 0.22 + grain * 0.12) * dirt;
    if (ly < mortar + 2) k *= 1.1;                       // lit top edge
    if (ly > rowH - 3) k *= 0.82;                        // shaded bottom edge
    if (lx > bw - 3) k *= 0.88;
    // chipped corners
    const chip = hashi(bx, row, seed + 9);
    if (chip > 0.62) {
      const cx = chip > 0.81 ? bw : mortar, cy = mortar;
      const dx = lx - cx, dy = ly - cy;
      if (dx * dx + dy * dy < 30 + 40 * (chip - 0.62)) k *= 0.62;
    }
    const burn = (hashi(bx, row, seed + 5) > 0.75) ? 1 - 0.25 * smoothstep(bw * 0.3, 0, Math.min(lx, bw - lx)) : 1;
    c[0] = col[0] * k * burn; c[1] = col[1] * k * burn; c[2] = col[2] * k * burn;
  });
  return P.toCanvas();
}

function texPlaster(seed, base = [0.74, 0.69, 0.6]) {
  const W = 256, P = new Pix(W), wv = [0, 0, 0];
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const blot = fbm(u * 4, v * 4, 4, 4, 5, seed) - 0.5;
    const mid = fbm(u * 24, v * 24, 24, 24, 2, seed + 1) - 0.5;
    const grit = vnoise(u * 128, v * 128, 128, 128, seed + 2) - 0.5;
    let k = 1 + blot * 0.22 + mid * 0.07 + grit * 0.1;
    const streak = fbm(u * 24, v * 2, 24, 2, 3, seed + 6) - 0.5;
    k += streak * 0.1;
    worley(u * 5, v * 5, 5, seed + 3, wv);
    const edge = wv[1] - wv[0];
    const crackGate = fbm(u * 6, v * 6, 6, 6, 3, seed + 5);
    if (edge < 0.022 && crackGate > 0.63) k *= 0.8 + edge * 9;
    const dmg = fbm(u * 4, v * 4, 4, 4, 4, seed + 8);
    if (dmg > 0.77) {
      // exposed brick underneath the render
      const ly = y % 16, row = (y >> 4), lx = (x + (row & 1) * 16) % 32;
      let bk = 0.85 + grit * 0.3;
      if (ly < 2 || lx < 2) bk *= 0.7;
      c[0] = 0.55 * bk; c[1] = 0.32 * bk; c[2] = 0.22 * bk;
      return;
    } else if (dmg > 0.745) {
      k *= 0.8;  // broken render lip casts a shadow
    }
    c[0] = base[0] * k; c[1] = base[1] * k; c[2] = base[2] * k;
  });
  return P.toCanvas();
}

function texWoodPlanks(seed, base = [0.56, 0.38, 0.22]) {
  const W = 256, ph = 32, P = new Pix(W);
  P.map((x, y, c) => {
    const row = Math.floor(y / ph), ly = y % ph;
    const seam = Math.floor(hashi(row, 0, seed) * W);
    const piece = (x - seam + W) % W < W / 2 ? 0 : 1;
    const id = hashi(row, piece, seed + 1);
    const tone = 0.82 + id * 0.32;
    const g = fbm(x / W * 2, y / W * 48, 2, 48, 4, seed + row * 3);
    const rings = Math.sin((y * 0.9 + g * 26 + id * 40) * 0.55) * 0.5 + 0.5;
    let k = tone * (0.86 + g * 0.24) * (0.9 + rings * 0.12);
    k *= 0.95 + 0.1 * (hashi(x, y, seed + 5) - 0.5);
    if (ly < 2) k *= 0.35;
    else if (ly === 2) k *= 1.12;
    else if (ly > ph - 2) k *= 0.8;
    const dj = Math.abs(((x - seam + W + W / 2) % W) - W / 2);
    if (dj < 1.5) k *= 0.4;
    c[0] = base[0] * k; c[1] = base[1] * k; c[2] = base[2] * k;
  });
  const pts = [];
  for (let r = 0; r < 8; r++) {
    const seam = Math.floor(hashi(r, 0, seed) * W);
    for (const dx of [-7, 7]) { const x = (seam + dx + W) % W; pts.push([x, r * ph + 10], [x, r * ph + 24]); }
  }
  P.stamp((ctx) => { for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); } }, [0.12, 0.1, 0.08], 0.85);
  return P.toCanvas();
}

function texPlywood(seed, base = [0.72, 0.58, 0.4]) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const warp = fbm(u * 3, v * 3, 3, 3, 3, seed) * 3;
    const g = Math.sin((v * 22 + warp) * TAU) * 0.5 + 0.5;
    const n = fbm(u * 2, v * 32, 2, 32, 3, seed + 1);
    let k = 0.86 + g * 0.1 + n * 0.12 + (hashi(x, y, seed + 2) - 0.5) * 0.05;
    c[0] = base[0] * k; c[1] = base[1] * k; c[2] = base[2] * k;
  });
  P.stamp((ctx) => { ctx.beginPath(); ctx.ellipse(70, 150, 9, 4, 0.1, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(196, 60, 6, 3, -0.1, 0, TAU); ctx.fill(); }, [0.38, 0.25, 0.14], 0.7);
  return P.toCanvas();
}

function texDiamondPlate(seed) {
  const W = 256, cell = 32, P = new Pix(W), base = 0.46;
  const L = [-0.62, -0.78];
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const brushed = fbm(u * 2, v * 64, 2, 64, 3, seed) - 0.5;
    const blot = fbm(u * 4, v * 4, 4, 4, 4, seed + 1) - 0.5;
    let k = 1 + brushed * 0.12 + blot * 0.2;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    const lx = (x % cell) - cell / 2 + 0.5, ly = (y % cell) - cell / 2 + 0.5;
    const s = ((cx + cy) & 1) ? 1 : -1;
    const a = (lx + s * ly) * 0.7071, b = (-s * lx + ly) * 0.7071;
    const e = (a / 11) * (a / 11) + (b / 3.6) * (b / 3.6);
    let rust = 0;
    if (e < 1) {
      const h = Math.sqrt(1 - e);
      const na = a / 121, nb = b / 12.96;
      const gx = (na - s * nb) * 0.7071, gy = (s * na + nb) * 0.7071;
      const gl = Math.hypot(gx, gy) + 1e-6;
      const lit = -(gx * L[0] + gy * L[1]) / gl * (1 - h);
      k *= 1.04 + lit * 0.55 + h * 0.12;
    } else if (e < 1.5) {
      const sd = (a * s * 0.2 + b) * 0.1;
      k *= 0.92 - Math.max(0, sd) * 0.15;
    }
    const r = fbm(u * 8, v * 8, 8, 8, 4, seed + 7);
    if (r > 0.64) rust = Math.min(1, (r - 0.64) * 4);
    const g = base * k;
    c[0] = lerp(g, 0.42, rust * 0.6); c[1] = lerp(g, 0.26, rust * 0.6); c[2] = lerp(g * 1.02, 0.15, rust * 0.6);
  });
  return P.toCanvas();
}

function texCorrugated(seed, paint = [0.6, 0.17, 0.12], ribs = 8, vertical = true) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const t = vertical ? u : v;
    const ph = t * ribs * TAU;
    const prof = Math.sin(ph);
    let k = 0.84 + 0.16 * prof + 0.12 * Math.pow(Math.max(0, Math.cos(ph - 0.6)), 8);
    const fade = fbm(u * 4, v * 4, 4, 4, 4, seed) - 0.5;
    k *= 1 + fade * 0.25;
    const rs = vertical ? fbm(u * 24, v * 2, 24, 2, 4, seed + 2) : fbm(u * 2, v * 24, 2, 24, 4, seed + 2);
    const rust = smoothstep(0.58, 0.8, rs);
    const chip = fbm(u * 16, v * 16, 16, 16, 3, seed + 4);
    let r = paint[0], g = paint[1], b = paint[2];
    if (chip > 0.745) { r = 0.36; g = 0.33; b = 0.3; }
    r = lerp(r, 0.38, rust); g = lerp(g, 0.21, rust); b = lerp(b, 0.12, rust);
    k *= 0.95 + (hashi(x, y, seed + 3) - 0.5) * 0.08;
    c[0] = r * k; c[1] = g * k; c[2] = b * k;
  });
  const rnd = mulberry32(seed + 11);
  P.stamp((ctx) => {
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const x = rnd() * 256, y = rnd() * 256, l = 8 + rnd() * 30, a = (rnd() - 0.5) * 0.6;
      ctx.lineWidth = 0.7; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
  }, [0.55, 0.53, 0.5], 0.6);
  return P.toCanvas();
}

function texMetalPanel(seed, paint = [0.35, 0.39, 0.33]) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const blot = fbm(u * 4, v * 4, 4, 4, 4, seed) - 0.5;
    const streak = fbm(u * 32, v * 3, 32, 3, 3, seed + 1) - 0.5;
    let k = 1 + blot * 0.22 + streak * 0.14 + (hashi(x, y, seed + 2) - 0.5) * 0.06;
    const chip = fbm(u * 10, v * 10, 10, 10, 4, seed + 3);
    let r = paint[0], g = paint[1], b = paint[2];
    if (chip > 0.72) { r = 0.5; g = 0.49; b = 0.47; }
    else if (chip > 0.69) k *= 0.75;
    const rust = smoothstep(0.62, 0.82, fbm(u * 20, v * 3, 20, 3, 3, seed + 5));
    r = lerp(r, 0.4, rust); g = lerp(g, 0.24, rust); b = lerp(b, 0.14, rust);
    const sx = x % 128, sy = y % 128;
    if (sx < 2 || sy < 2) k *= 0.45; else if (sx === 2 || sy === 2) k *= 1.15;
    c[0] = r * k; c[1] = g * k; c[2] = b * k;
  });
  const pts = [];
  for (let i = 0; i < 16; i++) { const t = i * 16 + 8; pts.push([7, t], [135, t], [t, 7], [t, 135]); }
  stampRivets(P, pts, 2.1, 0.42);
  return P.toCanvas();
}

function texSteel(seed, base = [0.4, 0.41, 0.42]) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const brushed = fbm(u * 2, v * 96, 2, 96, 2, seed) - 0.5;
    const blot = fbm(u * 4, v * 4, 4, 4, 4, seed + 1) - 0.5;
    const grime = smoothstep(0.55, 0.8, fbm(u * 8, v * 8, 8, 8, 4, seed + 2));
    let k = 1 + brushed * 0.12 + blot * 0.22 - grime * 0.3;
    c[0] = base[0] * k; c[1] = base[1] * k; c[2] = base[2] * k;
  });
  return P.toCanvas();
}

function texPaintedMetal(seed, paint) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const blot = fbm(u * 4, v * 4, 4, 4, 4, seed) - 0.5;
    let k = 1 + blot * 0.2 + (hashi(x, y, seed + 1) - 0.5) * 0.05;
    const chip = fbm(u * 12, v * 12, 12, 12, 4, seed + 2);
    let r = paint[0], g = paint[1], b = paint[2];
    if (chip > 0.68) { r = 0.22; g = 0.21; b = 0.2; } else if (chip > 0.655) k *= 0.8;
    const grime = smoothstep(0.55, 0.85, fbm(u * 6, v * 6, 6, 6, 3, seed + 3));
    k *= 1 - grime * 0.3;
    c[0] = r * k; c[1] = g * k; c[2] = b * k;
  });
  return P.toCanvas();
}

function texSand(seed) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const blot = fbm(u * 4, v * 4, 4, 4, 5, seed) - 0.5;
    const hue = fbm(u * 3, v * 3, 3, 3, 3, seed + 1) - 0.5;
    const warp = fbm(u * 4, v * 4, 4, 4, 3, seed + 2);
    const rip = Math.sin(TAU * (7 * u + 3 * v + warp * 1.5));
    const fine = hashi(x, y, seed + 3) - 0.5;
    const mid = vnoise(u * 64, v * 64, 64, 64, seed + 4) - 0.5;
    let k = 1 + blot * 0.24 + rip * 0.035 + fine * 0.12 + mid * 0.08;
    c[0] = 0.72 * k * (1 + hue * 0.08); c[1] = 0.63 * k; c[2] = 0.49 * k * (1 - hue * 0.1);
  });
  const rnd = mulberry32(seed + 5), peb = [];
  for (let i = 0; i < 140; i++) peb.push([rnd() * 256, rnd() * 256, 0.8 + rnd() * 1.8, rnd()]);
  P.stamp((ctx) => { for (const [x, y, r] of peb) { ctx.beginPath(); ctx.arc(x + 0.7, y + 0.8, r + 0.4, 0, TAU); ctx.fill(); } }, [0.3, 0.24, 0.16], 0.35);
  P.stamp((ctx) => { for (const [x, y, r, t] of peb) if (t < 0.6) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); } }, [0.5, 0.43, 0.34], 0.85);
  P.stamp((ctx) => { for (const [x, y, r, t] of peb) if (t >= 0.6) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); } }, [0.88, 0.8, 0.66], 0.85);
  return P.toCanvas();
}

function texTiles(seed, base = [0.62, 0.6, 0.55]) {
  const W = 256, t = 64, g = 3, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const tx = Math.floor(x / t), ty = Math.floor(y / t), lx = x % t, ly = y % t;
    const dirt = fbm(u * 4, v * 4, 4, 4, 4, seed) - 0.5;
    if (lx < g || ly < g) {
      const k = 0.62 + dirt * 0.3;
      c[0] = 0.5 * k; c[1] = 0.48 * k; c[2] = 0.44 * k;
      return;
    }
    const id = hashi(tx, ty, seed);
    let k = 0.92 + id * 0.12 + dirt * 0.14 + (hashi(x, y, seed + 1) - 0.5) * 0.04;
    if (lx < g + 2 || ly < g + 2) k *= 1.06;
    if (lx > t - 3 || ly > t - 3) k *= 0.9;
    c[0] = base[0] * k; c[1] = base[1] * k; c[2] = base[2] * k;
  });
  return P.toCanvas();
}

function texHazard(seed) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const s = ((x + y) % 64) < 32;
    const wear = fbm(u * 8, v * 8, 8, 8, 4, seed);
    let r = s ? 0.9 : 0.12, g = s ? 0.68 : 0.12, b = s ? 0.1 : 0.11;
    if (wear > 0.62) { const k = 0.5; r = k; g = k * 0.98; b = k * 0.92; }
    const n = 0.9 + 0.2 * fbm(u * 32, v * 32, 32, 32, 2, seed + 1);
    c[0] = r * n; c[1] = g * n; c[2] = b * n;
  });
  return P.toCanvas();
}

function texBurlap(seed) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const wx = Math.sin(x * Math.PI / 2) * 0.5 + 0.5, wy = Math.sin(y * Math.PI / 2) * 0.5 + 0.5;
    const weave = ((x >> 1) + (y >> 1)) & 1 ? wx : wy;
    const blot = fbm(u * 4, v * 4, 4, 4, 4, seed) - 0.5;
    let k = 0.82 + weave * 0.22 + blot * 0.24 + (hashi(x, y, seed) - 0.5) * 0.1;
    // bag seams every 64 px (sandbag rows/columns)
    const sy = y % 64, sx = (x + ((y >> 6) & 1) * 32) % 64;
    if (sy < 3 || sx < 3) k *= 0.55;
    else if (sy > 58) k *= 0.78;
    c[0] = 0.62 * k; c[1] = 0.53 * k; c[2] = 0.38 * k;
  });
  return P.toCanvas();
}
