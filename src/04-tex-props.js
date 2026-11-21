// Props, signage, decals, sprites and weapon skins + the texture registry.

function texCrate(seed, wood = [0.68, 0.52, 0.32], stencil = 'SF-04', sub = 'THIS SIDE UP') {
  const W = 256, B = 30, S = W - 2 * B, BR = 34, P = new Pix(W);
  P.map((x, y, c) => {
    let along, across, id, edge, k = 1;
    if (y < B || y >= W - B) {
      const y0 = y < B ? 0 : W - B;
      along = x; across = y; id = y < B ? 1 : 2; edge = Math.min(y - y0, y0 + B - 1 - y);
    } else if (x < B || x >= W - B) {
      const x0 = x < B ? 0 : W - B;
      along = y; across = x; id = x < B ? 3 : 4; edge = Math.min(x - x0, x0 + B - 1 - x);
    } else {
      const ix = x - B, iy = y - B, dd = (ix + iy - S) * 0.7071;
      if (Math.abs(dd) < BR / 2) {
        along = (ix - iy) * 0.7071 + 200; across = dd + 100; id = 5; edge = BR / 2 - Math.abs(dd);
      } else {
        const pw = S / 4, pi = Math.floor(ix / pw), lx = ix - pi * pw;
        along = y; across = x; id = 6 + pi; edge = Math.min(lx, pw - lx);
        k *= 0.8;
        if (dd > 0 && dd < BR / 2 + 7) k *= 0.72;          // brace shadow
        if (iy < 6 || ix < 6) k *= 0.8;                    // frame shadow
      }
    }
    const tone = 0.84 + hashi(id, 0, seed) * 0.3;
    const g = fbm(along / 64, across / 5, 64, 64, 4, seed + id * 7);
    const rings = Math.sin((across * 0.8 + g * 22) * 0.7) * 0.5 + 0.5;
    k *= tone * (0.84 + g * 0.26) * (0.92 + rings * 0.1);
    k *= 0.96 + (hashi(x, y, seed + 3) - 0.5) * 0.08;
    if (edge < 1.5) k *= 0.42; else if (edge < 3.5) k *= 0.78;
    c[0] = wood[0] * k; c[1] = wood[1] * k; c[2] = wood[2] * k;
  });
  const nails = [];
  for (const [cx, cy] of [[15, 15], [241, 15], [15, 241], [241, 241]]) nails.push([cx - 6, cy], [cx + 6, cy], [cx, cy - 6], [cx, cy + 6]);
  stampRivets(P, nails, 1.7, 0.36);
  P.stamp((ctx) => {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `44px ${STENCIL_FONT}`; ctx.fillText(stencil, 128, 156);
    ctx.font = `17px ${STENCIL_FONT}`; ctx.fillText(sub, 128, 194);
  }, [0.12, 0.1, 0.08], 0.7, 0.6, seed + 20);
  return P.toCanvas();
}

function texDoor(seed, paint = [0.24, 0.4, 0.37], metal = false) {
  const W = 256, H = 512, P = new Pix(W, H), st = 34;
  const panels = [[st, 36, 120, 232], [136, 36, W - st, 232], [st, 280, 120, 470], [136, 280, W - st, 470]];
  P.map((x, y, c) => {
    const u = x / W, v = y / H;
    const grain = metal ? fbm(u * 2, v * 64, 2, 64, 2, seed) : fbm(u * 3, v * 40, 3, 40, 4, seed);
    let k = 0.9 + grain * 0.18 + (hashi(x, y, seed + 1) - 0.5) * 0.05;
    for (const [x0, y0, x1, y1] of panels) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        k *= 0.9;
        const dl = x - x0, dr = x1 - 1 - x, dt = y - y0, db = y1 - 1 - y;
        const m = Math.min(dl, dr, dt, db);
        if (m < 7) { if (m === dt || m === dl) k *= 0.68; else k *= 1.14; }
        break;
      }
    }
    const chip = fbm(u * 10, v * 20, 10, 20, 4, seed + 2);
    let r = paint[0], g = paint[1], b = paint[2];
    if (chip > 0.66) { if (metal) { r = 0.45; g = 0.44; b = 0.42; } else { r = 0.5; g = 0.35; b = 0.2; } }
    else if (chip > 0.64) k *= 0.78;
    const grime = smoothstep(0.75, 1, v) * 0.3 + smoothstep(0.1, 0, Math.hypot(u - 0.86, v - 0.52)) * 0.25;
    k *= 1 - grime;
    c[0] = r * k; c[1] = g * k; c[2] = b * k;
  });
  P.stamp((ctx) => { ctx.fillRect(8, 478, W - 16, 30); }, [0.46, 0.46, 0.44], 0.95);
  P.stamp((ctx) => { ctx.fillRect(W - 30, 232, 16, 66); }, [0.16, 0.15, 0.14], 0.95);
  P.stamp((ctx) => { ctx.fillRect(W - 70, 256, 52, 9); }, [0.55, 0.54, 0.5], 0.95);
  P.stamp((ctx) => { ctx.fillRect(W - 70, 263, 52, 3); }, [0.1, 0.1, 0.1], 0.6);
  P.stamp((ctx) => { ctx.beginPath(); ctx.arc(W - 22, 284, 3, 0, TAU); ctx.fill(); ctx.fillRect(W - 23, 284, 2, 7); }, [0.02, 0.02, 0.02], 0.9);
  return P.toCanvas();
}

function texBarrel(seed, paint = [0.17, 0.31, 0.52]) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const blot = fbm(u * 4, v * 4, 4, 4, 4, seed) - 0.5;
    let k = 1 + blot * 0.22 + (hashi(x, y, seed + 1) - 0.5) * 0.05;
    let r = paint[0], g = paint[1], b = paint[2];
    for (const ry of [85, 171]) {
      const d = y - ry;
      if (Math.abs(d) < 6) k *= d < 0 ? 1.25 - (d + 6) * 0.02 : 0.7 + d * 0.02;
    }
    const rim = y < 9 || y > 246;
    if (rim) { r = 0.3; g = 0.3; b = 0.3; k *= y < 4 || y > 251 ? 1.2 : 0.75; }
    const rustN = fbm(u * 12, v * 12, 12, 12, 4, seed + 2);
    const rust = smoothstep(0.55, 0.8, rustN + smoothstep(0.75, 1, Math.abs(v - 0.5) * 2) * 0.25);
    const chip = fbm(u * 16, v * 16, 16, 16, 3, seed + 3) > 0.7;
    if (chip) { r = 0.35; g = 0.34; b = 0.33; }
    r = lerp(r, 0.4, rust); g = lerp(g, 0.22, rust); b = lerp(b, 0.12, rust);
    c[0] = r * k; c[1] = g * k; c[2] = b * k;
  });
  for (const lx of [64, 192]) {
    P.stamp((ctx) => { ctx.beginPath(); ctx.moveTo(lx, 98); ctx.lineTo(lx + 30, 128); ctx.lineTo(lx, 158); ctx.lineTo(lx - 30, 128); ctx.closePath(); ctx.fill(); }, [0.08, 0.07, 0.06], 0.9, 0.3, seed + 4);
    P.stamp((ctx) => { ctx.beginPath(); ctx.moveTo(lx, 102); ctx.lineTo(lx + 26, 128); ctx.lineTo(lx, 154); ctx.lineTo(lx - 26, 128); ctx.closePath(); ctx.fill(); }, [0.92, 0.48, 0.1], 0.95, 0.45, seed + 5);
    P.stamp((ctx) => { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `22px ${STENCIL_FONT}`; ctx.fillText('3', lx, 132); }, [0.08, 0.07, 0.06], 0.9, 0.3, seed + 6);
  }
  return P.toCanvas();
}

function texBarrelTop(seed) {
  const W = 128, P = new Pix(W);
  P.map((x, y, c) => {
    const dx = x - 64, dy = y - 64, r = Math.sqrt(dx * dx + dy * dy);
    let k = 0.42 + fbm(x / 32, y / 32, 4, 4, 3, seed) * 0.12;
    for (const rr of [18, 34, 50, 60]) if (Math.abs(r - rr) < 1.6) k *= r < rr ? 1.25 : 0.65;
    if (r > 61) k *= 0.6;
    c[0] = k * 0.95; c[1] = k * 0.96; c[2] = k;
  });
  P.stamp((ctx) => { ctx.beginPath(); ctx.arc(40, 44, 7, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(86, 90, 5, 0, TAU); ctx.fill(); }, [0.22, 0.22, 0.22], 0.9);
  return P.toCanvas();
}

function texTargetPlate(seed, reset = false) {
  const W = 128, P = new Pix(W), base = reset ? [0.72, 0.13, 0.1] : [0.86, 0.85, 0.8];
  P.map((x, y, c) => {
    let k = 0.94 + fbm(x / 32, y / 32, 4, 4, 3, seed) * 0.1 + (hashi(x, y, seed) - 0.5) * 0.04;
    const e = Math.min(x, y, W - 1 - x, W - 1 - y);
    if (e < 3) k *= 0.5; else if (e < 5) k *= 0.8;
    c[0] = base[0] * k; c[1] = base[1] * k; c[2] = base[2] * k;
  });
  if (reset) {
    P.stamp((ctx) => { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `30px ${STENCIL_FONT}`; ctx.fillText('RESET', 64, 58); ctx.font = `14px ${STENCIL_FONT}`; ctx.fillText('SHOOT TO WIPE', 64, 86); }, [0.95, 0.92, 0.86], 0.95, 0.25, seed + 1);
  } else {
    P.stamp((ctx) => { ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(64, 64, 40, 0, TAU); ctx.stroke(); }, [0.72, 0.12, 0.1], 0.95, 0.25, seed + 2);
    P.stamp((ctx) => { ctx.beginPath(); ctx.arc(64, 64, 20, 0, TAU); ctx.fill(); }, [0.08, 0.08, 0.08], 0.95, 0.2, seed + 3);
  }
  return P.toCanvas();
}

function texPaperBoard(seed) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const e = Math.min(x, y, W - 1 - x, W - 1 - y);
    if (e < 10) {
      const k = 0.85 + fbm(x / 64, y / 4, 4, 64, 3, seed) * 0.2;
      c[0] = 0.66 * k; c[1] = 0.52 * k; c[2] = 0.35 * k;
      return;
    }
    let k = 0.96 + (hashi(x, y, seed) - 0.5) * 0.03 + (fbm(x / 64, y / 64, 4, 4, 3, seed + 1) - 0.5) * 0.06;
    if ((x - 10) % 16 === 0 || (y - 10) % 16 === 0) k *= 0.86;
    c[0] = 0.92 * k; c[1] = 0.91 * k; c[2] = 0.86 * k;
  });
  P.stamp((ctx) => { ctx.lineWidth = 1.6; for (const r of [24, 48, 72, 96]) { ctx.beginPath(); ctx.arc(128, 128, r, 0, TAU); ctx.stroke(); } }, [0.1, 0.1, 0.1], 0.85);
  P.stamp((ctx) => { ctx.beginPath(); ctx.arc(128, 128, 12, 0, TAU); ctx.fill(); }, [0.7, 0.1, 0.08], 0.95);
  P.stamp((ctx) => {
    ctx.font = `12px ${STENCIL_FONT}`; ctx.textAlign = 'center';
    ctx.fillText('SPREAD BOARD · 256u', 128, 238);
    for (const [r, n] of [[24, '10'], [48, '8'], [72, '6'], [96, '4']]) ctx.fillText(n, 128 + r - 10, 124);
  }, [0.12, 0.12, 0.12], 0.9);
  return P.toCanvas();
}

function texSign(lines, bg, fg, seed, opt = {}) {
  const W = 256, H = 128, P = new Pix(W, H);
  P.map((x, y, c) => {
    const k = 0.9 + fbm(x / 64, y / 64, 4, 2, 3, seed) * 0.18 + (hashi(x, y, seed) - 0.5) * 0.04;
    c[0] = bg[0] * k; c[1] = bg[1] * k; c[2] = bg[2] * k;
  });
  P.stamp((ctx) => { ctx.lineWidth = 5; ctx.strokeRect(9, 9, W - 18, H - 18); }, fg, 0.9, 0.3, seed + 1);
  P.stamp((ctx) => {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((t, i) => {
      const big = i === 0;
      ctx.font = `${big ? (opt.big || 40) : (opt.small || 18)}px ${STENCIL_FONT}`;
      const yy = n === 1 ? 64 : (big ? 52 : 52 + 22 + (i - 1) * 20);
      ctx.fillText(t, 128, yy, 220);
    });
  }, fg, 0.95, 0.35, seed + 2);
  stampRivets(P, [[18, 18], [W - 18, 18], [18, H - 18], [W - 18, H - 18]], 2.4, 0.5);
  return P.toCanvas();
}

// Plant-site plate: big stencilled letter in a ring on safety orange.
function texSiteSign(letter, seed) {
  const W = 128, P = new Pix(W);
  P.map((x, y, c) => {
    const k = 0.9 + fbm(x / 32, y / 32, 4, 4, 3, seed) * 0.2 + (hashi(x, y, seed) - 0.5) * 0.06;
    c[0] = 0.86 * k; c[1] = 0.44 * k; c[2] = 0.1 * k;
  });
  const ink = [0.08, 0.07, 0.06];
  P.stamp((ctx) => { ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(64, 56, 38, 0, TAU); ctx.stroke(); }, ink, 0.95, 0.35, seed + 1);
  P.stamp((ctx) => {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `58px ${STENCIL_FONT}`; ctx.fillText(letter, 64, 59);
    ctx.font = `12px ${STENCIL_FONT}`; ctx.fillText('CHARGE SITE', 64, 112);
  }, ink, 0.95, 0.35, seed + 2);
  stampRivets(P, [[10, 10], [118, 10], [10, 118], [118, 118]], 2.2, 0.5);
  return P.toCanvas();
}

// Freight wagon side (fit): ribbed rusty body, sliding door, stencilled marks, hazard placard.
function texWagon(seed, paint = [0.44, 0.21, 0.13]) {
  const W = 256, H = 128, P = new Pix(W, H);
  P.map((x, y, c) => {
    const u = x / W, v = y / H, rib = x % 18;
    let k = 0.88 + fbm(u * 6, v * 3, 6, 3, 3, seed) * 0.2 + (hashi(x, y, seed) - 0.5) * 0.05;
    if (rib < 2) k *= 1.18; else if (rib < 4) k *= 0.72;
    k *= 1 - smoothstep(0.55, 1, fbm(u * 24, v * 2, 24, 2, 3, seed + 1)) * 0.25 * v;   // rust runs
    if (y < 6 || y > H - 8) k *= 0.6;
    c[0] = paint[0] * k; c[1] = paint[1] * k; c[2] = paint[2] * k;
  });
  const ink = [0.9, 0.86, 0.76];
  P.stamp((ctx) => { ctx.fillRect(98, 10, 60, 112); }, [paint[0] * 0.8, paint[1] * 0.8, paint[2] * 0.8], 0.9);
  P.stamp((ctx) => { ctx.lineWidth = 3; ctx.strokeRect(98, 10, 60, 112); ctx.fillRect(150, 58, 4, 16); }, [0.12, 0.08, 0.06], 0.9);
  P.stamp((ctx) => {
    ctx.font = `15px ${STENCIL_FONT}`; ctx.fillText('SPX 40217', 14, 104);
    ctx.font = `8px ${STENCIL_FONT}`; ctx.fillText('CAP 60T · TARE 22T', 14, 116); ctx.fillText('SALTPAN DEPOT', 176, 116);
  }, ink, 0.92, 0.35, seed + 2);
  P.stamp((ctx) => { ctx.beginPath(); ctx.moveTo(212, 30); ctx.lineTo(228, 46); ctx.lineTo(212, 62); ctx.lineTo(196, 46); ctx.closePath(); ctx.fill(); }, [0.92, 0.66, 0.1], 0.95, 0.2, seed + 3);
  return P.toCanvas();
}

// Window (fit): steel frame, four dusty panes with a sky reflection.
function texWindow(seed) {
  const W = 128, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W, frame = x < 7 || x > W - 8 || y < 7 || y > W - 8 || Math.abs(x - 64) < 3 || Math.abs(y - 64) < 3;
    if (frame) { const k = 0.85 + (hashi(x, y, seed) - 0.5) * 0.08; c[0] = 0.5 * k; c[1] = 0.52 * k; c[2] = 0.5 * k; return; }
    const refl = clamp(1 - Math.abs((u - v) * 1.6 - 0.1), 0, 1) * 0.35, dust = fbm(u * 5, v * 5, 5, 5, 3, seed + 1) * 0.12 + v * 0.1;
    c[0] = 0.1 + refl * 0.5 + dust; c[1] = 0.13 + refl * 0.55 + dust; c[2] = 0.17 + refl * 0.6 + dust * 0.9;
  });
  return P.toCanvas();
}

function texLabelBox(num, seed) {
  const W = 128, P = new Pix(W);
  P.map((x, y, c) => {
    const k = 0.92 + fbm(x / 32, y / 32, 4, 4, 4, seed) * 0.16 + (hashi(x, y, seed) - 0.5) * 0.08;
    c[0] = 0.55 * k; c[1] = 0.54 * k; c[2] = 0.5 * k;
  });
  P.stamp((ctx) => { ctx.fillRect(0, 0, W, 12); }, [0.88, 0.66, 0.12], 0.95, 0.4, seed + 1);
  P.stamp((ctx) => { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `58px ${STENCIL_FONT}`; ctx.fillText(num, 64, 66); ctx.font = `13px ${STENCIL_FONT}`; ctx.fillText('UNITS', 64, 106); }, [0.92, 0.7, 0.14], 0.95, 0.4, seed + 2);
  return P.toCanvas();
}

// Bullet-hole atlas for 2x modulate blending: 0.5 grey is neutral.
function texDecalAtlas() {
  const W = 256, P = new Pix(W).fill(0.5, 0.5, 0.5);
  P.map((x, y, c) => {
    const cell = (x >> 7) + (y >> 7) * 2, lx = (x & 127) - 63.5, ly = (y & 127) - 63.5;
    const r = Math.hypot(lx, ly), ang = Math.atan2(ly, lx);
    const jag = 1 + 0.35 * (vnoise((ang / TAU + 0.5) * 12, cell * 3.1, 12, 64, 77) - 0.5);
    const edgeFade = smoothstep(62, 50, r);
    let v = 0.5;
    if (cell === 0) {            // stone / concrete / brick
      const rh = 22 * jag;
      if (r < rh * 0.42) v = 0.05;
      else if (r < rh) v = 0.18 + (r / rh) * 0.16;
      else if (r < rh * 1.55) v = vnoise(ang * 3, r * 0.15, 64, 64, 5) > 0.45 ? 0.66 : 0.42;
      else v = 0.5 - 0.07 * smoothstep(rh * 2.7, rh * 1.55, r);
    } else if (cell === 1) {     // wood / paper: dark hole + splinters along the grain
      const rh = 17 * jag, sr = Math.hypot(lx * 0.78, ly * 1.15);
      if (sr < rh * 0.55) v = 0.05;
      else if (sr < rh) v = 0.28;
      else {
        const spl = Math.abs(Math.sin(ang * 5 + vnoise(ang * 2, 0, 64, 64, 9) * 4));
        if (r < rh * 2.8 && spl > 0.84 && Math.abs(ly) > Math.abs(lx) * 0.55) v = 0.68;
        else v = 0.5 - 0.06 * smoothstep(rh * 2.6, rh, r);
      }
    } else if (cell === 2) {     // metal: dent with bright exposed ring and soot
      const j = jag;
      if (r < 8 * j) v = 0.08;
      else if (r < 17 * j) v = 0.84 - (r - 8 * j) * 0.018;
      else if (r < 30 * j) v = 0.36 + (r - 17 * j) * 0.008;
      else v = 0.5;
    } else {                     // soft surfaces: smudge
      v = 0.5 - 0.2 * smoothstep(36 * jag, 4, r);
    }
    v = lerp(0.5, v, edgeFade);
    c[0] = v; c[1] = v; c[2] = v * (cell === 1 ? 0.96 : 1);
  });
  return P.toCanvas();
}

// RGBA sprite atlas (white, tinted per particle): 0 glow, 1 smoke, 2 spark, 3 flash star.
function texSpriteAtlas() {
  const W = 256, cv = makeCanvas(W), ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, W), o = img.data;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const cell = (x >> 7) + (y >> 7) * 2, lx = ((x & 127) - 63.5) / 64, ly = ((y & 127) - 63.5) / 64;
      const r = Math.hypot(lx, ly);
      let a = 0, col = 1;
      if (cell === 0) a = Math.pow(clamp(1 - r, 0, 1), 2.2);
      else if (cell === 1) {
        const n = fbm((lx + 1) * 3, (ly + 1) * 3, 64, 64, 4, 91);
        a = clamp(1 - r * 1.05, 0, 1); a = a * a * (0.45 + n * 0.9); a = clamp(a * 1.3, 0, 1);
        col = 0.8 + n * 0.25;
      } else if (cell === 2) a = Math.pow(clamp(1 - Math.hypot(lx * 0.35, ly * 2.2), 0, 1), 1.6);
      else {
        const ang = Math.atan2(ly, lx);
        const spikes = Math.pow(Math.abs(Math.cos(ang * 3)), 10) * 0.75 + Math.pow(Math.abs(Math.cos(ang * 3 + 0.52)), 30) * 0.4;
        const n = vnoise((ang / TAU + 0.5) * 16, r * 4, 16, 64, 33);
        const reach = 0.25 + spikes * (0.6 + n * 0.3);
        a = clamp(1 - r / reach, 0, 1); a = Math.pow(a, 1.3);
        a = Math.max(a, Math.pow(clamp(1 - r / 0.32, 0, 1), 1.5));
      }
      const i = (y * W + x) * 4;
      o[i] = 255 * col; o[i + 1] = 255 * col; o[i + 2] = 255 * col; o[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function texGunMetal(seed) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    let k = 0.27 + fbm(u * 8, v * 8, 8, 8, 4, seed) * 0.06 + (hashi(x, y, seed) - 0.5) * 0.03;
    const wear = smoothstep(0.66, 0.8, fbm(u * 6, v * 6, 6, 6, 4, seed + 1));
    k += wear * 0.16;
    c[0] = k; c[1] = k * 1.02; c[2] = k * 1.05;
  });
  return P.toCanvas();
}

function texPolymer(seed, tint = [1, 1, 1]) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    let k = 0.19 + (vnoise(x / 2, y / 2, 128, 128, seed) - 0.5) * 0.05 + fbm(x / 64, y / 64, 4, 4, 3, seed + 1) * 0.04;
    if (hashi(x >> 1, y >> 1, seed + 2) > 0.82) k *= 0.75;
    c[0] = k * tint[0]; c[1] = k * tint[1]; c[2] = k * tint[2];
  });
  return P.toCanvas();
}

function texGlove(seed, base = [0.52, 0.42, 0.3]) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const weave = ((x + y) % 4 < 2 ? 0.94 : 1.04) * ((x - y + 512) % 4 < 2 ? 0.97 : 1.02);
    const k = (0.85 + fbm(x / 64, y / 64, 4, 4, 4, seed) * 0.3) * weave;
    c[0] = base[0] * k; c[1] = base[1] * k; c[2] = base[2] * k;
  });
  P.stamp((ctx) => { ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; for (const yy of [40, 120, 200]) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(256, yy); ctx.stroke(); } }, [0.12, 0.11, 0.09], 0.7);
  return P.toCanvas();
}

// First-person sleeve per team. UV v runs wrist (0) -> elbow (1), u wraps round the arm.
// Raiders wear sand fatigues rolled above the forearm (skin shows); Wardens a navy twill with a cuff.
function texSleeve(seed, team) {
  const W = 256, P = new Pix(W), raider = team === 0;
  const fab = raider ? [0.6, 0.53, 0.4] : [0.21, 0.26, 0.35], skin = [0.7, 0.53, 0.4];
  P.map((x, y, c) => {
    const u = x / W, v = 1 - (y + 0.5) / W;      // canvas rows are flipped relative to UV v
    const twill = (x + y) % 4 < 2 ? 0.95 : 1.04;
    const crease = (fbm(u * 2, v * 9, 2, 9, 3, seed) - 0.5) * 0.34;   // soft wrinkles across the arm
    let k = (0.9 + fbm(u * 4, v * 4, 4, 4, 4, seed + 1) * 0.16 + crease) * twill;
    let col = fab;
    if (raider) {
      if (v < 0.4) {                                   // bare forearm
        col = skin;
        k = 0.92 + (fbm(u * 3, v * 3, 3, 3, 3, seed + 2) - 0.5) * 0.12 + (hashi(x, y, seed) - 0.5) * 0.05;
        if (hashi(x, y, seed + 3) > 0.985) k *= 0.82;  // hair and freckles
        k *= 1 - smoothstep(0.3, 0.4, v) * 0.35;        // shadow under the roll
      } else if (v < 0.57) {                           // rolled cuff: three fat folds
        const f = ((v - 0.4) / 0.17) * 3, t = f - Math.floor(f);
        k = (0.8 + Math.sin(t * Math.PI) * 0.32) * twill * (0.94 + hashi(x >> 2, Math.floor(f), seed) * 0.1);
      } else k *= 1 - smoothstep(0.62, 0.57, v) * 0.18;
    } else {
      if (v < 0.075) k *= 0.82;                        // cuff band
      if (Math.abs(v - 0.08) < 0.006 && (x % 6) < 3) k *= 0.6;   // cuff stitching
      if (Math.abs(u - 0.75) < 0.008) k *= 0.72;      // inner seam
    }
    c[0] = col[0] * k; c[1] = col[1] * k; c[2] = col[2] * k;
  });
  return P.toCanvas();
}

// Oiled walnut for gun furniture: flowing grain along v, darker figure lines.
function texGunWood(seed) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    const warp = fbm(u * 2, v * 6, 2, 6, 3, seed) * 3.2;
    const ring = Math.sin((u * 22 + warp) * Math.PI) * 0.5 + 0.5;
    const k = 0.7 + ring * 0.24 + (fbm(u * 8, v * 32, 8, 32, 3, seed + 1) - 0.5) * 0.2 + (hashi(x, y, seed) - 0.5) * 0.04;
    c[0] = 0.45 * k; c[1] = 0.26 * k; c[2] = 0.14 * k;
  });
  return P.toCanvas();
}

function texBlade(seed) {
  const W = 256, H = 128, P = new Pix(W, H);
  P.map((x, y, c) => {
    const u = x / W, v = y / H;
    let k = 0.6 + (fbm(u * 2, v * 48, 2, 48, 3, seed) - 0.5) * 0.16 + (hashi(x, y, seed) - 0.5) * 0.04;
    if (v > 0.72) k += 0.2 + (v - 0.72) * 0.5;                       // ground edge bevel
    else if (v > 0.68) k -= 0.12;
    if (Math.abs(v - 0.34) < 0.035) k -= 0.22; else if (Math.abs(v - 0.39) < 0.02) k += 0.12; // fuller groove
    if (v < 0.06) k -= 0.15;                                          // spine
    k *= 0.92 + fbm(u * 6, v * 3, 6, 3, 3, seed + 3) * 0.12;
    c[0] = k * 0.98; c[1] = k; c[2] = k * 1.03;
  });
  return P.toCanvas();
}

function texNade(seed) {
  const W = 256, P = new Pix(W);
  P.map((x, y, c) => {
    const u = x / W, v = y / W;
    let k = 0.92 + (fbm(u * 4, v * 4, 4, 4, 4, seed) - 0.5) * 0.24 + (hashi(x, y, seed) - 0.5) * 0.05;
    let r = 0.33, g = 0.37, b = 0.25;
    if (v > 0.12 && v < 0.2) { r = g = b = 0.86; }                     // white identification band
    if (v < 0.05 || v > 0.95) { r = g = b = 0.34; k *= 1.1; }          // crimped rims
    if (fbm(u * 14, v * 14, 14, 14, 3, seed + 1) > 0.7) { r = 0.42; g = 0.41; b = 0.39; }
    c[0] = r * k; c[1] = g * k; c[2] = b * k;
  });
  P.stamp((ctx) => {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const cx of [64, 192]) {
      ctx.font = `30px ${STENCIL_FONT}`; ctx.fillText('SMOKE', cx, 110);
      ctx.font = `15px ${STENCIL_FONT}`; ctx.fillText('VEIL · GREY', cx, 140); ctx.fillText('LOT 06-21', cx, 162);
    }
  }, [0.86, 0.84, 0.76], 0.9, 0.35, seed + 2);
  return P.toCanvas();
}

// RGBA smoke puffs (4 variants), lit from the top so stacked billboards read as volume.
function texSmokeAtlas() {
  const W = 256, cv = makeCanvas(W), ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, W), o = img.data;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const cell = (x >> 7) + (y >> 7) * 2, lx = ((x & 127) - 63.5) / 64, ly = ((y & 127) - 63.5) / 64;
      const r = Math.hypot(lx, ly);
      const n = fbm((lx + 1) * 2.5 + cell * 7.3, (ly + 1) * 2.5 + cell * 3.1, 64, 64, 5, 400 + cell);
      const lumps = fbm((lx + 1) * 5 + cell * 2.1, (ly + 1) * 5, 64, 64, 3, 500 + cell);
      const edge = 1 - smoothstep(0.42, 1.0, r + (n - 0.5) * 0.55);
      let a = edge * (0.6 + 0.4 * lumps);
      a = clamp(a * 1.25, 0, 1);
      const shade = clamp(0.74 + 0.22 * (-ly * 0.6 - lx * 0.25) + (lumps - 0.5) * 0.3, 0.45, 1.05);
      const i = (y * W + x) * 4;
      o[i] = o[i + 1] = o[i + 2] = shade * 255; o[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------
// Registry. world = units per texture tile; fit = stretch over the face; cyl = wrap around.
// ---------------------------------------------------------------------------
const TEX_DEFS = {
  concrete:       { gen: () => texConcrete(11, undefined, { seams: true, ties: true }), world: 128, surf: 'concrete' },
  concrete_plain: { gen: () => texConcrete(12, [0.56, 0.55, 0.51], { streaks: 0.08 }), world: 128, surf: 'concrete' },
  concrete_floor: { gen: () => texConcreteFloor(13), world: 128, surf: 'concrete' },
  brick:          { gen: () => texBrick(14), world: 112, surf: 'brick' },
  plaster:        { gen: () => texPlaster(15), world: 128, surf: 'plaster' },
  wood_floor:     { gen: () => texWoodPlanks(16), world: 128, surf: 'wood' },
  plywood:        { gen: () => texPlywood(17), world: 128, surf: 'wood' },
  diamond:        { gen: () => texDiamondPlate(18), world: 96, surf: 'metal' },
  container:      { gen: () => texCorrugated(19), world: 128, surf: 'metal' },
  container_blue: { gen: () => texCorrugated(29, [0.16, 0.3, 0.45]), world: 128, surf: 'metal' },
  roof:           { gen: () => texCorrugated(20, [0.5, 0.51, 0.5], 8, false), world: 128, surf: 'metal' },
  panel:          { gen: () => texMetalPanel(21), world: 128, surf: 'metal' },
  steel:          { gen: () => texSteel(22), world: 128, surf: 'metal' },
  rail:           { gen: () => texPaintedMetal(23, [0.85, 0.63, 0.12]), world: 28, surf: 'metal' },
  sand:           { gen: () => texSand(24), world: 192, surf: 'sand' },
  tiles:          { gen: () => texTiles(25), world: 128, surf: 'tile' },
  hazard:         { gen: () => texHazard(26), world: 64, surf: 'concrete' },
  sandbag:        { gen: () => texBurlap(27), world: 128, surf: 'cloth' },
  crate:          { gen: () => texCrate(30), fit: true, surf: 'wood' },
  crate_b:        { gen: () => texCrate(31, [0.6, 0.46, 0.29], 'K-12', 'KEEP DRY'), fit: true, surf: 'wood' },
  crate_mil:      { gen: () => texCrate(32, [0.37, 0.39, 0.27], 'R7 · 09', 'HANDLE WITH CARE'), fit: true, surf: 'wood' },
  door:           { gen: () => texDoor(33), fit: true, surf: 'wood' },
  door_metal:     { gen: () => texDoor(34, [0.42, 0.45, 0.4], true), fit: true, surf: 'metal' },
  barrel:         { gen: () => texBarrel(35), cyl: true, surf: 'metal' },
  barrel_red:     { gen: () => texBarrel(36, [0.55, 0.14, 0.1]), cyl: true, surf: 'metal' },
  barrel_top:     { gen: () => texBarrelTop(37), fit: true, surf: 'metal' },
  target:         { gen: () => texTargetPlate(38), fit: true, surf: 'metal' },
  target_reset:   { gen: () => texTargetPlate(39, true), fit: true, surf: 'metal' },
  paper:          { gen: () => texPaperBoard(40), fit: true, surf: 'paper' },
  sign_range:     { gen: () => texSign(['FIRING LINE', 'STAND BEHIND THE STRIPE'], [0.86, 0.66, 0.12], [0.08, 0.07, 0.06], 41), fit: true, surf: 'metal' },
  sign_hall:      { gen: () => texSign(['HALL B', 'TEST AREA · STAFF ONLY'], [0.13, 0.2, 0.32], [0.9, 0.88, 0.82], 42), fit: true, surf: 'metal' },
  sign_jump:      { gen: () => texSign(['JUMP TEST', 'CROUCH-JUMP FOR 64'], [0.18, 0.18, 0.17], [0.92, 0.7, 0.14], 43), fit: true, surf: 'metal' },
  sign_step:      { gen: () => texSign(['STEP TEST', '16 · 18 · 20 UNITS'], [0.18, 0.18, 0.17], [0.92, 0.7, 0.14], 44), fit: true, surf: 'metal' },
  sign_out:       { gen: () => texSign(['RANGE  ►', 'YARD 2'], [0.13, 0.2, 0.32], [0.9, 0.88, 0.82], 45), fit: true, surf: 'metal' },
  site_a:         { gen: () => texSiteSign('A', 58), fit: true, surf: 'metal' },
  // Saltpan Depot
  asphalt:        { gen: () => texAsphalt(71), world: 192, surf: 'concrete' },
  ballast:        { gen: () => texBallast(72), world: 64, surf: 'sand' },
  timber:         { gen: () => texWoodPlanks(73, [0.3, 0.22, 0.15]), world: 96, surf: 'wood' },
  shed:           { gen: () => texCorrugated(74, [0.46, 0.49, 0.46]), world: 128, surf: 'metal' },
  shed_roof:      { gen: () => texCorrugated(75, [0.38, 0.4, 0.39], 8, false), world: 128, surf: 'metal' },
  wagon:          { gen: () => texWagon(76), fit: true, surf: 'metal' },
  wagon_blue:     { gen: () => texWagon(77, [0.16, 0.27, 0.38]), fit: true, surf: 'metal' },
  window:         { gen: () => texWindow(78), fit: true, surf: 'metal' },
  plaster_warm:   { gen: () => texPlaster(79, [0.78, 0.66, 0.52]), world: 128, surf: 'plaster' },
  sign_depot:     { gen: () => texSign(['SALTPAN DEPOT', 'AUTHORISED VEHICLES ONLY'], [0.12, 0.22, 0.35], [0.9, 0.88, 0.82], 80), fit: true, surf: 'metal' },
  sign_weigh:     { gen: () => texSign(['WEIGHBRIDGE', 'STOP · WEIGH · PROCEED'], [0.86, 0.66, 0.12], [0.08, 0.07, 0.06], 81), fit: true, surf: 'metal' },
  sign_shed4:     { gen: () => texSign(['SHED 4', 'LOADING BAY · KEEP CLEAR'], [0.24, 0.33, 0.27], [0.9, 0.88, 0.8], 82), fit: true, surf: 'metal' },
  sign_platform:  { gen: () => texSign(['PLATFORM 2', 'STAND BEHIND THE LINE'], [0.13, 0.2, 0.32], [0.9, 0.88, 0.82], 83), fit: true, surf: 'metal' },
  sign_culvert:   { gen: () => texSign(['CULVERT', 'FLOOD RISK · KEEP OUT'], [0.8, 0.22, 0.14], [0.95, 0.92, 0.86], 84), fit: true, surf: 'metal' },
  sign_salt:      { gen: () => texSign(['SALT STORE', 'NO NAKED FLAMES'], [0.5, 0.47, 0.42], [0.1, 0.09, 0.08], 85), fit: true, surf: 'metal' },
  site_b:         { gen: () => texSiteSign('B', 59), fit: true, surf: 'metal' },
  // Kilnworks
  firebrick:      { gen: () => texBrickVariant(101, [[0.42, 0.2, 0.13], [0.36, 0.17, 0.12], [0.48, 0.25, 0.16], [0.3, 0.15, 0.11]], [0.42, 0.39, 0.35], 0.55), world: 112, surf: 'brick' },
  brick_yellow:   { gen: () => texBrickVariant(102, [[0.72, 0.6, 0.4], [0.66, 0.55, 0.36], [0.78, 0.66, 0.45], [0.62, 0.5, 0.33], [0.7, 0.56, 0.38]], [0.62, 0.6, 0.55], 0.12), world: 112, surf: 'brick' },
  clay:           { gen: () => texClay(103), world: 192, surf: 'sand' },
  sign_kiln:      { gen: () => texSign(['KILN YARD', 'HOT SURFACES · KEEP CLEAR'], [0.8, 0.22, 0.14], [0.95, 0.92, 0.86], 104), fit: true, surf: 'metal' },
  sign_press:     { gen: () => texSign(['PRESS HALL', 'EAR PROTECTION REQUIRED'], [0.13, 0.2, 0.32], [0.9, 0.88, 0.82], 105), fit: true, surf: 'metal' },
  sign_kilnworks: { gen: () => texSign(['KILNWORKS', 'BRICK & TILE · GATE 2'], [0.24, 0.16, 0.12], [0.94, 0.82, 0.62], 106), fit: true, surf: 'metal' },
  sign_pits:      { gen: () => texSign(['CLAY PITS', 'DANGER · SOFT GROUND'], [0.86, 0.66, 0.12], [0.08, 0.07, 0.06], 107), fit: true, surf: 'metal' },
  // Frostline
  snow:           { gen: () => texSnow(111), world: 224, surf: 'sand' },
  rock:           { gen: () => texRock(112), world: 256, surf: 'concrete' },
  hangar:         { gen: () => texCorrugated(113, [0.66, 0.69, 0.7]), world: 128, surf: 'metal' },
  paint_white:    { gen: () => texMetalPanel(114, [0.74, 0.76, 0.76]), world: 128, surf: 'metal' },
  paint_orange:   { gen: () => texMetalPanel(115, [0.8, 0.36, 0.12]), world: 128, surf: 'metal' },
  sign_hangar:    { gen: () => texSign(['HANGAR 2', 'NO OPEN FLAMES'], [0.13, 0.2, 0.32], [0.9, 0.88, 0.82], 116), fit: true, surf: 'metal' },
  sign_dish:      { gen: () => texSign(['DISH ARRAY', 'RF HAZARD · NO ENTRY'], [0.8, 0.22, 0.14], [0.95, 0.92, 0.86], 117), fit: true, surf: 'metal' },
  sign_frost:     { gen: () => texSign(['FROSTLINE STATION', 'ELEVATION 2140 M'], [0.18, 0.24, 0.3], [0.9, 0.92, 0.94], 118), fit: true, surf: 'metal' },
  jump32:         { gen: () => texLabelBox('32', 50), fit: true, surf: 'concrete' },
  jump48:         { gen: () => texLabelBox('48', 51), fit: true, surf: 'concrete' },
  jump64:         { gen: () => texLabelBox('64', 52), fit: true, surf: 'concrete' },
  jump72:         { gen: () => texLabelBox('72', 53), fit: true, surf: 'concrete' },
  step16:         { gen: () => texLabelBox('16', 54), fit: true, surf: 'concrete' },
  step18:         { gen: () => texLabelBox('18', 55), fit: true, surf: 'concrete' },
  step20:         { gen: () => texLabelBox('20', 56), fit: true, surf: 'concrete' },
  lamp:           { fullbright: [1.0, 0.92, 0.74], surf: 'metal' },
  screen_glow:    { fullbright: [0.42, 0.9, 0.62], surf: 'metal' },
};

// Non-world textures (sprites, decals, weapon skins).
const AUX_DEFS = {
  decals: texDecalAtlas, sprites: texSpriteAtlas,
  gun_metal: () => texGunMetal(60), gun_poly: () => texPolymer(61), gun_tan: () => texPolymer(62, [2.35, 2.0, 1.5]),
  // First-person hands per team: [0] Raiders, [1] Wardens.
  glove0: () => texGlove(63, [0.46, 0.36, 0.25]), glove1: () => texGlove(67, [0.27, 0.28, 0.3]),
  sleeve0: () => texSleeve(64, 0), sleeve1: () => texSleeve(68, 1),
  blade: () => texBlade(65), nade: () => texNade(66), smoke: texSmokeAtlas, gun_wood: () => texGunWood(69),
};

// Generates every texture; returns { name: { canvas, avg, def } }.
async function generateTextures(onProgress) {
  const out = {};
  const names = Object.keys(TEX_DEFS), aux = Object.keys(AUX_DEFS);
  const total = names.length + aux.length;
  let done = 0, t0 = performance.now();
  for (const n of names) {
    const def = TEX_DEFS[n];
    if (def.gen) { const canvas = def.gen(); out[n] = { canvas, avg: canvasAverage(canvas), def }; }
    else out[n] = { canvas: null, avg: def.fullbright.slice(), def };
    done++;
    if (performance.now() - t0 > 30) { onProgress(done / total); await yieldUI(); t0 = performance.now(); }
  }
  for (const n of aux) {
    out[n] = { canvas: AUX_DEFS[n](), avg: [0.5, 0.5, 0.5], def: { aux: true } };
    done++;
    if (performance.now() - t0 > 30) { onProgress(done / total); await yieldUI(); t0 = performance.now(); }
  }
  onProgress(1);
  return out;
}
