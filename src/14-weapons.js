// Weapon definitions, spray patterns and tick-driven weapon logic (guns, knife, grenade) + loadout.
// Angles in degrees, inaccuracy in milliradians, distances in units.

// Absolute spray offsets [pitch up, yaw left] per shot index. Shot 0 is dead on.
const RIFLE_PATTERN = (() => {
  const d = [[0, 0], [0.42, -0.04], [0.55, 0.05], [0.72, -0.08], [0.85, 0.1], [0.9, 0.12], [0.88, 0.02], [0.82, -0.1], [0.7, -0.14], [0.56, 0.08],
    [0.3, 0.5], [0.26, 0.55], [0.24, 0.6], [0.2, 0.55], [0.2, 0.5], [0.18, 0.45], [0.16, 0.4], [0.15, 0.3],
    [0.14, -0.6], [0.14, -0.75], [0.12, -0.8], [0.12, -0.75], [0.1, -0.7], [0.1, -0.6], [0.1, -0.5], [0.08, -0.4],
    [0.08, 0.45], [0.06, 0.5], [0.06, 0.5], [0.05, 0.4]];
  let p = 0, y = 0;
  return d.map(([dp, dy]) => [(p += dp * 0.85), (y += dy * 0.85)]);
})();
const PISTOL_PATTERN = Array.from({ length: 16 }, (_, i) => [1.3 * Math.pow(i, 0.82), i ? (i % 2 ? 1 : -1) * Math.min(1.1, 0.18 + i * 0.07) : 0]);
// SMG: gentle climb (~3 deg by shot 10), then a soft left-right wobble.
const SMG_PATTERN = (() => {
  const d = [[0, 0], [0.3, 0.02], [0.36, -0.04], [0.4, 0.05], [0.42, -0.06], [0.4, 0.08], [0.36, -0.05], [0.32, 0.06], [0.28, -0.04], [0.24, 0.05],
    [0.16, 0.3], [0.14, 0.32], [0.12, 0.3], [0.1, 0.26], [0.1, 0.2], [0.08, -0.3], [0.08, -0.38], [0.07, -0.4], [0.07, -0.36], [0.06, -0.3],
    [0.06, 0.3], [0.05, 0.34], [0.05, 0.3], [0.05, 0.24], [0.04, -0.26], [0.04, -0.3], [0.04, -0.28], [0.03, 0.2], [0.03, 0.24], [0.03, 0.2]];
  let p = 0, y = 0;
  return d.map(([dp, dy]) => [(p += dp), (y += dy)]);
})();
const SHOTGUN_PATTERN = [[0, 0], [1.4, 0.2], [2.4, -0.3], [3.1, 0.35], [3.6, -0.2], [4.0, 0.3], [4.3, -0.25], [4.5, 0.2], [4.6, 0]];
const SNIPER_PATTERN = Array.from({ length: 12 }, () => [0, 0]);   // bolt gun: all punch, no persistent drift

function patternAt(pat, idx) {
  if (idx <= 0) return [0, 0];
  const n = pat.length;
  if (idx >= n - 1) {
    const a = pat[n - 2], b = pat[n - 1], k = idx - (n - 1);
    return [b[0] + (b[0] - a[0]) * k * 0.4, b[1] + Math.sin(idx * 1.3) * 0.5];
  }
  const i = Math.floor(idx), f = idx - i;
  return [lerp(pat[i][0], pat[i + 1][0], f), lerp(pat[i][1], pat[i + 1][1], f)];
}

const WEAPONS = {
  rifle: {
    id: 'rifle', slot: 1, name: 'KESTREL AR', kind: 'gun', auto: true, mag: 30, reserve: 90, rpm: 600, price: 2700, killReward: 300,
    reload: { time: 2.45, empty: 2.85, marks: [[0.28, 'magout'], [0.5, 'cloth'], [1.36, 'magin']], emptyMarks: [[2.2, 'bolt']] },
    drawTime: 0.9, drawMarks: [[0.08, 'cloth'], [0.55, 'bolt']], inspectTime: 3.4, inspectMarks: [[0.2, 'cloth'], [1.9, 'cloth']], maxSpeed: 225,
    damage: 33, armorPen: 0.775, rangeMod: 0.98, penetration: 2.0, range: 8192,
    spread: 0.6, inStand: 4.8, inCrouch: 3.2, inMove: 150, inAir: 150, inLand: 70, inFire: 3.2, inFireMax: 26, recoverStand: 0.42, recoverCrouch: 0.3,
    recoil: { pattern: RIFLE_PATTERN, jitter: 0.12, recover: 13, viewFrac: 0.5 },
    kick: 1.0, tracerEvery: 2, shell: 'rifle', flash: 1.0, sound: 'rifle',
  },
  pistol: {
    id: 'pistol', slot: 2, name: 'WASP 9', kind: 'gun', auto: false, mag: 15, reserve: 45, rpm: 400, price: 200, killReward: 300,
    reload: { time: 2.15, empty: 2.35, marks: [[0.25, 'magout'], [1.3, 'magin']], emptyMarks: [[1.85, 'slide']] },
    drawTime: 0.6, drawMarks: [[0.05, 'cloth'], [0.3, 'slide']], inspectTime: 2.6, inspectMarks: [[0.15, 'cloth']], maxSpeed: 240,
    damage: 35, armorPen: 0.55, rangeMod: 0.85, penetration: 1.0, range: 4096,
    spread: 1.4, inStand: 6.0, inCrouch: 4.6, inMove: 32, inAir: 70, inLand: 30, inFire: 26, inFireMax: 70, recoverStand: 0.32, recoverCrouch: 0.26,
    recoil: { pattern: PISTOL_PATTERN, jitter: 0.3, recover: 7, viewFrac: 0.55 },
    kick: 1.35, tracerEvery: 3, shell: 'pistol', flash: 0.62, sound: 'pistol',
  },
  smg: {
    id: 'smg', slot: 1, name: 'SWIFT SMG', kind: 'gun', auto: true, mag: 30, reserve: 120, rpm: 800, price: 1250, killReward: 600,
    reload: { time: 2.25, empty: 2.6, marks: [[0.25, 'magout'], [0.45, 'cloth'], [1.25, 'magin']], emptyMarks: [[2.02, 'bolt']] },
    drawTime: 0.75, drawMarks: [[0.08, 'cloth'], [0.45, 'bolt']], inspectTime: 3.0, inspectMarks: [[0.2, 'cloth'], [1.6, 'cloth']], maxSpeed: 240,
    damage: 26, armorPen: 0.6, rangeMod: 0.84, penetration: 1.0, range: 4096,
    spread: 1.0, inStand: 9.0, inCrouch: 6.5, inMove: 45, inAir: 120, inLand: 40, inFire: 2.6, inFireMax: 30, recoverStand: 0.3, recoverCrouch: 0.24,
    recoil: { pattern: SMG_PATTERN, jitter: 0.16, recover: 16, viewFrac: 0.5 },
    kick: 0.7, tracerEvery: 3, shell: 'pistol', flash: 0.7, sound: 'smg',
  },
  shotgun: {
    id: 'shotgun', slot: 1, name: 'BISON 12', kind: 'gun', auto: true, mag: 8, reserve: 32, rpm: 68, price: 1100, killReward: 900,
    pellets: 9, pelletSpread: 38,
    shellReload: { start: 0.42, each: 0.48, end: 0.55, endQuick: 0.3, shellMarks: [[0.3, 'shellIn']], endMarks: [[0.12, 'pumpBack'], [0.3, 'pumpFwd']] },
    fireMarks: [[0.3, 'pumpBack'], [0.47, 'pumpFwd']], ejectOn: 'pumpBack',
    reload: { time: 0, empty: 0, marks: [], emptyMarks: [] },
    drawTime: 0.85, drawMarks: [[0.08, 'cloth'], [0.4, 'pumpBack'], [0.55, 'pumpFwd']], inspectTime: 3.0, inspectMarks: [[0.2, 'cloth'], [1.7, 'cloth']], maxSpeed: 220,
    damage: 26, armorPen: 0.5, rangeMod: 0.7, penetration: 1.0, range: 3000,
    spread: 0, inStand: 6.0, inCrouch: 5.0, inMove: 30, inAir: 90, inLand: 30, inFire: 8, inFireMax: 16, recoverStand: 0.4, recoverCrouch: 0.35,
    recoil: { pattern: SHOTGUN_PATTERN, jitter: 0.3, recover: 6, viewFrac: 0.65 },
    kick: 2.1, tracerEvery: 0, shell: 'shotgun', flash: 1.35, sound: 'shotgun',
  },
  sniper: {
    id: 'sniper', slot: 1, name: 'OSPREY LR', kind: 'gun', auto: false, mag: 10, reserve: 30, rpm: 41, price: 4750, killReward: 100,
    scope: [40, 12], scopedSpeed: 100,
    fireMarks: [[0.42, 'boltUp'], [0.56, 'boltBack'], [0.8, 'boltFwd'], [0.94, 'boltDown']], ejectOn: 'boltBack',
    reload: { time: 3.0, empty: 3.6, marks: [[0.4, 'magout'], [0.7, 'cloth'], [1.7, 'magin']], emptyMarks: [[2.6, 'boltUp'], [2.72, 'boltBack'], [2.95, 'boltFwd'], [3.08, 'boltDown']] },
    drawTime: 1.1, drawMarks: [[0.1, 'cloth'], [0.62, 'boltBack'], [0.8, 'boltFwd']], inspectTime: 3.2, inspectMarks: [[0.2, 'cloth'], [1.8, 'cloth']], maxSpeed: 200,
    damage: 115, armorPen: 0.975, rangeMod: 0.99, penetration: 2.5, range: 8192,
    spread: 0.2, inStand: 85, inCrouch: 65, inScoped: 1.2, inScopedCrouch: 0.8, inMove: 260, inAir: 400, inLand: 150, inFire: 60, inFireMax: 60, recoverStand: 0.35, recoverCrouch: 0.3,
    recoil: { pattern: SNIPER_PATTERN, jitter: 0.05, recover: 6, viewFrac: 0.6 },
    kick: 2.0, tracerEvery: 1, shell: 'rifle', flash: 1.5, sound: 'sniper',
  },
  knife: {
    id: 'knife', slot: 3, name: 'FIELD KNIFE', kind: 'knife', maxSpeed: 250, drawTime: 0.75, drawMarks: [[0.12, 'knifeDraw']], armorPen: 0.85, killReward: 1500,
    inspectTime: 3.0, inspectMarks: [[0.35, 'cloth'], [1.2, 'knifeDraw']],
    slash: { interval: 0.42, delay: 0.1, range: 48, damage: 25 }, stab: { interval: 1.05, delay: 0.24, range: 34, damage: 65 },
  },
  smoke: {
    id: 'smoke', slot: 4, name: 'VEIL SMOKE', kind: 'grenade', maxSpeed: 245, drawTime: 0.55, drawMarks: [[0.08, 'cloth']], inspectTime: 0,
    pullTime: 0.35, throwTime: 0.45, releaseAt: 0.09, throwSpeed: 680, lobSpeed: 320, restock: 2.5, price: 300, killReward: 300,
  },
  charge: {
    id: 'charge', slot: 5, name: 'THE CHARGE', kind: 'charge', maxSpeed: 250, drawTime: 0.8, drawMarks: [[0.1, 'cloth']], inspectTime: 0, killReward: 300,
    plantTime: 3.2, plantMarks: [[0.35, 'key'], [0.7, 'key'], [1.05, 'key'], [1.4, 'key'], [1.75, 'key'], [2.1, 'key'], [2.45, 'key']],
  },
};

class Weapon {
  constructor(def) {
    this.def = def; this.kind = def.kind; this.state = 'holstered'; this.t = 0; this.clock = 0;
    this.events = []; this.anim = 'draw'; this.animStart = 0; this.marks = null; this.markIdx = 0;
    this.recoil = [0, 0]; this.recoilView = [0, 0]; this.viewKick = 0; this.lastShotClock = -9;
  }
  play(name, marks) { this.anim = name; this.animStart = this.clock; this.marks = marks || null; this.markIdx = 0; }
  animTime() { return this.clock - this.animStart; }
  draw() { this.state = 'draw'; this.t = 0; this.play('draw', this.def.drawMarks); this.events.push({ type: 'draw', id: this.def.id }); }
  holster() { this.state = 'holstered'; this.marks = null; }
  inaccuracy() { return 0; }
  spreadBase() { return 0; }
  speed() { return this.def.maxSpeed; }
  startInspect() {
    if (!this.def.inspectTime || this.state !== 'idle') return;
    this.state = 'inspect'; this.t = 0; this.play('inspect', this.def.inspectMarks);
  }
  baseTick(dt) {
    this.clock += dt; this.t += dt;
    if (this.marks) {
      while (this.markIdx < this.marks.length && this.animTime() >= this.marks[this.markIdx][0]) {
        this.events.push({ type: 'sfx', part: this.marks[this.markIdx++][1], id: this.def.id });
      }
    }
    this.viewKick = Math.max(0, this.viewKick * Math.exp(-dt * 18) - dt * 0.5);
    this.recoilView[0] = damp(this.recoilView[0], this.recoil[0], 30, dt);
    this.recoilView[1] = damp(this.recoilView[1], this.recoil[1], 30, dt);
  }
  commonStates() {
    if (this.state === 'draw' && this.t >= this.def.drawTime) this.state = 'idle';
    if (this.state === 'inspect' && this.t >= this.def.inspectTime) this.state = 'idle';
  }
}

class Gun extends Weapon {
  constructor(def) {
    super(def);
    this.ammo = def.mag; this.reserve = def.reserve; this.nextFire = 0; this.fireInacc = 0;
    this.sprayIdx = 0; this.jit = [0, 0]; this.triggerHeld = true; this.emptyReload = false; this.slideLocked = false;
    this.lastShot = -9; this.shotCount = 0; this.heat = 0; this.reloadDur = 0; this.rnd = mulberry32(def.slot * 977 + def.mag);
    this.zoom = 0; this.zoomResume = 0; this.altHeld = true; this.reloadPhase = null; this.phaseT = 0; this.reloadAbort = false;
  }
  spreadBase() { return this.def.spread; }
  speed() { return this.zoom && this.def.scopedSpeed ? this.def.scopedSpeed : this.def.maxSpeed; }
  // Horizontal 4:3 FOV of the current scope level (0 when not zoomed).
  scopeFov() { return this.zoom && this.def.scope ? this.def.scope[this.zoom - 1] : 0; }
  draw() { super.draw(); this.triggerHeld = true; this.altHeld = true; this.zoom = 0; this.zoomResume = 0; }
  holster() { super.holster(); this.zoom = 0; this.zoomResume = 0; this.reloadPhase = null; }

  inaccuracy(pl) {
    const d = this.def, scoped = this.zoom > 0;
    let a = scoped ? (pl.ducked ? d.inScopedCrouch : d.inScoped) : (pl.ducked ? d.inCrouch : d.inStand);
    a += d.inMove * smoothstep(d.maxSpeed * 0.34, d.maxSpeed * 0.95, pl.speed());
    if (!pl.onGround && !pl.noclip) a += d.inAir;
    return a + d.inLand * pl.landPenalty + this.fireInacc;
  }

  startReload() {
    const d = this.def, r = d.reload;
    this.zoom = 0; this.zoomResume = 0;
    this.emptyReload = this.ammo === 0;
    this.state = 'reload'; this.t = 0;
    if (d.shellReload) {
      // shell by shell: start, one insert per shell, and a pump at the end if the chamber was empty
      const sr = d.shellReload, n = Math.min(d.mag - this.ammo, this.reserve);
      this.reloadPhase = 'start'; this.phaseT = 0; this.reloadAbort = false;
      this.reloadDur = sr.start + sr.each * n + (this.emptyReload ? sr.end : sr.endQuick);
      this.play('reloadStart');
    } else {
      this.reloadDur = this.emptyReload ? r.empty : r.time;
      this.play(this.emptyReload ? 'reloadEmpty' : 'reload', this.emptyReload ? r.marks.concat(r.emptyMarks) : r.marks);
    }
    this.events.push({ type: 'reload' });
  }

  shellReloadTick(cmd, dt) {
    const d = this.def, sr = d.shellReload;
    this.phaseT += dt;
    if (cmd.fire && this.ammo > 0) this.reloadAbort = true;         // firing interrupts after the current shell
    if (this.reloadPhase === 'start' && this.phaseT >= sr.start) {
      this.reloadPhase = 'shell'; this.phaseT = 0; this.play('reloadShell', sr.shellMarks);
    } else if (this.reloadPhase === 'shell' && this.phaseT >= sr.each) {
      this.ammo++; this.reserve--; this.phaseT = 0;
      if (this.ammo < d.mag && this.reserve > 0 && !this.reloadAbort) this.play('reloadShell', sr.shellMarks);
      else {
        // back to the shoulder; pump to chamber a round if the gun ran dry
        this.reloadPhase = 'end'; this.endDur = this.emptyReload ? sr.end : sr.endQuick;
        this.play(this.emptyReload ? 'reloadEndPump' : 'reloadEnd', this.emptyReload ? sr.endMarks : null);
      }
    } else if (this.reloadPhase === 'end' && this.phaseT >= this.endDur) {
      this.state = 'idle'; this.reloadPhase = null; this.play('idle');
    }
  }

  tick(cmd, pl, time, dt) {
    this.baseTick(dt);
    const d = this.def, rc = d.recoil, interval = 60 / d.rpm;
    this.fireInacc *= Math.exp(-dt * 2.3 / (pl.ducked ? d.recoverCrouch : d.recoverStand));
    this.heat = Math.max(0, this.heat - dt * 0.5);
    if (time - this.lastShot > interval * 1.25) this.sprayIdx = Math.max(0, this.sprayIdx - dt * rc.recover);
    const P = patternAt(rc.pattern, Math.max(0, this.sprayIdx - 1)), fade = clamp(this.sprayIdx, 0, 1);
    this.recoil[0] = P[0] + this.jit[0] * fade; this.recoil[1] = P[1] + this.jit[1] * fade;

    this.commonStates();
    if (this.state === 'reload') {
      if (d.shellReload) this.shellReloadTick(cmd, dt);
      else if (this.t >= this.reloadDur) {
        const take = Math.min(d.mag - this.ammo, this.reserve);
        this.ammo += take; this.reserve -= take; this.state = 'idle'; this.slideLocked = false;
      }
    }
    const ready = this.state === 'idle' || this.state === 'inspect';
    // scope: secondary fire steps through the zoom levels; the bolt cycle drops it and brings it back
    if (d.scope) {
      const press = cmd.alt && !this.altHeld;
      if (press && this.zoomResume) this.zoomResume = 0;
      else if (press && ready) { this.zoom = (this.zoom + 1) % (d.scope.length + 1); this.state = 'idle'; this.events.push({ type: 'zoom', level: this.zoom }); }
      if (this.zoomResume && ready && time >= this.nextFire - 0.08) { this.zoom = this.zoomResume; this.zoomResume = 0; this.events.push({ type: 'zoom', level: this.zoom }); }
    }
    this.altHeld = cmd.alt;
    if (cmd.reload && ready && this.ammo < d.mag && this.reserve > 0) this.startReload();
    else if (cmd.inspect && !this.zoom) this.startInspect();
    if (cmd.fire && (this.state === 'idle' || this.state === 'inspect') && time >= this.nextFire && (d.auto || !this.triggerHeld)) {
      if (this.ammo > 0) this.fire(pl, time, interval);
      else { this.events.push({ type: 'dry' }); this.nextFire = time + 0.25; if (this.reserve > 0) this.startReload(); }
    }
    this.triggerHeld = cmd.fire;
  }

  fire(pl, time, interval) {
    const d = this.def, rc = d.recoil;
    this.state = 'idle'; this.ammo--;
    this.nextFire = time - this.nextFire < interval * 1.5 ? this.nextFire + interval : time + interval;
    const idx = this.sprayIdx, P = patternAt(rc.pattern, idx);
    const js = rc.jitter * Math.min(1, 0.3 + idx * 0.1);
    this.jit = [(this.rnd() - 0.5) * 2 * js, (this.rnd() - 0.5) * 2.8 * js];
    const off = [P[0] + this.jit[0], P[1] + this.jit[1]];
    this.recoil[0] = off[0]; this.recoil[1] = off[1];
    const tracer = d.tracerEvery > 0 && this.shotCount % d.tracerEvery === 0;
    this.events.push({ type: 'shot', inacc: this.inaccuracy(pl), off, idx: Math.floor(idx), tracer, pellets: d.pellets || 1 });
    this.sprayIdx = idx + 1; this.shotCount++;
    this.fireInacc = Math.min(this.fireInacc + d.inFire, d.inFireMax);
    this.lastShot = time; this.lastShotClock = this.clock;
    this.viewKick = Math.min(this.viewKick + d.kick * 0.3, 1.2);
    this.heat = Math.min(1, this.heat + 0.09);
    if (this.ammo === 0 && d.id === 'pistol') this.slideLocked = true;
    if (d.scope && this.zoom) { this.zoomResume = this.ammo > 0 ? this.zoom : 0; this.zoom = 0; }
    // pump and bolt guns cycle by hand after every shot (no cycle on the last round)
    this.play(this.ammo > 0 ? 'fire' : 'fireLast', this.ammo > 0 ? d.fireMarks : null);
  }
}

class Knife extends Weapon {
  constructor(def) { super(def); this.nextAttack = 0; this.pending = null; this.flip = false; this.attackDur = 0; }
  tick(cmd, pl, time, dt) {
    this.baseTick(dt);
    this.commonStates();
    if (this.state === 'attack') {
      if (this.pending && this.t >= this.pending.delay) { this.events.push(Object.assign({ type: 'knifeHit' }, this.pending)); this.pending = null; }
      if (this.t >= this.attackDur) this.state = 'idle';
    }
    if (cmd.inspect) this.startInspect();
    const ready = (this.state === 'idle' || this.state === 'inspect') && time >= this.nextAttack;
    if (ready && (cmd.fire || cmd.alt)) {
      const heavy = !!cmd.alt;
      const a = heavy ? this.def.stab : this.def.slash;
      this.state = 'attack'; this.t = 0; this.attackDur = a.interval; this.nextAttack = time + a.interval;
      this.pending = { heavy, range: a.range, damage: a.damage, delay: a.delay };
      this.play(heavy ? 'stab' : this.flip ? 'slashR' : 'slashL');
      if (!heavy) this.flip = !this.flip;
      this.events.push({ type: 'swing', heavy });
    }
  }
}

class Grenade extends Weapon {
  constructor(def) { super(def); this.count = 1; this.mode = 'over'; this.restockT = 0; this.released = false; }
  draw() { if (this.count > 0) super.draw(); }
  tick(cmd, pl, time, dt) {
    this.baseTick(dt);
    const d = this.def, held = cmd.fire || cmd.alt;
    this.commonStates();
    if (this.state === 'idle' && held) {
      this.mode = cmd.alt && !cmd.fire ? 'under' : 'over';
      this.state = 'pull'; this.t = 0;
      this.play(this.mode === 'over' ? 'pullOver' : 'pullUnder', [[0.12, 'pin']]);
    } else if (this.state === 'pull' && this.t >= d.pullTime) { this.state = 'ready'; this.t = 0; }
    if (this.state === 'ready' && !held) {
      this.state = 'throw'; this.t = 0; this.released = false;
      this.play(this.mode === 'over' ? 'throwOver' : 'throwUnder', [[0, 'throw']]);
    }
    if (this.state === 'throw') {
      if (!this.released && this.t >= d.releaseAt) { this.released = true; this.count--; this.events.push({ type: 'throwNade', mode: this.mode }); }
      if (this.t >= d.throwTime) {
        if (this.count > 0) this.draw();
        else { this.state = 'empty'; this.events.push({ type: 'switchAway' }); }
      }
    }
  }
}

// The charge: hold fire inside a bomb site, standing on the ground, for plantTime seconds.
class Charge extends Weapon {
  constructor(def) { super(def); this.progress = 0; this.site = null; }
  speed() { return this.state === 'plant' ? 0 : this.def.maxSpeed; }
  tick(cmd, pl, time, dt) {
    this.baseTick(dt);
    this.commonStates();
    const site = typeof Bomb !== 'undefined' && Bomb.canPlant() ? Bomb.siteAt(pl.pos) : null;
    if (this.state === 'idle' && cmd.fire && site && pl.onGround) {
      this.state = 'plant'; this.t = 0; this.site = site; this.progress = 0;
      this.play('plant', this.def.plantMarks); this.events.push({ type: 'plantStart', site });
    }
    if (this.state === 'plant') {
      this.progress = clamp(this.t / this.def.plantTime, 0, 1);
      if (!cmd.fire || !pl.onGround || !site) { this.state = 'idle'; this.progress = 0; this.play('idle'); this.events.push({ type: 'plantAbort' }); }
      else if (this.t >= this.def.plantTime) { this.state = 'planted'; this.events.push({ type: 'planted', site: this.site }); }
    }
  }
}

const WEAPON_CLASS = { gun: Gun, knife: Knife, grenade: Grenade, charge: Charge };
const makeWeapon = (id) => new WEAPON_CLASS[WEAPONS[id].kind](WEAPONS[id]);

// Slots: 1 primary, 2 pistol, 3 knife, 4 grenade, 5 charge. One weapon per slot.
class Loadout {
  constructor(ids = ['rifle', 'pistol', 'knife', 'smoke']) { this.listShowT = 0; this.restock = true; this.active = null; this.setKit(ids); }
  setKit(ids) {
    if (this.active) this.active.holster();
    this.list = ids.map(makeWeapon); this.sort();
    this.active = this.list[0]; this.prev = this.list[1] || this.list[0];
    this.active.draw();
  }
  sort() { this.list.sort((a, b) => a.def.slot - b.def.slot); }
  ids() { return this.list.map((w) => w.def.id); }
  // Full ammo and grenades again; back to the first weapon (respawns, new rounds).
  refill(redraw = true) {
    for (const w of this.list) {
      if (w.kind === 'gun') { w.ammo = w.def.mag; w.reserve = w.def.reserve; w.state = 'idle'; w.slideLocked = false; w.sprayIdx = 0; w.fireInacc = 0; w.zoom = 0; w.zoomResume = 0; w.reloadPhase = null; }
      if (w.kind === 'grenade') { w.count = 1; w.restockT = 0; }
      if (w.kind === 'charge') { w.state = 'idle'; w.progress = 0; }
    }
    if (redraw) { this.active.holster(); this.active = this.best(); this.prev = this.list.find((w) => w !== this.active && this.usable(w)) || this.active; this.active.draw(); }
  }
  bySlot(s) { return this.list.find((w) => w.def.slot === s) || null; }
  byId(id) { return this.list.find((w) => w.def.id === id) || null; }
  usable(w) { return !!w && (w.kind !== 'grenade' || w.count > 0); }
  best() { return this.list.find((w) => this.usable(w) && w.kind !== 'charge') || this.list[0]; }
  primary() { return this.bySlot(1); }
  select(w) {
    if (!this.usable(w) || w === this.active) return false;
    if (this.active) { this.active.holster(); this.prev = this.active; }
    this.active = w; w.draw(); this.listShowT = 1.6;
    return true;
  }
  // Adds a weapon (an id or a weapon object, e.g. picked up with its ammo). Returns the weapon it
  // pushed out of the same slot so the caller can drop it, null if none, or false if refused.
  give(item, autoSwitch = true) {
    const w = typeof item === 'string' ? makeWeapon(item) : item;
    if (w.kind === 'grenade') {
      const g = this.byId(w.def.id);
      if (g) { if (g.count > 0) return false; g.count = 1; return null; }
    }
    const old = this.bySlot(w.def.slot);
    if (old) this.remove(old, false);
    this.list.push(w); this.sort();
    w.state = 'holstered';
    // switch to a better gun (primary over pistol over knife); never to grenades or the charge
    const better = w.kind !== 'grenade' && w.kind !== 'charge' && (!this.active || w.def.slot < this.active.def.slot || this.active.kind === 'grenade');
    if (!this.active || (autoSwitch && better)) this.select(w);
    return old || null;
  }
  // Removes a weapon (dropped, thrown out, planted); switches away if it was in hand.
  remove(w, switchAway = true) {
    const i = this.list.indexOf(w);
    if (i < 0) return;
    this.list.splice(i, 1);
    if (this.prev === w) this.prev = this.best();
    if (this.active === w) {
      w.holster(); this.active = null;
      const next = switchAway && this.usable(this.prev) && this.prev !== w ? this.prev : this.best();
      this.active = next; next.draw(); this.listShowT = 1.6;
    }
  }
  cycle(dir) {
    const n = this.list.length;
    let i = this.list.indexOf(this.active);
    for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (this.usable(this.list[i]) && this.list[i] !== this.active) { this.select(this.list[i]); return; } }
  }
  tick(cmd, pl, time, dt) {
    if (cmd.slot) this.select(this.bySlot(cmd.slot));
    else if (cmd.last) this.select(this.usable(this.prev) ? this.prev : this.best());
    else if (cmd.cycle) this.cycle(cmd.cycle);
    const w = this.active;
    w.tick(cmd, pl, time, dt);
    for (const g of this.list.slice()) {
      if (g.kind !== 'grenade' || g.count > 0) continue;
      if (this.restock) {
        // test-range convenience: an empty grenade slot restocks after a short delay
        g.restockT += dt;
        if (g.restockT >= g.def.restock) { g.count = 1; g.restockT = 0; }
      } else if (g !== this.active) this.remove(g);
    }
    if (w.events.some((e) => e.type === 'switchAway')) {
      if (!this.restock && w.kind === 'grenade' && w.count <= 0) this.remove(w);
      else this.select(this.usable(this.prev) ? this.prev : this.best());
    }
    this.listShowT = Math.max(0, this.listShowT - dt);
    pl.maxSpeed = this.active.speed();
  }
}
