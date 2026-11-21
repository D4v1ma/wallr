// Actors: the local player and bots share movement, loadout, model, health/armor and scoring.
// Combat.shot / Combat.knife resolve hits and damage without any rendering (testable headless).

const GROUP_MUL = { head: 4, chest: 1, stomach: 1.25, arm: 1, leg: 0.75 };
const BOT_NAMES = [['Vex', 'Kade', 'Rook', 'Sable', 'Dune', 'Fennec', 'Jinx', 'Mako'], ['Halden', 'Brisk', 'Corvin', 'Lark', 'Marsh', 'Quill', 'Tamsin', 'Wren']];
const BOT_KIT = ['rifle', 'pistol', 'knife'];
const RESPAWN_TIME = 3;
const IDLE_CMD = { fwd: 0, side: 0, jump: false, jumpHeld: false, duck: false, walk: false, fire: false, alt: false, reload: false, use: false, useHeld: false, drop: false, inspect: false, slot: 0, last: false, cycle: 0 };

function tickEye(pl, out = [0, 0, 0]) {
  out[0] = pl.pos[0]; out[1] = pl.pos[1] + lerp(PM.standEye, PM.duckEye, smoothstep(0, 1, pl.duckAmt)); out[2] = pl.pos[2];
  return out;
}

function viewDir(pl, out = [0, 0, 0]) {
  const cp = Math.cos(pl.pitch);
  out[0] = -Math.sin(pl.yaw) * cp; out[1] = Math.sin(pl.pitch); out[2] = -Math.cos(pl.yaw) * cp;
  return out;
}

class Actor {
  constructor(team, name, isBot, isMe) {
    this.team = team; this.name = name; this.isBot = isBot; this.isMe = isMe; this.id = Actors.nextId++;
    this.player = isMe ? Game.player : new Player(Game.L.cw);
    this.loadout = isMe ? Game.loadout : new Loadout(BOT_KIT);
    this.model = new PlayerModel(team);
    if (R.scene) R.scene.add(this.model.mesh);
    if (isMe) this.model.mesh.visible = false;
    this.health = 100; this.armor = 100; this.helmet = true; this.alive = false; this.deadT = 0;
    this.kills = 0; this.deaths = 0; this.hurtT = 0; this.hurtFrom = null; this.killer = null;
    this.money = 800; this.kit = false; this.squad = 0;
    this.dmg = 0; this.hs = 0; this.plants = 0; this.defuses = 0;
    this.cmd = Object.assign({}, IDLE_CMD);
    this.brain = isBot ? new BotBrain(this) : null;
    this.prevPos = [0, 0, 0];
  }

  spawn() {
    const sp = Actors.spawnPoint(this);
    this.player.spawn(sp.pos, sp.yaw);
    this.health = 100; this.armor = 100; this.helmet = true; this.alive = true; this.deadT = 0; this.killer = null;
    this.loadout.refill();
    this.model.dead = 0;
    if (this.brain) this.brain.reset();
  }

  damage(amount, group, attacker, def, from) {
    if (!this.alive) return 0;
    let dmg = amount * (GROUP_MUL[group] || 1);
    if (this.armor > 0 && group !== 'leg' && (group !== 'head' || this.helmet)) {
      let toHealth = dmg * (def.armorPen ?? 0.5), toArmor = (dmg - toHealth) * 0.5;
      if (toArmor > this.armor) { toHealth += (toArmor - this.armor) * 2; toArmor = this.armor; }
      this.armor = Math.max(0, Math.round(this.armor - toArmor));
      dmg = toHealth;
    }
    dmg = Math.max(1, Math.round(dmg));
    if (attacker && attacker !== this && attacker.team !== this.team) attacker.dmg += Math.min(dmg, this.health);
    this.health -= dmg;
    this.hurtT = 1; this.hurtFrom = from ? from.slice() : null;
    if (this.brain) this.brain.onHurt(attacker, from);
    if (this.isMe && typeof HUD !== 'undefined' && HUD.hurt) HUD.hurt(dmg);
    if (this.health <= 0) { this.health = 0; this.die(attacker, def, group === 'head'); }
    return dmg;
  }

  die(attacker, def, headshot) {
    this.alive = false; this.deadT = 0; this.deaths++; this.killer = attacker || null;
    this.killInfo = { weapon: def ? def.name : '', headshot };
    if (attacker && attacker !== this) {
      if (attacker.team !== this.team) { attacker.kills++; if (headshot) attacker.hs++; Actors.score[attacker.team]++; } else attacker.kills--;
    }
    Actors.feed.push({ killer: attacker ? attacker.name : '', kTeam: attacker ? attacker.team : this.team, victim: this.name, vTeam: this.team,
      weapon: def ? def.name : '', wid: def ? def.id : '', hs: headshot, age: 0, me: !!(attacker && attacker.isMe) || this.isMe });
    if (Actors.feed.length > 6) Actors.feed.shift();
    this.model.deathDir = headshot ? 1 : (Math.random() < 0.5 ? 1 : -1);
    if (typeof Snd !== 'undefined' && Snd.death) Snd.death(this.player.pos.slice());
    if (typeof Match !== 'undefined') Match.onDeath(this, attacker, def);
  }
}

const Actors = {
  list: [], me: null, nextId: 1, feed: [], score: [0, 0], spawnRot: [0, 0], ff: false,

  init() {
    this.list = []; this.feed = []; this.score = [0, 0];
    this.ff = !!Settings.v.ff;
    const me = new Actor(Settings.v.team, 'You', false, true);
    this.me = me; this.list.push(me);
    if (typeof Viewmodel !== 'undefined') Viewmodel.setTeam(me.team);
    me.spawn();
  },

  addBot(team) {
    const used = new Set(this.list.map((a) => a.name));
    const name = BOT_NAMES[team].find((n) => !used.has(n)) || BOT_NAMES.flat().find((n) => !used.has(n)) || `Bot-${this.nextId}`;
    const a = new Actor(team, name, true, false);
    this.list.push(a);
    a.spawn();
    if (typeof Match !== 'undefined' && Match.active) { a.squad = Match.squadOnSide(team); a.money = MATCH.start; a.loadout.restock = false; }
    return a;
  },

  removeBots() {
    for (const a of this.list) if (a.isBot && R.scene) R.scene.remove(a.model.mesh);
    this.list = this.list.filter((a) => !a.isBot);
  },

  // Swap an actor to the other faction (halftime, or your team choice): new model, same person.
  setSide(a, team) {
    if (a.team === team) return;
    if (R.scene) R.scene.remove(a.model.mesh);
    a.team = team; a.model = new PlayerModel(team);
    if (R.scene) { R.scene.add(a.model.mesh); a.model.mesh.visible = !a.isMe; }
    if (a.isMe && typeof Viewmodel !== 'undefined') Viewmodel.setTeam(team);
  },

  setTeam(team) {
    const me = this.me;
    if (me.team === team) return;
    this.setSide(me, team);
    if (typeof Match !== 'undefined' && Match.active) Match.startMatch(); else me.spawn();
  },

  count(team) { return this.list.filter((a) => a.isBot && a.team === team).length; },

  // Rotate through team spawns, skipping occupied ones.
  spawnPoint(actor) {
    const L = Game.L, list = (L.teamSpawns && L.teamSpawns[actor.team]) || L.spawns;
    for (let k = 0; k < list.length; k++) {
      const sp = list[(this.spawnRot[actor.team] + k) % list.length];
      const busy = this.list.some((o) => o !== actor && o.alive && Math.hypot(o.player.pos[0] - sp.pos[0], o.player.pos[2] - sp.pos[2]) < 48);
      if (!busy) { this.spawnRot[actor.team] = (this.spawnRot[actor.team] + k + 1) % list.length; return sp; }
    }
    return list[0];
  },

  // Nearest actor hitbox along a ray (skipping the shooter and, without friendly fire, teammates).
  hitscan(o, d, maxT, shooter) {
    let best = null;
    for (const a of this.list) {
      if (!a.alive || a === shooter || (!this.ff && shooter && a.team === shooter.team)) continue;
      const h = a.model.hitTest(o, d, best ? best.t : maxT);
      if (h && h.t <= (best ? best.t : maxT)) best = { actor: a, t: h.t, group: h.group };
    }
    return best;
  },

  tick(dt) {
    for (const a of this.list) {
      a.hurtT = Math.max(0, a.hurtT - dt * 1.6);
      if (!a.alive && (a.deadT += dt) >= RESPAWN_TIME && !(typeof Match !== 'undefined' && Match.active)) a.spawn();
    }
    for (const f of this.feed) f.age += dt;
    this.feed = this.feed.filter((f) => f.age < 7);
  },

  // Pose every model from its (interpolated) movement state; light from the probes.
  render(dt, alpha) {
    const tmp = [0, 0, 0];
    for (const a of this.list) {
      const p = a.player, m = a.model;
      m.setWeapon(a.loadout.active.def.id, !!a.loadout.byId('charge'));
      m.mesh.visible = !a.isMe && !this.hidden;
      m.update(dt, { x: lerp(p.prev[0], p.pos[0], alpha), y: lerp(p.prev[1], p.pos[1], alpha), z: lerp(p.prev[2], p.pos[2], alpha),
        yaw: p.yaw, pitch: p.pitch, vx: p.vel[0], vz: p.vel[2], ducked: p.ducked, onGround: p.onGround || p.noclip, alive: a.alive });
      if (FX.L) { FX.lightAt(p.pos[0], p.pos[1] + 40, p.pos[2], tmp); m.setLight(tmp[0], tmp[1], tmp[2]); }
    }
  },
};

// Hit resolution shared by the local player and bots.
const Combat = {
  // One trace per pellet (1 for bullets). Every pellet is its own hit, like separate bullets.
  shot(actor, w, e) {
    const pl = actor.player, eye = tickEye(pl), def = w.def, n = e.pellets || 1;
    const base = Ballistics.aimDir(pl, e.off, e.inacc, def.spread, [0, 0, 0]);
    const results = [];
    let dealt = 0;
    for (let i = 0; i < n; i++) {
      const dir = n > 1 ? Ballistics.pellet(base, i, def.pelletSpread, [0, 0, 0]) : base;
      const res = Ballistics.bullet(Game.L, eye, dir, def, actor);
      if (res.actor) dealt += res.actor.target.damage(res.actor.damage, res.actor.group, actor, def, eye);
      results.push({ res, dir });
    }
    Bots.noise(eye, actor, def.noise || 1700);
    return { res: results[0].res, dir: base, results, eye, dealt };
  },
  knife(actor, e) {
    const pl = actor.player, eye = tickEye(pl), dir = viewDir(pl);
    const hit = Ballistics.knife(Game.L, eye, dir, e.range, actor);
    let dealt = 0;
    if (hit && hit.kind === 'actor') dealt = hit.target.damage(e.damage, hit.group === 'head' ? 'chest' : hit.group, actor, WEAPONS.knife, eye);
    return { hit, eye, dir, dealt };
  },
};
