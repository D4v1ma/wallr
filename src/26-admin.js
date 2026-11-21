// Admin mode, unlocked with a passcode in Settings. Only hashes of the passcode are in the code
// (tools/admin-hash.mjs makes new ones). An admin can fly (V: noclip), has unlimited wallbang
// rounds with no wait, unlimited money, and sees enemies through walls (and on the radar).
// Admin belongs to the account that entered the code (a guest keeps it for the session) and can be
// switched off or removed. Matches played with admin powers don't change XP, points, rank or history.
// This is a game setting, not security: everything runs in the browser.

const ADMIN_HASHES = ['s256:ac0db9cb7158353579373ff6cca2aa6aa4285ca3cbff519540ba730de0f43725', 'c53:2frhyg3pbmd'];

const Admin = {
  unlocked: false, on: false,

  // The signed-in account's admin state (none for a guest who hasn't entered the code).
  load() {
    const a = typeof Accounts !== 'undefined' ? Accounts.cur : null;
    this.unlocked = !!(a && a.admin);
    this.on = this.unlocked && !a.adminOff;
    this.apply();
  },
  async tryCode(code) {
    const c = String(code || '').trim().toLowerCase();
    if (!c) return { ok: false, msg: 'Enter the passcode' };
    const [s, f] = await Promise.all([pinHash('admin', c, 's256'), pinHash('admin', c, 'c53')]);
    if (!ADMIN_HASHES.includes(s) && !ADMIN_HASHES.includes(f)) return { ok: false, msg: 'Wrong passcode' };
    this.unlocked = true; this.on = true;
    this.save(); this.apply();
    const a = Accounts.cur;
    return { ok: true, msg: a ? `${a.name} is now an admin` : 'You are an admin for this session (guest)' };
  },
  set(on) { this.on = !!on && this.unlocked; this.save(); this.apply(); },
  remove() { this.unlocked = false; this.on = false; this.save(); this.apply(); },
  save() {
    const a = typeof Accounts !== 'undefined' ? Accounts.cur : null;
    if (!a) return;
    if (this.unlocked) a.admin = true; else delete a.admin;
    if (this.unlocked && !this.on) a.adminOff = true; else delete a.adminOff;
    Accounts.saveIndex();
  },
  // Powers follow the switch: noclip only while on, money topped up, the match marked as an admin match.
  apply() {
    const me = typeof Actors !== 'undefined' ? Actors.me : null;
    if (me) {
      me.admin = this.on;
      if (!this.on && me.player.noclip) { me.player.noclip = false; me.player.vel = [0, 0, 0]; }
      if (this.on && typeof Match !== 'undefined' && Match.active) me.money = MATCH.max;
      if (!this.on && me.wbCharges === undefined) me.wbCharges = WALLBANG.perRound;
    }
    if (this.on && typeof Session !== 'undefined' && Session.active && !Session.done) Session.adminUsed = true;
  },
};
