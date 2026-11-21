// Accounts on this device. Each account has a callsign, an optional PIN and its own career profile
// (XP, points, purchases, loadout, Elo, history). Everything lives in this browser's storage:
//   shortfuse.accounts.v1          the account list and who signed in last
//   shortfuse.profile.v1.<id>      one account's profile
//   shortfuse.pending.v1.<id>      what leaving the current match would record (used if the page dies)
// Progress is committed when a match ends or you exit it (leave, close or reload the page), and
// when you buy or equip something in the menus. A guest plays without saving.
// The PIN only stops other people on this device from playing as you: it is hashed, not encryption.

const ACCOUNTS_KEY = 'shortfuse.accounts.v1', PROFILE_PREFIX = 'shortfuse.profile.v1.', PENDING_PREFIX = 'shortfuse.pending.v1.';
const LEGACY_PROFILE_KEY = 'shortfuse.profile.v1';      // Stage 6's single profile, moved into the first account

// 53-bit string hash (fallback when WebCrypto is unavailable).
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function randomId(n = 8) {
  const b = new Uint8Array(n);
  try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256); }
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
async function pinHash(salt, pin, kind) {
  const text = `shortfuse:${salt}:${pin}`;
  if (kind !== 'c53') {
    try {
      if (globalThis.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return 's256:' + Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* fall back */ }
    if (kind === 's256') return null;
  }
  let h = text;
  for (let i = 0; i < 4000; i++) h = cyrb53(h, i).toString(36);
  return 'c53:' + h;
}

const Accounts = {
  list: [], cur: null, lastSaved: 0, storageOK: true, remembered: null, notice: null, listeners: [],

  store: {
    get(k) { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (typeof localStorage === 'undefined') return false; localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
  },
  readJSON(k) { try { return JSON.parse(this.store.get(k) || 'null'); } catch (e) { return null; } },

  get guest() { return !this.cur; },
  name() { return this.cur ? this.cur.name : 'You'; },
  on(f) { this.listeners.push(f); },
  emit() { for (const f of this.listeners) { try { f(); } catch (e) { /* UI listener */ } } },

  init() {
    this.storageOK = this.store.set('shortfuse.probe', '1');
    this.store.del('shortfuse.probe');
    const idx = this.readJSON(ACCOUNTS_KEY);
    this.list = Array.isArray(idx && idx.accounts) ? idx.accounts.filter((a) => a && typeof a.id === 'string' && /^[0-9a-f]{8,32}$/.test(a.id) && typeof a.name === 'string') : [];
    for (const a of this.list) { a.name = this.cleanName(a.name) || 'Player'; a.created = +a.created || 0; a.lastPlayed = +a.lastPlayed || 0; if (!a.pin || typeof a.pin.hash !== 'string') a.pin = null; }
    this.remembered = idx && this.list.find((a) => a.id === idx.current) || null;
    this.cur = null;
    Profile.v = Profile.blank();
  },
  saveIndex() { return this.store.set(ACCOUNTS_KEY, JSON.stringify({ ver: 1, current: this.cur ? this.cur.id : null, accounts: this.list })); },

  cleanName(s) { return String(s || '').replace(/[^\p{L}\p{N} _.\-']/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16); },
  checkName(name, except) {
    const n = this.cleanName(name);
    if (n.length < 2) return { ok: false, msg: 'Use 2 to 16 letters, digits, spaces, _ . - or \'' };
    if (this.list.some((a) => a !== except && a.name.toLowerCase() === n.toLowerCase())) return { ok: false, msg: `“${n}” is already an account on this device` };
    return { ok: true, name: n };
  },
  checkPin(pin, pin2) {
    if (!pin && !pin2) return { ok: true, pin: '' };
    if (!/^\d{4,8}$/.test(pin)) return { ok: false, msg: 'A PIN is 4 to 8 digits' };
    if (pin !== pin2) return { ok: false, msg: 'The two PINs don’t match' };
    return { ok: true, pin };
  },
  // Progress from Stage 6 (before accounts) waiting to be moved into the first account.
  legacy() {
    const o = this.readJSON(LEGACY_PROFILE_KEY);
    if (!o) return null;
    const p = Profile.sanitize(o);
    return this.hasProgress(p) ? p : null;
  },
  hasProgress(p) { return p.xp > 0 || p.history.length > 0 || p.owned.att.length > 0 || p.owned.camo.length > 0 || p.points !== WELCOME_POINTS; },
  profileOf(a) { return Profile.sanitize(this.readJSON(PROFILE_PREFIX + a.id)); },

  async create(name, pin, opts = {}) {
    if (!this.storageOK) return { ok: false, msg: 'This browser isn’t letting the game store anything here, so accounts can’t be saved' };
    const n = this.checkName(name);
    if (!n.ok) return n;
    const a = { id: randomId(8), name: n.name, created: Date.now(), lastPlayed: 0, pin: null };
    if (pin) { const salt = randomId(8), hash = await pinHash(salt, pin); a.pin = { salt, hash }; }
    let profile = Profile.blank(), from = 'new';
    if (opts.fromGuest && this.hasProgress(Profile.v)) { profile = Profile.sanitize(JSON.parse(JSON.stringify(Profile.v))); from = 'guest'; }
    else if (!this.list.length) { const old = this.legacy(); if (old) { profile = old; from = 'legacy'; } }
    if (!this.store.set(PROFILE_PREFIX + a.id, JSON.stringify(profile))) return { ok: false, msg: 'Couldn’t save on this device (storage full or blocked)' };
    if (from === 'legacy') this.store.del(LEGACY_PROFILE_KEY);
    this.list.push(a);
    this.signIn(a);
    return { ok: true, account: a, from };
  },
  async verify(a, pin) {
    if (!a.pin) return true;
    const kind = a.pin.hash.startsWith('s256:') ? 's256' : 'c53', h = await pinHash(a.pin.salt, pin, kind);
    return !!h && h === a.pin.hash;
  },
  signIn(a) {
    a = this.list.find((x) => x.id === a.id) || a;
    this.cur = a; this.remembered = a;
    Profile.v = this.profileOf(a);
    if (typeof Arsenal !== 'undefined') Arsenal.cache.clear();
    this.saveIndex();
    this.applyPending();
    if (typeof Actors !== 'undefined' && Actors.me) Actors.me.name = a.name;
    this.emit(); Profile.emit();
  },
  signOut() {
    if (this.cur) this.saveProfile();
    this.cur = null;
    this.saveIndex();
    Profile.v = Profile.blank();
    if (typeof Arsenal !== 'undefined') Arsenal.cache.clear();
    if (typeof Actors !== 'undefined' && Actors.me) Actors.me.name = 'You';
    this.emit(); Profile.emit();
  },
  playAsGuest() { if (this.cur) this.signOut(); else { Profile.v = Profile.blank(); this.emit(); Profile.emit(); } },

  // Write the signed-in account's profile to this device. Guests have nothing to write.
  saveProfile() {
    if (!this.cur) return false;
    const ok = this.store.set(PROFILE_PREFIX + this.cur.id, JSON.stringify(Profile.v));
    if (ok) this.lastSaved = Date.now(); else this.saveFailed = Date.now();
    return ok;
  },
  touch() { if (this.cur) { this.cur.lastPlayed = Date.now(); this.saveIndex(); } },

  rename(name) {
    if (!this.cur) return { ok: false, msg: 'Sign in first' };
    const n = this.checkName(name, this.cur);
    if (!n.ok) return n;
    this.cur.name = n.name; this.saveIndex();
    if (typeof Actors !== 'undefined' && Actors.me) Actors.me.name = n.name;
    this.emit();
    return { ok: true, msg: `Callsign changed to ${n.name}` };
  },
  async setPin(oldPin, pin, pin2) {
    if (!this.cur) return { ok: false, msg: 'Sign in first' };
    if (this.cur.pin && !(await this.verify(this.cur, oldPin))) return { ok: false, msg: 'The current PIN is wrong' };
    const p = this.checkPin(pin, pin2);
    if (!p.ok) return p;
    if (!p.pin) { this.cur.pin = null; this.saveIndex(); this.emit(); return { ok: true, msg: 'PIN removed: anyone on this device can sign in to this account' }; }
    const salt = randomId(8);
    this.cur.pin = { salt, hash: await pinHash(salt, p.pin) };
    this.saveIndex(); this.emit();
    return { ok: true, msg: 'PIN saved' };
  },
  async remove(a, pin) {
    a = this.list.find((x) => x.id === a.id) || a;
    if (a.pin && !(await this.verify(a, pin))) return { ok: false, msg: 'The PIN is wrong' };
    this.store.del(PROFILE_PREFIX + a.id); this.store.del(PENDING_PREFIX + a.id);
    this.list = this.list.filter((x) => x !== a);
    if (this.remembered === a) this.remembered = null;
    if (this.cur === a) { this.cur = null; Profile.v = Profile.blank(); if (typeof Actors !== 'undefined' && Actors.me) Actors.me.name = 'You'; }
    this.saveIndex(); this.emit(); Profile.emit();
    return { ok: true, msg: `${a.name} was deleted from this device` };
  },

  // ---- saving on exit ----
  // What leaving the match right now would record; refreshed every round and when the tab is hidden,
  // so the match still counts if the page is closed or killed before it can save.
  checkpoint(rec) { if (this.cur && rec) this.store.set(PENDING_PREFIX + this.cur.id, JSON.stringify(rec)); },
  clearCheckpoint() { if (this.cur) this.store.del(PENDING_PREFIX + this.cur.id); },
  applyPending() {
    if (!this.cur) return null;
    const rec = this.readJSON(PENDING_PREFIX + this.cur.id);
    this.store.del(PENDING_PREFIX + this.cur.id);
    if (!rec || !rec.cfg || !rec.st || typeof rec.matchId !== 'string' || rec.matchId === Profile.v.lastMatchId) return null;
    const res = Profile.applyMatch(rec.cfg, rec.st, rec.outcome || 'left', rec.matchId);
    this.notice = { res, at: rec.at || Date.now() };
    return res;
  },
};
