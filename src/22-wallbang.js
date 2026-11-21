// Wallbang rounds, the heart of wallr. Press X to load one: your next gun shot goes through every
// wall in its way, at full damage, and hits the first enemy along the line. Everyone gets a few per
// round; they unlock 10 s after the round goes live (10 s after spawning in skirmish), and the HUD
// shows how many are left. Bots use them too, but only where they last saw someone. Admins have no
// limit and no wait.

const WALLBANG = { perRound: 3, unlock: 10 };

const Wallbang = {
  reset(a) { a.wbCharges = WALLBANG.perRound; a.wbArmed = false; },
  charges(a) { return a.admin ? Infinity : a.wbCharges === undefined ? WALLBANG.perRound : a.wbCharges; },
  // Seconds until wallbang rounds unlock for this actor (0: now; Infinity: not until next round).
  unlockIn(a) {
    if (a.admin) return 0;
    if (typeof Match !== 'undefined' && Match.active) {
      if (Match.phase === 'freeze') return Match.t + WALLBANG.unlock;
      if (Match.phase === 'live' || Match.phase === 'planted') return Math.max(0, WALLBANG.unlock - Match.liveT);
      return Infinity;
    }
    return Math.max(0, WALLBANG.unlock - (a.aliveT || 0));
  },
  ready(a) { return !!a.alive && this.unlockIn(a) <= 0 && this.charges(a) > 0; },
  armed(a) { return !!a.wbArmed; },
  // X: load a wallbang round for the next shot, or take it out again. Returns what happened.
  toggle(a) {
    if (a.wbArmed) { a.wbArmed = false; return 'off'; }
    if (!a.alive) return 'dead';
    if (this.unlockIn(a) > 0) return 'locked';
    if (this.charges(a) <= 0) return 'empty';
    const w = a.loadout.active;
    if (!w || w.kind !== 'gun') return 'nogun';
    a.wbArmed = true;
    return 'armed';
  },
  // A gun fires: a loaded wallbang round is used up (one per trigger pull; every shotgun pellet pierces).
  take(a, w) {
    if (!a.wbArmed || !w || w.kind !== 'gun') return false;
    a.wbArmed = false;
    if (!a.admin) a.wbCharges = Math.max(0, this.charges(a) - 1);
    a.wbUsed = (a.wbUsed || 0) + 1;
    return true;
  },
};
