// Team play for bots in defuse mode: buying by economy, a Raider plan per round (target site,
// route, the carrier plants while the rest escort), Wardens split between the sites, then
// retake and defuse after a plant. Orders are re-evaluated twice a second.

// Per-map data (L.tactics): routes { name: { stack, yaw, via } } where Raiders gather out of sight
// and then pass through `via`; siteRoutes { A: [main, flank] }; sites { A: { hold, plant, smoke } }
// with hold spots as [x, y, z, yawDeg] facing the Raider approach.
const PUSH_BY = 22;          // seconds into the round when the Raiders go even if not everyone has gathered

const Tactics = {
  rnd: mulberry32(2718), plan: null, assignT: 0,

  onRoundStart() {
    const sites = Bomb.sites();
    const site = sites.length ? sites[Math.floor(this.rnd() * sites.length)] : null;
    const T = Game.L.tactics, routes = (T && site && T.siteRoutes[site.name]) || [];
    this.plan = { site, route: routes[0], flank: routes[1] || routes[0], go: false };
    let i = 0;
    for (const a of Actors.list) {
      if (!a.brain) continue;
      a.brain.order = null; a.brain.buyAt = 0.6 + this.rnd() * 2.6; a.brain.bought = false;
      a.brain.post = a.team === TEAM.WARDENS ? (i++ % 2) : 0;     // wardens alternate A / B
    }
    this.assignT = 0;
  },

  onPlant() { this.assignT = 0; },

  tick(dt) {
    if (!Match.active) return;
    for (const a of Actors.list) {
      const b = a.brain;
      if (!b || !a.alive || b.bought || !Match.buyTime()) continue;
      b.buyAt -= dt;
      if (b.buyAt <= 0) { this.buy(a); b.bought = true; }
    }
    if ((this.assignT -= dt) <= 0) { this.assignT = 0.5; this.assign(); }
  },

  // Economy: pistol rounds buy armor or a smoke; otherwise full buy, force buy, or save.
  buy(a) {
    const r = this.rnd, pistolRound = Match.round === 1 || Match.round === Match.len.half + 1;
    const get = (id) => Match.buy(a, id).ok;
    if (pistolRound) {
      if (a.money >= 650 && r() < 0.6) get('vest'); else if (a.money >= 300 && r() < 0.5) get('smoke');
      return;
    }
    if (!a.loadout.primary()) {
      const mates = Actors.list.filter((o) => o.team === a.team && o !== a);
      const sniperTaken = mates.some((o) => o.loadout.byId('sniper'));
      const lossStreak = Match.streak[a.squad];
      if (a.money >= 6200 && !sniperTaken && r() < 0.3) get('sniper');
      else if (a.money >= 3350) get('rifle');
      else if (a.money >= 1900 && (lossStreak >= 2 || r() < 0.3)) get(r() < 0.55 ? 'smg' : 'shotgun');
    }
    if (a.money >= 1000 && !(a.armor >= 100 && a.helmet)) get('vesthelm');
    else if (a.money >= 650 && a.armor < 100) get('vest');
    if (a.team === TEAM.WARDENS && a.money >= 400 && !a.kit && r() < 0.7) get('kit');
    if (a.money >= 300 && r() < 0.45) get('smoke');
  },

  spot(list, k) { const s = list[k % list.length]; return { pos: [s[0], s[1], s[2]], yaw: s[3] !== undefined ? s[3] * DEG : null }; },

  assign() {
    const plan = this.plan;
    const T = Game.L.tactics;
    if (!plan || !plan.site || !T) return;
    const SPOTS = T.sites, R = T.routes;
    const st = Bomb.state, bpos = Bomb.where();
    const raiders = Actors.list.filter((a) => a.alive && a.team === TEAM.RAIDERS && a.brain);
    const wardens = Actors.list.filter((a) => a.alive && a.team === TEAM.WARDENS && a.brain);
    // closest raider bot fetches a dropped charge
    let fetcher = null;
    if (st === 'dropped' && bpos) {
      let best = Infinity;
      for (const a of raiders) { const d = Math.hypot(a.player.pos[0] - bpos[0], a.player.pos[2] - bpos[2]); if (d < best) { best = d; fetcher = a; } }
    }
    // gather inside the hall, then go together (with smoke cover when someone carries one)
    const routeOf = (i) => (i % 3 === 2 ? plan.flank : plan.route);   // one in three flanks
    if (!plan.go && st !== 'planted') {
      const gathered = raiders.filter((a, i) => Math.hypot(a.player.pos[0] - R[routeOf(i)].stack[0], a.player.pos[2] - R[routeOf(i)].stack[2]) < 260).length;
      if (gathered >= Math.ceil(raiders.length * 0.6) || Match.liveT > PUSH_BY || st === 'dropped') {
        plan.go = true;
        let k = 0;
        for (const a of raiders) if (a.loadout.byId('smoke')) a.brain.smokeAt = SPOTS[plan.site.name].smoke[k++ % 2].slice();
      }
    }
    raiders.forEach((a, i) => {
      const b = a.brain, spots = SPOTS[plan.site.name];
      if (!plan.go && st !== 'planted') {
        const rt = R[routeOf(i)];
        b.setOrder({ kind: 'stack', pos: rt.stack.slice(), yaw: rt.yaw, spread: 28 });
      } else if (st === 'planted') {
        const ang = (i / Math.max(1, raiders.length)) * TAU + 0.7, r = 220 + (i % 2) * 120;
        b.setOrder({ kind: 'guard', pos: [Bomb.pos[0] + Math.cos(ang) * r, Bomb.pos[1], Bomb.pos[2] + Math.sin(ang) * r], face: Bomb.pos });
      } else if (Bomb.carrier === a) {
        b.setOrder({ kind: 'plant', pos: this.spot(spots.plant, i).pos, via: R[routeOf(i)].via, site: plan.site });
      } else if (a === fetcher) {
        b.setOrder({ kind: 'pickup', pos: bpos.slice() });
      } else {
        b.setOrder({ kind: 'goto', pos: this.spot(spots.plant, i + 1).pos, via: R[routeOf(i)].via, spread: 90 });
      }
    });
    if (st === 'planted') {
      let defuser = null, best = Infinity;
      for (const a of wardens) { const d = Math.hypot(a.player.pos[0] - Bomb.pos[0], a.player.pos[2] - Bomb.pos[2]); if (d < best) { best = d; defuser = a; } }
      wardens.forEach((a, i) => {
        if (a === defuser) a.brain.setOrder({ kind: 'defuse', pos: Bomb.pos.slice() });
        else { const ang = i * 2.1; a.brain.setOrder({ kind: 'goto', pos: [Bomb.pos[0] + Math.cos(ang) * 160, Bomb.pos[1], Bomb.pos[2] + Math.sin(ang) * 160], spread: 60 }); }
      });
    } else {
      wardens.forEach((a, i) => {
        const site = Bomb.sites()[a.brain.post % Bomb.sites().length], s = this.spot(SPOTS[site.name].hold, i);
        a.brain.setOrder({ kind: 'hold', pos: s.pos, yaw: s.yaw });
      });
    }
  },
};
