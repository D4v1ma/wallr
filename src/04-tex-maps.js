// Textures for Kilnworks and Frostline: brick variants with soot, clay ground, snow, granite.

// Brick with a chosen palette and mortar; `soot` darkens it in rising streaks (kilns, chimneys).
function texBrickVariant(seed, pal, mortarCol = [0.6, 0.58, 0.53], soot = 0) {
  const W = 256, rowH = 32, bw = 64, mortar = 4, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W, row = Math.floor(y / rowH), off = (row & 1) * (bw / 2);
    const xs = (x + off) % W, bx = Math.floor(xs / bw), lx = xs % bw, ly = y % rowH;
    const dirt = 0.9 + 0.2 * fbm(u * 4, v * 4, 4, 4, 4, seed + 3);
    const sootK = soot ? 1 - soot * smoothstep(0.35, 0.75, fbm(u * 3, v * 1.5, 3, 2, 4, seed + 7) * 0.75 + (1 - v) * 0.35) : 1;
    if (ly < mortar || lx < mortar) {
      let k = (0.82 + fbm(u * 64, v * 64, 64, 64, 2, seed + 2) * 0.3) * dirt * sootK;
      if (ly < 2) k *= 0.62;
      c[0] = mortarCol[0] * k; c[1] = mortarCol[1] * k; c[2] = mortarCol[2] * k;
      return;
    }
    const col = pal[Math.floor(hashi(bx, row, seed) * pal.length)];
    let k = (1 + (fbm(u * 16, v * 16, 16, 16, 3, seed + 4) - 0.5) * 0.22 + (hashi(x, y, seed + 1) - 0.5) * 0.12) * dirt * sootK;
    if (ly < mortar + 2) k *= 1.1;
    if (ly > rowH - 3) k *= 0.82;
    if (lx > bw - 3) k *= 0.88;
    const chip = hashi(bx, row, seed + 9);
    if (chip > 0.62) { const dx = lx - (chip > 0.81 ? bw : mortar), dy = ly - mortar; if (dx * dx + dy * dy < 30 + 40 * (chip - 0.62)) k *= 0.62; }
    c[0] = col[0] * k; c[1] = col[1] * k; c[2] = col[2] * k;
  });
  return P.toCanvas();
}

// Dry red clay: blotchy, sun-cracked, with grit.
function texClay(seed) {
  const W = 256, P = new Pix(W), o = [0, 0, 0];
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const blot = fbm(u * 4, v * 4, 4, 4, 5, seed) - 0.5, hue = fbm(u * 2, v * 2, 2, 2, 3, seed + 1) - 0.5;
    worley(u * 7, v * 7, 7, seed + 2, o);
    const crack = 1 - smoothstep(0.0, 0.045, o[1] - o[0]) * 1;
    const fine = hashi(x, y, seed + 3) - 0.5;
    let k = 1 + blot * 0.26 + fine * 0.1 - crack * 0.32 * smoothstep(0.35, 0.6, fbm(u * 3, v * 3, 3, 3, 2, seed + 4));
    c[0] = 0.66 * k * (1 + hue * 0.1); c[1] = 0.42 * k * (1 - hue * 0.05); c[2] = 0.29 * k * (1 - hue * 0.12);
  });
  const rnd = mulberry32(seed + 5), peb = [];
  for (let i = 0; i < 90; i++) peb.push([rnd() * 256, rnd() * 256, 0.8 + rnd() * 1.6]);
  P.stamp((ctx) => { for (const [x, y, r] of peb) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); } }, [0.74, 0.6, 0.48], 0.7);
  return P.toCanvas();
}

// Packed snow: soft drifts, blue in the hollows, a few sparkles and scuffs.
function texSnow(seed) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const drift = fbm(u * 3, v * 3, 3, 3, 5, seed), ripple = Math.sin(TAU * (5 * u + 2 * v + fbm(u * 4, v * 4, 4, 4, 2, seed + 1) * 1.2)) * 0.5 + 0.5;
    const hollow = smoothstep(0.62, 0.3, drift);
    let k = 0.9 + drift * 0.14 + ripple * 0.025 + (hashi(x, y, seed + 2) - 0.5) * 0.05;
    if (hashi(x, y, seed + 3) > 0.996) k += 0.12;
    const scuff = smoothstep(0.62, 0.72, fbm(u * 6, v * 6, 6, 6, 3, seed + 4)) * 0.08;
    k -= scuff;
    c[0] = (0.76 - hollow * 0.1) * k; c[1] = (0.8 - hollow * 0.06) * k; c[2] = 0.86 * k;
  });
  return P.toCanvas();
}

// Granite: faceted cells with fake lighting, lichen speckle, frost in the cracks.
function texRock(seed, base = [0.46, 0.47, 0.49]) {
  const W = 256, P = new Pix(W), o = [0, 0, 0];
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    worley(u * 5, v * 5, 5, seed, o);
    const facet = 0.82 + hashi(Math.floor(o[2] * 997), 1, seed + 1) * 0.3, edge = smoothstep(0.0, 0.05, o[1] - o[0]);
    const grain = fbm(u * 24, v * 24, 24, 24, 3, seed + 2) - 0.5, speck = hashi(x, y, seed + 3);
    let k = facet * (0.72 + 0.28 * edge) + grain * 0.18 + (speck > 0.97 ? 0.12 : speck < 0.03 ? -0.1 : 0);
    let r = base[0] * k, g = base[1] * k, b = base[2] * k;
    if (edge < 0.4) { const f = (0.4 - edge) * 1.6; r += (0.82 - r) * f * 0.6; g += (0.86 - g) * f * 0.6; b += (0.92 - b) * f * 0.6; }   // frost in cracks
    if (fbm(u * 6, v * 6, 6, 6, 3, seed + 4) > 0.66) { r *= 0.92; g *= 0.98; b *= 0.82; }                                              // lichen
    c[0] = r; c[1] = g; c[2] = b;
  });
  return P.toCanvas();
}
