// Boot sequence, fixed-tick simulation (64 Hz) with interpolated rendering, game state.

const TICK = 1 / 64;

const Game = {
  L: null, player: null, loadout: null, state: 'loading', time: 0, acc: 0, last: 0,
  cmd: {}, look: [0, 0], eye: [0, 0, 0], alpha: 0, cpuMs: 0, renderMs: 0, tickMs: 0, prepMs: 0, lastHit: null, freeze: false, freezeFx: false, botsFrozen: false, spectate: null, shake: 0,
  get weapon() { return this.loadout ? this.loadout.active : null; },
};

function worldImpact(imp, decalScale = 1) {
  if (imp.kind === 'door') { imp.door.addImpact(imp, decalScale); return; }
  const b = imp.brush, fi = b.faceIndex ? b.faceIndex[imp.plane] : -1;
  const clip = fi >= 0 && imp.plane < b.faceCount ? b.polys[imp.plane] : null;
  FX.impact(imp.point, imp.normal, imp.surf, fi >= 0 ? FX.decals : null, clip, null, null, decalScale);
}

// Casing out of the ejection port: from the viewmodel for you, from the world model for others.
function ejectShell(actor, w) {
  const def = w.def, pl = actor.player;
  if (actor.isMe) {
    const ep = Viewmodel.anchorWorld('eject', 19, [0, 0, 0]);
    if (!ep) return;
    const rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw), f = viewDir(pl), r1 = Math.random(), r2 = Math.random();
    const v = [rx * (95 + r1 * 45) + f[0] * (-12 + r2 * 18) + pl.vel[0], 85 + r2 * 45 + pl.vel[1] * 0.5, rz * (95 + r1 * 45) + f[2] * (-12 + r2 * 18) + pl.vel[2]];
    FX.shells.spawn(def.shell, ep, v, FX.lightAt(ep[0], ep[1], ep[2], [0, 0, 0]));
  } else {
    const mz = actor.model.muzzleWorld([0, 0, 0]), dir = viewDir(pl), rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw);
    const ep = [mz[0] - dir[0] * 14 + rx * 1.5, mz[1] - dir[1] * 14 + 1, mz[2] - dir[2] * 14 + rz * 1.5];
    FX.shells.spawn(def.shell, ep, [rx * 110 + pl.vel[0], 90 + Math.random() * 30, rz * 110 + pl.vel[2]], FX.lightAt(ep[0], ep[1], ep[2], [0, 0, 0]));
  }
}

function fireShot(actor, w, e) {
  const shot = Combat.shot(actor, w, e), { eye, dir } = shot, def = w.def;
  let mz;
  if (actor.isMe) {
    Ents.stats.shots++;
    Snd.shot(def.sound, null, def.suppressed);
    Viewmodel.onShot(w);
    mz = Viewmodel.anchorWorld('muzzle', 22, [0, 0, 0]) || [eye[0] + dir[0] * 22, eye[1] + dir[1] * 22, eye[2] + dir[2] * 22];
  } else {
    actor.model.fire();
    mz = actor.model.muzzleWorld([0, 0, 0]);
    Snd.shot(def.sound, mz, def.suppressed);
    if (!def.suppressed) FX.worldFlash(mz, dir, def.flash);
  }
  if (!def.ejectOn) ejectShell(actor, w);
  DLights.add(mz[0], mz[1], mz[2], [1.0, 0.62, 0.3], 240 * def.flash + 40, 0.06);
  let what = 'nothing', damage = 0, sounds = 0, head = false, hits = 0;
  const bodies = new Set();
  for (const { res, dir: d } of shot.results) {
    for (const imp of res.impacts) {
      worldImpact(imp, shot.results.length > 1 ? 0.7 : 1);
      if (!imp.exit && sounds++ < 3) Snd.impact(SURF_NAMES[imp.surf], imp.point);
    }
    if (res.impacts.length && what === 'nothing') { const last = res.impacts[res.impacts.length - 1]; what = SURF_NAMES[last.surf]; damage = last.damage; }
    if (res.target) {
      FX.impact(res.target.point, res.target.normal, SURF.metal, null, null);
      if (res.target.target.hit() && actor.isMe) HUD.hitmarker();
      what = 'plate'; damage = res.target.damage;
    }
    if (res.actor) {
      const h = res.actor, hs = h.group === 'head';
      FX.blood(h.point, d);
      if (!bodies.has(h.target)) { bodies.add(h.target); Snd.bodyHit(h.point, hs && h.target.helmet); }
      head ||= hs; hits++;
      what = `${h.target.name} (${h.group})${shot.results.length > 1 ? ` x${hits}` : ''}`; damage = h.damage * (GROUP_MUL[h.group] || 1);
    }
  }
  if (bodies.size && actor.isMe) HUD.hitmarker(head);
  const r0 = shot.results[0].res;
  const end = r0.end || [eye[0] + dir[0] * def.range, eye[1] + dir[1] * def.range, eye[2] + dir[2] * def.range];
  if (shot.wallbang) {
    // a wallbang round: a hot streak along the whole line, sparks where it leaves each wall
    FX.tracers.spawn(mz, end, 9500, 900); FX.tracers.spawn(mz, end, 9000, 600);
    Snd.wallbang(actor.isMe ? null : mz);
    DLights.add(mz[0], mz[1], mz[2], [1.0, 0.45, 0.2], 360, 0.09);
    if (actor.isMe) HUD.note(`Wallbang · ${shot.results[0].res.pens} wall${shot.results[0].res.pens === 1 ? '' : 's'}`);
  } else if (e.tracer) FX.tracers.spawn(mz, end);
  FX.muzzleSmoke(mz, dir, w.heat);
  if (actor.isMe) Game.lastHit = { what, damage, pens: r0.pens, dist: r0.dist, dealt: shot.dealt };
}

function knifeHit(actor, e) {
  const { hit, eye, dealt } = Combat.knife(actor, e);
  if (!hit) return;
  if (hit.kind === 'actor') {
    FX.blood(hit.point, viewDir(actor.player));
    Snd.bodyHit(hit.point, false);
    if (actor.isMe) HUD.hitmarker(false);
  } else if (hit.kind === 'target') {
    FX.impact(hit.point, hit.normal, SURF.metal, null, null);
    if (hit.target.hit() && actor.isMe) HUD.hitmarker();
  } else worldImpact(hit, e.heavy ? 0.8 : 0.6);
  Snd.knifeHit(SURF_NAMES[hit.surf], hit.point, e.heavy);
  if (actor.isMe) Game.lastHit = { what: hit.kind === 'actor' ? hit.target.name : hit.kind === 'target' ? 'plate' : SURF_NAMES[hit.surf], damage: dealt || e.damage, pens: 0, dist: Math.hypot(hit.point[0] - eye[0], hit.point[1] - eye[1], hit.point[2] - eye[2]) };
}

function simTick(dt) {
  Game.time += dt;
  const me = Actors.me;
  for (const a of Actors.list) {
    let cmd;
    if (a.isMe) cmd = Game.state === 'playing' ? Input.buildCmd(Game.cmd) : IDLE_CMD;
    else cmd = Game.botsFrozen ? IDLE_CMD : a.brain.think(dt);
    if (!a.alive) continue;
    // freeze time: look and buy only; defusing pins you in place
    if (Match.frozen() || Bomb.defusing(a)) cmd = Object.assign({}, cmd, { fwd: 0, side: 0, jump: false, fire: false, alt: false, drop: false });
    Bomb.control(a, cmd, dt);
    if (cmd.wallbang && a.isMe) HUD.wallbangNote(Wallbang.toggle(a));
    if (cmd.use && !Bomb.defusing(a) && !Items.use(a)) { const d = Ents.doorInReach(tickEye(a.player), viewDir(a.player)); if (d) d.toggle(a.player); }
    if (cmd.drop) Items.drop(a, a.loadout.active, true);
    a.player.tick(cmd, dt);
    a.loadout.tick(cmd, a.player, Game.time, dt);
    for (const e of a.player.events) {
      if (e.type === 'step') { if (a.isMe) Snd.footstep(SURF_NAMES[e.surf]); else Snd.footstep(SURF_NAMES[e.surf], 1, a.player.pos.slice()); Bots.noise(a.player.pos, a, 650); }
      else if (e.type === 'jump' && a.isMe) Snd.jump();
      else if (e.type === 'land') { if (a.isMe) Snd.land(SURF_NAMES[e.surf], e.speed); else Snd.footstep(SURF_NAMES[e.surf], 1.3, a.player.pos.slice()); }
    }
    a.player.events.length = 0;
    for (const w of a.loadout.list.slice()) {
      for (const e of w.events) {
        if (e.type === 'shot') fireShot(a, w, e);
        else if (e.type === 'planted') Bomb.plant(a, w, e.site);
        else if (e.type === 'sfx' && e.part === w.def.ejectOn) { ejectShell(a, w); if (a.isMe) Snd.sfx(e.part); }
        else if (!a.isMe) continue;
        else if (e.type === 'dry') Snd.dry();
        else if (e.type === 'sfx') Snd.sfx(e.part);
        else if (e.type === 'zoom') Snd.sfx('zoom');
        else if (e.type === 'swing') Snd.knifeSwish(e.heavy);
        else if (e.type === 'knifeHit') knifeHit(a, e);
        else if (e.type === 'throwNade') Grenades.spawn(a.player, e.mode, tickEye(a.player), viewDir(a.player));
      }
      w.events.length = 0;
    }
  }
  if (!me.alive) { for (const w of me.loadout.list) w.events.length = 0; }
  Ents.tick(dt, Actors.list.filter((a) => a.alive).map((a) => a.player));
  Items.tick(dt, Match.active ? 0 : 45);
  Grenades.tick(dt);
  Bomb.tick(dt);
  Actors.tick(dt);
  Match.tick(dt);
  Tactics.tick(dt);
}

function handleHotkeys() {
  const pl = Game.player;
  if (Input.pressed('KeyV')) {
    if (!Actors.me.admin) HUD.note('Noclip is an admin power');
    else { pl.noclip = !pl.noclip; if (!pl.noclip) pl.vel = [0, 0, 0]; HUD.note(pl.noclip ? 'Noclip on · Space up, C down' : 'Noclip off'); }
  }
  if (Input.pressed('F1') || Input.pressed('Backquote')) { HUD.debug = !HUD.debug; $('hud-debug').hidden = !HUD.debug; }
  if (Input.pressed('KeyH')) { const shown = !HUD.el['hud-hint'].hidden; HUD.hintPinned = !shown; Settings.set('showHints', !shown); }
  if (Input.pressed('KeyB') || Input.touch.buyEdge) { Input.touch.buyEdge = false; BuyMenu.toggle(); }
  if (BuyMenu.open) {
    for (let n = 1; n <= 9; n++) if (Input.pressed('Digit' + n)) BuyMenu.press(n);
    if (Input.pressed('Escape')) BuyMenu.toggle(false);
  }
  if (Input.freeMouse && Input.pressed('Escape')) pause();
}

// Dead in a defuse round: follow a living teammate (anyone if none) from behind; Mouse 1 switches.
function spectateCam(me, cam, alpha) {
  const alive = Actors.list.filter((a) => a.alive && a !== me), mates = alive.filter((a) => a.team === me.team), pool = mates.length ? mates : alive;
  if (!pool.length) return false;
  let t = Game.specTarget;
  if (!t || !t.alive || !pool.includes(t)) t = pool[0];
  if (Game.state === 'playing' && Input.takeMouseEdge(0)) t = pool[(pool.indexOf(t) + 1) % pool.length];
  Game.specTarget = t;
  const p = t.player, x = lerp(p.prev[0], p.pos[0], alpha), y = lerp(p.prev[1], p.pos[1], alpha), z = lerp(p.prev[2], p.pos[2], alpha);
  const yaw = p.yaw, pitch = clamp(p.pitch * 0.6, -0.6, 0.5), cp = Math.cos(pitch), back = 135;
  const head = [x, y + (p.ducked ? 46 : 62), z];
  const tr = Game.specTr || (Game.specTr = makeTrace());
  Game.L.cw.trace(tr, head[0], head[1], head[2], head[0] + Math.sin(yaw) * cp * back, head[1] + 24 - Math.sin(pitch) * back, head[2] + Math.cos(yaw) * cp * back, 6, 6, 6, MASK_SHOT);
  cam.position.set(tr.ex, tr.ey, tr.ez);
  cam.rotation.set(pitch - 0.08, yaw, 0);
  return true;
}

// Death camera: sink to the floor beside the body and turn toward whoever did it.
function deathCam(me, cam, eye) {
  const t = smoothstep(0, 0.8, me.deadT), p = me.player.pos;
  cam.position.set(p[0], p[1] + lerp(eye[1] - p[1], 14, t), p[2]);
  let yaw = me.player.yaw, pitch = me.player.pitch * (1 - t);
  if (me.killer && me.killer !== me) {
    const k = me.killer.player.pos, want = Math.atan2(-(k[0] - p[0]), -(k[2] - p[2]));
    yaw = me.player.yaw + wrapAngle(want - me.player.yaw) * t;
    pitch = lerp(pitch, Math.atan2(k[1] + 50 - (p[1] + 14), Math.hypot(k[0] - p[0], k[2] - p[2])), t);
  }
  cam.rotation.set(pitch, yaw, 0.35 * t);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (Game.state === 'loading' || !Game.L || !Game.L.probes) { Game.last = 0; return; }   // a map is being built
  const t = now / 1000;
  const dt = Math.min(Game.last ? t - Game.last : 1 / 60, 0.1);
  Game.last = t;
  const t0 = performance.now();
  const me = Actors.me, pl = Game.player;
  const held = Game.loadout.active, zoomFov = me.alive && !Game.spectate && held.kind === 'gun' ? held.scopeFov() || held.adsFov() : 0;
  if (Game.state === 'playing') {
    Input.takeLook(Game.look, dt);
    if (me.alive) {
      const k = zoomFov ? zoomFov / Settings.v.fov : 1;     // scoped aim keeps the same feel per screen width
      pl.yaw -= Game.look[0] * DEG * k;
      pl.pitch = clamp(pl.pitch - Game.look[1] * DEG * k, -89 * DEG, 89 * DEG);
    }
    handleHotkeys();
  } else { Game.look[0] = Game.look[1] = 0; }
  Game.acc += dt;
  let n = 0;
  const inMenu = Game.state === 'menu' || Game.state === 'results' || Game.state === 'loading';
  const paused = Game.freeze || inMenu || (Match.active && Game.state !== 'playing');
  const ts = performance.now();
  while (!paused && Game.acc >= TICK && n < 8) { simTick(TICK); Game.acc -= TICK; n++; }
  const simT = performance.now() - ts;
  if (n) Game.tickMs = damp(Game.tickMs, simT / n, 4, dt);    // one 64 Hz simulation step
  if (n === 8 || paused) Game.acc = 0;
  Game.alpha = Game.acc / TICK;

  const w = Game.loadout.active, vf = w.kind === 'gun' ? w.def.recoil.viewFrac : 0;
  pl.updateView(dt);
  const eye = pl.eye(Game.alpha, Game.eye), cam = R.camera;
  if (inMenu) MenuCam.update(dt, cam);
  else if (Game.spectate) {
    const sv = Game.spectate;
    if (sv.follow) { const f = sv.follow.player.pos; sv.pos = [f[0] + sv.off[0], f[1] + sv.off[1], f[2] + sv.off[2]]; }
    cam.position.set(sv.pos[0], sv.pos[1], sv.pos[2]); cam.rotation.set(sv.pitch, sv.yaw, 0);
  } else if (me.alive) {
    cam.position.set(eye[0], eye[1], eye[2]);
    cam.rotation.set(pl.pitch + (w.recoilView[0] * vf + w.viewKick) * DEG, pl.yaw + w.recoilView[1] * vf * DEG, 0);
  } else if (!(Match.active && me.deadT > 2.2 && spectateCam(me, cam, Game.alpha))) deathCam(me, cam, eye);
  if (me.alive) Game.specTarget = null;
  if (Game.shake > 0) {
    const k = Game.shake * Game.shake;
    cam.rotation.x += (Math.random() - 0.5) * 0.05 * k; cam.rotation.y += (Math.random() - 0.5) * 0.05 * k; cam.rotation.z += (Math.random() - 0.5) * 0.03 * k;
    Game.shake = Math.max(0, Game.shake - dt * 1.1);
  }
  cam.updateMatrixWorld();
  Ents.render(Game.alpha);
  Items.render(); Bomb.render();
  Grenades.render(Game.alpha);
  Actors.hidden = inMenu;
  Actors.render(dt, Game.alpha);
  if (window.__SF) for (const mq of window.__SF.mannequins) {
    mq.pm.update(dt, mq.st);
    FX.lightAt(mq.st.x, mq.st.y + 40, mq.st.z, mq.pm.light); mq.pm.setLight(mq.pm.light[0], mq.pm.light[1], mq.pm.light[2]);
  }
  const zf = me.alive && !Game.spectate && w.kind === 'gun' ? w.scopeFov() : 0;   // after this frame's ticks
  const af = me.alive && !Game.spectate && w.kind === 'gun' ? w.adsFov() : 0;
  R.setZoom(zf || af); HUD.scope(zf); HUD.ads(me.alive && w.kind === 'gun' ? w.ads : 0);
  Viewmodel.rig.visible = me.alive && !Game.spectate && !zf && !inMenu;
  if (!inMenu) $('sf-fade').style.opacity = '0';
  Viewmodel.update(dt, pl, w, Game.look, eye, Game.alpha);
  FX.update(Game.freezeFx ? 0 : dt);
  const f = viewDir(pl);
  Snd.listener(cam.position.x, cam.position.y, cam.position.z, f[0], f[1], f[2]);
  Snd.setSpace(Viewmodel.lightProbe[3] * 0.5 + clamp((Viewmodel.lightProbe[2] - 0.15) * 1.2, 0, 0.5));
  const item = Game.state === 'playing' && me.alive ? Items.lookAt(me) : null;
  const door = Game.state === 'playing' && me.alive && !item ? Ents.doorInReach(eye, f) : null;
  let prompt = item ? `E — ${me.loadout.bySlot(item.w.def.slot) && item.w.def.slot !== 5 ? 'swap for' : 'pick up'} ${item.w.def.name}` : door ? `E — ${door.isOpen() ? 'close' : 'open'} door` : '';
  if (me.alive && Match.active && Game.state === 'playing') {
    const hw = me.loadout.active;
    if (Bomb.canDefuse(me) && Bomb.defuser !== me) prompt = `Hold E to defuse the charge (${me.kit ? 5 : 10} s)`;
    else if (!prompt && hw.kind === 'charge' && hw.state !== 'plant') prompt = Bomb.siteAt(me.player.pos) ? 'Hold Mouse 1 to plant the charge' : 'Carry the charge to site A or B';
  }
  if (!inMenu) HUD.update(dt, pl, Game.loadout, prompt, cam);
  const tR = performance.now();
  R.render();
  const t1 = performance.now();
  Game.renderMs = damp(Game.renderMs, t1 - tR, 4, dt);       // WebGL submission (the rasterizer when it runs on the CPU)
  Game.prepMs = damp(Game.prepMs, t1 - t0 - simT - (t1 - tR), 4, dt);   // per-frame JS outside the simulation
  Game.cpuMs = damp(Game.cpuMs, t1 - t0, 4, dt);
}

function startPlaying() {
  Game.state = 'playing';
  Input.active = true;
  Menu.hide(); HUD.show(true);
  document.body.classList.add('playing');
  if (Input.touch.enabled) $('sf-touch').hidden = false;
}

function releasePointer() {
  Input.active = false; Input.releaseAll(); Input.exitLock();
  document.body.classList.remove('playing');
  $('sf-touch').hidden = true;
  HUD.show(false);
}

function pause() {
  if (Game.state !== 'playing') return;
  if (BuyMenu.open) BuyMenu.toggle(false);
  Game.state = 'paused';
  releasePointer();
  Menu.stack = [];
  Menu.show('pause', false);
}

function onPlayClicked() {
  Snd.init(); Snd.ui();
  if (Input.touch.enabled || Input.freeMouse) { startPlaying(); return; }
  Input.active = true;
  Input.requestLock();
}

// Default lobby: 5v5 for defuse (you and four bots against five), 3v3 for skirmish.
function populateBots() {
  const mine = Actors.me.team, other = 1 - mine, defuse = Settings.v.mode === 'defuse';
  for (let i = 0; i < (defuse ? 5 : 3); i++) Actors.addBot(other);
  for (let i = 0; i < (defuse ? 4 : 2); i++) Actors.addBot(mine);
}

// Build, light and upload a map in place (no page reload). from/to map the progress bar.
async function loadMap(key, from = 0, to = 1) {
  if (!MAPS[key]) key = 'depot';
  const def = MAPS[key], first = !Game.L, P = (f) => from + (to - from) * f;
  Game.state = 'loading';
  Menu.show('loading', false);
  $('load-map').textContent = def.name;
  $('load-note').className = 'note'; $('load-note').textContent = `${def.name}: ${def.blurb}.`;
  if (!first) { if (BuyMenu.open) BuyMenu.toggle(false); Items.clear(); Grenades.clear(); Bomb.reset(); Actors.removeBots(); R.newScene(); }
  Menu.loading(`Building ${def.name}`, P(0.02)); await yieldUI();
  const L = compileLevel(def.build(), Game.tex);
  L.name = def.name; L.key = key;
  Game.L = L;
  const bake = await bakeLighting(L, (f) => Menu.loading('Compiling lighting', P(0.04 + f * 0.84)));
  L.probes = bake.probes; L.bakeStats = bake.stats;
  Menu.loading('Mapping bot routes', P(0.9)); await yieldUI();
  Nav.build(L);
  Radar.build(L);
  Menu.loading('Uploading to the GPU', P(0.96)); await yieldUI();
  R.buildWorld(L, bake);
  FX.init(L); Ents.init(L); Grenades.init(L); Items.init();
  if (first) {
    Viewmodel.build(); WeaponIcons.build();
    Game.player = new Player(L.cw);
    Game.loadout = new Loadout(undefined, (id) => Arsenal.def(id));
  } else Game.player.cw = L.cw;
  Actors.init();
  Actors.me.name = Accounts.name();
  Admin.apply();
  Game.player.maxSpeed = Game.loadout.active.def.maxSpeed;
  MenuCam.reset(L);
  HUD.el['hud-tag'].textContent = L.name;
  Menu.loading('Ready', P(1));
}

// One match as the player set it up in Create Game: roster, side, rules; rewards at the end.
const Session = {
  active: false, cfg: null, done: false, results: null, resultsT: 0, matchId: '',
  stats(me) {
    const M = Match;
    return { kills: me.kills, deaths: me.deaths, hs: me.hs, dmg: me.dmg, plants: me.plants, defuses: me.defuses,
      rounds: M.active ? M.history.length : 0, roundsWon: M.active ? M.score[me.squad] : 0,
      score: M.active ? [M.score[me.squad], M.score[1 - me.squad]] : null };
  },
  // Map already loaded: sets everything up synchronously (so the click can still capture the mouse).
  begin(cfg) {
    cfg = Object.assign({}, cfg);
    const team = cfg.team === 'r' ? (Math.random() < 0.5 ? 0 : 1) : Number(cfg.team);
    Object.assign(Settings.v, { botSkill: cfg.diff, mode: cfg.mode, matchLen: cfg.len, ff: !!cfg.ff, team, map: cfg.map }); Settings.save();
    clearTimeout(this.resultsT);
    if (BuyMenu.open) BuyMenu.toggle(false);
    Actors.removeBots(); Actors.ff = !!cfg.ff;
    const me = Actors.me;
    if (me.team !== team) Actors.setSide(me, team);
    for (let i = 0; i < cfg.enemies; i++) Actors.addBot(1 - team);
    for (let i = 0; i < cfg.allies; i++) Actors.addBot(team);
    for (const a of Actors.list) { a.kills = 0; a.deaths = 0; a.dmg = 0; a.hs = 0; a.plants = 0; a.defuses = 0; }
    Game.spectate = null; Game.freeze = false; Game.botsFrozen = false;
    Match.setMode(cfg.mode);
    if (cfg.mode !== 'defuse') { Actors.feed = []; Actors.score = [0, 0]; }
    me.name = Accounts.name();
    this.active = true; this.cfg = cfg; this.done = false; this.results = null; this.matchId = randomId(6) + Date.now().toString(36);
    this.adminUsed = false; Admin.apply();
  },
  // What leaving now would record: practice XP in skirmish; in defuse a loss once the match has
  // started (nothing if you leave during the first buy time without a kill).
  exitOutcome(st) {
    if (this.cfg.mode !== 'defuse') return 'practice';
    return Match.round > 1 || Match.phase !== 'freeze' || st.kills ? 'left' : 'none';
  },
  // Fold the match into the profile (saved to the signed-in account on this device) exactly once.
  record(outcome) {
    this.done = true;
    if (this.adminUsed) { this.results = Profile.adminResults(this.cfg, this.stats(Actors.me), outcome); Accounts.clearCheckpoint(); return this.results; }
    this.results = Profile.applyMatch(this.cfg, this.stats(Actors.me), outcome, this.matchId);
    Accounts.clearCheckpoint();
    return this.results;
  },
  // Kept up to date every round and when the tab is hidden, so an exit still counts if the page dies.
  checkpoint() {
    if (!this.active || this.done || Accounts.guest || this.adminUsed) return;
    const st = this.stats(Actors.me);
    Accounts.checkpoint({ matchId: this.matchId, cfg: this.cfg, st, outcome: this.exitOutcome(st), at: Date.now() });
  },
  // The page is closing or reloading mid-match: that is an exit, save it now.
  exitNow() { if (this.active && !this.done) this.record(this.exitOutcome(this.stats(Actors.me))); },
  matchOver(outcome) {
    if (!this.active || this.done) return;
    Match.hold = true;
    this.record(outcome);
    clearTimeout(this.resultsT);
    this.resultsT = setTimeout(() => this.showResults(), 5500);
  },
  showResults() {
    if (!this.results) return;
    if (Game.state === 'playing') releasePointer();
    if (BuyMenu.open) BuyMenu.toggle(false);
    Game.state = 'results';
    Menu.stack = [];
    Menu.show('results', false);
  },
  // Leaving from the pause menu: a ranked match that has started counts as a loss.
  leave() {
    if (this.active && !this.done) {
      const outcome = this.exitOutcome(this.stats(Actors.me));
      this.record(outcome);
      if (outcome !== 'none' || this.results.xp.total > 0) { this.showResults(); return; }
    }
    this.active = false;
    Game.state = 'menu';
    Menu.home();
  },
};

// Start a configured match: straight away on the loaded map, or after loading another one.
async function launch(cfg) {
  if (!cfg) return;
  Session.active = false;
  if (Game.L && Game.L.key === cfg.map) { Session.begin(cfg); onPlayClicked(); return; }
  await loadMap(cfg.map);
  Session.begin(cfg);
  Game.state = 'menu';
  Menu.show('ready', false);
}

// Main-menu background: slow dolly shots through the loaded map, with a dip to black between them.
const MenuCam = {
  shots: null, i: 0, t: 0, dur: 13,
  reset(L) {
    this.shots = L.menuShots && L.menuShots.length ? L.menuShots : this.auto(L);
    this.i = 0; this.t = 0;
  },
  auto(L) {
    const lo = L.bounds.lo, hi = L.bounds.hi, c = [(lo[0] + hi[0]) / 2, 0, (lo[2] + hi[2]) / 2];
    return (L.sites && L.sites.length ? L.sites : [{ center: c }]).map((s) => ({ from: [s.center[0] - 420, 300, s.center[2] + 380], to: [s.center[0] - 220, 280, s.center[2] + 460], look: [s.center[0], 30, s.center[2]] }));
  },
  update(dt, cam) {
    if (!this.shots) return;
    this.t += dt;
    if (this.t >= this.dur) { this.t = 0; this.i = (this.i + 1) % this.shots.length; }
    const s = this.shots[this.i], k = smoothstep(0, 1, this.t / this.dur);
    const p = [lerp(s.from[0], s.to[0], k), lerp(s.from[1], s.to[1], k), lerp(s.from[2], s.to[2], k)];
    const lk = s.lookTo ? [lerp(s.look[0], s.lookTo[0], k), lerp(s.look[1], s.lookTo[1], k), lerp(s.look[2], s.lookTo[2], k)] : s.look;
    const dx = lk[0] - p[0], dy = lk[1] - p[1], dz = lk[2] - p[2];
    cam.position.set(p[0], p[1], p[2]);
    cam.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0);
    const fade = Math.min(1, this.t / 0.7, (this.dur - this.t) / 0.7);
    $('sf-fade').style.opacity = (1 - clamp(fade, 0, 1)).toFixed(2);
  },
};

async function boot(hot) {
  HUD.init(); Menu.init();
  const canvas = $('sf-canvas');
  if (!window.THREE) { Menu.error('The 3D library (three.js r128) failed to load from cdnjs. Check your connection and reload.'); return; }
  try { R.init(canvas); } catch (e) { Menu.error('WebGL is unavailable in this browser, so the game cannot render. Enable hardware acceleration or try another browser.'); return; }
  Menu.loading('Generating textures', 0);
  await yieldUI();
  const tex = await generateTextures((f) => Menu.loading('Generating textures', f * 0.26));
  R.makeTextures(tex);
  Game.tex = tex;
  // accounts on this device: the one that signed in last comes straight back unless it has a PIN
  Accounts.init();
  if (Accounts.remembered && !Accounts.remembered.pin) Accounts.signIn(Accounts.remembered);
  // ?map=key in the page address overrides the last map played
  let qmap = null;
  try { qmap = new URLSearchParams(location.search).get('map'); } catch (e) { qmap = null; }
  const last = Profile.v.lastCfg && Profile.v.lastCfg.map;
  const mapKey = MAPS[qmap] ? qmap : MAPS[last] ? last : MAPS[Settings.v.map] ? Settings.v.map : 'depot';
  await loadMap(mapKey, 0.27, 1);
  if (hot && Array.isArray(hot.pos)) { Game.player.spawn(hot.pos, hot.yaw || 0); Game.player.pitch = hot.pitch || 0; }
  populateBots();
  Match.setMode(Settings.v.mode);

  Input.init(canvas);
  Input.onLockChange = (locked, fallback) => {
    if (locked) startPlaying();
    else if (fallback) { HUD.note('Mouse capture unavailable here: aim with the cursor or arrow keys'); startPlaying(); }
    else pause();
  };
  $('t-menu').addEventListener('click', pause);
  $('buy-menu').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b && !b.disabled) BuyMenu.buy(b.dataset.id); });
  window.addEventListener('resize', () => R.resize());
  window.addEventListener('beforeunload', (e) => { if (Game.state === 'playing') { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { Session.checkpoint(); pause(); } });
  window.addEventListener('pagehide', () => Session.exitNow());
  R.resize();
  Game.state = 'menu';
  Menu.firstScreen();
  requestAnimationFrame(frame);

  // Test/debug hooks (harmless in normal play).
  window.__SF = {
    Game, R, Ents, FX, Input, Ballistics, Grenades, Settings, Viewmodel, Snd, Actors, Nav, Bots, Items, Bomb, Match, SHOP, Tactics, BuyMenu, Radar, MAPS,
    Profile, Arsenal, Session, Menu, Rewards, ArmoryView, Accounts, Admin, Wallbang, WALLBANG, launch, loadMap,
    setView(x, y, z, yawDeg, pitchDeg) {
      const p = Game.player; p.spawn([x, y, z], yawDeg * DEG); p.pitch = (pitchDeg || 0) * DEG;
      const w = Game.loadout.active; if (w.state === 'draw') { w.state = 'idle'; w.anim = 'idle'; }
    },
    select(id) { const lo = Game.loadout; lo.select(lo.byId(id)); },
    give(id) { const lo = Game.loadout, w = lo.give(id); const a = lo.active; if (a.state === 'draw') { a.state = 'idle'; a.anim = 'idle'; } return w; },
    fire(n = 1, tracer = false) { const w = Game.loadout.active; for (let i = 0; i < n; i++) fireShot(Actors.me, w, { off: [0, 0], inacc: w.inaccuracy(Game.player), tracer }); },
    play() { startPlaying(); },
    vmPose(o) { Object.assign(Viewmodel.cur.base, o); },
    pose(anim, t, state) { const w = Game.loadout.active; w.anim = anim; w.animStart = w.clock - t; if (state) { w.state = state; w.t = t; } },
    mannequins: [],
    mannequin(team, st, weapon = 'rifle') {
      const pm = new PlayerModel(team); pm.setWeapon(weapon); R.scene.add(pm.mesh);
      const m = { pm, st: Object.assign({ yaw: 0, pitch: 0, vx: 0, vz: 0, ducked: false, onGround: true, alive: true }, st) };
      this.mannequins.push(m); return m;
    },
    // free camera for screenshots (null to return to the player's eyes)
    spectate(pos, yawDeg, pitchDeg, follow, off) { Game.spectate = pos || follow ? { pos, yaw: yawDeg * DEG, pitch: pitchDeg * DEG, follow, off } : null; },
    place(a, x, y, z, yawDeg) { a.player.spawn([x, y, z], yawDeg * DEG); a.player.pitch = 0; a.alive = true; a.health = 100; a.armor = 100; if (a.brain) a.brain.reset(); },
  };
}

(function start() {
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) {
    try { hot.snapshot(() => (Game.player ? { pos: Game.player.pos.slice(), yaw: Game.player.yaw, pitch: Game.player.pitch } : {})); } catch (e) { /* optional */ }
  }
  const go = (data) => boot(data || {});
  if (hot && hot.ready) hot.ready(go); else go((hot && hot.data) || {});
})();
