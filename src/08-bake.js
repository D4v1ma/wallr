// Lightmap + light-probe baker (runs once at load, chunked so the UI keeps painting).
// direct = sun + point lights (shadow rays); indirect = sky + one bounce (cosine rays), with AO.
// Luxels are stored as light/LM_SCALE so the world shader can overbright up to 2x.

const LM_SCALE = 2.0;
const BAKE = { rays: 16, bounce: 1.35, aoDist: 56, aoStrength: 0.55, probeStep: 64, probeRays: 14 };

function onb(nx, ny, nz, out) {
  const s = nz >= 0 ? 1 : -1, a = -1 / (s + nz), b = nx * ny * a;
  out[0] = 1 + s * nx * nx * a; out[1] = s * b; out[2] = -s * nx;
  out[3] = b; out[4] = s + ny * ny * a; out[5] = -ny;
  return out;
}

async function bakeLighting(L, onProgress) {
  const { cw, faces, atlasW, atlasH, env, lights, tex } = L;
  const lmFaces = faces.filter((f) => f.lm);
  const total = L.luxels;
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), valid = new Uint8Array(total);
  const direct = new Float32Array(total * 3), indirect = new Float32Array(total * 3);
  const albedo = faces.map((f) => (tex[f.mat] ? tex[f.mat].avg : [0.5, 0.5, 0.5]));
  const sun = env.sunDir, sunC = env.sunColor.map((c) => c * env.sunIntensity);
  const skyZ = env.skyZenith.map((c) => c * env.skyIntensity), skyH = env.skyHorizon.map((c) => c * env.skyIntensity);
  const rnd = mulberry32(1234);
  const t0 = performance.now();
  let lastYield = performance.now();
  const step = async (frac) => {
    if (performance.now() - lastYield > 28) { onProgress(frac); await yieldUI(); lastYield = performance.now(); }
  };

  // 1) luxel sample points (1 unit off the surface) and validity
  for (const f of lmFaces) {
    const { r, t, minR, maxR, minT, maxT } = f.axes, { s, w, h, start } = f.lm;
    const [nx, ny, nz] = f.n, d = f.d;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const R = clamp(minR + i * s, minR + 0.5, maxR - 0.5), T = clamp(minT + j * s, minT + 0.5, maxT - 0.5);
        const k = start + j * w + i, o = k * 3;
        pos[o] = R * r[0] + T * t[0] + (d + 1) * nx;
        pos[o + 1] = R * r[1] + T * t[1] + (d + 1) * ny;
        pos[o + 2] = R * r[2] + T * t[2] + (d + 1) * nz;
        nrm[o] = nx; nrm[o + 1] = ny; nrm[o + 2] = nz;
        valid[k] = cw.pointContents(pos[o], pos[o + 1], pos[o + 2], CONTENTS.OPAQUE) ? 0 : 1;
      }
    }
  }

  // direct light at a point/normal (also used for bounce hits on faces without a lightmap)
  const directAt = (px, py, pz, nx, ny, nz, out, o) => {
    let r = 0, g = 0, b = 0;
    const ndl = nx * sun[0] + ny * sun[1] + nz * sun[2];
    if (ndl > 0 && cw.rayCast(px, py, pz, sun[0], sun[1], sun[2], 9000, MASK_LIGHT, true) < 0) {
      r += sunC[0] * ndl; g += sunC[1] * ndl; b += sunC[2] * ndl;
    }
    for (const Lt of lights) {
      let lx = Lt.pos[0] - px, ly = Lt.pos[1] - py, lz = Lt.pos[2] - pz;
      const dist = Math.hypot(lx, ly, lz);
      if (dist > Lt.radius || dist < 0.01) continue;
      lx /= dist; ly /= dist; lz /= dist;
      const nd = nx * lx + ny * ly + nz * lz;
      if (nd <= 0) continue;
      if (cw.rayCast(px, py, pz, lx, ly, lz, dist - 1, MASK_LIGHT, true) >= 0) continue;
      const a = 1 - dist / Lt.radius, e = Lt.intensity * a * a * nd;
      r += Lt.color[0] * e; g += Lt.color[1] * e; b += Lt.color[2] * e;
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
  };

  // 2) direct
  for (let k = 0; k < total; k++) {
    if (valid[k]) { const o = k * 3; directAt(pos[o], pos[o + 1], pos[o + 2], nrm[o], nrm[o + 1], nrm[o + 2], direct, o); }
    if ((k & 255) === 0) await step(0.05 + 0.25 * k / total);
  }

  const dilate = (buf) => {
    for (const f of lmFaces) {
      const { w, h, start } = f.lm;
      const ok = valid.slice(start, start + w * h);
      if (!ok.some((v) => v)) { for (let i = 0; i < w * h; i++) { const o = (start + i) * 3; buf[o] = buf[o + 1] = buf[o + 2] = env.ambient; } continue; }
      for (let pass = 0; pass < 64; pass++) {
        let changed = false;
        const next = ok.slice();
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const li = j * w + i;
          if (ok[li]) continue;
          let r = 0, g = 0, b = 0, n = 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
            const q = jj * w + ii;
            if (!ok[q]) continue;
            const o = (start + q) * 3; r += buf[o]; g += buf[o + 1]; b += buf[o + 2]; n++;
          }
          if (n) { const o = (start + li) * 3; buf[o] = r / n; buf[o + 1] = g / n; buf[o + 2] = b / n; next[li] = 1; changed = true; }
        }
        ok.set(next);
        if (!changed) break;
      }
    }
  };
  const directD = direct.slice();
  dilate(directD);

  // radiance leaving a surface hit by a bounce ray
  const hitRadiance = (hb, hp, hx, hy, hz, out) => {
    const fi = hb.faceIndex ? hb.faceIndex[hp] : -1;
    if (fi >= 0) {
      const hf = faces[fi], al = albedo[fi];
      if (!hf.lm) { out[0] = al[0] * 0.8; out[1] = al[1] * 0.8; out[2] = al[2] * 0.8; return; }  // lamp
      const { r, t, minR, minT } = hf.axes, { s, w, h, start } = hf.lm;
      const R = hx * r[0] + hy * r[1] + hz * r[2], T = hx * t[0] + hy * t[1] + hz * t[2];
      const i = clamp(Math.round((R - minR) / s), 0, w - 1), j = clamp(Math.round((T - minT) / s), 0, h - 1);
      const o = (start + j * w + i) * 3;
      out[0] = directD[o] * al[0]; out[1] = directD[o + 1] * al[1]; out[2] = directD[o + 2] * al[2];
      return;
    }
    // hidden / nodraw face: estimate on the fly
    const P = hb.P, o4 = hp * 4, tmp = [0, 0, 0];
    if (hp >= 0) directAt(hx + P[o4], hy + P[o4 + 1], hz + P[o4 + 2], P[o4], P[o4 + 1], P[o4 + 2], tmp, 0);
    out[0] = tmp[0] * 0.4; out[1] = tmp[1] * 0.4; out[2] = tmp[2] * 0.4;
  };

  // 3) indirect: sky + bounce + AO
  const K = BAKE.rays, G = Math.round(Math.sqrt(K)), B = [0, 0, 0, 0, 0, 0], rad = [0, 0, 0];
  for (let k = 0; k < total; k++) {
    if ((k & 127) === 0) await step(0.3 + 0.55 * k / total);
    if (!valid[k]) continue;
    const o = k * 3, px = pos[o], py = pos[o + 1], pz = pos[o + 2], nx = nrm[o], ny = nrm[o + 1], nz = nrm[o + 2];
    onb(nx, ny, nz, B);
    const rot = rnd() * TAU;
    let ar = 0, ag = 0, ab = 0, occ = 0;
    for (let a = 0; a < G; a++) {
      for (let b = 0; b < G; b++) {
        const u1 = (a + rnd()) / G, u2 = (b + rnd()) / G;
        const rr = Math.sqrt(u1), ph = TAU * u2 + rot, lx = rr * Math.cos(ph), ly = rr * Math.sin(ph), lz = Math.sqrt(1 - u1);
        const dx = B[0] * lx + B[3] * ly + nx * lz, dy = B[1] * lx + B[4] * ly + ny * lz, dz = B[2] * lx + B[5] * ly + nz * lz;
        const t = cw.rayCast(px, py, pz, dx, dy, dz, 6000, MASK_LIGHT, false);
        if (t < 0) {
          const e = Math.max(dy, 0), m = Math.sqrt(e);
          ar += lerp(skyH[0], skyZ[0], m); ag += lerp(skyH[1], skyZ[1], m); ab += lerp(skyH[2], skyZ[2], m);
        } else {
          hitRadiance(cw.hitBrush, cw.hitPlane, px + dx * t, py + dy * t, pz + dz * t, rad);
          ar += rad[0] * BAKE.bounce; ag += rad[1] * BAKE.bounce; ab += rad[2] * BAKE.bounce;
          if (t < BAKE.aoDist) occ += 1 - t / BAKE.aoDist;
        }
      }
    }
    const n = G * G, ao = 1 - (occ / n) * BAKE.aoStrength;
    indirect[o] = (ar / n + env.ambient) * ao; indirect[o + 1] = (ag / n + env.ambient) * ao; indirect[o + 2] = (ab / n + env.ambient * 1.1) * ao;
  }
  dilate(indirect);

  // 4) per-face filtering (keeps faces independent so nothing bleeds across edges)
  const blur = (buf, wts) => {
    for (const f of lmFaces) {
      const { w, h, start } = f.lm, src = buf.slice(start * 3, (start + w * h) * 3);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let r = 0, g = 0, b = 0, ws = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
          const wt = wts[(dj + 1) * 3 + di + 1], q = (jj * w + ii) * 3;
          r += src[q] * wt; g += src[q + 1] * wt; b += src[q + 2] * wt; ws += wt;
        }
        const o = (start + j * w + i) * 3; buf[o] = r / ws; buf[o + 1] = g / ws; buf[o + 2] = b / ws;
      }
    }
  };
  const BOX = [1, 1, 1, 1, 1, 1, 1, 1, 1], TENT = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  blur(indirect, BOX); blur(indirect, BOX); blur(directD, TENT);
  onProgress(0.87); await yieldUI();

  // 5) compose atlas
  const lmData = new Uint8Array(atlasW * atlasH * 4);
  const put = (x, y, r, g, b) => {
    if (x >= atlasW || y >= atlasH) return;
    const q = (y * atlasW + x) * 4;
    lmData[q] = clamp(r / LM_SCALE, 0, 1) * 255; lmData[q + 1] = clamp(g / LM_SCALE, 0, 1) * 255; lmData[q + 2] = clamp(b / LM_SCALE, 0, 1) * 255; lmData[q + 3] = 255;
  };
  for (const f of lmFaces) {
    const { w, h, x, y, start } = f.lm;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const o = (start + j * w + i) * 3;
      const r = directD[o] + indirect[o], g = directD[o + 1] + indirect[o + 1], b = directD[o + 2] + indirect[o + 2];
      put(x + i, y + j, r, g, b);
      if (i === w - 1) put(x + w, y + j, r, g, b);
      if (j === h - 1) put(x + i, y + h, r, g, b);
    }
  }

  // 6) light probes for dynamic objects (viewmodel, later players)
  const PS = BAKE.probeStep, lo = L.bounds.lo, hi = L.bounds.hi;
  const pnx = Math.ceil((hi[0] - lo[0]) / PS) + 1, pny = Math.max(2, Math.ceil(Math.min(hi[1] - lo[1], 448) / PS) + 1), pnz = Math.ceil((hi[2] - lo[2]) / PS) + 1;
  const probes = { nx: pnx, ny: pny, nz: pnz, x0: lo[0], y0: Math.max(lo[1], 0) + 24, z0: lo[2], step: PS, data: new Float32Array(pnx * pny * pnz * 4), valid: new Uint8Array(pnx * pny * pnz) };
  const PR = BAKE.probeRays, dirs = [];
  for (let i = 0; i < PR; i++) {
    const y = 1 - (i + 0.5) / PR * 2, r = Math.sqrt(1 - y * y), ph = i * 2.399963;
    dirs.push([Math.cos(ph) * r, y, Math.sin(ph) * r]);
  }
  for (let iz = 0; iz < pnz; iz++) {
    await step(0.88 + 0.11 * iz / pnz);
    for (let iy = 0; iy < pny; iy++) for (let ix = 0; ix < pnx; ix++) {
      const idx = (iz * pny + iy) * pnx + ix;
      const px = probes.x0 + ix * PS, py = probes.y0 + iy * PS, pz = probes.z0 + iz * PS;
      if (cw.pointContents(px, py, pz, CONTENTS.OPAQUE | CONTENTS.SOLID)) continue;
      probes.valid[idx] = 1;
      let ar = 0, ag = 0, ab = 0;
      for (const [dx, dy, dz] of dirs) {
        const t = cw.rayCast(px, py, pz, dx, dy, dz, 6000, MASK_LIGHT, false);
        if (t < 0) {
          const m = Math.sqrt(Math.max(dy, 0));
          ar += lerp(skyH[0], skyZ[0], m); ag += lerp(skyH[1], skyZ[1], m); ab += lerp(skyH[2], skyZ[2], m);
        } else {
          hitRadiance(cw.hitBrush, cw.hitPlane, px + dx * t, py + dy * t, pz + dz * t, rad);
          ar += rad[0]; ag += rad[1]; ab += rad[2];
        }
      }
      let lr = 0, lg = 0, lb = 0;
      for (const Lt of lights) {
        let lx = Lt.pos[0] - px, ly = Lt.pos[1] - py, lz = Lt.pos[2] - pz;
        const dist = Math.hypot(lx, ly, lz);
        if (dist > Lt.radius) continue;
        lx /= dist; ly /= dist; lz /= dist;
        if (cw.rayCast(px, py, pz, lx, ly, lz, dist - 1, MASK_LIGHT, true) >= 0) continue;
        const a = 1 - dist / Lt.radius, e = Lt.intensity * a * a * 0.6;
        lr += Lt.color[0] * e; lg += Lt.color[1] * e; lb += Lt.color[2] * e;
      }
      const sv = cw.rayCast(px, py, pz, sun[0], sun[1], sun[2], 9000, MASK_LIGHT, true) < 0 ? 1 : 0;
      const q = idx * 4;
      probes.data[q] = ar / PR + lr + env.ambient; probes.data[q + 1] = ag / PR + lg + env.ambient; probes.data[q + 2] = ab / PR + lb + env.ambient; probes.data[q + 3] = sv;
    }
  }
  onProgress(1);
  const ms = performance.now() - t0;
  return { lmData, probes, stats: { luxels: total, ms: Math.round(ms), faces: lmFaces.length, atlas: `${atlasW}x${atlasH}` } };
}

// Trilinear probe lookup -> out = [r, g, b, sunVisibility]
function sampleProbes(pr, x, y, z, out) {
  const fx = clamp((x - pr.x0) / pr.step, 0, pr.nx - 1.001), fy = clamp((y - pr.y0) / pr.step, 0, pr.ny - 1.001), fz = clamp((z - pr.z0) / pr.step, 0, pr.nz - 1.001);
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz), tx = fx - ix, ty = fy - iy, tz = fz - iz;
  let r = 0, g = 0, b = 0, s = 0, ws = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    const idx = ((iz + dz) * pr.ny + (iy + dy)) * pr.nx + (ix + dx);
    if (!pr.valid[idx]) continue;
    const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz) + 1e-4;
    const q = idx * 4;
    r += pr.data[q] * w; g += pr.data[q + 1] * w; b += pr.data[q + 2] * w; s += pr.data[q + 3] * w; ws += w;
  }
  if (ws > 0) { out[0] = r / ws; out[1] = g / ws; out[2] = b / ws; out[3] = s / ws; }
  else { out[0] = out[1] = out[2] = 0.3; out[3] = 0; }
  return out;
}
