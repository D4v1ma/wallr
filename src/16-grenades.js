// Thrown smoke grenades: bouncing projectile physics and the smoke clouds they release.

const NADE_GRAVITY = 320;   // grenades fall slower than players (0.4x)
const NADE_HALF = 2;

class SmokeCloud {
  constructor(L, pos, seed) {
    this.p = pos.slice(); this.t = 0; this.life = 18; this.R = 150;
    const rnd = mulberry32(seed), cw = L.cw, tr = makeTrace();
    const c = [pos[0], pos[1] + 26, pos[2]];
    this.puffs = [];
    for (let i = 0; i < 46; i++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * this.R, h = Math.pow(rnd(), 1.4) * this.R * 0.95;
      let ox = Math.cos(a) * r, oy = 14 + h * (1 - Math.pow(r / this.R, 2) * 0.55), oz = Math.sin(a) * r;
      // keep the cloud inside the room: pull puffs back from walls
      cw.trace(tr, c[0], c[1], c[2], pos[0] + ox, pos[1] + oy, pos[2] + oz, 10, 10, 10, MASK_SHOT);
      if (tr.fraction < 1) {
        const k = Math.max(0, tr.fraction - 0.06);
        ox = (c[0] - pos[0]) + (pos[0] + ox - c[0]) * k; oy = (c[1] - pos[1]) + (pos[1] + oy - c[1]) * k; oz = (c[2] - pos[2]) + (pos[2] + oz - c[2]) * k;
      }
      this.puffs.push({ o: [ox, oy, oz], size: 62 + rnd() * 44, rot: rnd() * TAU, spin: (rnd() - 0.5) * 0.12, v: Math.floor(rnd() * 4),
        shade: 0.88 + rnd() * 0.16 + (oy / this.R) * 0.08, delay: rnd() * 0.45, drift: [(rnd() - 0.5) * 3, 1.2 + rnd() * 2.2, (rnd() - 0.5) * 3] });
    }
    const pr = sampleProbes(L.probes, c[0], c[1] + 40, c[2], [0, 0, 0, 0]), env = L.env;
    const sunK = pr[3] * env.sunIntensity * 0.55;
    this.light = [0.78 * (pr[0] + env.sunColor[0] * sunK), 0.78 * (pr[1] + env.sunColor[1] * sunK), 0.78 * (pr[2] + env.sunColor[2] * sunK)].map((v) => clamp(v, 0.12, 1.05));
  }
  density() { return smoothstep(0, 0.5, this.t) * (1 - smoothstep(this.life - 3.2, this.life, this.t)); }
  alive() { return this.t < this.life; }
  // Visit every puff's current state.
  each(fn) {
    const t = this.t, dens = this.density();
    for (const q of this.puffs) {
      const tt = Math.max(0, t - q.delay), grow = 1 - Math.exp(-tt * 2.1);
      const k = 0.22 + 0.78 * grow;
      fn(this.p[0] + q.o[0] * k + q.drift[0] * t, this.p[1] + q.o[1] * k + q.drift[1] * t, this.p[2] + q.o[2] * k + q.drift[2] * t,
        q.size * (0.3 + 0.7 * grow), q.rot + q.spin * t, dens * smoothstep(0, 0.25, tt) * 0.82, q.v, q.shade);
    }
  }
  // 0..1: how deep the camera sits inside the cloud.
  inside(x, y, z) {
    const dx = x - this.p[0], dy = y - (this.p[1] + this.R * 0.35), dz = z - this.p[2];
    const d = Math.hypot(dx, dy * 1.4, dz) / (this.R * 0.85);
    return clamp(1.25 - d, 0, 1) * this.density() * smoothstep(0.4, 1.4, this.t);
  }
}

const Grenades = {
  list: [], clouds: [], tr: makeTrace(), L: null, geo: null, seed: 1,

  init(L) {
    this.L = L;
    const body = new THREE.CylinderGeometry(1.2, 1.2, 4.2, 10);
    const top = new THREE.CylinderGeometry(0.55, 0.62, 1.0, 8); top.translate(0, 2.6, 0);
    const lever = new THREE.BoxGeometry(0.5, 3.2, 0.14); lever.translate(0, 1.0, 1.28);
    this.geo = mergeGeos([body, top, lever]);
  },

  // New round: no grenades in flight, no smoke left over.
  clear() {
    for (const g of this.list) { if (R.scene && g.mesh) R.scene.remove(g.mesh); if (g.mat) g.mat.dispose(); }
    this.list = []; this.clouds = [];
  },

  spawn(pl, mode, eye, dir) {
    const d = WEAPONS.smoke, speed = mode === 'over' ? d.throwSpeed : d.lobSpeed;
    const up = mode === 'over' ? 0.12 : 0.3;
    let vx = dir[0], vy = dir[1] + up, vz = dir[2];
    const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
    const rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw);
    const target = [eye[0] + dir[0] * 14 + rx * 3, eye[1] + dir[1] * 14 - (mode === 'over' ? 1 : 12), eye[2] + dir[2] * 14 + rz * 3];
    this.L.cw.trace(this.tr, eye[0], eye[1], eye[2], target[0], target[1], target[2], NADE_HALF, NADE_HALF, NADE_HALF, MASK_SHOT);
    const p = [this.tr.ex, this.tr.ey, this.tr.ez];
    const mat = new THREE.MeshLambertMaterial({ map: R.textures ? R.textures.nade : null });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.scale.setScalar(0.85);
    if (R.scene) R.scene.add(mesh);
    const g = { p, prev: p.slice(), v: [vx * speed + pl.vel[0], vy * speed + pl.vel[1] * 0.6, vz * speed + pl.vel[2]], rot: [0, pl.yaw, 0], spin: [8 + Math.random() * 6, 0, 3], age: 0,
      rest: false, restT: 0, popped: false, mesh, mat, bounces: 0, cloud: null };
    this.list.push(g);
    return g;
  },

  tick(dt) {
    const cw = this.L.cw, tr = this.tr;
    for (const g of this.list) {
      g.prev[0] = g.p[0]; g.prev[1] = g.p[1]; g.prev[2] = g.p[2];
      g.age += dt;
      if (g.rest) g.restT += dt;
      else {
        const v = g.v;
        v[1] -= NADE_GRAVITY * dt;
        let left = dt;
        for (let i = 0; i < 3 && left > 1e-5; i++) {
          cw.trace(tr, g.p[0], g.p[1], g.p[2], g.p[0] + v[0] * left, g.p[1] + v[1] * left, g.p[2] + v[2] * left, NADE_HALF, NADE_HALF, NADE_HALF, MASK_SHOT);
          if (tr.allsolid) { v[0] = v[1] = v[2] = 0; g.rest = true; break; }
          g.p[0] = tr.ex; g.p[1] = tr.ey; g.p[2] = tr.ez;
          if (tr.fraction >= 1) break;
          left *= 1 - tr.fraction;
          const vn = v[0] * tr.nx + v[1] * tr.ny + v[2] * tr.nz;
          if (vn < 0) {
            v[0] -= 1.45 * vn * tr.nx; v[1] -= 1.45 * vn * tr.ny; v[2] -= 1.45 * vn * tr.nz;
            if (tr.ny > 0.7) { v[0] *= 0.7; v[2] *= 0.7; } else { v[0] *= 0.8; v[1] *= 0.8; v[2] *= 0.8; }
            g.spin[0] *= 0.55; g.spin[2] *= 0.55;
            if (-vn > 55 && g.bounces < 8) { Snd.nadeBounce(SURF_NAMES[tr.surf], -vn, g.p.slice()); g.bounces++; }
            if (tr.ny > 0.7 && Math.hypot(v[0], v[1], v[2]) < 32) { v[0] = v[1] = v[2] = 0; g.rest = true; break; }
          }
        }
        g.rot[0] += g.spin[0] * dt; g.rot[2] += g.spin[2] * dt;
      }
      if (!g.popped && ((g.rest && g.restT > 0.3 && g.age > 1.0) || g.age > 6)) {
        g.popped = true;
        g.cloud = new SmokeCloud(this.L, g.p, this.seed++ * 7919);
        this.clouds.push(g.cloud);
        Snd.smokePop(g.p.slice());
      }
    }
    for (const c of this.clouds) c.t += dt;
    this.clouds = this.clouds.filter((c) => c.alive());
    this.list = this.list.filter((g) => {
      const keep = !g.popped || g.cloud.alive();
      if (!keep) { if (R.scene) R.scene.remove(g.mesh); g.mat.dispose(); }
      return keep;
    });
  },

  render(alpha) {
    for (const g of this.list) {
      g.mesh.position.set(lerp(g.prev[0], g.p[0], alpha), lerp(g.prev[1], g.p[1], alpha), lerp(g.prev[2], g.p[2], alpha));
      if (g.rest) { g.mesh.rotation.set(Math.PI / 2, g.rot[1], 0); g.mesh.position.y -= NADE_HALF - 1.0; }
      else g.mesh.rotation.set(g.rot[0], g.rot[1], g.rot[2]);
      const pr = sampleProbes(this.L.probes, g.p[0], g.p[1] + 8, g.p[2], FX.probe), env = this.L.env;
      const s = pr[3] * env.sunIntensity * 0.7;
      g.mat.color.setRGB(pr[0] + s * env.sunColor[0], pr[1] + s * env.sunColor[1], pr[2] + s * env.sunColor[2]);
    }
  },

  // Does a dense cloud sit across the line a -> b? (used for bot sight)
  blocks(a, b) {
    for (const c of this.clouds) {
      const dens = c.density() * smoothstep(0.4, 1.6, c.t);
      if (dens < 0.35) continue;
      const cx = c.p[0], cy = c.p[1] + c.R * 0.4, cz = c.p[2], r = c.R * 0.78 * dens;
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], ll = dx * dx + dy * dy + dz * dz || 1;
      const t = clamp(((cx - a[0]) * dx + (cy - a[1]) * dy + (cz - a[2]) * dz) / ll, 0, 1);
      if (Math.hypot(a[0] + dx * t - cx, (a[1] + dy * t - cy) * 1.3, a[2] + dz * t - cz) < r) return true;
    }
    return false;
  },

  // Strongest "inside the smoke" factor at a point, plus the cloud colour.
  insideAt(x, y, z, outCol) {
    let best = 0;
    for (const c of this.clouds) {
      const k = c.inside(x, y, z);
      if (k > best) { best = k; outCol[0] = c.light[0]; outCol[1] = c.light[1]; outCol[2] = c.light[2]; }
    }
    return best;
  },
};
