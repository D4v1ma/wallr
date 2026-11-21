// Bot brains. Perception at 10 Hz (vision cone, line of sight through walls/doors/smoke, hearing),
// reaction delay, aim error that settles while tracking, recoil compensation, burst fire with
// counter-strafing, and waypoint navigation with string pulling, jump links, doors and unsticking.

const BOT_SKILL = {
  easy: { react: 0.62, aimErr: 4.5, turn: 210, recoil: 0.25, head: 0.08, burst: [2, 4], fov: 100, settle: 1.2 },
  normal: { react: 0.36, aimErr: 2.4, turn: 330, recoil: 0.55, head: 0.25, burst: [3, 6], fov: 110, settle: 1.9 },
  hard: { react: 0.2, aimErr: 1.1, turn: 520, recoil: 0.85, head: 0.55, burst: [4, 8], fov: 120, settle: 2.8 },
};

const Bots = {
  rnd: mulberry32(4242),
  get skill() { return BOT_SKILL[Settings.v.botSkill] || BOT_SKILL.normal; },
  // A loud event: enemies of `src` within `radius` may come to look.
  noise(pos, src, radius) {
    for (const a of Actors.list) {
      if (!a.brain || !a.alive || (src && a.team === src.team)) continue;
      const d = Math.hypot(a.player.pos[0] - pos[0], a.player.pos[2] - pos[2]);
      if (d < radius) a.brain.hear(pos, d / radius);
    }
  },
};

class BotBrain {
  constructor(actor) { this.a = actor; this.eyeV = [0, 0, 0]; this.reset(); }

  reset() {
    this.target = null; this.visible = false; this.lastSeen = null; this.lastSeenT = -9; this.reactUntil = 0;
    this.err = [0, 0]; this.aimHead = false; this.goal = null; this.path = null; this.pi = 0; this.repathT = 0;
    this.perceiveT = Bots.rnd() * 0.1; this.clock = 0; this.burstLeft = 0; this.cool = 0; this.lastShots = 0;
    this.strafe = 0; this.strafeT = 0; this.stuckT = 0; this.anchor = null; this.anchorT = 0; this.doorT = 0; this.pullT = 0;
    this.investigate = null; this.lookYaw = null; this.wantYaw = this.a.player.yaw; this.wantPitch = 0; this.fireToggle = false;
    this.order = null; this.via = null; this.altPrev = false; this.glanceT = 0; this.glance = 0; this.smokeAt = null; this.smokeT = 0;
  }

  // Orders come from Tactics; repeating the same order keeps the current route.
  setOrder(o) {
    const cur = this.order;
    if (cur && cur.kind === o.kind && Math.hypot(cur.base[0] - o.pos[0], cur.base[2] - o.pos[2]) < 64) { cur.face = o.face; cur.yaw = o.yaw; cur.site = o.site; return; }
    o.base = o.pos.slice();
    if (o.spread) o.pos = [o.pos[0] + (Bots.rnd() - 0.5) * 2 * o.spread, o.pos[1], o.pos[2] + (Bots.rnd() - 0.5) * 2 * o.spread];
    this.order = o; this.via = o.via ? o.via.slice() : null; this.goal = null; this.path = null;
  }

  // The gun a bot wants in hand: a primary with ammo, else the pistol.
  wantedGun() {
    const lo = this.a.loadout, prim = lo.primary(), pistol = lo.bySlot(2);
    if (prim && prim.ammo + prim.reserve > 0) return prim;
    if (pistol && pistol.ammo + pistol.reserve > 0) return pistol;
    return prim || pistol || null;
  }

  hear(pos, k) {
    if (this.target) return;
    if (!this.investigate || Bots.rnd() < 0.5) this.investigate = pos.slice();
    if (k < 0.6) this.lookYaw = Math.atan2(-(pos[0] - this.a.player.pos[0]), -(pos[2] - this.a.player.pos[2]));
    this.goal = null;
  }

  onHurt(attacker, from) {
    if (!from || this.target) return;
    this.lookYaw = Math.atan2(-(from[0] - this.a.player.pos[0]), -(from[2] - this.a.player.pos[2]));
    this.investigate = from.slice(); this.goal = null;
  }

  los(a, b) {
    const tr = Nav.tr;
    Game.L.cw.trace(tr, a[0], a[1], a[2], b[0], b[1], b[2], 0, 0, 0, MASK_SHOT);
    return tr.fraction >= 1 && !Grenades.blocks(a, b);
  }

  // Head and chest of another actor (from its movement state).
  points(e) {
    const p = e.player.pos, eyeH = lerp(PM.standEye, PM.duckEye, e.player.ducked ? 1 : 0);
    return [[p[0], p[1] + eyeH + 2, p[2]], [p[0], p[1] + eyeH - 14, p[2]]];
  }

  perceive(sk) {
    const a = this.a, pl = a.player, eye = tickEye(pl, this.eyeV), f = viewDir(pl), cosF = Math.cos(sk.fov / 2 * DEG);
    let best = null, bestD = Infinity, bestPts = null;
    for (const e of Actors.list) {
      if (!e.alive || e.team === a.team) continue;
      const [head, chest] = this.points(e);
      const dx = chest[0] - eye[0], dy = chest[1] - eye[1], dz = chest[2] - eye[2], d = Math.hypot(dx, dy, dz);
      if (d > 5000) continue;
      const inView = (dx * f[0] + dy * f[1] + dz * f[2]) / d > cosF || d < 200 || e === this.target;
      if (!inView) continue;
      if (!this.los(eye, chest) && !this.los(eye, head)) continue;
      if (d < bestD) { bestD = d; best = e; bestPts = [head, chest]; }
    }
    if (best) {
      if (best !== this.target) {
        const fresh = this.clock - this.lastSeenT > 1.5;
        this.target = best;
        this.reactUntil = this.clock + sk.react * (0.75 + Bots.rnd() * 0.5) * (fresh ? 1 : 0.4);
        const spread = sk.aimErr * (0.6 + Math.min(1.5, bestD / 900));
        this.err = [(Bots.rnd() - 0.5) * 2 * spread, (Bots.rnd() - 0.5) * 2 * spread * 0.6];
        this.aimHead = Bots.rnd() < sk.head; this.burstLeft = 0; this.cool = 0;
      }
      this.visible = true; this.lastSeen = best.player.pos.slice(); this.lastSeenT = this.clock;
    } else if (this.target) {
      this.visible = false;
      if (!this.target.alive || this.clock - this.lastSeenT > 2.5) {
        if (this.target.alive && this.lastSeen) this.investigate = this.lastSeen;
        this.target = null; this.goal = null; this.path = null;
      }
    }
  }

  think(dt) {
    const a = this.a, cmd = a.cmd, sk = Bots.skill;
    Object.assign(cmd, IDLE_CMD);
    if (!a.alive) return cmd;
    this.clock += dt;
    if ((this.perceiveT -= dt) <= 0) { this.perceiveT = 0.1; this.perceive(sk); }
    if (this.target && !this.target.alive) { this.target = null; this.visible = false; }
    const w = a.loadout.active, o = this.order, p = a.player.pos;
    const near = (q, r) => q && Math.hypot(q[0] - p[0], q[2] - p[2]) < r && Math.abs(q[1] - p[1]) < 60;
    // a defuser out of time keeps its hands on the charge whatever happens
    const mustDefuse = o && o.kind === 'defuse' && Bomb.state === 'planted' && near(Bomb.pos, 44) && Bomb.timer < Bomb.defuseDur + 1.5;
    let busy = false;
    if (this.target && this.visible && !mustDefuse) this.fight(dt, cmd, sk, w);
    else {
      if (this.target && this.lastSeen && !this.investigate) this.investigate = this.lastSeen;
      if (this.smokeAt) { busy = (this.smokeT += dt) < 4 && this.throwSmoke(cmd, this.smokeAt); if (!busy) { this.smokeAt = null; this.smokeT = 0; } }
      else if (o && o.kind === 'plant' && Bomb.siteAt(p) && (near(o.pos, 220) || w.kind === 'charge')) busy = this.plantNow(cmd);
      else if (o && o.kind === 'defuse' && Bomb.state === 'planted' && near(Bomb.pos, 44)) busy = this.defuseNow(cmd);
      else if (o && (o.kind === 'hold' || o.kind === 'guard' || o.kind === 'stack') && !this.investigate && !this.via && near(o.pos, 48)) this.holdPost(dt, o);
      else this.roam(dt, cmd, sk);
      if (!busy) {
        if (w.kind === 'gun' && w.ammo < w.def.mag * 0.4 && w.reserve > 0 && w.state === 'idle') cmd.reload = true;
        const want = this.wantedGun();
        if (want && w !== want && w.state !== 'reload') cmd.slot = want.def.slot;
      }
    }
    this.turn(dt, sk, !!this.target || busy);
    this.altPrev = cmd.alt;
    return cmd;
  }

  plantNow(cmd) {
    const lo = this.a.loadout, ch = lo.byId('charge');
    if (!ch) return false;
    if (lo.active !== ch) cmd.slot = 5;
    else if (ch.state === 'idle' || ch.state === 'plant') cmd.fire = true;
    this.wantPitch = -0.5;
    return true;
  }

  defuseNow(cmd) {
    const p = this.a.player.pos, b = Bomb.pos;
    this.wantYaw = Math.atan2(-(b[0] - p[0]), -(b[2] - p[2])); this.wantPitch = -1.0;
    cmd.useHeld = true;
    return true;
  }

  // Smoke a spot: draw the grenade, aim a lob that lands there, pull the pin and let go.
  throwSmoke(cmd, target) {
    const lo = this.a.loadout, g = lo.byId('smoke'), pl = this.a.player;
    if (!g || g.count <= 0) return false;
    if (lo.active !== g) { cmd.slot = 4; return true; }
    const eye = tickEye(pl, this.eyeV), dx = target[0] - eye[0], dz = target[2] - eye[2];
    this.wantYaw = Math.atan2(-dx, -dz);
    this.wantPitch = BotBrain.lobPitch(Math.hypot(dx, dz) * 0.85, target[1] - eye[1]);
    const aimed = Math.abs(wrapAngle(this.wantYaw - pl.yaw)) < 0.06 && Math.abs(this.wantPitch - pl.pitch) < 0.06;
    if (g.state === 'pull' || (g.state === 'idle' && aimed)) cmd.fire = true;
    return true;
  }

  // Launch pitch for an overhand throw to land `d` units away and `h` units lower/higher.
  static lobPitch(d, h) {
    const v = WEAPONS.smoke.throwSpeed;
    let best = 0.4, bestErr = Infinity;
    for (let p = -0.3; p <= 1.1; p += 0.02) {
      let hx = Math.cos(p), vy = Math.sin(p) + 0.12;
      const l = Math.hypot(hx, vy); hx /= l; vy /= l;
      const vv = vy * v, disc = vv * vv - 2 * NADE_GRAVITY * h;
      if (disc < 0) continue;
      const t = (vv + Math.sqrt(disc)) / NADE_GRAVITY, err = Math.abs(hx * v * t - d);
      if (err < bestErr) { bestErr = err; best = p; }
    }
    return best;
  }

  // At a post: face the expected approach and glance around now and then.
  holdPost(dt, o) {
    const p = this.a.player.pos;
    let base = o.yaw;
    if (o.face) base = Math.atan2((o.face[0] - p[0]), (o.face[2] - p[2]));      // guards look away from the charge
    if (base === null || base === undefined) base = this.wantYaw;
    if ((this.glanceT -= dt) <= 0) { this.glanceT = 1.2 + Bots.rnd() * 2.2; this.glance = (Bots.rnd() - 0.5) * 1.1; }
    this.wantYaw = base + this.glance; this.wantPitch = 0;
  }

  fight(dt, cmd, sk, w) {
    const a = this.a, pl = a.player, eye = tickEye(pl, this.eyeV), t = this.target;
    const [head, chest] = this.points(t), aim = this.aimHead ? head : chest;
    const dx = aim[0] - eye[0], dy = aim[1] - eye[1], dz = aim[2] - eye[2], dist = Math.hypot(dx, dy, dz);
    const k = Math.exp(-dt * sk.settle);
    this.err[0] *= k; this.err[1] *= k;
    const rc = w.kind === 'gun' ? w.recoil : [0, 0];
    this.wantYaw = Math.atan2(-dx, -dz) + (this.err[0] - rc[1] * sk.recoil) * DEG;
    this.wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) + (this.err[1] - rc[0] * sk.recoil) * DEG;
    // weapons: draw a gun, reload when empty, pistol when the primary is dry, scope in at range
    const want = this.wantedGun();
    if (w.kind !== 'gun') { if (want) cmd.slot = want.def.slot; return; }
    if (w.ammo === 0) {
      if (w.def.slot === 1 && w.reserve === 0) cmd.slot = 2; else cmd.reload = true;
    }
    if (w.def.scope && w.zoom === 0 && !w.zoomResume && dist > 280 && w.state === 'idle') cmd.alt = !this.altPrev;
    // shoot when the crosshair is on the target's silhouette
    const off = Math.hypot(wrapAngle(this.wantYaw - pl.yaw), this.wantPitch - pl.pitch) / DEG;
    const size = Math.max(1.0, Math.atan2(12, dist) / DEG);
    const ready = this.clock >= this.reactUntil && (w.state === 'idle' || w.state === 'inspect') && w.ammo > 0;
    const long = dist > 1000;
    let firing = false;
    if (this.cool > 0) this.cool -= dt;
    else if (ready && off < size) {
      if (this.burstLeft <= 0) {
        const [lo, hi] = sk.burst;
        this.burstLeft = long ? 1 + Math.floor(Bots.rnd() * 2) : lo + Math.floor(Bots.rnd() * (hi - lo + 1));
        this.lastShots = w.shotCount; this.crouchPref = long && Bots.rnd() < 0.35;
      }
      firing = true;
      if (w.def.auto) cmd.fire = true; else { this.fireToggle = !this.fireToggle; cmd.fire = this.fireToggle; }
      if (w.shotCount - this.lastShots >= this.burstLeft) { this.burstLeft = 0; this.cool = (long ? 0.45 : 0.22) + Bots.rnd() * 0.25; cmd.fire = false; }
    }
    // movement: stop (counter-strafe) to shoot, strafe between bursts
    const sp = pl.speed();
    if (firing) {
      if (sp > 60) {
        const rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw), lat = pl.vel[0] * rx + pl.vel[2] * rz;
        if (Math.abs(lat) > 40) cmd.side = -Math.sign(lat);
      }
      cmd.duck = !!this.crouchPref;
    } else {
      if ((this.strafeT -= dt) <= 0) { this.strafe = Bots.rnd() < 0.25 ? 0 : (Bots.rnd() < 0.5 ? -1 : 1); this.strafeT = 0.25 + Bots.rnd() * 0.45; }
      cmd.side = this.strafe;
      if (dist > 700 && dist < 1600 && this.strafe === 0) cmd.fwd = 1;
    }
  }

  pickGoal() {
    const L = Game.L, r = Bots.rnd, o = this.order;
    if (o) {
      if (this.via) return this.via.slice();
      // posted bots only chase noises close to their post; carriers and defusers ignore them
      const inv = this.investigate; this.investigate = null;
      if (inv && o.kind !== 'plant' && o.kind !== 'defuse' && o.kind !== 'pickup' && Math.hypot(inv[0] - o.pos[0], inv[2] - o.pos[2]) < 900) return inv.slice();
      return o.pos.slice();
    }
    if (this.investigate) { const g = this.investigate; this.investigate = null; return g.slice(); }
    if (L.hotspots && L.hotspots.length && r() < 0.75) {
      const h = L.hotspots[Math.floor(r() * L.hotspots.length)].pos;
      return [h[0] + (r() - 0.5) * 60, h[1], h[2] + (r() - 0.5) * 60];
    }
    const n = Nav.randomNode(r);
    return n ? [n.x, n.y, n.z] : null;
  }

  roam(dt, cmd, sk) {
    const a = this.a, pl = a.player, p = pl.pos;
    if (this.via && Math.hypot(p[0] - this.via[0], p[2] - this.via[2]) < 130) { this.via = null; this.goal = null; this.path = null; }
    if (!this.goal || (this.repathT -= dt) <= 0 || !this.path) {
      if (!this.goal) this.goal = this.pickGoal();
      this.path = this.goal ? Nav.path(p[0], p[1], p[2], this.goal[0], this.goal[1], this.goal[2]) : null;
      this.pi = 0; this.repathT = 5 + Bots.rnd() * 3;
      if (!this.path) { this.goal = null; return; }
    }
    // string pulling: skip ahead while a straight walk is clear
    if ((this.pullT -= dt) <= 0) {
      this.pullT = 0.3;
      for (let j = Math.min(this.path.length - 1, this.pi + 3); j > this.pi; j--) {
        const n = this.path[j];
        if (this.path.slice(this.pi, j + 1).some((q) => q.jump)) continue;
        const wk = Nav.walk(p[0], p[1], p[2], n.x, n.y, n.z);
        if (wk && !wk.jump) { this.pi = j; break; }
      }
    }
    let n = this.path[this.pi];
    while (n && Math.hypot(n.x - p[0], n.z - p[2]) < 22 && Math.abs(n.y - p[1]) < 40) { this.pi++; n = this.path[this.pi]; }
    if (!n) { this.goal = null; this.path = null; return; }
    const dx = n.x - p[0], dz = n.z - p[2], d2 = Math.hypot(dx, dz);
    this.wantYaw = this.lookYaw !== null ? this.lookYaw : Math.atan2(-dx, -dz);
    if (this.lookYaw !== null && Math.abs(wrapAngle(this.lookYaw - pl.yaw)) < 0.1) this.lookYaw = null;
    this.wantPitch = 0;
    // move toward the waypoint regardless of where we look
    const my = Math.atan2(-dx, -dz), rel = my - pl.yaw;
    cmd.fwd = Math.cos(rel); cmd.side = -Math.sin(rel);
    if (n.jump && d2 < 60 && pl.onGround) cmd.jump = true;
    if (!pl.onGround && pl.vel[1] < 120) cmd.duck = n.jump;
    // doors and getting stuck
    if (!this.anchor || (this.anchorT -= dt) <= 0) {
      const moved = this.anchor ? Math.hypot(p[0] - this.anchor[0], p[2] - this.anchor[2]) : 99;
      this.stuckT = moved < 14 ? this.stuckT + 0.6 : 0;
      this.anchor = p.slice(); this.anchorT = 0.6;
    }
    if (this.stuckT > 0) {
      this.doorT -= dt;
      const door = Ents.doorInReach(tickEye(pl, this.eyeV), viewDir(pl));
      if (door && !door.isOpen() && this.doorT <= 0) { cmd.use = true; this.doorT = 1.5; }
      else if (this.stuckT >= 1.2 && pl.onGround) cmd.jump = true;
      if (this.stuckT >= 2.4) { this.goal = null; this.path = null; this.stuckT = 0; }
    }
  }

  turn(dt, sk, combat) {
    const pl = this.a.player, rate = sk.turn * DEG * dt * (combat ? 1 : 0.65);
    const dy = wrapAngle(this.wantYaw - pl.yaw), dp = this.wantPitch - pl.pitch;
    pl.yaw += clamp(dy * Math.min(1, dt * 14), -rate, rate);
    pl.pitch = clamp(pl.pitch + clamp(dp * Math.min(1, dt * 14), -rate * 0.7, rate * 0.7), -1.4, 1.4);
  }
}
