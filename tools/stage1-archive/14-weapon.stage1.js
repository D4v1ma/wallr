// Weapon logic (tick-driven) + bullet resolution. Inaccuracy is in milliradians.

const RIFLE = {
  name: 'KESTREL AR', mag: 30, reserve: 90, rpm: 600, reloadTime: 2.45, drawTime: 0.75, maxSpeed: 225, range: 8192,
  spread: 0.6, inStand: 4.8, inCrouch: 3.2, inMove: 150, inAir: 150, inLand: 70, inFire: 7.5, inFireMax: 64,
  recoverStand: 0.42, recoverCrouch: 0.3,
  punch: 0.6, punchYaw: 0.3, punchDecay: 7.5, punchLinear: 3.5,
};

class Weapon {
  constructor(def) {
    this.def = def; this.ammo = def.mag; this.reserve = def.reserve;
    this.state = 'draw'; this.t = 0; this.nextFire = 0; this.fireInacc = 0; this.shots = 0;
    this.punch = [0, 0]; this.events = []; this.triggerHeld = false; this.reloadMarks = 0; this.emptyReload = false;
  }

  draw() { this.state = 'draw'; this.t = 0; this.events.push({ type: 'draw' }); }

  startReload() {
    this.state = 'reload'; this.t = 0; this.reloadMarks = 0; this.emptyReload = this.ammo === 0;
    this.events.push({ type: 'reload', empty: this.emptyReload });
  }

  // Current inaccuracy (mrad) for a player state; used for spread and the dynamic crosshair.
  inaccuracy(pl) {
    const d = this.def;
    let a = pl.ducked ? d.inCrouch : d.inStand;
    const sp = pl.speed(), ms = d.maxSpeed;
    a += d.inMove * smoothstep(ms * 0.34, ms * 0.95, sp);
    if (!pl.onGround && !pl.noclip) a += d.inAir;
    a += d.inLand * pl.landPenalty;
    return a + this.fireInacc;
  }

  tick(cmd, pl, time, dt) {
    const d = this.def;
    this.fireInacc *= Math.exp(-dt * 2.3 / (pl.ducked ? d.recoverCrouch : d.recoverStand));
    if (!cmd.fire) this.shots = Math.max(0, this.shots - dt * 14);
    for (let i = 0; i < 2; i++) {
      const p = this.punch[i], m = Math.abs(p);
      if (m < 1e-4) { this.punch[i] = 0; continue; }
      const nm = Math.max(0, m * Math.exp(-dt * d.punchDecay) - d.punchLinear * dt);
      this.punch[i] = Math.sign(p) * nm;
    }
    this.t += dt;
    if (this.state === 'draw' && this.t >= d.drawTime) this.state = 'idle';
    if (this.state === 'reload') {
      const marks = [[0.28, 'out'], [0.5, 'cloth'], [1.36, 'in'], [this.emptyReload ? 1.86 : 9, 'bolt']];
      while (this.reloadMarks < marks.length && this.t >= marks[this.reloadMarks][0]) this.events.push({ type: 'reloadSfx', part: marks[this.reloadMarks++][1] });
      if (this.t >= d.reloadTime) {
        const take = Math.min(d.mag - this.ammo, this.reserve);
        this.ammo += take; this.reserve -= take; this.state = 'idle';
      }
    }
    if (cmd.reload && this.state === 'idle' && this.ammo < d.mag && this.reserve > 0) this.startReload();
    if (cmd.fire && this.state === 'idle' && time >= this.nextFire) {
      if (this.ammo > 0) this.fire(pl, time);
      else if (!this.triggerHeld) { this.events.push({ type: 'dry' }); this.nextFire = time + 0.25; if (this.reserve > 0) this.startReload(); }
    }
    this.triggerHeld = cmd.fire;
  }

  fire(pl, time) {
    const d = this.def, interval = 60 / d.rpm;
    this.ammo--;
    this.nextFire = time - this.nextFire < interval * 1.5 ? this.nextFire + interval : time + interval;
    const inacc = this.inaccuracy(pl);
    this.events.push({ type: 'shot', inacc });
    this.fireInacc = Math.min(this.fireInacc + d.inFire, d.inFireMax);
    const k = Math.min(1, 0.45 + this.shots * 0.13);
    this.punch[0] += d.punch * k;
    this.punch[1] += (Math.random() - 0.5) * 2 * d.punchYaw * Math.min(1, this.shots / 3);
    this.shots++;
    if (this.ammo === 0 && this.reserve > 0) this.events.push({ type: 'autoReload' });
  }
}

// Bullet resolution: world brushes, dynamic doors and range plates.
const Combat = {
  tr: makeTrace(), rnd: mulberry32(9),

  // Aim direction with view punch (bullets land at 2x punch) and center-weighted spread.
  aimDir(pl, w, inaccMrad, out) {
    const yaw = pl.yaw + w.punch[1] * 2 * DEG, pitch = clamp(pl.pitch + w.punch[0] * 2 * DEG, -1.55, 1.55);
    const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
    const fx = -sy * cp, fy = sp, fz = -cy * cp;
    const rx = cy, rz = -sy;
    const ux = sy * sp, uy = cp, uz = cy * sp;
    const th = this.rnd() * TAU, r = (inaccMrad * this.rnd() + w.def.spread * this.rnd()) * 0.001;
    const a = Math.cos(th) * r, b = Math.sin(th) * r;
    let dx = fx + rx * a + ux * b, dy = fy + uy * b, dz = fz + rz * a + uz * b;
    const l = Math.hypot(dx, dy, dz);
    out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
    return out;
  },

  // Returns { kind: 'world'|'door'|'target'|'none', point, normal, dist }
  shoot(L, eye, dir, range) {
    const tr = this.tr, ex = eye[0] + dir[0] * range, ey = eye[1] + dir[1] * range, ez = eye[2] + dir[2] * range;
    L.cw.trace(tr, eye[0], eye[1], eye[2], ex, ey, ez, 0, 0, 0, MASK_SHOT);
    let dist = tr.fraction * range;
    let hitT = null, hitTd = Infinity;
    for (const t of Ents.targets) {
      const d = t.rayHit(eye, dir, dist);
      if (d >= 0 && d < hitTd) { hitTd = d; hitT = t; }
    }
    if (hitT) {
      const p = [eye[0] + dir[0] * hitTd, eye[1] + dir[1] * hitTd, eye[2] + dir[2] * hitTd];
      return { kind: 'target', target: hitT, point: p, normal: [-1, 0, 0], dist: hitTd, surf: SURF.metal };
    }
    if (tr.fraction >= 1 || !tr.brush) return { kind: 'none', dist: range };
    const n = [tr.nx, tr.ny, tr.nz];
    let p = [tr.ex, tr.ey, tr.ez];
    if (tr.plane >= 0) {
      const P = tr.brush.P, o = tr.plane * 4, off = p[0] * P[o] + p[1] * P[o + 1] + p[2] * P[o + 2] - P[o + 3];
      p = [p[0] - P[o] * off, p[1] - P[o + 1] * off, p[2] - P[o + 2] * off];
    }
    const door = tr.brush.door || null;
    return { kind: door ? 'door' : 'world', door, brush: tr.brush, plane: tr.plane, point: p, normal: n, dist, surf: tr.surf };
  },
};
