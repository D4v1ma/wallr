// Front end. Screens are <section class="scr"> elements in #sf-overlay: the main menu over a slow
// fly-through of the loaded map, Create Game, the armory (Loadout and Shop share it), Career,
// Settings and Controls, the in-match pause menu, a "ready" card after a map load, and results.

const MAP_LIST = ['depot', 'kiln', 'frost', 'range'];
const SCREENS = ['loading', 'home', 'create', 'armory', 'career', 'settings', 'controls', 'pause', 'ready', 'results'];
const escHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtN = (n) => Math.round(n).toLocaleString('en-US');
const signed = (n, d = 0) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(d);
const ptsHTML = (n) => `<span class="pts"><i aria-hidden="true"></i>${fmtN(n)}<small> pts</small></span>`;

// Rank emblem: a hexagonal badge in the family colour, a glyph per family, chevrons for I–III.
let emblemSeq = 0;
const EMBLEM_GLYPH = [
  '<path d="M32 18 L35 29 L46 32 L35 35 L32 46 L29 35 L18 32 L29 29 Z" fill="#fff8e8"/>',
  '<path d="M32 16 L43 30 L32 48 L21 30 Z" fill="#f4f7f8" stroke="rgba(0,0,0,.3)" stroke-width="1.2"/><path d="M32 16 L32 48 M21 30 L43 30" stroke="rgba(0,0,0,.25)" stroke-width="1"/>',
  '<path d="M22 44 C22 34 38 36 36 26 C35 22 31 21 30 18" fill="none" stroke="#fff3da" stroke-width="3" stroke-linecap="round"/><circle cx="30" cy="16" r="4.2" fill="#fff"/><circle cx="30" cy="16" r="7" fill="none" stroke="#fff3da" stroke-width="1.2" opacity=".7"/>',
  '<path d="M35 14 L23 34 L31 34 L28 50 L42 28 L34 28 Z" fill="#f2fffc"/>',
  '<path d="M32 13 L35.5 25 L47 19 L40 30 L51 34 L39 37 L44 49 L33 41 L27 51 L26 39 L14 41 L23 32 L14 23 L27 26 Z" fill="#fff1ea"/>',
  '<circle cx="32" cy="32" r="5" fill="#fff"/><circle cx="32" cy="32" r="11" fill="none" stroke="#f3eeff" stroke-width="2.4"/><circle cx="32" cy="32" r="17" fill="none" stroke="#f3eeff" stroke-width="1.6" opacity=".7"/>',
  '<path d="M32 12 C38 20 44 24 42 34 C41 41 36 46 32 47 C27 46 22 42 22 35 C22 29 26 27 27 22 C30 26 30 29 31 31 C33 26 33 18 32 12 Z" fill="#fff6d8"/><path d="M32 30 C35 34 37 37 35 41 C34 43 31 44 29 42 C28 39 30 36 32 30 Z" fill="#e5573f"/>',
];
function emblemSVG(rk, px = 56) {
  const id = `eg${++emblemSeq}`;
  if (rk < 0) {
    return `<svg class="emblem" viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true"><path d="M32 3 L57 17 L57 47 L32 61 L7 47 L7 17 Z" fill="#1d2120" stroke="#59605a" stroke-width="2" stroke-dasharray="4 3"/><text x="32" y="41" text-anchor="middle" font-family="Chakra Petch, sans-serif" font-weight="700" font-size="24" fill="#8a918a">?</text></svg>`;
  }
  const r = RANKS[rk], f = RANK_FAMILIES[r.fam];
  let chev = '';
  for (let i = 0; i < r.tier; i++) { const y = 50 - i * 5; chev += `<path d="M24 ${y} L32 ${y + 4} L40 ${y}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" opacity=".9"/>`; }
  return `<svg class="emblem" viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${f.col}"/><stop offset="1" stop-color="${f.col2}"/></linearGradient></defs>`
    + `<path d="M32 3 L57 17 L57 47 L32 61 L7 47 L7 17 Z" fill="url(#${id})" stroke="rgba(0,0,0,.6)" stroke-width="2"/><path d="M32 8 L52.5 19.5 L52.5 44.5 L32 56 L11.5 44.5 L11.5 19.5 Z" fill="none" stroke="rgba(255,255,255,.38)" stroke-width="1.2"/>`
    + `<g transform="translate(0 ${r.tier ? -4 : 0})">${EMBLEM_GLYPH[r.fam]}</g>${chev}</svg>`;
}
const rankName = (rk, placed) => (rk < 0 ? `Unranked · ${Math.min(placed, PLACEMENTS)}/${PLACEMENTS} placements` : RANKS[rk].name);
const levelBadge = (lv) => `<span class="lvl" title="Level ${lv}">${lv}</span>`;
function xpBar(lv) { return `<div class="xpbar" title="${fmtN(lv.into)} / ${fmtN(lv.need)} XP"><i style="width:${(100 * lv.into / lv.need).toFixed(1)}%"></i></div>`; }

// ---------------------------------------------------------------------------
// 3D gun preview for the armory (its own small renderer; the game's renderer keeps drawing the map).
// ---------------------------------------------------------------------------
const ArmoryView = {
  renderer: null, scene: null, cam: null, models: {}, cur: null, canvas: null, raf: 0, t: 0, last: 0, running: false, failed: false,
  init(canvas) {
    if (this.renderer || this.failed) return !!this.renderer;
    try { this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); } catch (e) { this.failed = true; return false; }
    this.canvas = canvas;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(24, 2, 1, 400);
    const key = new THREE.DirectionalLight(0xfff1dc, 1.05); key.position.set(1, 1.4, 0.8);
    const rim = new THREE.DirectionalLight(0x9cc4ff, 0.45); rim.position.set(-1, 0.6, -1.2);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.48), key, rim);
    const M = vmMaterials();
    const builders = { rifle: buildRifleVM, pistol: buildPistolVM, smg: buildSmgVM, shotgun: buildShotgunVM, sniper: buildSniperVM };
    for (const g of ARMORY_GUNS) {
      const Mg = vmMatsFor(M), m = builders[g](Mg);
      vmPrepareKit(m, Mg);
      m.root.traverse((o) => { if (o.isMesh && (o.material === Mg.glove || o.material === Mg.sleeve)) o.visible = false; });
      for (const p of ['left', 'right', 'finger', 'shell']) if (m.parts[p]) m.parts[p].visible = false;
      if (m.flash) m.flash.visible = false;
      m.root.visible = false;
      this.frame(m);
      this.scene.add(m.root);
      this.models[g] = m;
    }
    return true;
  },
  show(gun, def) {
    if (!this.renderer) return;
    for (const [g, m] of Object.entries(this.models)) m.root.visible = g === gun;
    this.cur = this.models[gun];
    vmApplyKit(this.cur, def);
    this.frame(this.cur);
    this.start();
  },
  // Frame the gun itself: visible, opaque meshes only (hands and glass excluded, attachments included).
  frame(m) {
    const box = new THREE.Box3(), tmp = new THREE.Box3(), was = m.root.visible;
    m.root.visible = true; m.root.position.set(0, 0, 0);
    m.root.updateMatrixWorld(true);
    m.root.traverse((o) => {
      if (!o.isMesh || o.material.transparent) return;
      for (let p = o; p; p = p.parent) { if (!p.visible) return; if (p === m.root) break; }
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
    });
    m.root.visible = was;
    if (box.isEmpty()) return;
    const sz = box.getSize(new THREE.Vector3());
    m.center = box.getCenter(new THREE.Vector3()); m.len = sz.z; m.h = sz.y;
  },
  start() { if (!this.running && this.renderer) { this.running = true; this.last = 0; this.raf = requestAnimationFrame((t) => this.loop(t)); } },
  stop() { this.running = false; cancelAnimationFrame(this.raf); },
  loop(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame((t) => this.loop(t));
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0; this.last = now; this.t += dt;
    const cv = this.canvas, w = cv.clientWidth, h = cv.clientHeight, m = this.cur;
    if (!w || !h || !m) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false); }
    this.cam.aspect = w / h;
    const tv = Math.tan(this.cam.fov * DEG / 2), dist = Math.max(m.len / 2 / (tv * this.cam.aspect) * 1.12, m.h / 2 / tv * 1.5);
    const yaw = Math.PI / 2 + Math.sin(this.t * 0.45) * 0.38;
    m.root.position.set(-m.center.x, -m.center.y, -m.center.z);
    this.scene.rotation.set(0.12 + Math.sin(this.t * 0.31) * 0.04, yaw - Math.PI / 2, 0);
    this.cam.position.set(dist, 0, 0); this.cam.lookAt(0, 0, 0); this.cam.updateProjectionMatrix();
    this.renderer.render(this.scene, this.cam);
  },
};

// ---------------------------------------------------------------------------
const Menu = {
  cur: null, stack: [], cfg: null, arm: { mode: 'loadout', gun: 'rifle', sel: null, fromCreate: false, msg: '' }, careerTab: 'overview',

  init() {
    $('sf-overlay').addEventListener('click', (e) => this.onClick(e));
    $('sf-overlay').addEventListener('change', (e) => { if (e.target.id === 'cfg-ff') { this.cfg.ff = e.target.checked; this.renderCreate(); } });
    this.bindSettings();
    Profile.on(() => {
      if (this.cur === 'home') this.renderHome();
      else if (this.cur === 'armory') this.renderArmory();
      else if (this.cur === 'career') this.renderCareer();
    });
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || Game.state === 'playing' || !this.cur) return;
      if (['create', 'armory', 'career', 'settings', 'controls'].includes(this.cur)) { e.preventDefault(); this.back(); }
    });
  },
  loading(label, frac) {
    $('load-label').textContent = label;
    $('load-pct').textContent = Math.round(frac * 100) + '%';
    $('load-bar').style.width = (frac * 100).toFixed(1) + '%';
  },
  error(msg) {
    this.show('loading', false);
    $('load-label').textContent = 'Cannot start';
    const n = $('load-note'); n.className = 'err'; n.textContent = msg;
  },

  show(name, push = true) {
    if (push && this.cur && this.cur !== name && !['loading', 'ready', 'results'].includes(this.cur)) this.stack.push(this.cur);
    this.cur = name;
    $('sf-overlay').hidden = false;
    $('sf-overlay').dataset.scr = name;
    for (const s of SCREENS) { const el = $('scr-' + s); if (el) el.hidden = s !== name; }
    const r = { home: 'renderHome', create: 'renderCreate', armory: 'renderArmory', career: 'renderCareer', pause: 'renderPause', results: 'renderResults', ready: 'renderReady' }[name];
    if (r) this[r]();
    if (name !== 'armory') ArmoryView.stop();
    const focus = $('scr-' + name) && $('scr-' + name).querySelector('[data-autofocus]');
    if (focus && !Input.touch.enabled) focus.focus({ preventScroll: true });
  },
  back() {
    const prev = this.stack.pop() || (Game.state === 'paused' ? 'pause' : 'home');
    this.show(prev, false);
  },
  home() { this.stack = []; this.show('home', false); },
  hide() { $('sf-overlay').hidden = true; this.cur = null; this.stack = []; ArmoryView.stop(); },

  onClick(e) {
    const t = e.target.closest('button, [data-act]');
    if (!t || t.disabled) return;
    const d = t.dataset;
    if (d.go) { Snd.init(); Snd.ui(); if (d.go === 'create') this.openCreate(); else if (d.go === 'loadout' || d.go === 'shop') this.openArmory(d.go, false); else this.show(d.go); return; }
    if (d.back !== undefined) { Snd.ui(); this.back(); return; }
    if (d.act) { Snd.init(); this.act(d.act, d, t); }
  },

  act(a, d) {
    const c = this.cfg, A = this.arm;
    switch (a) {
      case 'cfg': {
        const v = d.k === 'ranked' || d.k === 'ff' ? d.v === 'true' : d.v;
        c[d.k] = v; Snd.ui(); this.renderCreate(); break;
      }
      case 'step': c[d.k] = (c[d.k] | 0) + Number(d.d); Snd.ui(); this.renderCreate(); break;
      case 'create-next': Profile.v.lastCfg = Object.assign({}, this.normCfg(c)); Profile.save(true); this.openArmory('loadout', true); break;
      case 'gun': A.gun = d.v; A.sel = null; A.msg = ''; Snd.ui(); this.renderArmory(); break;
      case 'opt': {
        const sel = { slot: d.slot, id: d.v || null };
        const same = A.sel && A.sel.slot === sel.slot && A.sel.id === sel.id;
        A.sel = sel; A.msg = '';
        // in the loadout an owned option equips straight away; a locked one shows its Buy button
        if (A.mode === 'loadout' && (!sel.id || this.owned(A.gun, sel)) && !same) Profile.equip(A.gun, sel.slot, sel.id);
        Snd.ui(); this.renderArmory(); break;
      }
      case 'buy': {
        const s = A.sel;
        if (!s || !s.id) break;
        const r = s.slot === 'camo' ? Profile.buy('camo', s.id) : Profile.buy('att', s.id, A.gun);
        A.msg = r.msg;
        if (r.ok) { Snd.buy(); Profile.equip(A.gun, s.slot, s.id); } else Snd.dry();
        this.renderArmory(); break;
      }
      case 'equip': if (A.sel) { Profile.equip(A.gun, A.sel.slot, A.sel.id); Snd.ui(); this.renderArmory(); } break;
      case 'unequip': if (A.sel) { Profile.equip(A.gun, A.sel.slot, null); A.sel = { slot: A.sel.slot, id: null }; Snd.ui(); this.renderArmory(); } break;
      case 'start': Snd.ui(); launch(this.normCfg(Object.assign({}, this.cfg || Profile.v.lastCfg || this.defaultCfg()))); break;
      case 'deploy': onPlayClicked(); break;
      case 'resume': onPlayClicked(); break;
      case 'leave': Snd.ui(); Session.leave(); break;
      case 'again': Snd.ui(); launch(Session.cfg); break;
      case 'home': Snd.ui(); Game.state = 'menu'; this.home(); break;
      case 'career-tab': this.careerTab = d.v; Snd.ui(); this.renderCareer(); break;
      case 'fullscreen': toggleFullscreen(); break;
    }
  },

  // ---------------- home ----------------
  renderHome() {
    const v = Profile.v, lv = Profile.level(), rk = Profile.rank();
    $('home-card').innerHTML = `
      <div class="hc-top">${emblemSVG(rk, 64)}<div><div class="hc-rank">${escHTML(rankName(rk, v.placed))}</div><div class="hc-elo">${rk < 0 ? 'Play ranked matches to place' : `${fmtN(v.elo)} Elo · peak ${fmtN(v.peak)}`}</div></div></div>
      <div class="hc-level">${levelBadge(lv.level)}<div class="hc-xp"><div class="hc-xpl"><span>Level ${lv.level}</span><span>${fmtN(lv.into)} / ${fmtN(lv.need)} XP</span></div>${xpBar(lv)}</div></div>
      <div class="hc-foot">${ptsHTML(v.points)}<span class="sync">${escHTML(Profile.syncLabel())}</span></div>`;
    $('home-points').innerHTML = `${fmtN(v.points)} points to spend`;
    const L = Game.L;
    $('home-map').textContent = L ? `${L.name}` : '';
  },

  // ---------------- create game ----------------
  defaultCfg() { return { map: 'depot', mode: 'defuse', ranked: false, diff: 'normal', team: '1', allies: 4, enemies: 5, len: 'standard', ff: false }; },
  openCreate() {
    const last = Profile.v.lastCfg;
    this.cfg = this.normCfg(Object.assign(this.defaultCfg(), last && typeof last === 'object' ? last : {}));
    this.show('create');
  },
  normCfg(c) {
    if (!MAPS[c.map]) c.map = 'depot';
    if (!DIFFS[c.diff]) c.diff = 'normal';
    if (c.mode !== 'defuse' && c.mode !== 'skirmish') c.mode = 'defuse';
    if (c.mode !== 'defuse') c.ranked = false;
    if (c.ranked) { c.allies = 4; c.enemies = 5; c.ff = false; if (MAPS[c.map].practice) c.map = 'depot'; }
    c.allies = clamp(c.allies | 0, 0, 4); c.enemies = clamp(c.enemies | 0, 1, 5);
    if (!['0', '1', 'r'].includes(String(c.team))) c.team = '1';
    c.team = String(c.team);
    if (c.len !== 'short') c.len = 'standard';
    return c;
  },
  renderCreate() {
    const c = this.normCfg(this.cfg), el = $('scr-create'), def = c.mode === 'defuse';
    const seg = (key, opts, val, dis) => `<div class="seg" role="group">${opts.map(([v, label, sub]) => `<button type="button" data-act="cfg" data-k="${key}" data-v="${v}" aria-pressed="${String(val) === String(v)}"${dis ? ' disabled' : ''}><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`).join('')}</div>`;
    const maps = MAP_LIST.filter((k) => MAPS[k]).map((k) => {
      const m = MAPS[k], dis = c.ranked && m.practice;
      return `<button type="button" class="mapcard" data-act="cfg" data-k="map" data-v="${k}" aria-pressed="${c.map === k}"${dis ? ' disabled' : ''}><img src="${Radar.thumbURL(k)}" alt=""><b>${escHTML(m.name)}</b><small>${escHTML(m.blurb)}</small></button>`;
    }).join('');
    const stepper = (k, label, lo, hi) => `<div class="stepper"><span>${label}</span><button type="button" data-act="step" data-k="${k}" data-d="-1" aria-label="Fewer"${c.ranked || c[k] <= lo ? ' disabled' : ''}>−</button><b>${c[k]}</b><button type="button" data-act="step" data-k="${k}" data-d="1" aria-label="More"${c.ranked || c[k] >= hi ? ' disabled' : ''}>+</button></div>`;
    const pv = def ? Rewards.preview(c, Profile.v.elo, Profile.v.placed) : null, placing = c.ranked && Profile.v.placed < PLACEMENTS;
    const teamName = c.team === 'r' ? 'a random side' : `the ${TEAMS[Number(c.team)].name}`;
    const summary = def
      ? `<b>${c.ranked ? 'Ranked' : 'Casual'}</b> · ${escHTML(MAPS[c.map].name)} · ${1 + c.allies}v${c.enemies} · ${DIFFS[c.diff].name} bots · ${c.len === 'short' ? 'first to 9' : 'first to 16'} · you play ${teamName}<br>
         <span class="elo-pv">Typical result: win <em class="up">${signed(pv.win)}</em> · loss <em class="down">${signed(pv.loss)}</em> Elo${placing ? ` · placement match ${Profile.v.placed + 1} of ${PLACEMENTS}` : ''}${c.ranked ? '' : ' · casual matches count a quarter'}</span>`
      : `<b>Skirmish</b> · ${escHTML(MAPS[c.map].name)} · respawns, no rounds · ${DIFFS[c.diff].name} bots · practice XP only, no Elo`;
    el.innerHTML = `<div class="sheet wide">
      <header class="sheet-head"><button type="button" class="btn ghost back" data-back>‹ Back</button><h2>Create game</h2><span class="head-aside">${ptsHTML(Profile.v.points)}</span></header>
      <div class="sheet-body">
        <h3 class="sect">Map</h3><div class="maps">${maps}</div>
        <div class="cfg-grid">
          <div class="cfg"><h3 class="sect">Mode</h3>${seg('mode', [['defuse', 'Defuse', 'Rounds · money · the charge'], ['skirmish', 'Skirmish', 'Respawns · practice']], c.mode)}</div>
          <div class="cfg"><h3 class="sect">Match type</h3>${seg('ranked', [['false', 'Casual', 'Your rules · Elo ×¼'], ['true', 'Ranked', '5v5 · full Elo']], c.ranked, !def)}</div>
          <div class="cfg wide"><h3 class="sect">Bot difficulty</h3>${seg('diff', DIFF_ORDER.map((k) => [k, DIFFS[k].name, `Rating ${DIFFS[k].elo}`]), c.diff)}<p class="note">${DIFFS[c.diff].blurb}. Harder bots pay more XP and are worth more Elo.</p></div>
          <div class="cfg"><h3 class="sect">Length</h3>${seg('len', [['short', 'Short', 'First to 9'], ['standard', 'Standard', 'First to 16']], c.len, !def)}</div>
          <div class="cfg"><h3 class="sect">Your side</h3>${seg('team', [['1', 'Wardens', 'Defend'], ['0', 'Raiders', 'Attack'], ['r', 'Random', 'Either']], c.team)}</div>
          <div class="cfg"><h3 class="sect">Players${c.ranked ? ' <small>(ranked: 5v5)</small>' : ''}</h3>${stepper('allies', 'Bot teammates', 0, 4)}${stepper('enemies', 'Bot opponents', 1, 5)}</div>
          <div class="cfg"><h3 class="sect">Rules</h3><label class="check"><input type="checkbox" id="cfg-ff"${c.ff ? ' checked' : ''}${c.ranked ? ' disabled' : ''}> Friendly fire${c.ranked ? ' (off in ranked)' : ''}</label></div>
        </div>
      </div>
      <footer class="sheet-foot"><p class="summary">${summary}</p><div class="actions"><button type="button" class="btn" data-back>Back</button><button type="button" class="btn primary" data-act="create-next" data-autofocus>Next: loadout ›</button></div></footer>
    </div>`;
  },

  // ---------------- armory (loadout + shop) ----------------
  openArmory(mode, fromCreate) { Object.assign(this.arm, { mode, fromCreate, sel: null, msg: '' }); this.show('armory'); },
  owned(gun, sel) { return !sel.id || (sel.slot === 'camo' ? Profile.owns('camo', sel.id) : Profile.owns('att', `${gun}:${sel.id}`)); },
  optionsFor(gun, slot) {
    if (slot === 'camo') return [null, ...Object.keys(CAMOS)];
    return [null, ...Object.values(ATTACHMENTS).filter((a) => a.slot === slot && a.guns.includes(gun)).map((a) => a.id)];
  },
  renderArmory() {
    const A = this.arm, gun = A.gun, shop = A.mode === 'shop', kit = Arsenal.kitFor(gun), v = Profile.v;
    const sel = A.sel, pkit = sel ? Object.assign({}, kit, { [sel.slot]: sel.id }) : kit;
    const base = WEAPONS[gun], cur = Arsenal.def(gun, kit), prev = Arsenal.def(gun, pkit);
    $('arm-title').textContent = shop ? 'Shop' : A.fromCreate ? 'Loadout for this match' : 'Loadout';
    $('arm-points').innerHTML = ptsHTML(v.points);
    $('arm-guns').innerHTML = ARMORY_GUNS.map((g) => {
      const k = Arsenal.kitFor(g), n = ATT_SLOTS.filter((s) => k[s.id]).length;
      return `<button type="button" data-act="gun" data-v="${g}" aria-pressed="${g === gun}">${WeaponIcons.img(g)}<b>${WEAPONS[g].name}</b><small>${n ? `${n} attachment${n > 1 ? 's' : ''}` : 'Stock'}${k.camo ? ` · ${CAMOS[k.camo].name}` : ''}</small></button>`;
    }).join('');
    // slots
    const chip = (slot, id) => {
      const eq = (kit[slot] || null) === id, own = this.owned(gun, { slot, id }), selc = sel && sel.slot === slot && sel.id === id;
      const name = id ? (slot === 'camo' ? CAMOS[id].name : attName(id, gun)) : slot === 'camo' ? 'Factory finish' : 'None';
      const price = id ? (slot === 'camo' ? CAMOS[id].price : attPrice(id, gun)) : 0;
      const tag = eq ? 'Equipped' : own ? (shop && id ? 'Owned' : 'Equip') : `${fmtN(price)} pts`;
      const sw = slot === 'camo' ? `<i class="sw" style="${id ? `background-image:url(${this.camoURL(id)})` : ''}"></i>` : '';
      return `<button type="button" class="chip${eq ? ' eq' : ''}${own ? '' : ' lock'}${selc ? ' sel' : ''}" data-act="opt" data-slot="${slot}" data-v="${id || ''}" aria-pressed="${eq}">${sw}<b>${escHTML(name)}</b><small>${tag}</small></button>`;
    };
    const slots = ATT_SLOTS.map((s) => ({ id: s.id, name: s.name })).concat([{ id: 'camo', name: 'Camo' }]);
    $('arm-slots').innerHTML = slots.map((s) => {
      const opts = this.optionsFor(gun, s.id);
      if (opts.length <= 1) return `<div class="slot"><h3 class="sect">${s.name}</h3><p class="note">No ${s.name.toLowerCase()} options for this gun.</p></div>`;
      return `<div class="slot${s.id === 'camo' ? ' camo' : ''}"><h3 class="sect">${s.name}${s.id === 'camo' ? ' <small>unlocks for every gun</small>' : ''}</h3><div class="chips">${opts.map((id) => chip(s.id, id)).join('')}</div></div>`;
    }).join('');
    // detail of the selected option
    let det = '';
    if (sel && sel.id) {
      const own = this.owned(gun, sel), eq = (kit[sel.slot] || null) === sel.id;
      const price = sel.slot === 'camo' ? CAMOS[sel.id].price : attPrice(sel.id, gun);
      let title, sub, pros = [], cons = [];
      if (sel.slot === 'camo') { const cm = CAMOS[sel.id]; title = cm.name; sub = `${CAMO_TIERS[cm.tier]} camo · cosmetic`; }
      else { const at = ATTACHMENTS[sel.id]; title = attName(sel.id, gun); sub = `${at.kind} · ${ATT_SLOTS.find((s) => s.id === at.slot).name}`; pros = attPros(at, gun); cons = attCons(at, gun); }
      const btn = eq ? `<button type="button" class="btn" data-act="unequip">Remove</button>`
        : own ? `<button type="button" class="btn primary" data-act="equip">Equip</button>`
          : `<button type="button" class="btn primary" data-act="buy"${v.points < price ? ' disabled' : ''}>Buy · ${fmtN(price)} pts</button>`;
      det = `<div class="det-head"><div><b>${escHTML(title)}</b><small>${escHTML(sub)}</small></div>${btn}</div>
        <ul class="pc">${pros.map((p) => `<li class="pro">${escHTML(p)}</li>`).join('')}${cons.map((p) => `<li class="con">${escHTML(p)}</li>`).join('')}</ul>
        ${!own && v.points < price ? `<p class="note">You need ${fmtN(price - v.points)} more points. Every level-up pays points; play matches to level up.</p>` : ''}`;
    } else {
      det = `<p class="note">${shop ? 'Pick an attachment or camo to see what it does, then buy it with points. Attachments are bought per gun; camos unlock for every gun.' : 'Choose what this gun carries. Owned options equip on click; locked ones show their price. Your loadout is used whenever you buy this gun.'}</p>`;
    }
    if (A.msg) det += `<p class="msg">${escHTML(A.msg)}</p>`;
    $('arm-detail').innerHTML = det;
    // stats: stock → equipped (bar) and the selection's change (delta)
    const s0 = Arsenal.stats(base), s1 = Arsenal.stats(cur), s2 = Arsenal.stats(prev);
    $('arm-stats').innerHTML = s0.map((st, i) => {
      const a = s1[i].v, b = s2[i].v, w = (x) => (100 * clamp(x / st.max, 0, 1)).toFixed(1), dlt = b - a, better = st.lower ? dlt < 0 : dlt > 0;
      const dTxt = Math.abs(dlt) > 1e-6 ? `<em class="${better ? 'up' : 'down'}">${dlt > 0 ? '+' : '−'}${String(st.fmt(Math.abs(dlt))).replace(/ (rpm|u\/s|s)$/, '')}</em>` : '';
      return `<div class="stat-row"><span>${st.name}</span><div class="sbar"><i style="width:${w(Math.min(a, b))}%"></i><b class="${better ? 'up' : 'down'}" style="left:${w(Math.min(a, b))}%;width:${(w(Math.max(a, b)) - w(Math.min(a, b))).toFixed(1)}%"></b></div><span class="sv">${st.fmt(b)} ${dTxt}</span></div>`;
    }).join('');
    $('arm-name').innerHTML = `<b>${base.name}</b><small>${ATT_SLOTS.map((s) => (pkit[s.id] ? attName(pkit[s.id], gun) : '')).filter(Boolean).join(' · ') || 'Stock'}${pkit.camo ? ` · ${CAMOS[pkit.camo].name}` : ''}</small>`;
    $('arm-foot').innerHTML = A.fromCreate
      ? `<p class="summary">Attachments apply to the guns you buy during the match. Bots carry stock guns.</p><div class="actions"><button type="button" class="btn" data-back>Back</button><button type="button" class="btn primary" data-act="start" data-autofocus>Start match ›</button></div>`
      : `<p class="summary">${shop ? 'Earn points by levelling up: XP comes from eliminations, damage, rounds and wins.' : 'Locked options can be bought here too.'}</p><div class="actions"><button type="button" class="btn" data-go="${shop ? 'loadout' : 'shop'}">${shop ? 'Open loadout' : 'Open shop'}</button><button type="button" class="btn primary" data-back>Done</button></div>`;
    if (ArmoryView.init($('arm-canvas'))) ArmoryView.show(gun, prev);
    else $('arm-canvas').hidden = true;
  },
  camoURL(id) {
    if (!this.camoURLs) this.camoURLs = {};
    if (!this.camoURLs[id]) { const cv = Arsenal.camoCanvas(id), sm = makeCanvas(64); sm.getContext('2d').drawImage(cv, 0, 0, 64, 64); this.camoURLs[id] = sm.toDataURL(); }
    return this.camoURLs[id];
  },

  // ---------------- career ----------------
  renderCareer() {
    const v = Profile.v, s = v.stats, lv = Profile.level(), rk = Profile.rank(), el = $('scr-career');
    const nextRk = rk >= 0 && rk < RANKS.length - 1 ? RANKS[rk + 1] : null, curMin = rk >= 0 ? RANKS[rk].min : 0;
    const prog = nextRk ? clamp((v.elo - curMin) / (nextRk.min - curMin), 0, 1) : 1;
    const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills ? '∞' : '—', adr = s.rounds ? Math.round(s.damage / s.rounds) : 0;
    const hsp = s.kills ? Math.round(100 * s.hs / s.kills) : 0, wr = s.matches ? Math.round(100 * s.wins / s.matches) : 0;
    const tile = (label, val) => `<div class="tile"><small>${label}</small><b>${val}</b></div>`;
    const hist = v.history.length ? `<table class="hist"><thead><tr><th>Result</th><th>Map</th><th>Type</th><th>Score</th><th>K–D</th><th>ADR</th><th>XP</th><th>Elo</th></tr></thead><tbody>${v.history.map((h) => {
      const res = { win: 'Win', loss: 'Loss', draw: 'Draw', left: 'Left' }[h.outcome] || h.outcome;
      return `<tr class="${h.outcome}"><td>${res}</td><td>${escHTML(MAPS[h.map] ? MAPS[h.map].name : h.map)}</td><td>${h.ranked ? 'Ranked' : 'Casual'} · ${(DIFFS[h.diff] || DIFFS.normal).name}</td><td>${h.score ? `${h.score[0]}–${h.score[1]}` : '—'}</td><td>${h.k}–${h.d}</td><td>${h.adr}</td><td>+${fmtN(h.xp)}</td><td class="${h.elo > 0 ? 'up' : h.elo < 0 ? 'down' : ''}">${h.elo === null || h.elo === undefined ? '—' : signed(h.elo)}</td></tr>`;
    }).join('')}</tbody></table>` : '<p class="note">No matches yet. Defuse matches show up here with their XP and Elo.</p>';
    const ladder = RANKS.map((r, i) => `<div class="rung${i === rk ? ' on' : ''}">${emblemSVG(i, 30)}<span>${r.name}</span><small>${r.min ? fmtN(r.min) : '0'}+</small></div>`).reverse().join('');
    el.innerHTML = `<div class="sheet wide">
      <header class="sheet-head"><button type="button" class="btn ghost back" data-back>‹ Back</button><h2>Career</h2><span class="head-aside">${ptsHTML(v.points)}</span></header>
      <div class="sheet-body career">
        <div class="car-top">
          <div class="car-rank">${emblemSVG(rk, 96)}<div><small>Rank</small><b>${escHTML(rankName(rk, v.placed))}</b><span>${rk < 0 ? `Elo ${fmtN(v.elo)} (hidden until placed)` : `${fmtN(v.elo)} Elo · peak ${fmtN(v.peak)}`}</span>
            ${nextRk ? `<div class="xpbar rank"><i style="width:${(prog * 100).toFixed(1)}%"></i></div><small>${rk < 0 ? '' : `${fmtN(Math.max(0, nextRk.min - v.elo))} to ${nextRk.name}`}</small>` : ''}</div></div>
          <div class="car-level">${levelBadge(lv.level)}<div><small>Level</small><b>Level ${lv.level}</b><span>${fmtN(lv.into)} / ${fmtN(lv.need)} XP · next level pays ${fmtN(LEVELS.points(lv.level + 1))} points</span>${xpBar(lv)}</div></div>
        </div>
        <div class="tiles">${tile('Matches', fmtN(s.matches))}${tile('Win rate', `${wr}%`)}${tile('W–L–D', `${s.wins}–${s.losses + s.left}–${s.draws}`)}${tile('Ranked played', fmtN(s.ranked))}
          ${tile('Eliminations', fmtN(s.kills))}${tile('K/D', kd)}${tile('Damage / round', adr)}${tile('Headshot %', `${hsp}%`)}${tile('Charges planted', fmtN(s.plants))}${tile('Charges defused', fmtN(s.defuses))}</div>
        <div class="car-cols"><div><h3 class="sect">Recent matches</h3>${hist}</div><div><h3 class="sect">Ranks</h3><div class="ladder">${ladder}</div>
          <p class="note">Elo moves with every defuse match: winning against higher-rated bots moves it most, and your eliminations, damage and objectives add to it. Ranked matches count fully, casual ones a quarter. The first ${PLACEMENTS} ranked matches are placements and count double.</p></div></div>
      </div>
    </div>`;
  },

  // ---------------- pause / ready ----------------
  renderPause() {
    const c = Session.cfg, M = Match, me = Actors.me;
    let info = 'Practice';
    if (Session.active && c) {
      info = `${c.ranked ? 'Ranked' : c.mode === 'defuse' ? 'Casual' : 'Skirmish'} · ${escHTML(Game.L.name)} · ${DIFFS[c.diff].name} bots`;
      if (M.active) info += ` · round ${M.round} · ${M.score[me.squad]}–${M.score[1 - me.squad]}`;
    }
    $('pause-info').innerHTML = info;
    const ranked = Session.active && c && c.ranked && !Session.done;
    $('pause-warn').hidden = !ranked;
    $('btn-leave').textContent = Session.active && !Session.done ? 'Leave match' : 'Main menu';
  },
  renderReady() { $('ready-map').textContent = Game.L ? Game.L.name : ''; $('ready-info').textContent = Session.cfg ? `${Session.cfg.ranked ? 'Ranked' : Session.cfg.mode === 'defuse' ? 'Casual' : 'Skirmish'} · ${DIFFS[Session.cfg.diff].name} bots` : ''; },

  // ---------------- results ----------------
  renderResults() {
    const R0 = Session.results, el = $('scr-results');
    if (!R0) { el.innerHTML = ''; return; }
    const { outcome, cfg, st, xp, ups, lv0, lv1, elo } = R0;
    const title = { win: 'Victory', loss: 'Defeat', draw: 'Draw', left: 'Match left', none: 'Match left', practice: 'Practice over' }[outcome] || 'Match over';
    const adr = st.rounds ? Math.round(st.dmg / st.rounds) : 0, hsp = st.kills ? Math.round(100 * st.hs / st.kills) : 0;
    const tile = (label, val) => `<div class="tile"><small>${label}</small><b>${val}</b></div>`;
    const xpLines = xp.lines.map((l) => `<li><span>${escHTML(l.label)}</span><b>+${fmtN(l.v)}</b></li>`).join('') || '<li><span>Nothing earned</span><b>0</b></li>';
    const lvlPct = (100 * lv1.into / lv1.need).toFixed(1), lvl0Pct = lv1.level === lv0.level ? (100 * lv0.into / lv0.need).toFixed(1) : '0';
    const upsHTML = ups.length ? `<div class="lvlups">${ups.map((u) => `<div class="lvlup">${levelBadge(u.level)}<span class="lu-t">Level ${u.level}</span>${ptsHTML(u.points)}</div>`).join('')}</div>` : '';
    let eloHTML = '';
    if (elo) {
      const rk0 = R0.rank0, rk1 = R0.rank1, up = elo.delta >= 0;
      const partList = elo.parts.filter((p) => Math.abs(p.v) > 0.05).map((p) => `<li class="sub"><span>${escHTML(p.label)}</span><b>${signed(p.v, 1)}</b></li>`).join('');
      eloHTML = `<div class="res-box"><h3 class="sect">Rank · ${escHTML(elo.modeLabel)}</h3>
        <div class="res-rank">${emblemSVG(rk0, 56)}<span class="arrow">›</span>${emblemSVG(rk1, 72)}<div><b>${escHTML(rankName(rk1, R0.placed1))}</b><span>${fmtN(R0.elo0)} → ${fmtN(R0.elo1)} Elo <em class="${up ? 'up' : 'down'}">${signed(elo.delta)}</em></span>${rk1 > rk0 && rk0 >= 0 ? '<span class="promo">Promoted</span>' : rk1 < rk0 && rk1 >= 0 ? '<span class="demo">Demoted</span>' : rk0 < 0 && rk1 >= 0 ? '<span class="promo">Placed</span>' : ''}</div></div>
        <ul class="lines">${elo.lines.map((l) => `<li><span>${escHTML(l.label)}</span><b>${signed(l.v, 1)}</b></li>`).join('')}${partList}<li class="tot"><span>Elo change</span><b>${signed(elo.delta)}</b></li></ul></div>`;
    }
    el.innerHTML = `<div class="sheet wide results ${outcome}">
      <header class="res-head"><div><small>${escHTML(MAPS[cfg.map] ? MAPS[cfg.map].name : '')} · ${cfg.mode === 'defuse' ? (cfg.ranked ? 'Ranked' : 'Casual') : 'Skirmish'} · ${DIFFS[cfg.diff].name} bots</small><h2>${title}</h2></div>${st.score ? `<div class="res-score">${st.score[0]}<i>–</i>${st.score[1]}</div>` : ''}</header>
      <div class="sheet-body">
        <div class="tiles">${tile('Eliminations', st.kills)}${tile('Deaths', st.deaths)}${tile('Damage / round', adr)}${tile('Headshot %', `${hsp}%`)}${cfg.mode === 'defuse' ? tile('Rounds won', st.roundsWon) + tile('Planted', st.plants) + tile('Defused', st.defuses) : ''}</div>
        <div class="res-cols">
          <div class="res-box"><h3 class="sect">Experience · ${xp.mults.map(escHTML).join(' · ')}</h3><ul class="lines">${xpLines}<li class="tot"><span>Total XP${xp.k !== 1 ? ` (×${xp.k.toFixed(2)})` : ''}</span><b>+${fmtN(xp.total)}</b></li></ul>
            <div class="res-level">${levelBadge(lv1.level)}<div><div class="hc-xpl"><span>Level ${lv1.level}</span><span>${fmtN(lv1.into)} / ${fmtN(lv1.need)} XP</span></div><div class="xpbar anim"><i style="--from:${lvl0Pct}%;width:${lvlPct}%"></i></div></div></div>
            ${upsHTML}<p class="note">Points: ${ptsHTML(R0.pointsNow)} · spend them in the shop.</p></div>
          ${eloHTML || `<div class="res-box"><h3 class="sect">Rank</h3><p class="note">${cfg.mode === 'defuse' ? 'This match ended before it started, so your rating did not change.' : 'Skirmish is practice: it pays some XP but never changes your Elo. Play a defuse match to move your rank.'}</p></div>`}
        </div>
      </div>
      <footer class="sheet-foot"><p class="summary">${outcome === 'left' && cfg.ranked ? 'Leaving a ranked match counts as a loss.' : ''}</p><div class="actions"><button type="button" class="btn" data-go="shop">Shop</button><button type="button" class="btn" data-act="home">Main menu</button><button type="button" class="btn primary" data-act="again" data-autofocus>Play again</button></div></footer>
    </div>`;
  },

  // ---------------- settings (same controls as before) ----------------
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
    Settings.on((k) => {
      if (['fov', 'aspect', 'vmFov', 'renderScale', 'maxDpr'].includes(k)) R.resize();
      if (k.startsWith('xh')) HUD.applyCrosshairStyle();
      if (k === 'volume') Snd.setVolume();
      if (k === 'showFps' || k === 'showSpeed' || k === 'showHints') HUD.applyToggles();
      // the old Match-tab options still work from the test hooks
      if (k === 'team') Actors.setTeam(Settings.v.team);
      if (k === 'ff') Actors.ff = !!Settings.v.ff;
      if (k === 'mode') Match.setMode(Settings.v.mode);
      if (k === 'matchLen' && Match.active) Match.startMatch();
    });
  },
};

function toggleFullscreen() {
  (async () => {
    try {
      if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().catch(() => {}); }
      else await document.exitFullscreen();
    } catch (e) { HUD.note('Fullscreen is not available here'); }
  })();
}
