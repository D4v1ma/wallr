// HUD + menu. DOM writes are skipped when values don't change.

const $ = (id) => document.getElementById(id);

const HUD = {
  el: {}, last: {}, fpsAcc: 0, fpsFrames: 0, fps: 0, noteT: 0, hitT: 0, debug: false, xhGap: 0, smokeCol: [0.6, 0.6, 0.6], hurtFlash: 0, tr: null,
  init() {
    for (const id of ['sf-hud', 'xh', 'hitmark', 'hud-hint', 'hud-fps', 'hud-hp', 'hud-ar', 'hud-prompt', 'hud-speed', 'hud-wname', 'hud-reload', 'hud-ammo', 'hud-mag', 'hud-res',
      'hud-debug', 'hud-note', 'r-hits', 'r-shots', 'r-acc', 'hud-wlist', 'sf-smoke', 'hud-feed', 'hud-score', 'hud-dmg', 'hud-hurt', 'hud-dead', 'hud-board', 'hud-target', 'hud-scope', 'hud-tag', 'hud-alive', 'hud-range', 'hud-money', 'hud-cash', 'hud-cashd',
      'hud-buyzone', 'hud-carry', 'hud-banner', 'hud-progress', 'hud-progress-label', 'hud-progress-bar', 'buy-menu', 'hud-place'])
      this.el[id] = $(id);
    this.applyCrosshairStyle();
    this.applyToggles();
    Radar.attach($('hud-radar'));
    this.hintAge = 0; this.hintPinned = false;
  },
  set(id, v, prop = 'textContent') { if (this.last[id + prop] !== v) { this.last[id + prop] = v; this.el[id][prop] = v; } },
  show(on) { this.el['sf-hud'].hidden = !on; },
  applyCrosshairStyle() {
    const s = Settings.v, x = this.el.xh.style;
    x.setProperty('--xc', s.xhColor); x.setProperty('--xl', s.xhSize + 'px'); x.setProperty('--xt', s.xhThick + 'px');
    x.setProperty('--xo', s.xhOutline ? '1px' : '0px');
    this.el.xh.classList.toggle('dot', s.xhDot);
  },
  applyToggles() {
    const s = Settings.v;
    this.el['hud-fps'].hidden = !s.showFps; this.el['hud-speed'].hidden = !s.showSpeed; this.el['hud-hint'].hidden = !s.showHints;
  },
  note(text) { this.el['hud-note'].textContent = text; this.el['hud-note'].classList.add('on'); this.noteT = 2.2; },
  hitmarker(head) { this.el.hitmark.classList.add('on'); this.el.hitmark.classList.toggle('hs', !!head); this.hitT = head ? 0.16 : 0.1; },
  scope(fov) {
    const on = fov > 0;
    if (this.last.scope === on) return;
    this.last.scope = on; this.el['hud-scope'].hidden = !on; this.el.xh.style.visibility = on ? 'hidden' : '';
  },
  clock(t) { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },

  // Defuse-mode HUD: clock, alive pips, money, the charge, progress bars, round banners.
  updateRound(dt) {
    const el = this.el, me = Actors.me, M = Match, on = M.active;
    // the radar follows whoever the camera follows
    const spec = !me.alive && Game.specTarget && Game.specTarget.alive ? Game.specTarget : null, who = spec || me;
    Radar.draw(me, who.player.pos, who.player.yaw, dt);
    this.set('hud-place', Radar.areaAt(who.player.pos[0], who.player.pos[2]));
    const low = me.alive && me.health <= 25;
    if (this.last.low !== low) { this.last.low = low; el['hud-hp'].classList.toggle('low', low); }
    if (Game.state === 'playing') this.hintAge += dt;
    const hints = Settings.v.showHints && !Input.touch.enabled && (this.hintAge < 30 || this.hintPinned);
    if (this.last.hints !== hints) { this.last.hints = hints; el['hud-hint'].hidden = !hints; }
    this.set('hud-tag', on ? `${Game.L.name} · Round ${M.round}` : `${Game.L.name} · Skirmish`);
    if (this.last.defuse !== on) { this.last.defuse = on; el['hud-range'].hidden = on; el['hud-money'].hidden = !on; el['hud-alive'].hidden = !on; }
    let clock = '<i>:</i>';
    if (on) {
      const cls = M.phase === 'planted' ? 'planted' : M.phase === 'freeze' ? 'freeze' : M.phase === 'live' && M.t < 10 ? 'low' : '';
      const txt = M.phase === 'planted' ? 'CHARGE' : M.phase === 'freeze' || M.phase === 'live' ? this.clock(M.t) : '0:00';
      clock = `<em class="${cls}">${txt}</em>`;
    }
    const sc = on ? [M.sideScore(0), M.sideScore(1)] : Actors.score;
    this.set('hud-score', `<b class="t0">${TEAMS[0].name.toUpperCase()}</b><span>${sc[0]}</span>${clock}<span>${sc[1]}</span><b class="t1">${TEAMS[1].name.toUpperCase()}</b>`, 'innerHTML');
    if (on) {
      const pips = (t) => Actors.list.filter((a) => a.team === t).map((a) => `<i class="${a.alive ? 'on' : ''}"></i>`).join('');
      this.set('hud-alive', `<span class="t0">${pips(0)}</span><span class="t1">${pips(1)}</span>`, 'innerHTML');
      if (this.last.money !== undefined && me.money !== this.last.money) { this.cashD = me.money - this.last.money; this.cashT = 2.4; }
      this.last.money = me.money;
      this.set('hud-cash', me.money.toLocaleString('en-US'));
      this.cashT = Math.max(0, (this.cashT || 0) - dt);
      const dtxt = this.cashD ? `${this.cashD > 0 ? '+' : '−'}$${Math.abs(this.cashD).toLocaleString('en-US')}` : '';
      this.set('hud-cashd', dtxt);
      el['hud-cashd'].classList.toggle('on', this.cashT > 0); el['hud-cashd'].classList.toggle('neg', this.cashD < 0);
      const buy = M.canBuy(me);
      if (this.last.buy !== buy) { this.last.buy = buy; el['hud-buyzone'].hidden = !buy; }
      const carry = !!me.loadout.byId('charge'), inSite = carry && !!Bomb.siteAt(me.player.pos);
      const cs = carry ? (inSite ? 'carry site' : 'carry') : '';
      if (this.last.carry !== cs) { this.last.carry = cs; el['hud-carry'].hidden = !carry; el['hud-carry'].className = cs; }
    }
    // planting / defusing progress
    const w = me.loadout.active;
    let prog = null;
    if (me.alive && w.kind === 'charge' && w.state === 'plant') prog = ['Planting the charge', w.progress, 'plant'];
    else if (Bomb.defuser === me) prog = [me.kit ? 'Defusing · kit' : 'Defusing', Bomb.defuseT / Bomb.defuseDur, 'defuse'];
    if (this.last.prog !== !!prog) { this.last.prog = !!prog; el['hud-progress'].hidden = !prog; }
    if (prog) {
      this.set('hud-progress-label', prog[0]); el['hud-progress'].className = 'hud-progress ' + prog[2];
      el['hud-progress-bar'].style.width = (clamp(prog[1], 0, 1) * 100).toFixed(1) + '%';
    }
    // round banners
    const b = on ? M.banner : null;
    const sub = b ? (b.final ? `${b.sub} · new match in ${Math.ceil(M.t)} s` : b.sub) : '';
    const sig = b ? `${b.title}|${sub}|${b.kind}` : '';
    if (this.last.banner !== sig) {
      this.last.banner = sig; el['hud-banner'].hidden = !b;
      if (b) {
        el['hud-banner'].className = `hud-banner ${b.kind}${b.side !== undefined ? ' t' + b.side : ''}${b.final ? ' final' : ''}`;
        el['hud-banner'].innerHTML = `<h2>${this.esc(b.title)}</h2><p>${this.esc(sub)}</p>`;
      }
    }
    BuyMenu.tick(dt);
  },

  hurt(dmg) { this.hurtFlash = Math.min(1, this.hurtFlash + 0.25 + dmg / 80); Snd.hurt(); },
  esc(t) { return String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); },

  // killfeed, score, damage direction, death message, scoreboard, name under the crosshair
  updateCombat(dt, pl, cam) {
    const me = Actors.me, el = this.el;
    this.set('hud-hp', String(me.health)); this.set('hud-ar', String(me.armor));
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.4);
    const ho = this.hurtFlash.toFixed(2);
    if (this.last.ho !== ho) { this.last.ho = ho; el['hud-hurt'].style.opacity = ho; }
    if (me.hurtT > 0 && me.hurtFrom && me.alive) {
      const dx = me.hurtFrom[0] - pl.pos[0], dz = me.hurtFrom[2] - pl.pos[2];
      const ang = wrapAngle(Math.atan2(-dx, -dz) - pl.yaw);
      el['hud-dmg'].style.transform = `rotate(${(-ang).toFixed(3)}rad)`; el['hud-dmg'].style.opacity = me.hurtT.toFixed(2);
    } else if (this.last.dmgOff !== true) { el['hud-dmg'].style.opacity = '0'; }
    this.last.dmgOff = !(me.hurtT > 0);
    const sig = Actors.feed.map((f) => f.victim + f.age.toFixed(0)).join('|') + Actors.feed.length;
    if (this.last.feed !== sig) {
      this.last.feed = sig;
      el['hud-feed'].innerHTML = Actors.feed.map((f) => `<div class="${f.me ? 'mine' : ''}" style="opacity:${f.age > 5.5 ? (7 - f.age) / 1.5 : 1}"><b class="t${f.kTeam}">${this.esc(f.killer)}</b><span title="${this.esc(f.weapon)}">${WeaponIcons.img(f.wid) || this.esc(f.weapon)}${f.hs ? ' <i class="hs">◉</i>' : ''}</span><b class="t${f.vTeam}">${this.esc(f.victim)}</b></div>`).join('');
    }
    const by = me.killer && me.killer !== me ? `Killed by <b class="t${me.killer.team}">${this.esc(me.killer.name)}</b> · ${this.esc(me.killInfo.weapon)}${me.killInfo.headshot ? ' · headshot' : ''}`
      : me.killInfo && me.killInfo.weapon === BLAST.name ? 'Caught in the blast' : 'You died';
    let after = `Back in ${Math.max(0, Math.ceil(RESPAWN_TIME - me.deadT))}`;
    if (Match.active) after = Game.specTarget && Game.specTarget.alive ? `Spectating <b class="t${Game.specTarget.team}">${this.esc(Game.specTarget.name)}</b> · ${Game.specTarget.health} HP · Mouse 1: next` : 'Waiting for the next round';
    const deadMsg = me.alive || (Match.active && Match.phase === 'over') ? '' : `${me.deadT < 2.2 || !Match.active ? by + '<br>' : ''}<small>${after}</small>`;
    if (this.last.dead !== deadMsg) { this.last.dead = deadMsg; el['hud-dead'].innerHTML = deadMsg; el['hud-dead'].hidden = !deadMsg; }
    const board = Game.state === 'playing' && Input.down('Tab');
    if (board) {
      const M = Match, cash = (a) => (M.active ? (a.team === me.team ? `$${a.money.toLocaleString('en-US')}` : '—') : '');
      const rows = (t) => Actors.list.filter((a) => a.team === t).sort((a, b) => b.kills - a.kills)
        .map((a) => `<tr class="${a.isMe ? 'me' : ''}${a.alive ? '' : ' dead'}"><td>${this.esc(a.name)}${a.isBot ? ' <small>BOT</small>' : ''}${Bomb.carrier === a && a.team === me.team ? ' <small>CHARGE</small>' : ''}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.alive ? a.health : '—'}</td>${M.active ? `<td>${cash(a)}</td>` : ''}</tr>`).join('');
      const score = (t) => (M.active ? M.sideScore(t) : Actors.score[t]);
      let html = [0, 1].map((t) => `<table><caption class="t${t}">${TEAMS[t].name} · ${score(t)}</caption><tr><th>Name</th><th>K</th><th>D</th><th>HP</th>${M.active ? '<th>Money</th>' : ''}</tr>${rows(t)}</table>`).join('');
      if (M.active && M.history.length) html += `<div class="hist">${M.history.map((h) => `<i class="t${h.side}" title="${h.reason}">${{ elim: '✕', bomb: '✹', defuse: '✓', time: '◷' }[h.reason]}</i>`).join('')}</div>`;
      if (this.last.board !== html) { this.last.board = html; el['hud-board'].innerHTML = html; }
    }
    if (this.last.boardOn !== board) { this.last.boardOn = board; el['hud-board'].hidden = !board; }
    // name under the crosshair (only with a clear line of sight)
    let label = '';
    if (me.alive) {
      const o = [cam.position.x, cam.position.y, cam.position.z], d = viewDir(pl), h = Actors.hitscan(o, d, 2600, me);
      if (h || Actors.ff) {
        const near = h || null;
        if (near) {
          if (!this.tr) this.tr = makeTrace();
          Game.L.cw.trace(this.tr, o[0], o[1], o[2], o[0] + d[0] * near.t, o[1] + d[1] * near.t, o[2] + d[2] * near.t, 0, 0, 0, MASK_SHOT);
          if (this.tr.fraction >= 1) label = `<b class="t${near.actor.team}">${this.esc(near.actor.name)}</b>`;
        }
      }
      for (const a of Actors.list) {
        if (a === me || !a.alive || a.team !== me.team || label) continue;
        const ah = a.model.hitTest(o, d, 1800);
        if (ah) { if (!this.tr) this.tr = makeTrace(); Game.L.cw.trace(this.tr, o[0], o[1], o[2], o[0] + d[0] * ah.t, o[1] + d[1] * ah.t, o[2] + d[2] * ah.t, 0, 0, 0, MASK_SHOT); if (this.tr.fraction >= 1) label = `<b class="t${a.team}">${this.esc(a.name)}</b> · ${a.health} HP`; }
      }
    }
    if (this.last.label !== label) { this.last.label = label; el['hud-target'].innerHTML = label; }
  },
  // degrees -> screen pixels at the screen centre
  degToPx(deg) { return Math.tan(deg * DEG) / Math.tan(R.camera.fov * DEG / 2) * (R.viewH / 2); },

  update(dt, pl, lo, prompt, cam) {
    const s = Settings.v, w = lo.active, gun = w.kind === 'gun';
    // crosshair: gap tracks the real cone of fire for guns
    let gap = s.xhGap;
    if (gun && s.xhStyle === 'dynamic') gap += Math.min(this.degToPx(Math.atan((w.inaccuracy(pl) + w.spreadBase()) * 0.001) / DEG), 140);
    this.xhGap = damp(this.xhGap, gap, 28, dt);
    const g = (Math.round(this.xhGap * 2) / 2) + 'px';
    if (this.last.xg !== g) { this.last.xg = g; this.el.xh.style.setProperty('--xg', g); }
    let tx = 0, ty = 0;
    if (gun && s.xhRecoil) {
      const vf = w.def.recoil.viewFrac;
      ty = -this.degToPx(w.recoil[0] - w.recoilView[0] * vf - w.viewKick); tx = -this.degToPx(w.recoil[1] - w.recoilView[1] * vf);
    }
    const tf = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
    if (this.last.xtf !== tf) { this.last.xtf = tf; this.el.xh.style.transform = tf; }
    // weapon + ammo
    this.set('hud-wname', w.def.name);
    if (gun) { this.set('hud-mag', String(w.ammo)); this.set('hud-res', '/ ' + w.reserve); }
    else if (w.kind === 'grenade') { this.set('hud-mag', String(w.count)); this.set('hud-res', w.count ? '' : 'restocking'); }
    else { this.set('hud-mag', '—'); this.set('hud-res', ''); }
    this.el['hud-ammo'].classList.toggle('low', gun && w.ammo <= Math.ceil(w.def.mag * 0.25));
    const rl = gun && w.state === 'reload';
    this.el['hud-reload'].classList.toggle('on', rl);
    if (rl) this.el['hud-reload'].firstElementChild.style.width = (100 * clamp(w.t / w.reloadDur, 0, 1)).toFixed(1) + '%';
    // weapon list after switching
    const showList = lo.listShowT > 0;
    if (this.last.wl !== showList) { this.last.wl = showList; this.el['hud-wlist'].hidden = !showList; }
    if (showList) {
      const sig = lo.list.map((x) => x.def.id + (x === w ? '*' : '') + (lo.usable(x) ? '' : '-')).join(',');
      if (this.last.wlsig !== sig) {
        this.last.wlsig = sig;
        this.el['hud-wlist'].innerHTML = lo.list.map((x) => `<div class="${x === w ? 'on' : ''}${lo.usable(x) ? '' : ' off'}"><b>${x.def.slot}</b><span>${x.def.name}</span>${WeaponIcons.img(x.def.id)}</div>`).join('');
      }
    }
    if (s.showSpeed) this.set('hud-speed', `<b>${Math.round(pl.speed())}</b> u/s${pl.noclip ? ' · noclip' : ''}`, 'innerHTML');
    this.set('hud-prompt', prompt || '');
    this.el['hud-prompt'].classList.toggle('on', !!prompt);
    this.set('r-hits', String(Ents.stats.hits)); this.set('r-shots', String(Ents.stats.shots));
    this.set('r-acc', `${Ents.plateCount() - Ents.platesUp()}/${Ents.plateCount()}`);
    this.updateRound(dt);
    this.updateCombat(dt, pl, cam);
    // inside a smoke cloud: wash the screen out
    const k = Grenades.insideAt(cam.position.x, cam.position.y, cam.position.z, this.smokeCol);
    const op = (Math.round(k * 0.94 * 100) / 100).toFixed(2);
    if (this.last.smoke !== op) {
      this.last.smoke = op;
      const c = this.smokeCol.map((v) => Math.round(clamp(v, 0, 1) * 255));
      this.el['sf-smoke'].style.background = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
      this.el['sf-smoke'].style.opacity = op;
    }
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; if (s.showFps) this.set('hud-fps', `${Math.round(this.fps)} FPS · ${Game.cpuMs.toFixed(1)} ms cpu`); }
    if (this.noteT > 0 && (this.noteT -= dt) <= 0) this.el['hud-note'].classList.remove('on');
    if (this.hitT > 0 && (this.hitT -= dt) <= 0) this.el.hitmark.classList.remove('on');
    if (this.debug) {
      const p = pl.pos, v = pl.vel, b = Game.L.bakeStats, h = Game.lastHit;
      this.el['hud-debug'].textContent =
        `pos   ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${p[2].toFixed(1)}\n` +
        `vel   ${v[0].toFixed(0)} ${v[1].toFixed(0)} ${v[2].toFixed(0)}  (${pl.speed().toFixed(0)} u/s)\n` +
        `state ${pl.noclip ? 'noclip' : pl.onGround ? 'ground' : 'air'}${pl.ducked ? ' · ducked' : ''} · ${SURF_NAMES[pl.groundSurf]}\n` +
        `weap  ${w.def.id} · ${w.state} · ${w.anim}` + (gun ? ` · inacc ${w.inaccuracy(pl).toFixed(1)} mrad · spray #${w.sprayIdx.toFixed(1)} · recoil ${w.recoil[0].toFixed(2)}°,${w.recoil[1].toFixed(2)}°` : '') + '\n' +
        `hit   ${h ? `${h.what} · ${h.damage.toFixed(1)} dmg · ${h.pens} wall${h.pens === 1 ? '' : 's'} · ${h.dist.toFixed(0)}u` : '—'}\n` +
        `fx    ${FX.tracers.list.length} tracers · ${FX.shells.list.length} casings · ${FX.smoke.n} smoke puffs · ${FX.dust.n + FX.sparks.n} particles\n` +
        `gfx   ${R.stats.calls} draws · ${R.stats.tris} tris · ${R.renderer.getPixelRatio().toFixed(2)}x\n` +
        `bake  ${b.luxels} luxels · ${b.faces} faces · ${b.atlas} · ${b.ms} ms`;
    }
  },
};

const Menu = {
  init() {
    document.querySelectorAll('.tabs [role="tab"]').forEach((t) => t.addEventListener('click', () => this.tab(t.dataset.tab)));
    this.bindSettings();
  },
  loading(label, frac) {
    $('load-label').textContent = label;
    $('load-pct').textContent = Math.round(frac * 100) + '%';
    $('load-bar').style.width = (frac * 100).toFixed(1) + '%';
  },
  error(msg) {
    $('load-label').textContent = 'Cannot start';
    const n = $('load-note'); n.className = 'err'; n.textContent = msg;
  },
  showMain(resume) {
    $('sf-overlay').hidden = false; $('sf-loading').hidden = true; $('sf-menu').hidden = false;
    $('btn-play').textContent = resume ? 'Resume' : 'Play';
  },
  hide() { $('sf-overlay').hidden = true; },
  tab(name) {
    for (const t of ['controls', 'settings', 'bots']) {
      $('tab-' + t).setAttribute('aria-selected', String(t === name));
      $('pane-' + t).hidden = t !== name;
    }
  },
  bindSettings() {
    const s = Settings.v;
    const range = (id, key, fmt, scale = 1) => {
      const el = $(id), out = $('out-' + id.slice(4));
      el.value = s[key] * scale; if (out) out.textContent = fmt(s[key]);
      el.addEventListener('input', () => { const v = parseFloat(el.value) / scale; Settings.set(key, v); if (out) out.textContent = fmt(v); });
    };
    const check = (id, key) => { const el = $(id); el.checked = s[key]; el.addEventListener('change', () => Settings.set(key, el.checked)); };
    const select = (id, key, num) => { const el = $(id); el.value = String(s[key]); el.addEventListener('change', () => Settings.set(key, num ? parseFloat(el.value) : el.value)); };
    range('set-sens', 'sensitivity', (v) => v.toFixed(2));
    check('set-invert', 'invertY'); check('set-raw', 'rawInput');
    range('set-fov', 'fov', (v) => `${Math.round(v)}°`);
    select('set-aspect', 'aspect');
    range('set-vmfov', 'vmFov', (v) => `${Math.round(v)}°`);
    range('set-rscale', 'renderScale', (v) => `${Math.round(v)}%`);
    select('set-dpr', 'maxDpr', true);
    select('set-xhstyle', 'xhStyle'); select('set-xhcolor', 'xhColor');
    range('set-xhsize', 'xhSize', (v) => `${v}px`); range('set-xhgap', 'xhGap', (v) => `${v}px`); range('set-xhthick', 'xhThick', (v) => `${v}px`);
    check('set-xhdot', 'xhDot'); check('set-xhoutline', 'xhOutline'); check('set-xhrecoil', 'xhRecoil');
    range('set-vol', 'volume', (v) => `${Math.round(v)}%`);
    check('set-fps', 'showFps'); check('set-speed', 'showSpeed');
    select('set-botskill', 'botSkill'); select('set-team', 'team', true); check('set-ff', 'ff');
    select('set-mode', 'mode'); select('set-matchlen', 'matchLen'); select('set-map', 'map');
    const roster = (fn) => () => { fn(); if (Match.active) Match.startMatch(); this.updateBots(); };
    $('bot-add-0').addEventListener('click', roster(() => { if (Actors.list.length < 12) Actors.addBot(0); }));
    $('bot-add-1').addEventListener('click', roster(() => { if (Actors.list.length < 12) Actors.addBot(1); }));
    $('bot-clear').addEventListener('click', roster(() => Actors.removeBots()));
    $('match-restart').addEventListener('click', () => { if (Match.active) Match.startMatch(); else Match.setMode('skirmish'); HUD.note(Match.active ? 'New match' : 'Skirmish reset'); this.updateBots(); });
    Settings.on((k) => {
      if (['fov', 'aspect', 'vmFov', 'renderScale', 'maxDpr'].includes(k)) R.resize();
      if (k.startsWith('xh')) HUD.applyCrosshairStyle();
      if (k === 'volume') Snd.setVolume();
      if (k === 'showFps' || k === 'showSpeed' || k === 'showHints') HUD.applyToggles();
      if (k === 'team') { Actors.setTeam(Settings.v.team); this.updateBots(); }
      if (k === 'ff') Actors.ff = !!Settings.v.ff;
      if (k === 'mode') { Match.setMode(Settings.v.mode); this.updateBots(); }
      if (k === 'map') { $('menu-note').textContent = `Loading ${(MAPS[Settings.v.map] || MAPS.depot).name}…`; setTimeout(() => location.reload(), 60); }
      if (k === 'matchLen' && Match.active) { Match.startMatch(); this.updateBots(); }
    });
  },
  updateBots() {
    const r = Actors.count(0), w = Actors.count(1), me = Actors.me;
    const m = Match.active ? ` Round ${Match.round}, ${TEAMS[0].name} ${Match.sideScore(0)} – ${Match.sideScore(1)} ${TEAMS[1].name}.` : ' Skirmish: respawns after 3 s.';
    $('bot-status').textContent = `${r} Raider bot${r === 1 ? '' : 's'} and ${w} Warden bot${w === 1 ? '' : 's'}; you're on the ${TEAMS[me.team].name}.${m}`;
  },
};

// Buy menu: B opens it during buy time near your spawn; 1-9 (or a click with a free cursor) buys.
const BuyMenu = {
  open: false, msg: '', msgT: 0, sig: '', renderT: 0,
  toggle(force) {
    const want = force !== undefined ? force : !this.open, me = Actors.me;
    if (want && !Match.active) { HUD.note('Buying is part of defuse mode (Match tab)'); return; }
    if (want && !Match.canBuy(me)) { HUD.note(!me.alive ? 'You can buy again next round' : !Match.buyTime() ? 'Buy time is over' : 'Too far from your buy zone'); return; }
    this.open = want; Input.uiCapture = want; HUD.el['buy-menu'].hidden = !want; this.msg = ''; this.sig = '';
    if (want) this.render();
  },
  press(n) { const e = SHOP.find((x) => x.key === n); if (e) this.buy(e.id); },
  buy(id) {
    const r = Match.buy(Actors.me, id);
    this.msg = r.msg; this.msgT = 2.5;
    if (!r.ok) Snd.dry();
    this.render();
  },
  render() {
    const me = Actors.me, M = Match, can = M.canBuy(me);
    const status = can ? `${Math.ceil(M.buyTimeLeft())} s left` : !M.buyTime() ? 'Buy time is over' : 'Outside your buy zone';
    const items = SHOP.map((e) => { const q = M.quote(me, e); return { e, q, off: !can || !!q.no || me.money < q.price }; });
    const sig = `${me.money}|${status}|${this.msg}|${items.map((i) => (i.off ? 0 : 1) + (i.q.price || '')).join(',')}`;
    if (sig === this.sig) return;
    this.sig = sig;
    let html = `<header><span>Buy</span><b>$${me.money.toLocaleString('en-US')}</b><small>${status}</small></header>`, group = '';
    for (const { e, q, off } of items) {
      if (e.group !== group) { group = e.group; html += `<h3>${group}</h3>`; }
      const note = q.no ? q.no : q.note === 'helmet' ? 'helmet only' : '';
      html += `<button type="button" data-id="${e.id}"${off ? ' disabled' : ''}><kbd>${e.key}</kbd><span>${e.kind === 'weapon' ? WeaponIcons.img(e.id) : '<i class="wi-pad"></i>'}${e.name}${note ? `<small>${note}</small>` : ''}</span><span class="price">$${(q.price ?? e.price).toLocaleString('en-US')}</span></button>`;
    }
    html += `<footer><span class="msg">${this.msg ? HUD.esc(this.msg) : ''}</span><span>1–9 to buy · B to close</span></footer>`;
    HUD.el['buy-menu'].innerHTML = html;
  },
  tick(dt) {
    if (!this.open) return;
    if (!Match.active || !Actors.me.alive || !Match.buyTime() || Game.state !== 'playing') { this.toggle(false); return; }
    if ((this.msgT -= dt) <= 0 && this.msg) this.msg = '';
    if ((this.renderT -= dt) <= 0) { this.renderT = 0.2; this.render(); }
  },
};
