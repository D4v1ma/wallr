// Bot brains. A bot only knows what it has seen, heard or been told:
//  - sight: a view cone and line of sight (walls, doors and smoke block it); an enemy has to be in
//    view long enough to be noticed (faster near the middle of the view, up close, when moving or
//    firing), then the reaction delay runs before the first shot;
//  - hearing: gunfire and running footsteps give a rough position (muffled and vaguer through walls);
//  - getting shot: only the rough direction it came from;
//  - teammates: a callout of where an enemy was seen, a second or so later.
// What it knows fades: it checks the last position it had, looks around, then goes back to its job.
// Aim error that settles while tracking, recoil compensation, burst fire with counter-strafing,
// and waypoint navigation with string pulling, jump links, doors and unsticking.

// spot: how fast an enemy in view gets noticed (1/s at the middle of the view, close by);
// wallbang: chance to put a wall-piercing shot through cover where an enemy was just seen
const BOT_SKILL = {
  easy: { react: 0.62, aimErr: 4.5, turn: 210, recoil: 0.25, head: 0.08, burst: [2, 4], fov: 100, settle: 1.2, spot: 2.6, wallbang: 0 },
  normal: { react: 0.36, aimErr: 2.4, turn: 330, recoil: 0.55, head: 0.25, burst: [3, 6], fov: 110, settle: 1.9, spot: 4.0, wallbang: 0.3 },
  hard: { react: 0.2, aimErr: 1.1, turn: 520, recoil: 0.85, head: 0.55, burst: [4, 8], fov: 120, settle: 2.8, spot: 5.6, wallbang: 0.5 },
  expert: { react: 0.13, aimErr: 0.7, turn: 700, recoil: 0.95, head: 0.7, burst: [5, 10], fov: 126, settle: 3.5, spot: 7.5, wallbang: 0.7 },
};

const Bots = {
  rnd: mulberry32(4242),
  get skill() { return BOT_SKILL[Settings.v.botSkill] || BOT_SKILL.normal; },
  ear: [0, 0, 0], tr: null,
  // A loud event (a shot, a running footstep): enemies of `src` within `radius` hear it, half as far
  // through walls, and only roughly where it came from (worse with distance and through walls).
  noise(pos, src, radius) {
    for (const a of Actors.list) {
      if (!a.brain || !a.alive || (src && a.team === src.team)) continue;
      const ear = tickEye(a.player, this.ear), d = Math.hypot(ear[0] - pos[0], ear[2] - pos[2]);
      if (d >= radius) continue;
      const walls = !this.clear(ear, pos), eff = radius * (walls ? 0.5 : 1);
      if (d >= eff) continue;
      const err = 40 + d * (walls ? 0.3 : 0.14), r = this.rnd;
      a.brain.hear([pos[0] + (r() - 0.5) * 2 * err, pos[1], pos[2] + (r() - 0.5) * 2 * err], d / eff);
    }
  },
  // Plain line of sight through the level (no smoke): used for hearing.
  clear(a, b) {
    if (!this.tr) this.tr = makeTrace();
    Game.L.cw.trace(this.tr, a[0], a[1], a[2], b[0], b[1], b[2], 0, 0, 0, MASK_SHOT);
    return this.tr.fraction >= 1;
  },
  // A bot that spots an enemy tells its teammates where, a moment later (where it was then).
  callout(from, enemy) {
    const pos = enemy.player.pos.slice();
    for (const m of Actors.list) {
      if (m === from || !m.brain || !m.alive || m.team !== from.team) continue;
      m.brain.inbox.push({ pos, at: m.brain.clock + 0.8 + this.rnd() * 0.8, who: enemy });
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
    this.aware = new Map(); this.inbox = []; this.scanT = 0; this.wbTry = null; this.wbPrev = false; this.lostT = -9;
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

  // A rough position from a sound: turn toward close ones, go and check.
  hear(pos, k) {
    if (this.target && this.visible) return;
    if (!this.investigate || k < 0.5 || Bots.rnd() < 0.4) this.investigate = pos.slice();
    if (k < 0.7) this.lookYaw = Math.atan2(-(pos[0] - this.a.player.pos[0]), -(pos[2] - this.a.player.pos[2]));
    this.goal = null;
  }

  // Shot by someone: only the rough direction it came from, not how far.
  onHurt(attacker, from) {
    if (!from || (this.target && this.visible)) return;
    const p = this.a.player.pos, dx = from[0] - p[0], dz = from[2] - p[2];
    const yaw = Math.atan2(-dx, -dz) + (Bots.rnd() - 0.5) * 0.35, guess = Math.min(Math.hypot(dx, dz), 350 + Bots.rnd() * 450);
    this.lookYaw = yaw;
    this.investigate = [p[0] - Math.sin(yaw) * guess, p[1], p[2] - Math.cos(yaw) * guess]; this.goal = null;
  }

  // A teammate's callout: go and check where the enemy was seen (if it isn't fighting already).
  readInbox() {
    if (!this.inbox.length) return;
    const now = this.inbox.filter((m) => m.at <= this.clock);
    if (!now.length) return;
    this.inbox = this.inbox.filter((m) => m.at > this.clock);
    if (this.target && this.visible) return;
    const m = now[now.length - 1], p = this.a.player.pos;
    this.investigate = m.pos.slice(); this.goal = null;
    if (Math.hypot(m.pos[0] - p[0], m.pos[2] - p[2]) < 900) this.lookYaw = Math.atan2(-(m.pos[0] - p[0]), -(m.pos[2] - p[2]));
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

  // Sight, 10 times a second. Each enemy in view builds up "noticed" until the bot has really seen
  // it; out of view it fades. Nothing outside the view cone (bar someone brushing past) is seen.
  perceive(sk) {
    const a = this.a, pl = a.player, eye = tickEye(pl, this.eyeV), f = viewDir(pl), cosF = Math.cos(sk.fov / 2 * DEG), dt = 0.1;
    let best = null, bestD = Infinity;
    for (const e of Actors.list) {
      if (!e.alive || e.team === a.team) { this.aware.delete(e); continue; }
      const [head, chest] = this.points(e);
      const dx = chest[0] - eye[0], dy = chest[1] - eye[1], dz = chest[2] - eye[2], d = Math.hypot(dx, dy, dz) || 1;
      const cos = (dx * f[0] + dy * f[1] + dz * f[2]) / d, touching = d < 90;
      const seen = d < 5000 && (cos > cosF || touching) && (this.los(eye, chest) || this.los(eye, head));
      let aw = this.aware.get(e) || 0;
      if (seen) {
        const c = smoothstep(cosF, 0.995, cos), center = 0.25 + 2.75 * c * c;          // straight ahead: almost at once; the edge of view: slowly
        const far = clamp(1.6 - d / 1600, 0.3, 1.6);                                   // close and big, or far and small
        const move = e.player.speed() > 130 ? 1.3 : e.player.ducked ? 0.6 : 0.9;
        const loud = Game.time - (e.lastShotT || -9) < 0.6 ? 2.2 : 1;                   // muzzle flash
        const known = e === this.target || Math.hypot(e.player.pos[0] - (this.lastSeen ? this.lastSeen[0] : 1e9), e.player.pos[2] - (this.lastSeen ? this.lastSeen[2] : 1e9)) < 300 ? 3 : 1;
        aw += dt * sk.spot * center * far * move * loud * known * (touching ? 4 : 1);
      } else aw -= dt * 0.35;
      if (aw > 0) this.aware.set(e, Math.min(aw, 1.6)); else this.aware.delete(e);
      if (seen && aw >= 1 && d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      if (best !== this.target) {
        if (this.clock - this.lastSeenT > 4 && Bots.rnd() < 0.85) Bots.callout(a, best);
        const fresh = this.clock - this.lastSeenT > 1.5;
        this.target = best;
        this.reactUntil = this.clock + sk.react * (0.75 + Bots.rnd() * 0.5) * (fresh ? 1 : 0.4);
        const spread = sk.aimErr * (0.6 + Math.min(1.5, bestD / 900));
        this.err = [(Bots.rnd() - 0.5) * 2 * spread, (Bots.rnd() - 0.5) * 2 * spread * 0.6];
        this.aimHead = Bots.rnd() < sk.head; this.burstLeft = 0; this.cool = 0;
      }
      this.visible = true; this.lastSeen = best.player.pos.slice(); this.lastSeenT = this.clock;
    } else if (this.target) {
      if (this.visible) this.lostT = this.clock;
      this.visible = false;
      if (!this.target.alive || this.clock - this.lastSeenT > 2.5) {
        if (this.target.alive && this.lastSeen) { this.investigate = this.lastSeen; this.scanT = 0; }
        this.target = null; this.goal = null; this.path = null;
      }
    }
  }

  // Just lost sight of someone: sometimes put a wall-piercing shot through the cover where they were.
  // Uses only where the enemy was last seen, like a player pre-firing a corner.
  wallbangTry(dt, cmd, sk, w) {
    const a = this.a, pl = a.player;
    if (!this.wbTry) {
      if (!this.target || this.visible || this.lostT < 0 || this.clock - this.lostT > 0.25 || !this.lastSeen) return false;
      if (w.kind !== 'gun' || w.ammo <= 0 || !Wallbang.ready(a) || Bots.rnd() >= sk.wallbang) { this.lostT = -9; return false; }
      const p = this.lastSeen, d = Math.hypot(p[0] - pl.pos[0], p[2] - pl.pos[2]);
      this.lostT = -9;
      if (d > 1800 || d < 120) return false;
      const e = sk.aimErr * 1.5;
      this.wbTry = { pos: [p[0], p[1] + 48, p[2]], t: 0, err: [(Bots.rnd() - 0.5) * e, (Bots.rnd() - 0.5) * e * 0.6], armed: false };
    }
    const t = this.wbTry, eye = tickEye(pl, this.eyeV);
    t.t += dt;
    if (t.t > 1.6 || w.kind !== 'gun' || this.visible) { this.wbTry = null; if (Wallbang.armed(a)) Wallbang.toggle(a); return false; }
    const dx = t.pos[0] - eye[0], dy = t.pos[1] - eye[1], dz = t.pos[2] - eye[2];
    this.wantYaw = Math.atan2(-dx, -dz) + t.err[0] * DEG; this.wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) + t.err[1] * DEG;
    if (!Wallbang.armed(a)) {
      if (t.armed) { this.wbTry = null; return false; }            // the round went out: done
      t.armed = true;
      if (Wallbang.toggle(a) !== 'armed') { this.wbTry = null; return false; }
      return true;
    }
    const off = Math.hypot(wrapAngle(this.wantYaw - pl.yaw), this.wantPitch - pl.pitch) / DEG;
    if (off < 1.2 && (w.state === 'idle' || w.state === 'inspect') && w.ammo > 0) { cmd.fire = !this.fireToggle; this.fireToggle = !this.fireToggle; }
    if (pl.speed() > 60) { const rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw), lat = pl.vel[0] * rx + pl.vel[2] * rz; if (Math.abs(lat) > 40) cmd.side = -Math.sign(lat); }
    return true;
  }

  think(dt) {
    const a = this.a, cmd = a.cmd, sk = Bots.skill;
    Object.assign(cmd, IDLE_CMD);
    if (!a.alive) return cmd;
    this.clock += dt;
    if ((this.perceiveT -= dt) <= 0) { this.perceiveT = 0.1; this.perceive(sk); }
    this.readInbox();
    if (this.target && !this.target.alive) { this.target = null; this.visible = false; }
    const w = a.loadout.active, o = this.order, p = a.player.pos;
    const near = (q, r) => q && Math.hypot(q[0] - p[0], q[2] - p[2]) < r && Math.abs(q[1] - p[1]) < 60;
    // a defuser out of time keeps its hands on the charge whatever happens
    const mustDefuse = o && o.kind === 'defuse' && Bomb.state === 'planted' && near(Bomb.pos, 44) && Bomb.timer < Bomb.defuseDur + 1.5;
    let busy = false;
    if (this.target && this.visible && !mustDefuse) this.fight(dt, cmd, sk, w);
    else if (!mustDefuse && this.wallbangTry(dt, cmd, sk, w)) busy = true;
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
