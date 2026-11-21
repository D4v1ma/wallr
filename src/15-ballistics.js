// Bullet and knife resolution. Bullets punch through thin brushes depending on material:
// allowed thickness = MAT_PEN[surface] * weapon penetration power.

const MAT_PEN = SURF_NAMES.map((n) => ({ concrete: 3, brick: 3, plaster: 4, wood: 12, metal: 4.5, sand: 0, tile: 3, cloth: 2, paper: 40 })[n] || 0);

const Ballistics = {
  tr: makeTrace(), rnd: mulberry32(9),

  // View direction + spray offset (deg) + center-weighted random spread (mrad).
  aimDir(pl, off, inacc, spread, out) {
    const yaw = pl.yaw + off[1] * DEG, pitch = clamp(pl.pitch + off[0] * DEG, -1.55, 1.55);
    const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
    const fx = -sy * cp, fy = sp, fz = -cy * cp, rx = cy, rz = -sy, ux = sy * sp, uy = cp, uz = cy * sp;
    const th = this.rnd() * TAU, r = (inacc * this.rnd() + spread * this.rnd()) * 0.001;
    const a = Math.cos(th) * r, b = Math.sin(th) * r;
    const dx = fx + rx * a + ux * b, dy = fy + uy * b, dz = fz + rz * a + uz * b, l = Math.hypot(dx, dy, dz);
    out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
    return out;
  },

  // Shotgun pellet i around a base direction: uniform over a disc of `spread` mrad (pellet 0 near the middle).
  pellet(base, i, spread, out) {
    const ux = Math.abs(base[1]) < 0.99 ? 0 : 1, uy = 1 - ux;
    let rx = base[1] * 0 - base[2] * uy, ry = base[2] * ux - base[0] * 0, rz = base[0] * uy - base[1] * ux;
    const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    const vx = ry * base[2] - rz * base[1], vy = rz * base[0] - rx * base[2], vz = rx * base[1] - ry * base[0];
    const th = this.rnd() * TAU, r = spread * 0.001 * Math.sqrt(this.rnd()) * (i === 0 ? 0.25 : 1);
    const a = Math.cos(th) * r, b = Math.sin(th) * r;
    const dx = base[0] + rx * a + vx * b, dy = base[1] + ry * a + vy * b, dz = base[2] + rz * a + vz * b, l = Math.hypot(dx, dy, dz);
    out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
    return out;
  },

  // Distance from a point inside a convex brush to where the ray leaves it.
  exit(b, px, py, pz, dx, dy, dz) {
    const P = b.P;
    let best = Infinity, plane = -1;
    for (let i = 0, o = 0; i < b.n; i++, o += 4) {
      const den = P[o] * dx + P[o + 1] * dy + P[o + 2] * dz;
      if (den <= 1e-9) continue;
      const t = (P[o + 3] - (P[o] * px + P[o + 1] * py + P[o + 2] * pz)) / den;
      if (t < best) { best = t; plane = i; }
    }
    return plane < 0 ? null : { t: Math.max(0, best), plane };
  },

  onPlane(b, plane, p) {
    if (plane < 0) return p;
    const P = b.P, o = plane * 4, off = p[0] * P[o] + p[1] * P[o + 1] + p[2] * P[o + 2] - P[o + 3];
    return [p[0] - P[o] * off, p[1] - P[o + 1] * off, p[2] - P[o + 2] * off];
  },

  // -> { impacts: [{kind, door, brush, plane, point, normal, surf, exit, dist}], target, end, dist, pens }
  bullet(L, eye, dir, def, shooter = null) {
    const res = { impacts: [], target: null, actor: null, end: null, dist: 0, pens: 0 };
    let sx = eye[0], sy = eye[1], sz = eye[2], remaining = def.range, travelled = 0, power = def.penetration, damage = def.damage;
    for (let seg = 0; seg < 4; seg++) {
      const tr = this.tr;
      L.cw.trace(tr, sx, sy, sz, sx + dir[0] * remaining, sy + dir[1] * remaining, sz + dir[2] * remaining, 0, 0, 0, MASK_SHOT);
      if (tr.startsolid) return res;
      const dist = tr.fraction * remaining;
      let hitT = null, hitTd = Infinity;
      const s = [sx, sy, sz];
      for (const t of Ents.targets) { const d = t.rayHit(s, dir, dist); if (d >= 0 && d < hitTd) { hitTd = d; hitT = t; } }
      const ah = Actors.hitscan(s, dir, Math.min(dist, hitTd), shooter);
      if (ah) {
        const total = travelled + ah.t, p = [sx + dir[0] * ah.t, sy + dir[1] * ah.t, sz + dir[2] * ah.t];
        res.actor = { target: ah.actor, group: ah.group, point: p, dist: total, damage: damage * Math.pow(def.rangeMod, total / 500) };
        res.end = p; res.dist = total;
        return res;
      }
      if (hitT) {
        const total = travelled + hitTd, p = [sx + dir[0] * hitTd, sy + dir[1] * hitTd, sz + dir[2] * hitTd];
        res.target = { target: hitT, point: p, normal: [-1, 0, 0], dist: total, damage: damage * Math.pow(def.rangeMod, total / 500) };
        res.end = p; res.dist = total;
        return res;
      }
      if (tr.fraction >= 1 || !tr.brush) { res.end = [tr.ex, tr.ey, tr.ez]; res.dist = travelled + dist; return res; }
      const b = tr.brush, kind = b.door ? 'door' : 'world';
      const p = this.onPlane(b, tr.plane, [tr.ex, tr.ey, tr.ez]);
      travelled += dist;
      res.impacts.push({ kind, door: b.door || null, brush: b, plane: tr.plane, point: p, normal: [tr.nx, tr.ny, tr.nz], surf: tr.surf, exit: false, dist: travelled, damage });
      res.end = p; res.dist = travelled;
      const allow = MAT_PEN[tr.surf] * power;
      if (allow <= 0 || res.pens >= 2) return res;
      const ex = this.exit(b, p[0] + dir[0] * 0.05, p[1] + dir[1] * 0.05, p[2] + dir[2] * 0.05, dir[0], dir[1], dir[2]);
      if (!ex) return res;
      const thick = ex.t + 0.05;
      if (thick > allow) return res;
      const q = [p[0] + dir[0] * thick, p[1] + dir[1] * thick, p[2] + dir[2] * thick];
      const P = b.P, o = ex.plane * 4, frac = thick / allow;
      damage *= Math.max(0.1, 1 - 0.45 * frac - 0.1);
      power *= Math.max(0, 1 - frac * 0.75);
      res.pens++;
      res.impacts.push({ kind, door: b.door || null, brush: b, plane: ex.plane, point: q, normal: [P[o], P[o + 1], P[o + 2]], surf: b.surf[ex.plane], exit: true, dist: travelled + thick, damage });
      travelled += thick; remaining -= dist + thick + 0.1;
      if (remaining <= 0) return res;
      sx = q[0] + dir[0] * 0.1; sy = q[1] + dir[1] * 0.1; sz = q[2] + dir[2] * 0.1;
    }
    return res;
  },

  // Every wall a ray crosses before maxT: merged entry/exit intervals with the brush faces they use.
  crossings(L, eye, dir, maxT) {
    const hits = [], [ex, ey, ez] = eye, [dx, dy, dz] = dir;
    const scan = (b, kind) => {
      if (!slabHit(ex, ey, ez, dx, dy, dz, b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], maxT)) return;
      const P = b.P;
      let t0 = -Infinity, t1 = Infinity, p0 = -1, p1 = -1;
      for (let i = 0, o = 0; i < b.n; i++, o += 4) {
        const den = P[o] * dx + P[o + 1] * dy + P[o + 2] * dz, dist = P[o + 3] - (P[o] * ex + P[o + 1] * ey + P[o + 2] * ez);
        if (den > -1e-9 && den < 1e-9) { if (dist < 0) return; continue; }
        const t = dist / den;
        if (den < 0) { if (t > t0) { t0 = t; p0 = i; } } else if (t < t1) { t1 = t; p1 = i; }
      }
      if (t0 < t1 && t0 > 0 && t0 < maxT) hits.push({ b, kind, t0, p0, t1: Math.min(t1, maxT), p1: t1 <= maxT ? p1 : -1 });
    };
    for (const b of L.cw.brushes) if (b.contents & CONTENTS.SOLID) scan(b, 'world');
    for (const b of L.cw.dynamic) if (b.active && (b.contents & CONTENTS.SOLID)) scan(b, 'door');
    hits.sort((a, b) => a.t0 - b.t0);
    const walls = [];
    for (const h of hits) {
      const w = walls[walls.length - 1];
      if (w && h.t0 <= w.t1 + 0.5) { if (h.t1 > w.t1) { w.t1 = h.t1; w.out = h; } } else walls.push({ t0: h.t0, t1: h.t1, in: h, out: h });
    }
    return walls;
  },

  // A wallbang round: straight through every wall to the first enemy on the line, at full damage
  // (only the usual range falloff). Each wall it crosses still gets entry and exit marks.
  wallbang(L, eye, dir, def, shooter = null) {
    const range = Math.max(def.range, 8192), res = { impacts: [], target: null, actor: null, end: null, dist: 0, pens: 0, wallbang: true };
    const ah = Actors.hitscan(eye, dir, range, shooter), maxT = ah ? ah.t : range;
    const walls = this.crossings(L, eye, dir, maxT);
    const at = (t) => [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t];
    for (const w of walls.slice(0, 16)) {
      const a = w.in, b = w.out, P0 = a.b.P, P1 = b.b.P;
      res.impacts.push({ kind: a.kind, door: a.b.door || null, brush: a.b, plane: a.p0, point: this.onPlane(a.b, a.p0, at(w.t0)), normal: [P0[a.p0 * 4], P0[a.p0 * 4 + 1], P0[a.p0 * 4 + 2]], surf: a.b.surf[a.p0], exit: false, dist: w.t0, damage: def.damage });
      if (b.p1 >= 0) res.impacts.push({ kind: b.kind, door: b.b.door || null, brush: b.b, plane: b.p1, point: this.onPlane(b.b, b.p1, at(w.t1)), normal: [P1[b.p1 * 4], P1[b.p1 * 4 + 1], P1[b.p1 * 4 + 2]], surf: b.b.surf[b.p1], exit: true, dist: w.t1, damage: def.damage });
    }
    res.pens = walls.length;
    if (ah) {
      const p = at(ah.t);
      res.actor = { target: ah.actor, group: ah.group, point: p, dist: ah.t, damage: def.damage * Math.pow(def.rangeMod, ah.t / 500) };
      res.end = p; res.dist = ah.t;
    } else { res.end = at(range); res.dist = range; }
    return res;
  },

  // Knife: a ray first, then a small hull sweep so edges still connect. Returns an impact or null.
  knife(L, eye, dir, range, shooter = null) {
    const tr = this.tr, ex = eye[0] + dir[0] * range, ey = eye[1] + dir[1] * range, ez = eye[2] + dir[2] * range;
    const ah = Actors.hitscan(eye, dir, range, shooter);
    if (ah) return { kind: 'actor', target: ah.actor, group: ah.group, point: [eye[0] + dir[0] * ah.t, eye[1] + dir[1] * ah.t, eye[2] + dir[2] * ah.t], normal: [-dir[0], -dir[1], -dir[2]], surf: SURF.cloth };
    for (const t of Ents.targets) {
      const d = t.rayHit(eye, dir, range);
      if (d >= 0) return { kind: 'target', target: t, point: [eye[0] + dir[0] * d, eye[1] + dir[1] * d, eye[2] + dir[2] * d], normal: [-1, 0, 0], surf: SURF.metal };
    }
    L.cw.trace(tr, eye[0], eye[1], eye[2], ex, ey, ez, 0, 0, 0, MASK_SHOT);
    let hull = false;
    if (tr.fraction >= 1) { L.cw.trace(tr, eye[0], eye[1], eye[2], ex, ey, ez, 4, 4, 4, MASK_SHOT); hull = true; }
    if (tr.fraction >= 1 || !tr.brush || tr.startsolid) return null;
    const b = tr.brush, n = [tr.nx, tr.ny, tr.nz];
    let p = [tr.ex, tr.ey, tr.ez];
    if (hull) p = [p[0] - n[0] * 4, p[1] - n[1] * 4, p[2] - n[2] * 4];
    p = this.onPlane(b, tr.plane, p);
    return { kind: b.door ? 'door' : 'world', door: b.door || null, brush: b, plane: tr.plane, point: p, normal: n, surf: tr.surf, exit: false };
  },
};
