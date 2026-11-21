// Defuse mode: rounds, money and buying. Raiders attack with the charge, Wardens defend A and B.
// Squads keep their score when everyone swaps sides at halftime. Skirmish mode = Stage 3 respawns.

const MATCH = {
  freeze: 10, round: 115, post: 5, halftime: 8, over: 25, buyWindow: 20, buyRadius: 520, start: 800, max: 16000,
  win: { elim: 3250, bomb: 3500, defuse: 3500, time: 3250 }, loss: [1400, 1900, 2400, 2900, 3400],
  plantBonus: 800, plantReward: 300, defuseReward: 300, teamKill: -300,
};
const MATCH_LEN = { standard: { win: 16, half: 15, max: 30 }, short: { win: 9, half: 8, max: 16 } };
const END_TEXT = {
  elim: (w) => `all ${TEAMS[1 - w].name} down`, bomb: () => 'the charge detonated', defuse: () => 'the charge was defused', time: () => 'time ran out',
};

// Buy menu: one key per item, CS 1.6 style.
const SHOP = [
  { key: 1, id: 'pistol', name: 'Wasp 9', price: 200, kind: 'weapon', group: 'Pistol' },
  { key: 2, id: 'smg', name: 'Swift SMG', price: 1250, kind: 'weapon', group: 'Close range' },
  { key: 3, id: 'shotgun', name: 'Bison 12', price: 1100, kind: 'weapon', group: 'Close range' },
  { key: 4, id: 'rifle', name: 'Kestrel AR', price: 2700, kind: 'weapon', group: 'Rifles' },
  { key: 5, id: 'sniper', name: 'Osprey LR', price: 4750, kind: 'weapon', group: 'Rifles' },
  { key: 6, id: 'vest', name: 'Vest', price: 650, kind: 'gear', group: 'Gear' },
  { key: 7, id: 'vesthelm', name: 'Vest + helmet', price: 1000, kind: 'gear', group: 'Gear' },
  { key: 8, id: 'smoke', name: 'Veil smoke', price: 300, kind: 'weapon', group: 'Gear' },
  { key: 9, id: 'kit', name: 'Defuse kit', price: 400, kind: 'gear', group: 'Gear', team: 1 },
];

const Match = {
  active: false, phase: 'idle', t: 0, liveT: 0, round: 0, score: [0, 0], streak: [0, 0], half: 1, len: MATCH_LEN.standard,
  history: [], planted: false, halftimeNext: false, result: null, banner: null, draw: false,

  // squad 0 started the match on the Wardens (your side by default), squad 1 on the Raiders
  squadOnSide(side) { const me = Actors.me; return me ? (side === me.team ? me.squad : 1 - me.squad) : side; },
  sideScore(side) { return this.score[this.squadOnSide(side)]; },

  setMode(mode) {
    if (mode === 'defuse') this.startMatch();
    else {
      this.active = false; this.phase = 'idle'; this.banner = null;
      Items.clear(); Bomb.reset(); Grenades.clear();
      for (const a of Actors.list) {
        a.loadout.restock = true;
        a.loadout.setKit(a.isMe ? ['rifle', 'pistol', 'knife', 'smoke'] : BOT_KIT);
        a.spawn();
      }
    }
  },

  startMatch() {
    this.active = true; this.len = MATCH_LEN[Settings.v.matchLen] || MATCH_LEN.standard;
    this.score = [0, 0]; this.streak = [0, 0]; this.history = []; this.round = 1; this.half = 1; this.halftimeNext = false; this.draw = false;
    Actors.feed = []; Actors.score = [0, 0];
    for (const a of Actors.list) {
      a.squad = a.team === Actors.me.team ? 0 : 1;
      a.money = MATCH.start; a.kills = 0; a.deaths = 0; a.kit = false;
      a.alive = false;                       // everyone starts the first round fresh
    }
    if (Actors.me) Actors.me.squad = 0;
    this.startRound();
  },

  // New round: survivors keep their gear, the dead start again with a pistol and knife.
  startRound() {
    Items.clear(); Bomb.reset(); Grenades.clear();
    for (const d of Ents.doors) if (d.isOpen && d.isOpen()) d.toggle(null);
    for (const a of Actors.list) {
      const lo = a.loadout;
      lo.restock = false;
      if (a.alive) {
        lo.refill(false);
        const charge = lo.byId('charge'); if (charge) lo.remove(charge, false);
      } else {
        lo.setKit(['pistol', 'knife']);
        a.armor = 0; a.helmet = false; a.kit = false;
      }
      const sp = Actors.spawnPoint(a);
      a.player.spawn(sp.pos, sp.yaw);
      a.health = 100; a.alive = true; a.deadT = 0; a.killer = null; a.hurtT = 0; a.model.dead = 0;
      if (lo.active.state === 'holstered') lo.active.draw();
      lo.select(lo.best());
      if (a.brain) a.brain.reset();
    }
    const raiders = Actors.list.filter((a) => a.team === TEAM.RAIDERS);
    if (raiders.length) Bomb.assign(raiders[Math.floor(Math.random() * raiders.length)]);
    this.planted = false; this.result = null;
    this.phase = 'freeze'; this.t = MATCH.freeze; this.liveT = 0;
    this.banner = { title: `Round ${this.round}`, sub: this.round === 1 ? (this.half === 1 ? 'First half' : 'Second half') : this.round === this.len.half + 1 ? 'Second half · sides swapped' : 'Buy time — B to open the buy menu', t: 3.2, kind: 'round' };
    if (typeof Tactics !== 'undefined') Tactics.onRoundStart();
  },

  frozen() { return this.active && this.phase === 'freeze'; },
  buyTime() { return this.active && (this.phase === 'freeze' || (this.phase === 'live' && this.liveT < MATCH.buyWindow)); },
  buyTimeLeft() { return this.phase === 'freeze' ? this.t + MATCH.buyWindow : Math.max(0, MATCH.buyWindow - this.liveT); },
  inBuyZone(a) {
    const list = (Game.L.teamSpawns && Game.L.teamSpawns[a.team]) || [];
    const p = a.player.pos;
    return list.some((s) => Math.hypot(s.pos[0] - p[0], s.pos[2] - p[2]) < MATCH.buyRadius);
  },
  canBuy(a) { return !this.active ? false : a.alive && this.buyTime() && this.inBuyZone(a); },

  // Price for this actor right now, or a reason it can't be bought.
  quote(a, e) {
    if (e.team !== undefined && a.team !== e.team) return { no: 'Wardens only' };
    if (e.id === 'vest' && a.armor >= 100) return { no: 'Already have one' };
    if (e.id === 'vesthelm') {
      if (a.armor >= 100 && a.helmet) return { no: 'Already have both' };
      if (a.armor >= 100) return { price: 350, note: 'helmet' };
    }
    if (e.id === 'kit' && a.kit) return { no: 'Already have one' };
    if (e.kind === 'weapon') {
      const has = a.loadout.byId(e.id);
      if (has && (e.id !== 'smoke' || has.count > 0)) return { no: 'Already have one' };
    }
    return { price: e.price };
  },

  buy(a, id) {
    const e = SHOP.find((x) => x.id === id);
    if (!e) return { ok: false, msg: 'Unknown item' };
    if (!this.canBuy(a)) return { ok: false, msg: !this.buyTime() ? 'Buy time is over' : 'Too far from your buy zone' };
    const q = this.quote(a, e);
    if (q.no) return { ok: false, msg: q.no };
    if (a.money < q.price) return { ok: false, msg: 'Not enough money' };
    a.money -= q.price;
    if (e.kind === 'weapon') {
      const old = a.loadout.give(e.id, true);
      if (old) Items.drop(a, old, false);
    } else if (e.id === 'vest') a.armor = 100;
    else if (e.id === 'vesthelm') { a.armor = 100; a.helmet = true; }
    else if (e.id === 'kit') a.kit = true;
    if (a.isMe) Snd.buy();
    return { ok: true, msg: `Bought ${e.name}` };
  },

  tick(dt) {
    if (!this.active) return;
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    if (this.phase !== 'planted') this.t -= dt;
    switch (this.phase) {
      case 'freeze':
        if (this.t <= 0) { this.phase = 'live'; this.t = MATCH.round; this.liveT = 0; Snd.roundGo(); this.banner = { title: 'Go', sub: Actors.me.team === TEAM.RAIDERS ? 'Plant the charge at A or B' : 'Defend A and B', t: 1.8, kind: 'go' }; }
        break;
      case 'live':
        this.liveT += dt;
        this.checkWin();
        if (this.phase === 'live' && this.t <= 0) this.endRound(TEAM.WARDENS, 'time');
        break;
      case 'planted':
        this.liveT += dt;
        this.checkWin();
        break;
      case 'post':
        if (this.t <= 0) this.nextRound();
        break;
      case 'over':
        if (this.t <= 0) this.startMatch();
        break;
    }
  },

  alive(side) { return Actors.list.filter((a) => a.team === side && a.alive).length; },
  total(side) { return Actors.list.filter((a) => a.team === side).length; },

  checkWin() {
    const R_ = TEAM.RAIDERS, W = TEAM.WARDENS;
    if (this.total(W) > 0 && this.alive(W) === 0) this.endRound(R_, 'elim');
    else if (this.phase === 'live' && this.total(R_) > 0 && this.alive(R_) === 0) this.endRound(W, 'elim');
  },

  onPlant(actor, site) {
    if (!this.active || this.phase !== 'live') return;
    this.planted = true; this.phase = 'planted';
    actor.money = Math.min(MATCH.max, actor.money + MATCH.plantReward);
    this.banner = { title: `Charge planted at ${site.name}`, sub: Actors.me.team === TEAM.WARDENS ? 'Get there and defuse it (hold E)' : 'Guard it until it blows', t: 3, kind: 'plant' };
    if (typeof Tactics !== 'undefined') Tactics.onPlant(site);
  },
  onDefuse(a) {
    if (!this.active) return;
    a.money = Math.min(MATCH.max, a.money + MATCH.defuseReward);
    this.endRound(TEAM.WARDENS, 'defuse');
  },
  onExplode() { if (this.active && this.phase !== 'post') this.endRound(TEAM.RAIDERS, 'bomb'); },

  // Called from Actor.die: drops, kill rewards.
  onDeath(victim, attacker, def) {
    if (!this.active) return;
    const lo = victim.loadout, gun = lo.primary() || lo.bySlot(2), ch = lo.byId('charge');
    if (gun) Items.drop(victim, gun, false);
    if (ch) Items.drop(victim, ch, false);
    victim.kit = false;
    if (attacker && attacker !== victim) {
      if (attacker.team !== victim.team) attacker.money = Math.min(MATCH.max, attacker.money + (def && def.killReward !== undefined ? def.killReward : 300));
      else attacker.money = Math.max(0, attacker.money + MATCH.teamKill);
    }
  },

  endRound(side, reason) {
    if (this.phase === 'post' || this.phase === 'over') return;
    const win = this.squadOnSide(side), lose = 1 - win;
    this.score[win]++;
    this.history.push({ round: this.round, side, squad: win, reason });
    for (const a of Actors.list) {
      let pay;
      if (a.team === side) pay = MATCH.win[reason];
      else {
        pay = MATCH.loss[Math.min(this.streak[lose], MATCH.loss.length - 1)];
        if (reason === 'time' && a.team === TEAM.RAIDERS && a.alive) pay = 0;     // hid instead of attacking
        if (a.team === TEAM.RAIDERS && this.planted) pay += MATCH.plantBonus;
      }
      a.money = Math.min(MATCH.max, a.money + pay);
    }
    this.streak[win] = 0; this.streak[lose]++;
    const mine = Actors.me && Actors.me.team === side;
    this.result = { side, reason, mine };
    this.banner = { title: `${TEAMS[side].name} win`, sub: END_TEXT[reason](side), t: MATCH.post, kind: mine ? 'win' : 'lose', side };
    Snd.roundEnd(mine);
    this.phase = 'post'; this.t = MATCH.post;
    if (this.score[win] >= this.len.win) {
      this.phase = 'over'; this.t = MATCH.over; this.draw = false;
      this.banner = { title: `${TEAMS[side].name} win the match`, sub: `${this.score[win]} – ${this.score[lose]}`, t: MATCH.over, kind: mine ? 'win' : 'lose', side, final: true };
    } else if (this.round >= this.len.max) {
      this.phase = 'over'; this.t = MATCH.over; this.draw = true;
      this.banner = { title: 'Draw', sub: `${this.score[0]} – ${this.score[1]}`, t: MATCH.over, kind: 'draw', final: true };
    } else if (this.round === this.len.half) {
      this.halftimeNext = true; this.t = MATCH.halftime;
      this.banner.sub += ' · Halftime: sides swap';
      this.banner.t = MATCH.halftime;
    }
  },

  nextRound() {
    this.round++;
    if (this.halftimeNext) {
      this.halftimeNext = false; this.half = 2; this.streak = [0, 0];
      for (const a of Actors.list) {
        Actors.setSide(a, 1 - a.team);
        a.money = MATCH.start; a.alive = false; a.kit = false;
      }
    }
    this.startRound();
  },
};
