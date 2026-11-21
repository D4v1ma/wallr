// Radar and weapon icons.
// The radar overview is rasterised once at load from brush footprints (coloured by height; roofs and
// anything floating above head height are skipped so interiors show), then each frame a rotating
// circular window around you shows teammates, enemies your team can currently see, and the charge.
// Weapon icons are side-view silhouettes rasterised from the world models.

const Radar = {
  img: null, s: 0.125, zoom: 0.8, lo: [0, 0], spotted: new Map(), spotT: 0, tr: null, ctx: null, el: null, px: 168, dpr: 1, place: '',

  // One footprint per solid brush: its top face, classified by height (roofs and floaters skipped).
  footprint(polys, planes, o, bottom, top) {
    if (bottom >= 100 || o.radar === false) return null;
    let ti = -1, best = 0.3;
    for (let i = 0; i < planes.length; i++) if (polys[i] && planes[i][1] > best) { best = planes[i][1]; ti = i; }
    if (ti < 0) return null;
    const kind = o.radar === 'floor' ? 'raised' : top - bottom >= 120 && top >= 150 ? 'wall' : top <= -30 ? 'low' : top <= 20 ? 'ground' : 'raised';
    return { poly: polys[ti], top, kind };
  },
  paint(items, lo, hi, sites, s, labels) {
    const W = Math.max(8, Math.ceil((hi[0] - lo[0]) * s)), H = Math.max(8, Math.ceil((hi[2] - lo[2]) * s));
    const cv = makeCanvas(W, H), g = cv.getContext('2d');
    const order = { low: 0, ground: 1, raised: 2, wall: 3 }, fill = { low: '#4a4842', ground: '#6c685e', raised: '#918c7e', wall: '#1a1c1d' };
    items.sort((a, b) => order[a.kind] - order[b.kind] || a.top - b.top);
    for (const it of items) {
      g.beginPath();
      it.poly.forEach((v, i) => { const x = (v[0] - lo[0]) * s, y = (v[2] - lo[2]) * s; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath(); g.fillStyle = fill[it.kind]; g.fill();
      if (it.kind === 'raised') { g.strokeStyle = 'rgba(16, 16, 16, 0.55)'; g.lineWidth = 1; g.stroke(); }
    }
    for (const st of sites || []) {
      g.fillStyle = 'rgba(240, 165, 58, 0.16)';
      g.fillRect((st.min[0] - lo[0]) * s, (st.min[2] - lo[2]) * s, (st.max[0] - st.min[0]) * s, (st.max[2] - st.min[2]) * s);
      if (labels) {
        g.fillStyle = 'rgba(240, 165, 58, 0.95)'; g.font = `700 ${Math.round(labels)}px ${STENCIL_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(st.name, (st.center[0] - lo[0]) * s, (st.center[2] - lo[2]) * s);
      }
    }
    return cv;
  },
  build(L) {
    const lo = L.bounds.lo, hi = L.bounds.hi, items = [];
    this.lo = [lo[0], lo[2]];
    for (const b of L.cw.brushes) {
      if (!(b.contents & CONTENTS.SOLID)) continue;
      const planes = []; for (let i = 0; i < b.faceCount; i++) planes.push([b.P[i * 4], b.P[i * 4 + 1], b.P[i * 4 + 2]]);
      const it = this.footprint(b.polys, planes, (b.mb && b.mb.o) || {}, b.min[1], b.max[1]);
      if (it) items.push(it);
    }
    this.img = this.paint(items, lo, hi, L.sites, this.s); this.tr = makeTrace(); this.spotted.clear();
  },
  // Overview of a map that isn't loaded (Create Game cards): straight from the map builder.
  thumbs: {}, thumbURLs: {},
  thumbURL(key) { return this.thumbURLs[key] || (this.thumbURLs[key] = this.thumb(key).toDataURL()); },
  thumb(key) {
    if (this.thumbs[key]) return this.thumbs[key];
    const def = MAPS[key], mb = def.build(), items = [], lo = [Infinity, 0, Infinity], hi = [-Infinity, 0, -Infinity];
    for (const b of mb.brushes) {
      const o = b.o || {};
      if (o.nocollide || o.entity || o.clip) continue;
      const planes = b.faces.map((f) => f.plane), polys = brushPolygons(planes);
      let y0 = Infinity, y1 = -Infinity;
      for (const p of polys) if (p) for (const v of p) { if (v[1] < y0) y0 = v[1]; if (v[1] > y1) y1 = v[1]; lo[0] = Math.min(lo[0], v[0]); lo[2] = Math.min(lo[2], v[2]); hi[0] = Math.max(hi[0], v[0]); hi[2] = Math.max(hi[2], v[2]); }
      const it = this.footprint(polys, planes, o, y0, y1);
      if (it) items.push(it);
    }
    const s = 220 / Math.max(hi[0] - lo[0], hi[2] - lo[2]);
    return (this.thumbs[key] = this.paint(items, lo, hi, mb.sites, s, 18));
  },

  attach(canvas) {
    this.el = canvas; this.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(this.px * this.dpr);
    this.ctx = canvas.getContext('2d');
  },

  areaAt(x, z) {
    for (const a of Game.L.areas || []) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return a.name;
    return '';
  },

  // Enemies count as spotted while you (in your view cone) or a teammate's bot can see them.
  updateSpotted(me, dt) {
    for (const [a, t] of this.spotted) { if (!a.alive || t - dt <= 0) this.spotted.delete(a); else this.spotted.set(a, t - dt); }
    if ((this.spotT -= dt) > 0) return;
    this.spotT = 0.15;
    const eye = tickEye(me.player), f = viewDir(me.player);
    for (const e of Actors.list) {
      if (!e.alive || e.team === me.team) continue;
      let seen = Actors.list.some((t) => t.alive && t.team === me.team && t.brain && t.brain.target === e && t.brain.visible);
      if (!seen && me.alive) {
        const p = e.player.pos, c = [p[0], p[1] + 46, p[2]], dx = c[0] - eye[0], dy = c[1] - eye[1], dz = c[2] - eye[2], d = Math.hypot(dx, dy, dz) || 1;
        if ((dx * f[0] + dy * f[1] + dz * f[2]) / d > 0.62) {
          Game.L.cw.trace(this.tr, eye[0], eye[1], eye[2], c[0], c[1], c[2], 0, 0, 0, MASK_SHOT);
          seen = this.tr.fraction >= 1 && !Grenades.blocks(eye, c);
        }
      }
      if (seen) this.spotted.set(e, 1.0);
    }
  },

  draw(me, view, yaw, dt) {
    const c = this.ctx;
    if (!c || !this.img) return;
    this.updateSpotted(me, dt);
    const S = this.el.width, R = S / 2, k = this.zoom * this.dpr, s = this.s, cs = Math.cos(yaw), sn = Math.sin(yaw);
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(R, R, R - 1, 0, TAU); c.clip();
    c.fillStyle = 'rgba(10, 12, 11, 0.78)'; c.fillRect(0, 0, S, S);
    c.translate(R, R); c.rotate(yaw); c.scale(k, k);
    c.globalAlpha = 0.92; c.drawImage(this.img, -(view[0] - this.lo[0]) * s, -(view[2] - this.lo[1]) * s); c.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, R, R);
    // map position -> radar screen (rotated so you face up), clamped to the rim when far away
    const at = (x, z, clampIt) => {
      const dx = (x - view[0]) * s * k, dz = (z - view[2]) * s * k;
      let X = dx * cs - dz * sn, Y = dx * sn + dz * cs;
      const d = Math.hypot(X, Y), lim = R - 7 * this.dpr;
      if (clampIt && d > lim) { X *= lim / d; Y *= lim / d; }
      return [X, Y, d <= lim];
    };
    const u = this.dpr;
    c.font = `600 ${Math.round(14 * u)}px ${getComputedStyle(document.body).fontFamily}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const st of Game.L.sites || []) {
      const [X, Y] = at(st.center[0], st.center[2], true);
      c.fillStyle = 'rgba(240, 165, 58, 0.92)'; c.fillText(st.name, X, Y);
    }
    // the charge
    const bomb = Bomb.where();
    if (bomb && Match.active) {
      const vis = Bomb.state === 'planted' || (me.team === TEAM.RAIDERS && Bomb.state === 'dropped');
      if (vis && (Bomb.state !== 'planted' || Math.floor(Game.time * 3) % 2 === 0)) {
        const [X, Y] = at(bomb[0], bomb[2], true);
        c.fillStyle = Bomb.state === 'planted' ? '#ff4a32' : '#f0a53a'; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = u;
        c.fillRect(X - 4 * u, Y - 3 * u, 8 * u, 6 * u); c.strokeRect(X - 4 * u, Y - 3 * u, 8 * u, 6 * u);
      }
    }
    // players
    for (const a of Actors.list) {
      if (a === me || !a.alive) continue;
      const mate = a.team === me.team;
      if (!mate && !this.spotted.has(a)) continue;
      const p = a.player.pos, [X, Y] = at(p[0], p[2], mate);
      if (!mate && Math.hypot(X, Y) > R - 7 * u) continue;
      const col = mate ? (a.team === TEAM.RAIDERS ? '#eba264' : '#86bcef') : '#ff3b2f';
      if (mate) {
        const h = a.player.yaw - yaw, hx = -Math.sin(h), hy = -Math.cos(h);
        c.strokeStyle = col; c.lineWidth = 1.6 * u; c.beginPath(); c.moveTo(X, Y); c.lineTo(X + hx * 7 * u, Y + hy * 7 * u); c.stroke();
      }
      c.beginPath(); c.arc(X, Y, 3.6 * u, 0, TAU); c.fillStyle = col; c.fill();
      c.lineWidth = u; c.strokeStyle = 'rgba(0, 0, 0, 0.85)'; c.stroke();
      if (mate && Bomb.carrier === a) { c.beginPath(); c.arc(X, Y, 6.2 * u, 0, TAU); c.strokeStyle = '#f0a53a'; c.lineWidth = 1.4 * u; c.stroke(); }
    }
    // you: an arrow pointing up
    if (me.alive) {
      c.beginPath(); c.moveTo(0, -7 * u); c.lineTo(5 * u, 5 * u); c.lineTo(0, 2.5 * u); c.lineTo(-5 * u, 5 * u); c.closePath();
      c.fillStyle = '#f3ecd6'; c.fill(); c.strokeStyle = 'rgba(0, 0, 0, 0.9)'; c.lineWidth = u; c.stroke();
    }
    c.restore();
    c.beginPath(); c.arc(R, R, R - 1, 0, TAU); c.strokeStyle = 'rgba(243, 236, 214, 0.35)'; c.lineWidth = 1.5 * u; c.stroke();
  },
};

// Side-view silhouettes of the world models (muzzle to the right), as data URLs.
const WeaponIcons = {
  url: {},
  build() {
    for (const id of Object.keys(WEAPONS)) this.url[id] = this.draw(id);
    this.url.blast = this.url.charge;
  },
  draw(id) {
    const geo = (PlayerModel.wgeo && PlayerModel.wgeo[id]) ? PlayerModel.wgeo[id].geo : chWeaponGeo(id).geo;
    const P = geo.attributes.position.array, W = 96, H = 32, pad = 2;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < P.length; i += 3) { const u = -P[i + 2], v = P[i + 1]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const k = Math.min((W - pad * 2) / (u1 - u0 || 1), (H - pad * 2) / (v1 - v0 || 1));
    const ox = (W - (u1 - u0) * k) / 2, oy = (H - (v1 - v0) * k) / 2;
    const cv = makeCanvas(W, H), g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 0.6; g.lineJoin = 'round';
    for (let i = 0; i < P.length; i += 9) {
      g.beginPath();
      for (let j = 0; j < 3; j++) {
        const x = ox + (-P[i + j * 3 + 2] - u0) * k, y = H - oy - (P[i + j * 3 + 1] - v0) * k;
        if (j) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath(); g.fill(); g.stroke();
    }
    return cv.toDataURL();
  },
  img(id, cls = 'wi') { const u = this.url[id]; return u ? `<img class="${cls}" src="${u}" alt="">` : ''; },
};
