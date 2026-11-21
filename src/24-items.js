// Weapons on the ground: thrown with G, dropped on death, picked up by walking over them (into an
// empty slot) or swapped with E. The charge is an item too while nobody carries it; only Raiders take it.

const ITEM_HALF = [4, 1.5, 4];

const Items = {
  list: [], tr: null,

  init() { this.clear(); this.tr = makeTrace(); },

  clear() {
    for (const it of this.list) if (it.mesh && R.scene) R.scene.remove(it.mesh);
    this.list = [];
  },

  spawn(w, pos, vel, yaw, owner) {
    const it = { w, id: w.def.id, p: pos.slice(), v: vel.slice(), yaw, roll: 0, spin: [(Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6], rest: false, age: 0, owner, mesh: null };
    this.list.push(it);
    if (R.scene && R.textures) {
      if (!PlayerModel.wgeo) PlayerModel.wgeo = {};
      if (!PlayerModel.wgeo[it.id]) PlayerModel.wgeo[it.id] = chWeaponGeo(it.id);
      it.mesh = new THREE.Mesh(PlayerModel.wgeo[it.id].geo, new THREE.MeshLambertMaterial({ map: R.textures.gun_metal, vertexColors: true }));
      it.mesh.rotation.order = 'YXZ';
      R.scene.add(it.mesh);
    }
    return it;
  },

  remove(it) {
    const i = this.list.indexOf(it);
    if (i >= 0) this.list.splice(i, 1);
    if (it.mesh && R.scene) R.scene.remove(it.mesh);
  },

  // Throw a weapon out of an actor's hands. toss=false lets it fall at the body (deaths).
  drop(actor, w, toss = true) {
    if (!w || w.kind === 'knife' || w.kind === 'grenade' || w.state === 'plant') return null;
    const pl = actor.player, eye = tickEye(pl), f = viewDir(pl), tr = this.tr, cw = Game.L.cw;
    actor.loadout.remove(w);
    if (w.kind === 'charge') w.progress = 0;
    let pos = toss ? [eye[0] + f[0] * 14, eye[1] - 10, eye[2] + f[2] * 14] : [pl.pos[0] + (Math.random() - 0.5) * 10, pl.pos[1] + 30, pl.pos[2] + (Math.random() - 0.5) * 10];
    cw.trace(tr, pl.pos[0], pl.pos[1] + 36, pl.pos[2], pos[0], pos[1], pos[2], ITEM_HALF[0], ITEM_HALF[1], ITEM_HALF[2], MASK_SHOT);
    if (tr.fraction < 1) pos = [tr.ex, tr.ey, tr.ez];
    const sp = 250, vel = toss
      ? [f[0] * sp + pl.vel[0] * 0.6, Math.max(f[1], -0.2) * sp + 110, f[2] * sp + pl.vel[2] * 0.6]
      : [(Math.random() - 0.5) * 70 + pl.vel[0] * 0.3, 70, (Math.random() - 0.5) * 70 + pl.vel[2] * 0.3];
    const it = this.spawn(w, pos, vel, pl.yaw + (Math.random() - 0.5) * 0.6, actor);
    if (w.kind === 'charge' && typeof Bomb !== 'undefined') Bomb.onDrop(actor, it);
    return it;
  },

  near(a, it, r) {
    const p = a.player.pos;
    return Math.hypot(it.p[0] - p[0], it.p[2] - p[2]) < r && it.p[1] > p[1] - 10 && it.p[1] < p[1] + 72;
  },

  // Walking over an item takes it only into an empty slot (never back right after dropping it).
  canAuto(a, it) {
    if (it.owner === a && it.age < 1.5) return false;
    if (it.w.kind === 'charge') return a.team === TEAM.RAIDERS;
    return !a.loadout.bySlot(it.w.def.slot);
  },

  pick(a, it) {
    this.remove(it);
    a.loadout.give(it.w, true);
    if (a.isMe) { Snd.pickup(); if (typeof HUD !== 'undefined' && HUD.note) HUD.note(`Picked up ${it.w.def.name}`); }
    if (it.w.kind === 'charge' && typeof Bomb !== 'undefined') Bomb.onPickup(a);
  },

  // The item an actor is looking at, within reach and in plain view.
  lookAt(a, reach = 100) {
    const eye = tickEye(a.player), d = viewDir(a.player);
    let best = null, bestScore = Infinity;
    for (const it of this.list) {
      if (it.w.kind === 'charge' && a.team !== TEAM.RAIDERS) continue;
      const dx = it.p[0] - eye[0], dy = it.p[1] - eye[1], dz = it.p[2] - eye[2], dist = Math.hypot(dx, dy, dz) || 1;
      if (dist > reach) continue;
      const cos = (dx * d[0] + dy * d[1] + dz * d[2]) / dist;
      if (cos < 0.88) continue;
      const score = dist * (2.2 - cos);
      if (score < bestScore) { bestScore = score; best = it; }
    }
    if (best) {
      Game.L.cw.trace(this.tr, eye[0], eye[1], eye[2], best.p[0], best.p[1], best.p[2], 0, 0, 0, MASK_SHOT);
      if (this.tr.fraction < 0.97) best = null;
    }
    return best;
  },

  // E: swap the weapon in that slot for the one you are looking at.
  use(a) {
    const it = this.lookAt(a);
    if (!it) return false;
    const old = a.loadout.bySlot(it.w.def.slot);
    if (old && old.kind !== 'knife' && old.kind !== 'grenade') this.drop(a, old, true);
    this.pick(a, it);
    return true;
  },

  tick(dt, maxAge = 0) {
    const tr = this.tr, cw = Game.L.cw, H = ITEM_HALF;
    for (const it of this.list) {
      it.age += dt;
      if (it.rest) continue;
      const v = it.v;
      v[1] -= 800 * dt;
      cw.trace(tr, it.p[0], it.p[1], it.p[2], it.p[0] + v[0] * dt, it.p[1] + v[1] * dt, it.p[2] + v[2] * dt, H[0], H[1], H[2], MASK_SHOT);
      if (tr.startsolid) { it.p[1] += 4; continue; }
      it.p[0] = tr.ex; it.p[1] = tr.ey; it.p[2] = tr.ez;
      if (tr.fraction < 1) {
        const vn = v[0] * tr.nx + v[1] * tr.ny + v[2] * tr.nz;
        v[0] -= 1.35 * vn * tr.nx; v[1] -= 1.35 * vn * tr.ny; v[2] -= 1.35 * vn * tr.nz;
        v[0] *= 0.5; v[1] *= 0.5; v[2] *= 0.5; it.spin[0] *= 0.4; it.spin[1] *= 0.6;
        if (-vn > 70) Snd.itemDrop(it.p.slice(), it.w.kind);
        if (tr.ny > 0.7 && Math.hypot(v[0], v[1], v[2]) < 45) { it.rest = true; it.v = [0, 0, 0]; }
      }
      if (!it.rest) { it.yaw += it.spin[1] * dt; it.roll += it.spin[0] * dt; }
    }
    for (const a of Actors.list) {
      if (!a.alive) continue;
      for (const it of this.list.slice()) if (this.near(a, it, 36) && this.canAuto(a, it)) this.pick(a, it);
    }
    if (maxAge > 0) for (const it of this.list.slice()) if (it.age > maxAge && it.w.kind !== 'charge') this.remove(it);
  },

  render() {
    const tmp = [0, 0, 0];
    for (const it of this.list) {
      const m = it.mesh;
      if (!m) continue;
      const flat = it.w.kind === 'charge';
      if (it.rest) { m.position.set(it.p[0], it.p[1] - ITEM_HALF[1] + (flat ? 0.75 : 0.7), it.p[2]); m.rotation.set(0, it.yaw, flat ? 0 : Math.PI / 2); }
      else { m.position.set(it.p[0], it.p[1], it.p[2]); m.rotation.set(it.roll * 0.3, it.yaw, flat ? it.roll * 0.2 : it.roll); }
      FX.lightAt(it.p[0], it.p[1] + 8, it.p[2], tmp);
      m.material.color.setRGB(tmp[0], tmp[1], tmp[2]);
    }
  },
};
