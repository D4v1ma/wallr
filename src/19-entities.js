// Brush entities: hinged doors (dynamic collision) and knock-down steel plates.

function rotYPlanes(planes, hinge, a) {
  const c = Math.cos(a), s = Math.sin(a), hx = hinge[0], hz = hinge[2];
  return planes.map(([nx, ny, nz, d]) => {
    const px = nx * d - hx, py = ny * d, pz = nz * d - hz;
    const rnx = nx * c + nz * s, rnz = -nx * s + nz * c;
    const rpx = px * c + pz * s + hx, rpz = -px * s + pz * c + hz;
    return [rnx, ny, rnz, rnx * rpx + ny * py + rnz * rpz];
  });
}

class Door {
  constructor(L, def) {
    this.L = L; this.mb = def.mb; this.brush = def.mb.cbrush; this.brush.door = this;
    this.hinge = [def.hinge[0], 0, def.hinge[1]];
    this.closed = def.mb.faces.map((f) => f.plane.slice());
    this.surfs = Array.from(this.brush.surf.slice(0, this.closed.length));
    this.angle = 0; this.prevAngle = 0; this.target = 0; this.speed = 2.6;
    this.metal = def.mb.faces.some((f) => f.mat === 'door_metal');
    this.obj = R.entityObject(L, def.mb, this.hinge);
    this.decals = new DecalSet(48, this.obj);
    const h = this.hinge;
    this.localPolys = this.brush.polys.map((p) => (p ? p.map((v) => [v[0] - h[0], v[1] - h[1], v[2] - h[2]]) : null));
    const b = this.brush;
    this.center = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    // doorway volume (closed pose, slightly thickened) so an open door can be closed by looking through its frame
    const t = 10;
    this.doorway = new Brush(this.closed.map(([nx, ny, nz, d]) => [nx, ny, nz, d + (Math.abs(ny) < 0.5 ? t : 0)]), CONTENTS.SOLID, this.surfs, this.surfs[0]);
  }

  isOpen() { return this.target !== 0; }

  toggle(pl) {
    if (this.target !== 0) { this.target = 0; }
    else {
      // swing away from the player
      const h = this.hinge, c = this.center, best = { s: 1, d: -1 };
      for (const s of [1, -1]) {
        const a = s * Math.PI / 2, cs = Math.cos(a), sn = Math.sin(a);
        const x = (c[0] - h[0]) * cs + (c[2] - h[2]) * sn + h[0], z = -(c[0] - h[0]) * sn + (c[2] - h[2]) * cs + h[2];
        const d = Math.hypot(x - pl.pos[0], z - pl.pos[2]);
        if (d > best.d) { best.d = d; best.s = s; }
      }
      this.target = best.s * 1.7;
    }
    Snd.door(this.center, this.metal, this.target !== 0);
  }

  tick(dt, pls) {
    this.prevAngle = this.angle;
    if (this.angle === this.target) return;
    const diff = this.target - this.angle, step = Math.sign(diff) * Math.min(Math.abs(diff), this.speed * dt);
    const next = this.angle + step;
    const planes = rotYPlanes(this.closed, this.hinge, next);
    const tmp = new Brush(planes, CONTENTS.SOLID, this.surfs, this.surfs[0]);
    for (const pl of pls) {
      const hh = (pl.ducked ? PM.duckH : PM.standH) / 2;
      if (!pl.noclip && this.L.cw.boxOverlaps(tmp, pl.pos[0], pl.pos[1] + hh, pl.pos[2], PM.half + 0.5, hh, PM.half + 0.5)) return; // blocked by someone
    }
    this.angle = Math.abs(this.target - next) < 1e-6 ? this.target : next;
    const b = this.brush;
    b.P = tmp.P; b.n = tmp.n; b.polys = tmp.polys; b.min = tmp.min; b.max = tmp.max; b.surf = tmp.surf; b.faceCount = tmp.faceCount;
  }

  render(alpha) { this.obj.rotation.y = lerp(this.prevAngle, this.angle, alpha); }

  // Bullet hole in door-local space (decals ride along with the door).
  addImpact(hit, decalScale = 1) {
    const a = -this.angle, c = Math.cos(a), s = Math.sin(a), h = this.hinge;
    const px = hit.point[0] - h[0], pz = hit.point[2] - h[2];
    const lp = [px * c + pz * s, hit.point[1] - h[1], -px * s + pz * c];
    const n = hit.normal, ln = [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c];
    const clip = hit.plane >= 0 && hit.plane < this.closed.length ? this.localPolys[hit.plane] : null;
    FX.impact(hit.point, hit.normal, hit.surf, this.decals, clip, lp, ln, decalScale);
  }
}

class Target {
  constructor(L, def) {
    this.def = def; this.c = def.center; this.h = def.half; this.action = def.opts.action || null;
    this.pivot = [this.c[0], this.c[1] - this.h[1], this.c[2]];
    this.obj = R.entityObject(L, def.mb, this.pivot);
    this.angle = 0; this.prevAngle = 0; this.state = 'up'; this.t = 0;
  }

  rayHit(eye, d, maxDist) {
    if (this.state !== 'up' && this.state !== 'wobble') return -1;
    const c = this.c, h = this.h;
    if (!slabHit(eye[0], eye[1], eye[2], d[0], d[1], d[2], c[0] - h[0], c[1] - h[1], c[2] - h[2], c[0] + h[0], c[1] + h[1], c[2] + h[2], maxDist)) return -1;
    // entry distance along the ray
    let t0 = 0;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) continue;
      const ta = (c[a] - h[a] - eye[a]) / d[a], tb = (c[a] + h[a] - eye[a]) / d[a];
      t0 = Math.max(t0, Math.min(ta, tb));
    }
    return t0;
  }

  hit() {
    Snd.plate(this.c);
    if (this.action === 'reset') {
      this.state = 'wobble'; this.t = 0;
      FX.decals.clear(); for (const d of Ents.doors) d.decals.clear();
      Ents.stats.hits = 0; Ents.stats.shots = 0;
      HUD.note('Spread board wiped · counters reset');
      return false;
    }
    if (this.state !== 'up') return false;
    this.state = 'falling'; this.t = 0; Ents.stats.hits++;
    return true;
  }

  tick(dt) {
    this.prevAngle = this.angle; this.t += dt;
    if (this.state === 'falling') {
      this.angle = -1.42 * smoothstep(0, 0.22, this.t) + Math.sin(this.t * 20) * 0.06 * Math.exp(-this.t * 6) * (this.t > 0.22 ? 1 : 0);
      if (this.t > 2.4) { this.state = 'rising'; this.t = 0; }
    } else if (this.state === 'rising') {
      this.angle = -1.42 * (1 - smoothstep(0, 0.5, this.t));
      if (this.t >= 0.5) { this.state = 'up'; this.angle = 0; }
    } else if (this.state === 'wobble') {
      this.angle = -0.32 * Math.exp(-this.t * 4) * Math.sin(this.t * 16);
      if (this.t > 1.2) { this.state = 'up'; this.angle = 0; }
    }
  }

  render(alpha) { this.obj.rotation.z = lerp(this.prevAngle, this.angle, alpha); }
}

const Ents = {
  doors: [], targets: [], stats: { hits: 0, shots: 0 },
  init(L) {
    for (const d of L.doors) this.doors.push(new Door(L, d));
    for (const t of L.targets) this.targets.push(new Target(L, t));
  },
  tick(dt, pls) { for (const d of this.doors) d.tick(dt, pls); for (const t of this.targets) t.tick(dt); },
  render(alpha) { for (const d of this.doors) d.render(alpha); for (const t of this.targets) t.render(alpha); },
  platesUp() { return this.targets.filter((t) => !t.action && t.state === 'up').length; },
  plateCount() { return this.targets.filter((t) => !t.action).length; },
  // Door under the crosshair within reach, or null.
  doorInReach(eye, dir) {
    let best = null, bd = 100;
    const cw = Game.L.cw;
    for (const d of this.doors) {
      let t = cw.rayBrush(d.brush, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], bd);
      if (t < 0 && d.angle !== 0) t = cw.rayBrush(d.doorway, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], bd);
      if (t >= 0 && t < bd) { bd = t; best = d; }
    }
    return best;
  },
};
