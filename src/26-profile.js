// Career profile: XP and levels (each level pays shop points), owned attachments and camos, the
// per-gun kit, Elo rating and rank, lifetime stats and recent matches.
// Saved on this device (localStorage) and, when the page runs as a claude.ai artifact with the
// `db` capability, in a private per-user document so progress follows the account.

const DIFFS = {
  easy: { name: 'Easy', elo: 750, xp: 0.8, blurb: 'Slow to react, loose aim' },
  normal: { name: 'Normal', elo: 1050, xp: 1, blurb: 'Fair fights' },
  hard: { name: 'Hard', elo: 1350, xp: 1.25, blurb: 'Quick, accurate, punishes peeks' },
  expert: { name: 'Expert', elo: 1650, xp: 1.5, blurb: 'Near-instant reactions, headshot aim' },
};
const DIFF_ORDER = ['easy', 'normal', 'hard', 'expert'];

// Ranks by rating. The family sets the emblem colour; tiers are I–III.
const RANK_FAMILIES = [
  { name: 'Spark', col: '#c07a4a', col2: '#6e3d22' }, { name: 'Flint', col: '#aeb6bb', col2: '#535b61' },
  { name: 'Fuse', col: '#f0a53a', col2: '#8a5310' }, { name: 'Charge', col: '#4fc6b8', col2: '#1b5f58' },
  { name: 'Blast', col: '#e5573f', col2: '#7a1f13' }, { name: 'Shockwave', col: '#a688f0', col2: '#4b3290' },
  { name: 'Short Fuse', col: '#ffd76a', col2: '#9a6a00' },
];
const RANKS = (() => {
  const list = [], roman = ['I', 'II', 'III'];
  let r = 0;
  for (let f = 0; f < 5; f++) for (let t = 0; t < 3; t++) { list.push({ name: `${RANK_FAMILIES[f].name} ${roman[t]}`, fam: f, tier: t + 1, min: r }); r = r === 0 ? 700 : r + 100; }
  list.push({ name: 'Shockwave', fam: 5, tier: 0, min: 2200 });
  list.push({ name: 'Short Fuse', fam: 6, tier: 0, min: 2400 });
  return list;
})();
const PLACEMENTS = 3;
const rankFor = (elo) => { let k = 0; for (let i = 0; i < RANKS.length; i++) if (elo >= RANKS[i].min) k = i; return k; };

// Levels: XP needed for the next level grows, and every level-up pays shop points.
const LEVELS = {
  need: (L) => Math.min(800 + 150 * (L - 1), 6000),
  points: (L) => Math.min(150 + 10 * (L - 1), 600) + (L % 10 === 0 ? 500 : 0),
  of(xp) {
    let L = 1, rest = Math.max(0, xp);
    while (L < 200 && rest >= this.need(L)) { rest -= this.need(L); L++; }
    return { level: L, into: rest, need: this.need(L) };
  },
};
const WELCOME_POINTS = 600;

const Profile = {
  key: 'shortfuse.profile.v1', v: null, listeners: [],
  cloud: null, cloudState: 'local', writing: false, again: false, saveT: null, retryT: null,

  blank() {
    const kit = {};
    for (const g of ARMORY_GUNS) kit[g] = { muzzle: null, optic: null, mag: null, grip: null, camo: null };
    return {
      ver: 1, created: Date.now(), updated: 0, xp: 0, points: WELCOME_POINTS, owned: { att: [], camo: [] }, kit,
      elo: 1000, peak: 1000, placed: 0, lastCfg: null,
      stats: { matches: 0, wins: 0, losses: 0, draws: 0, left: 0, ranked: 0, kills: 0, deaths: 0, hs: 0, damage: 0, rounds: 0, plants: 0, defuses: 0 },
      history: [],
    };
  },

  // Accept anything shaped roughly right; drop what isn't.
  sanitize(o) {
    const b = this.blank();
    if (!o || typeof o !== 'object') return b;
    const num = (v, d, lo = 0, hi = 1e9) => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : d);
    b.created = num(o.created, b.created); b.updated = num(o.updated, 0); b.xp = num(o.xp, 0); b.points = num(o.points, WELCOME_POINTS);
    b.elo = num(o.elo, 1000, 0, 5000); b.peak = num(o.peak, b.elo, 0, 5000); b.placed = num(o.placed, 0, 0, 1e6);
    if (o.owned && typeof o.owned === 'object') {
      if (Array.isArray(o.owned.att)) b.owned.att = o.owned.att.filter((s) => typeof s === 'string' && ATTACHMENTS[s.split(':')[1]] && attFits(s.split(':')[1], s.split(':')[0]));
      if (Array.isArray(o.owned.camo)) b.owned.camo = o.owned.camo.filter((s) => typeof s === 'string' && CAMOS[s]);
    }
    if (o.kit && typeof o.kit === 'object') {
      for (const g of ARMORY_GUNS) {
        const k = o.kit[g];
        if (!k || typeof k !== 'object') continue;
        for (const s of ATT_SLOTS) { const a = k[s.id]; if (a && attFits(a, g) && ATTACHMENTS[a].slot === s.id && b.owned.att.includes(`${g}:${a}`)) b.kit[g][s.id] = a; }
        if (k.camo && b.owned.camo.includes(k.camo)) b.kit[g].camo = k.camo;
      }
    }
    if (o.stats && typeof o.stats === 'object') for (const k of Object.keys(b.stats)) b.stats[k] = num(o.stats[k], 0);
    if (Array.isArray(o.history)) b.history = o.history.filter((h) => h && typeof h === 'object').slice(0, 15);
    if (o.lastCfg && typeof o.lastCfg === 'object') b.lastCfg = o.lastCfg;
    return b;
  },

  load() {
    let saved = null;
    try { if (typeof localStorage !== 'undefined') saved = JSON.parse(localStorage.getItem(this.key) || 'null'); } catch (e) { saved = null; }
    this.v = this.sanitize(saved);
  },
  on(f) { this.listeners.push(f); },
  emit() { for (const f of this.listeners) { try { f(this.v); } catch (e) { /* UI listener */ } } },

  // Every real change goes through here: device copy now, account copy one write at a time.
  save(soon) {
    this.v.updated = Date.now();
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(this.key, JSON.stringify(this.v)); } catch (e) { /* storage blocked */ }
    if (this.cloud) {
      clearTimeout(this.saveT);
      if (soon) this.saveT = setTimeout(() => this.push(), 1500); else this.push();
    }
    this.emit();
  },
  async push() {
    if (!this.cloud || this.cloudState === 'readonly') return;
    if (this.writing) { this.again = true; return; }
    this.writing = true;
    try {
      await this.cloud.set(JSON.parse(JSON.stringify(this.v)));
      this.cloudState = 'synced';
    } catch (e) {
      const code = e && e.code;
      if (code === 'invalid_argument' || code === 'revoked' || code === 'not_granted') this.cloudState = 'readonly';
      else { this.cloudState = 'offline'; clearTimeout(this.retryT); this.retryT = setTimeout(() => this.push(), 20000); }
    }
    this.writing = false;
    this.emit();
    if (this.again) { this.again = false; this.push(); }
  },

  // Optional: the account copy. Never blocks the game; the device copy is used until it answers.
  async connect() {
    const c = typeof window !== 'undefined' ? window.claude : null;
    if (!c || typeof c.use !== 'function') return;
    this.cloudState = 'connecting'; this.emit();
    const limit = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
    try {
      const [db, user] = await limit(Promise.all([c.use('db'), c.use('user')]), 10000) || [null, null];
      const id = db && user ? await limit(user.id(), 10000) : null;
      if (!db || !id) { this.cloudState = 'local'; this.emit(); return; }
      const ref = db.doc(`data/users/${id}/profile`);
      const snap = await limit(ref.get(), 10000);
      if (!snap) { this.cloudState = 'local'; this.emit(); return; }
      this.cloud = ref; this.cloudState = 'synced';
      const remote = snap.exists ? this.sanitize(snap.data()) : null;
      if (remote && remote.updated > this.v.updated) {
        this.v = remote;
        try { localStorage.setItem(this.key, JSON.stringify(this.v)); } catch (e) { /* storage blocked */ }
        Arsenal.cache.clear();
        this.emit();
      } else if (this.v.updated > (remote ? remote.updated : 0)) this.push();
      else this.emit();
    } catch (e) { this.cloudState = 'local'; this.emit(); }
  },
  syncLabel() {
    return { synced: 'Saved to your account', connecting: 'Connecting…', offline: 'Account save pending', readonly: 'Saved on this device (no write access)' }[this.cloudState] || 'Saved on this device';
  },

  level() { return LEVELS.of(this.v.xp); },
  rank() { return this.v.placed >= PLACEMENTS ? rankFor(this.v.elo) : -1; },
  owns(kind, id) { return this.v.owned[kind].includes(id); },

  // Shop: attachments are per gun ("rifle:hush"), camos are for every gun.
  buy(kind, id, gun) {
    const key = kind === 'att' ? `${gun}:${id}` : id;
    if (this.owns(kind, key)) return { ok: false, msg: 'Already owned' };
    if (kind === 'att' && !attFits(id, gun)) return { ok: false, msg: 'Does not fit this gun' };
    const price = kind === 'att' ? attPrice(id, gun) : CAMOS[id] ? CAMOS[id].price : Infinity;
    if (this.v.points < price) return { ok: false, msg: `Need ${price - this.v.points} more points` };
    this.v.points -= price;
    this.v.owned[kind].push(key);
    this.save();
    return { ok: true, msg: kind === 'att' ? `${attName(id, gun)} unlocked for the ${WEAPONS[gun].name}` : `${CAMOS[id].name} unlocked for every gun`, price };
  },
  equip(gun, slot, id) {
    const k = this.v.kit[gun];
    if (!k) return false;
    if (slot === 'camo') { if (id && !this.owns('camo', id)) return false; k.camo = id || null; }
    else {
      if (id && (!this.owns('att', `${gun}:${id}`) || ATTACHMENTS[id].slot !== slot)) return false;
      k[slot] = id || null;
    }
    Arsenal.cache.clear();
    this.save(true);
    return true;
  },

  // Fold a finished (or abandoned) match into the career; returns everything the results screen shows.
  applyMatch(cfg, st, outcome) {
    const v = this.v, lv0 = this.level(), rank0 = this.rank(), elo0 = v.elo, placed0 = v.placed;
    const xp = Rewards.xp(cfg, st, outcome);
    const elo = cfg.mode === 'defuse' && outcome !== 'none' ? Rewards.elo(cfg, st, outcome, v.elo, v.placed) : null;
    v.xp += xp.total;
    const lv1 = this.level(), ups = [];
    for (let L = lv0.level + 1; L <= lv1.level; L++) { const p = LEVELS.points(L); ups.push({ level: L, points: p }); v.points += p; }
    if (elo) {
      v.elo = Math.max(0, v.elo + elo.delta);
      if (cfg.ranked) v.placed++;
      if (v.placed >= PLACEMENTS) v.peak = Math.max(v.peak, v.elo);
    }
    const s = v.stats;
    if (cfg.mode === 'defuse' && outcome !== 'none') {
      s.matches++; if (cfg.ranked) s.ranked++;
      if (outcome === 'win') s.wins++; else if (outcome === 'draw') s.draws++; else if (outcome === 'left') s.left++; else s.losses++;
      s.rounds += st.rounds; s.plants += st.plants; s.defuses += st.defuses;
    }
    s.kills += st.kills; s.deaths += st.deaths; s.hs += st.hs; s.damage += Math.round(st.dmg);
    const rec = { t: Date.now(), map: cfg.map, mode: cfg.mode, ranked: !!cfg.ranked, diff: cfg.diff, outcome, score: st.score || null,
      k: st.kills, d: st.deaths, adr: st.rounds ? Math.round(st.dmg / st.rounds) : 0, xp: xp.total, elo: elo ? elo.delta : null };
    if (cfg.mode === 'defuse' && outcome !== 'none') { v.history.unshift(rec); v.history.length = Math.min(v.history.length, 15); }
    this.save();
    return { outcome, cfg, st, xp, ups, lv0, lv1, elo, elo0, elo1: v.elo, rank0, rank1: this.rank(), placed0, placed1: v.placed, pointsNow: v.points };
  },
};

// XP and Elo for one match. `st`: { kills, deaths, hs, dmg, rounds, roundsWon, plants, defuses }.
const Rewards = {
  xp(cfg, st, outcome) {
    const lines = [], add = (label, v) => { if (v) lines.push({ label, v: Math.round(v) }); };
    if (cfg.mode === 'defuse') {
      add(`Eliminations ${st.kills} × 100`, st.kills * 100);
      add(`Headshots ${st.hs} × 30`, st.hs * 30);
      add(`Damage ${Math.round(st.dmg)} × 0.5`, st.dmg * 0.5);
      add(`Rounds won ${st.roundsWon} × 60`, st.roundsWon * 60);
      add(`Charges planted ${st.plants} × 80`, st.plants * 80);
      add(`Charges defused ${st.defuses} × 120`, st.defuses * 120);
      if (outcome === 'win') add('Match win', 600);
      else if (outcome === 'draw') add('Match draw', 300);
      if (outcome !== 'left' && outcome !== 'none') add('Match completed', 400);
    } else {
      add(`Practice eliminations ${st.kills} × 40`, st.kills * 40);
      add(`Practice damage ${Math.round(st.dmg)} × 0.2`, st.dmg * 0.2);
    }
    const base = lines.reduce((n, l) => n + l.v, 0), d = DIFFS[cfg.diff] || DIFFS.normal;
    let k = d.xp; const mults = [`${d.name} bots ×${d.xp}`];
    if (cfg.ranked) { k *= 1.25; mults.push('Ranked ×1.25'); }
    return { lines, base, k, mults, total: Math.round(base * k) };
  },

  // Bot sides have a rating set by difficulty (and how many of them you face); the result moves
  // you toward it Elo-style, and your own eliminations and damage add on top. Ranked matches count
  // fully; casual ones a quarter. Placement matches move twice as far.
  oppRating(cfg) {
    const d = DIFFS[cfg.diff] || DIFFS.normal;
    return d.elo + 40 * ((cfg.enemies || 5) - 1 - (cfg.allies ?? 4));
  },
  elo(cfg, st, outcome, rating, placed) {
    const ropp = this.oppRating(cfg), E = 1 / (1 + Math.pow(10, (ropp - rating) / 400));
    const S = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
    const lenK = cfg.len === 'short' ? 0.7 : 1, placing = cfg.ranked && placed < PLACEMENTS;
    const K = (cfg.ranked ? (placing ? 64 : 32) : 8) * lenK;
    const result = K * (S - E);
    const adr = st.rounds ? st.dmg / st.rounds : 0;
    const parts = [
      { label: `Eliminations ${st.kills} × 0.9`, v: st.kills * 0.9 }, { label: `Headshots ${st.hs} × 0.15`, v: st.hs * 0.15 },
      { label: `Damage per round ${Math.round(adr)} vs 75`, v: st.rounds ? (adr - 75) * 0.12 : 0 }, { label: `Deaths ${st.deaths} × −0.6`, v: -st.deaths * 0.6 },
      { label: 'Objectives', v: st.plants * 0.5 + st.defuses * 1.0 },
    ];
    const rawSum = parts.reduce((n, p) => n + p.v, 0), fav = rawSum > 0 ? 2 * (1 - E) : 2 * E;   // favourites gain less and lose more
    const modeK = cfg.ranked ? (placing ? 2 : 1) : 0.25, cap = cfg.ranked ? 24 : 6;
    const perf = clamp(rawSum * lenK * fav * modeK, -cap, cap);
    const why = [`${rawSum > 0 ? 'gains' : 'losses'} ×${fav.toFixed(2)} at ${Math.round(E * 100)}% expected`];
    if (lenK !== 1) why.push(`short ×${lenK}`);
    why.push(cfg.ranked ? (placing ? 'placement ×2' : 'ranked ×1') : 'casual ×0.25');
    if (Math.abs(rawSum * lenK * fav * modeK) > cap) why.push(`capped at ±${cap}`);
    if (rawSum) parts.push({ label: `Weighting: ${why.join(', ')}`, v: perf - rawSum });
    const delta = Math.round(result + perf);
    const res = outcome === 'win' ? 'Win' : outcome === 'draw' ? 'Draw' : outcome === 'left' ? 'Left early (counts as a loss)' : 'Loss';
    return {
      delta, E, ropp, result, perf, placing,
      lines: [{ label: `${res} vs ${(DIFFS[cfg.diff] || DIFFS.normal).name} bots (${ropp}) · expected ${Math.round(E * 100)}%`, v: result }, { label: 'Performance', v: perf }],
      parts, modeLabel: cfg.ranked ? (placing ? `Ranked placement ${placed + 1}/${PLACEMENTS} · ×2` : 'Ranked · full weight') : 'Casual · ×0.25 weight',
    };
  },
  // What a win and a loss would roughly be worth with an average game (Create Game summary).
  preview(cfg, rating, placed) {
    const st = { kills: 14, deaths: 14, hs: 4, dmg: 1900, rounds: cfg.len === 'short' ? 14 : 24, plants: 1, defuses: 0 };
    st.dmg = st.rounds * 78;
    return { win: this.elo(cfg, st, 'win', rating, placed).delta, loss: this.elo(cfg, st, 'loss', rating, placed).delta };
  },
};

Profile.load();
