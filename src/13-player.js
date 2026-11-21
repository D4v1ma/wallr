// Player movement (fixed tick). Ground/air acceleration and friction follow the classic
// Quake/Source model; collision uses slide-move with crease handling and 18-unit stepping.

const PM = {
  gravity: 800, jumpSpeed: 301.993, stepSize: 18, accel: 5.5, airAccel: 12, friction: 5.2, stopSpeed: 80, airCap: 30,
  walkFrac: 0.52, duckFrac: 0.34, half: 16, standH: 72, duckH: 54, standEye: 64, duckEye: 46, duckDelta: 9,
  minWalkNormal: 0.7, noclipSpeed: 900,
};

class Player {
  constructor(cw) {
    this.cw = cw; this.tr = makeTrace();
    this.pos = [0, 0, 0]; this.prev = [0, 0, 0]; this.vel = [0, 0, 0];
    this.yaw = 0; this.pitch = 0;
    this.ducked = false; this.duckAmt = 0;
    this.onGround = false; this.gn = [0, 1, 0]; this.groundSurf = 0;
    this.noclip = false; this.stamina = 0; this.maxSpeed = 225; this.landPenalty = 0;
    this.viewOffset = 0; this.landKick = 0; this.stepDist = 0;
    this.events = [];
    this._pl = new Float64Array(15); this._c = [0, 0, 0];
  }

  spawn(p, yaw) {
    this.vel = [0, 0, 0];
    this.yaw = yaw; this.pitch = 0; this.ducked = false; this.duckAmt = 0; this.noclip = false;
    this.viewOffset = 0; this.landKick = 0; this.stamina = 0; this.landPenalty = 0;
    // drop the hull onto whatever is below the spawn point
    const tr = this.trace(p[0], p[1] + 4, p[2], p[0], p[1] - 64, p[2], false);
    this.pos = [p[0], tr.startsolid ? p[1] + 4 : tr.ey, p[2]];
    this.prev = this.pos.slice();
    this.categorize();
  }

  speed() { return Math.hypot(this.vel[0], this.vel[2]); }

  // Hull trace with feet positions; returns the shared trace (ey converted back to feet).
  trace(sx, sy, sz, ex, ey, ez, ducked = this.ducked) {
    const hh = (ducked ? PM.duckH : PM.standH) / 2;
    const tr = this.cw.trace(this.tr, sx, sy + hh, sz, ex, ey + hh, ez, PM.half, hh, PM.half, MASK_PLAYER);
    tr.ey -= hh;
    return tr;
  }
  fits(x, y, z, ducked) { return !this.trace(x, y, z, x, y, z, ducked).startsolid; }

  // Absorb an instant origin change into the camera smoothing.
  shiftView(dy) { this.viewOffset -= dy; this.prev[1] += dy; }

  tick(cmd, dt) {
    const p = this.pos, v = this.vel;
    this.prev[0] = p[0]; this.prev[1] = p[1]; this.prev[2] = p[2];
    if (this.noclip) { this.noclipMove(cmd, dt); return; }
    this.checkDuck(cmd);
    this.stamina = Math.max(0, this.stamina - 80 * dt);
    this.landPenalty = Math.max(0, this.landPenalty - dt * 2.5);
    const scale = (this.ducked ? PM.duckFrac : cmd.walk ? PM.walkFrac : 1) * (1 - this.stamina / 100);
    const maxspeed = this.maxSpeed * scale;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * cmd.fwd + cy * cmd.side, wz = -cy * cmd.fwd - sy * cmd.side;
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-6) { wx /= wl; wz /= wl; }
    const wishspeed = wl > 1e-6 ? maxspeed * Math.min(1, wl) : 0;

    if (!this.onGround) v[1] -= PM.gravity * dt * 0.5;
    if (cmd.jump && this.onGround) this.doJump(dt);
    if (this.onGround) {
      this.friction(dt);
      this.accelerate(wx, wz, wishspeed, dt);
      v[1] = 0;
      const sp = Math.hypot(v[0], v[2]);
      if (sp > maxspeed && maxspeed > 0) { const k = maxspeed / sp; v[0] *= k; v[2] *= k; }
      this.walkMove(dt);
    } else {
      this.airAccelerate(wx, wz, wishspeed, dt);
      this.slideMove(dt);
    }
    const wasGround = this.onGround, fallV = -v[1];
    this.categorize();
    if (!wasGround && this.onGround) this.onLand(fallV);
    if (!this.onGround) v[1] -= PM.gravity * dt * 0.5; else v[1] = 0;

    if (this.onGround) {
      const hs = Math.hypot(v[0], v[2]);
      this.stepDist += hs * dt;
      if (this.stepDist > 76) {
        this.stepDist = 0;
        if (hs > 150 && !this.ducked && !cmd.walk) this.events.push({ type: 'step', surf: this.groundSurf });
      }
    }
  }

  doJump(dt) {
    const v = this.vel, hs = Math.hypot(v[0], v[2]), cap = this.maxSpeed * 1.1;
    if (hs > cap) { const k = cap / hs; v[0] *= k; v[2] *= k; }
    v[1] = PM.jumpSpeed - PM.gravity * dt * 0.5; // first half of gravity (midpoint integration)
    this.onGround = false;
    this.stamina = Math.min(this.stamina + 12, 45);
    this.events.push({ type: 'jump' });
  }

  onLand(fallV) {
    if (fallV > 170) { this.events.push({ type: 'land', speed: fallV, surf: this.groundSurf }); this.landKick = Math.min(fallV / 60, 9); }
    this.stamina = Math.min(this.stamina + clamp(fallV / 28, 0, 22), 45);
    this.landPenalty = Math.max(this.landPenalty, clamp(fallV / 420, 0, 1));
  }

  friction(dt) {
    const v = this.vel, sp = Math.hypot(v[0], v[2]);
    if (sp < 0.1) { v[0] = v[2] = 0; return; }
    const control = sp < PM.stopSpeed ? PM.stopSpeed : sp;
    const k = Math.max(sp - control * PM.friction * dt, 0) / sp;
    v[0] *= k; v[2] *= k;
  }

  accelerate(wx, wz, wishspeed, dt) {
    const v = this.vel, add = wishspeed - (v[0] * wx + v[2] * wz);
    if (add <= 0) return;
    // acceleration uses the weapon's full speed (walk/crouch only lower the cap)
    const as = Math.min(PM.accel * dt * this.maxSpeed, add);
    v[0] += as * wx; v[2] += as * wz;
  }

  airAccelerate(wx, wz, wishspeed, dt) {
    const v = this.vel, capped = Math.min(wishspeed, PM.airCap), add = capped - (v[0] * wx + v[2] * wz);
    if (add <= 0) return;
    const as = Math.min(PM.airAccel * wishspeed * dt, add);
    v[0] += as * wx; v[2] += as * wz;
  }

  walkMove(dt) {
    const p = this.pos, v = this.vel;
    if (Math.hypot(v[0], v[2]) < 1) { v[0] = v[2] = 0; return; }
    const tr = this.trace(p[0], p[1], p[2], p[0] + v[0] * dt, p[1], p[2] + v[2] * dt);
    if (tr.fraction === 1 && !tr.startsolid) { p[0] = tr.ex; p[1] = tr.ey; p[2] = tr.ez; this.stayOnGround(); return; }
    this.stepMove(dt);
    this.stayOnGround();
  }

  stepMove(dt) {
    const p = this.pos, v = this.vel;
    const ox = p[0], oy = p[1], oz = p[2], ovx = v[0], ovy = v[1], ovz = v[2];
    this.slideMove(dt);
    const dx = p[0], dy = p[1], dz = p[2], dvx = v[0], dvy = v[1], dvz = v[2];
    p[0] = ox; p[1] = oy; p[2] = oz; v[0] = ovx; v[1] = ovy; v[2] = ovz;
    let tr = this.trace(ox, oy, oz, ox, oy + PM.stepSize + TRACE_EPS, oz);
    if (!tr.startsolid && !tr.allsolid) p[1] = tr.ey;
    this.slideMove(dt);
    tr = this.trace(p[0], p[1], p[2], p[0], p[1] - PM.stepSize - TRACE_EPS, p[2]);
    if (!tr.startsolid && !tr.allsolid) { p[0] = tr.ex; p[1] = tr.ey; p[2] = tr.ez; }
    if (tr.fraction === 1 || tr.ny < PM.minWalkNormal) {
      p[0] = dx; p[1] = dy; p[2] = dz; v[0] = dvx; v[1] = dvy; v[2] = dvz;
      return;
    }
    const upDist = (p[0] - ox) ** 2 + (p[2] - oz) ** 2, downDist = (dx - ox) ** 2 + (dz - oz) ** 2;
    if (downDist > upDist) { p[0] = dx; p[1] = dy; p[2] = dz; v[0] = dvx; v[1] = dvy; v[2] = dvz; }
    else {
      v[1] = dvy;
      const up = p[1] - oy;
      if (up > 2) this.shiftView(up);
    }
  }

  stayOnGround() {
    const p = this.pos;
    let tr = this.trace(p[0], p[1], p[2], p[0], p[1] + 2, p[2]);
    const sy = tr.ey;
    tr = this.trace(p[0], sy, p[2], p[0], p[1] - PM.stepSize, p[2]);
    if (tr.fraction > 0 && tr.fraction < 1 && !tr.startsolid && tr.ny >= PM.minWalkNormal) {
      const d = tr.ey - p[1];
      if (Math.abs(d) > 0.01) { p[1] = tr.ey; if (d < -2) this.shiftView(d); }
    }
  }

  clipVel(vx, vy, vz, nx, ny, nz) {
    let b = vx * nx + vy * ny + vz * nz;
    b = b < 0 ? b * 1.001 : b / 1.001;
    const c = this._c; c[0] = vx - nx * b; c[1] = vy - ny * b; c[2] = vz - nz * b;
    return c;
  }

  // Quake 3 PM_SlideMove (gravity handled by the caller).
  slideMove(dt) {
    const p = this.pos, v = this.vel, pl = this._pl;
    let np = 0;
    if (this.onGround) { pl[0] = this.gn[0]; pl[1] = this.gn[1]; pl[2] = this.gn[2]; np = 1; }
    const vl = Math.hypot(v[0], v[1], v[2]);
    if (vl > 0) { pl[np * 3] = v[0] / vl; pl[np * 3 + 1] = v[1] / vl; pl[np * 3 + 2] = v[2] / vl; np++; }
    let timeLeft = dt;
    for (let bump = 0; bump < 4; bump++) {
      const tr = this.trace(p[0], p[1], p[2], p[0] + v[0] * timeLeft, p[1] + v[1] * timeLeft, p[2] + v[2] * timeLeft);
      if (tr.allsolid) { v[1] = 0; return; }
      if (tr.fraction > 0) { p[0] = tr.ex; p[1] = tr.ey; p[2] = tr.ez; }
      if (tr.fraction === 1) break;
      timeLeft -= timeLeft * tr.fraction;
      if (np >= 5) { v[0] = v[1] = v[2] = 0; return; }
      let dup = false;
      for (let i = 0; i < np; i++) {
        if (tr.nx * pl[i * 3] + tr.ny * pl[i * 3 + 1] + tr.nz * pl[i * 3 + 2] > 0.99) { v[0] += tr.nx; v[1] += tr.ny; v[2] += tr.nz; dup = true; break; }
      }
      if (dup) continue;
      pl[np * 3] = tr.nx; pl[np * 3 + 1] = tr.ny; pl[np * 3 + 2] = tr.nz; np++;
      for (let i = 0; i < np; i++) {
        const ix = pl[i * 3], iy = pl[i * 3 + 1], iz = pl[i * 3 + 2];
        if (v[0] * ix + v[1] * iy + v[2] * iz >= 0.1) continue;
        let c = this.clipVel(v[0], v[1], v[2], ix, iy, iz);
        let cx = c[0], cy = c[1], cz = c[2], stop = false;
        for (let j = 0; j < np; j++) {
          if (j === i) continue;
          const jx = pl[j * 3], jy = pl[j * 3 + 1], jz = pl[j * 3 + 2];
          if (cx * jx + cy * jy + cz * jz >= 0.1) continue;
          c = this.clipVel(cx, cy, cz, jx, jy, jz); cx = c[0]; cy = c[1]; cz = c[2];
          if (cx * ix + cy * iy + cz * iz >= 0) continue;
          let dx = iy * jz - iz * jy, dy = iz * jx - ix * jz, dz = ix * jy - iy * jx;
          const dl = Math.hypot(dx, dy, dz);
          if (dl < 1e-9) { stop = true; break; }
          dx /= dl; dy /= dl; dz /= dl;
          const d = dx * v[0] + dy * v[1] + dz * v[2];
          cx = dx * d; cy = dy * d; cz = dz * d;
          for (let k = 0; k < np; k++) {
            if (k === i || k === j) continue;
            if (cx * pl[k * 3] + cy * pl[k * 3 + 1] + cz * pl[k * 3 + 2] >= 0.1) continue;
            stop = true; break;
          }
          if (stop) break;
        }
        if (stop) { v[0] = v[1] = v[2] = 0; return; }
        v[0] = cx; v[1] = cy; v[2] = cz;
        break;
      }
    }
  }

  categorize() {
    const p = this.pos, v = this.vel;
    if (v[1] > 140) { this.onGround = false; return; }
    const tr = this.trace(p[0], p[1], p[2], p[0], p[1] - 2, p[2]);
    if (tr.fraction < 1 && !tr.allsolid && tr.ny >= PM.minWalkNormal) {
      this.onGround = true; this.gn[0] = tr.nx; this.gn[1] = tr.ny; this.gn[2] = tr.nz; this.groundSurf = tr.surf;
      if (tr.fraction > 0) p[1] = tr.ey;
    } else this.onGround = false;
  }

  checkDuck(cmd) {
    const p = this.pos, d = PM.duckDelta;
    if (cmd.duck && !this.ducked) {
      if (!this.onGround && this.fits(p[0], p[1] + d, p[2], true)) { p[1] += d; this.shiftView(d); }
      this.ducked = true;
    } else if (!cmd.duck && this.ducked) {
      if (this.onGround) { if (this.fits(p[0], p[1], p[2], false)) this.ducked = false; }
      else if (this.fits(p[0], p[1] - d, p[2], false)) { p[1] -= d; this.shiftView(-d); this.ducked = false; }
      else if (this.fits(p[0], p[1], p[2], false)) this.ducked = false;
    }
  }

  noclipMove(cmd, dt) {
    const sp = PM.noclipSpeed * (cmd.walk ? 0.35 : 1);
    const cp = Math.cos(this.pitch), spi = Math.sin(this.pitch), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let dx = -sy * cp * cmd.fwd + cy * cmd.side, dy = spi * cmd.fwd + (cmd.jumpHeld ? 1 : 0) - (cmd.duck ? 1 : 0), dz = -cy * cp * cmd.fwd - sy * cmd.side;
    const l = Math.hypot(dx, dy, dz);
    if (l > 1e-6) { dx /= l; dy /= l; dz /= l; }
    const v = this.vel, p = this.pos;
    v[0] = dx * sp; v[1] = dy * sp; v[2] = dz * sp;
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    this.onGround = false; this.ducked = false;
  }

  // Render-time smoothing (called every frame).
  updateView(dt) {
    const target = this.ducked ? 1 : 0;
    this.duckAmt += clamp(target - this.duckAmt, -dt / 0.11, dt / 0.11);
    this.viewOffset = damp(this.viewOffset, 0, 14, dt);
    this.landKick = damp(this.landKick, 0, 8, dt);
  }

  eye(alpha, out) {
    const e = lerp(PM.standEye, PM.duckEye, smoothstep(0, 1, this.duckAmt));
    out[0] = lerp(this.prev[0], this.pos[0], alpha);
    out[1] = lerp(this.prev[1], this.pos[1], alpha) + e + this.viewOffset - this.landKick;
    out[2] = lerp(this.prev[2], this.pos[2], alpha);
    return out;
  }
}
