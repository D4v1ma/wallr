// The charge: who carries it, planting at A or B, the 40 s fuse, defusing and the blast.
// States: none -> carried <-> dropped -> planted -> defused | exploded.

const BOMB = { fuse: 40, defuse: 10, kitDefuse: 5, damage: 500, sigma: 480, reach: 64 };
const BLAST = { id: 'blast', name: 'THE CHARGE', armorPen: 0.6, killReward: 0 };

const Bomb = {
  state: 'none', carrier: null, item: null, pos: null, site: null, timer: 0, planter: null,
  defuser: null, defuseT: 0, defuseDur: BOMB.defuse, beepT: 0, ledT: 0, mesh: null, led: null, plantedAt: 0,

  reset() {
    if (this.mesh && R.scene) R.scene.remove(this.mesh);
    Object.assign(this, { state: 'none', carrier: null, item: null, pos: null, site: null, timer: 0, planter: null, defuser: null, defuseT: 0, mesh: null, led: null });
  },

  sites() { return (Game.L && Game.L.sites) || []; },
  siteAt(p) {
    for (const s of this.sites()) {
      if (p[0] >= s.min[0] && p[0] <= s.max[0] && p[2] >= s.min[2] && p[2] <= s.max[2] && p[1] >= s.min[1] && p[1] <= s.max[1]) return s;
    }
    return null;
  },
  siteByName(n) { return this.sites().find((s) => s.name === n) || null; },
  // Planting only while a round is being played (any time outside defuse mode).
  canPlant() { return typeof Match === 'undefined' || !Match.active || Match.phase === 'live'; },

  // Where the charge is right now, whoever has it.
  where() {
    if (this.state === 'carried' && this.carrier) return this.carrier.player.pos;
    if (this.state === 'dropped' && this.item) return this.item.p;
    if (this.pos) return this.pos;
    return null;
  },

  assign(actor) {
    actor.loadout.give('charge', false);
    this.state = 'carried'; this.carrier = actor; this.item = null;
  },
  onDrop(actor, item) {
    this.state = 'dropped'; this.carrier = null; this.item = item;
    if (Actors.me && Actors.me.team === TEAM.RAIDERS && typeof HUD !== 'undefined' && HUD.note) HUD.note(actor.isMe ? 'You dropped the charge' : 'The charge was dropped');
  },
  onPickup(actor) {
    this.state = 'carried'; this.carrier = actor; this.item = null;
    if (actor.isMe && typeof HUD !== 'undefined' && HUD.note) HUD.note('You have the charge: plant it at A or B (hold fire)');
  },

  plant(actor, w, site) {
    actor.loadout.remove(w);
    const p = actor.player.pos;
    Object.assign(this, { state: 'planted', carrier: null, item: null, pos: [p[0], p[1], p[2]], site, timer: BOMB.fuse, beepT: 0.4, planter: actor, plantedAt: Game.time });
    if (R.scene && R.textures) {
      if (!PlayerModel.wgeo) PlayerModel.wgeo = {};
      if (!PlayerModel.wgeo.charge) PlayerModel.wgeo.charge = chWeaponGeo('charge');
      this.mesh = new THREE.Mesh(PlayerModel.wgeo.charge.geo, new THREE.MeshLambertMaterial({ map: R.textures.gun_metal, vertexColors: true }));
      this.mesh.position.set(p[0], p[1] + 0.75, p[2]); this.mesh.rotation.y = actor.player.yaw;
      this.led = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2a18 }));
      this.led.position.set(1.75, 1.45, -0.55); this.mesh.add(this.led);
      const L = FX.lightAt(p[0], p[1] + 8, p[2], [0, 0, 0]); this.mesh.material.color.setRGB(L[0], L[1], L[2]);
      R.scene.add(this.mesh);
    }
    Snd.armed(this.pos);
    if (typeof Match !== 'undefined') Match.onPlant(actor, site);
  },

  canDefuse(a) {
    if (this.state !== 'planted' || !a.alive || a.team !== TEAM.WARDENS || !a.player.onGround) return false;
    const p = a.player.pos;
    return Math.hypot(p[0] - this.pos[0], p[2] - this.pos[2]) < BOMB.reach && Math.abs(p[1] - this.pos[1]) < 40;
  },
  defusing(a) { return this.defuser === a; },

  // Per actor and tick: holding use near the planted charge defuses it (and pins you in place).
  control(a, cmd, dt) {
    if (this.defuser === a) {
      if (!cmd.useHeld || !this.canDefuse(a)) { this.defuser = null; this.defuseT = 0; return; }
      this.defuseT += dt;
      if (this.defuseT >= this.defuseDur) this.defuse(a);
    } else if (!this.defuser && cmd.useHeld && this.canDefuse(a)) {
      this.defuser = a; this.defuseT = 0; this.defuseDur = a.kit ? BOMB.kitDefuse : BOMB.defuse;
      Snd.defuseStart(this.pos);
    }
  },

  defuse(a) {
    this.state = 'defused'; this.defuser = null;
    if (this.led) this.led.visible = false;
    Snd.defused(this.pos);
    if (typeof Match !== 'undefined') Match.onDefuse(a);
  },

  tick(dt) {
    if (this.state !== 'planted') return;
    if (this.defuser && !this.defuser.alive) { this.defuser = null; this.defuseT = 0; }
    this.timer -= dt;
    this.beepT -= dt; this.ledT -= dt;
    if (this.beepT <= 0) {
      const f = clamp(this.timer / BOMB.fuse, 0, 1);
      this.beepT = this.timer < 2 ? 0.12 : 0.16 + 0.84 * f;
      Snd.beep(this.pos, 1 - f);
      this.ledT = 0.07;
      if (R.scene) DLights.add(this.pos[0], this.pos[1] + 4, this.pos[2], [1, 0.12, 0.06], 70, 0.08);
    }
    if (this.timer <= 0) this.explode();
  },

  explode() {
    this.state = 'exploded'; this.defuser = null;
    const c = [this.pos[0], this.pos[1] + 16, this.pos[2]], s2 = 2 * BOMB.sigma * BOMB.sigma;
    for (const a of Actors.list) {
      if (!a.alive) continue;
      const p = a.player.pos, d2 = (p[0] - c[0]) ** 2 + (p[1] + 36 - c[1]) ** 2 + (p[2] - c[2]) ** 2;
      const dmg = BOMB.damage * Math.exp(-d2 / s2);
      if (dmg >= 1) a.damage(dmg, 'chest', null, BLAST, c);
    }
    if (this.mesh && R.scene) { R.scene.remove(this.mesh); this.mesh = null; }
    if (R.scene) { FX.explosion(c); Game.shake = Math.max(Game.shake || 0, clamp(1.6 - Math.hypot(Game.player.pos[0] - c[0], Game.player.pos[2] - c[2]) / 1600, 0.25, 1.4)); }
    Snd.explosion(c);
    if (typeof Match !== 'undefined') Match.onExplode();
  },

  render() {
    if (this.led) this.led.visible = this.state === 'planted' && this.ledT > 0;
  },
};
