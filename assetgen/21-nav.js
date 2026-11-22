// Waypoint graph generated from the level (assetgen fork: the grid step comes from the map's
// env.navStep, 40 by default): one node per grid column on every walkable
// brush top where a standing hull fits, linked when the floor between them can be walked
// (steps <= 18), hopped (<= 50, jump links) or dropped from (one-way). A* + string pulling.

let NAV_STEP = 40;

const Nav = {
  nodes: [], cells: new Map(), tr: makeTrace(), L: null, ms: 0,

  key(cx, cz) { return cx * 4096 + cz; },

  build(L) {
    const t0 = performance.now(), cw = L.cw, tr = this.tr;
    NAV_STEP = (L.env && L.env.navStep) || 40;
    this.L = L; this.nodes = []; this.cells = new Map();
    // doors count as open: bots push them open when they bump into one
    const doorState = cw.dynamic.map((b) => b.active);
    for (const b of cw.dynamic) b.active = false;
    // walkable brush tops
    const tops = [];
    for (const b of cw.brushes) {
      if (!(b.contents & CONTENTS.SOLID)) continue;
      for (let i = 0; i < b.faceCount; i++) {
        const o = i * 4, ny = b.P[o + 1], poly = b.polys[i];
        if (ny < 0.7 || !poly) continue;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const v of poly) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); z0 = Math.min(z0, v[2]); z1 = Math.max(z1, v[2]); }
        tops.push({ P: b.P, o, poly, x0, x1, z0, z1 });
      }
    }
    const lo = L.bounds.lo, hi = L.bounds.hi;
    const inPoly = (poly, x, z) => {
      let sign = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], c = poly[(i + 1) % poly.length];
        const cr = (c[0] - a[0]) * (z - a[2]) - (c[2] - a[2]) * (x - a[0]);
        if (Math.abs(cr) < 1e-9) continue;
        const s = cr > 0 ? 1 : -1;
        if (sign === 0) sign = s; else if (s !== sign) return false;
      }
      return true;
    };
    for (let cx = Math.ceil(lo[0] / NAV_STEP); cx * NAV_STEP <= hi[0]; cx++) {
      for (let cz = Math.ceil(lo[2] / NAV_STEP); cz * NAV_STEP <= hi[2]; cz++) {
        const x = cx * NAV_STEP, z = cz * NAV_STEP, ys = [];
        for (const t of tops) {
          if (x < t.x0 || x > t.x1 || z < t.z0 || z > t.z1 || !inPoly(t.poly, x, z)) continue;
          const ty = (t.P[t.o + 3] - t.P[t.o] * x - t.P[t.o + 2] * z) / t.P[t.o + 1];
          // drop a hull from one step above: on stairs and ramps it rests on the highest surface under it
          cw.trace(tr, x, ty + 19 + 36, z, x, ty - 2 + 36, z, 15, 36, 15, MASK_PLAYER);
          if (tr.startsolid || tr.fraction >= 1) continue;
          const y = tr.ey - 36;
          if (ys.some((q) => Math.abs(q - y) < 4)) continue;
          ys.push(y);
          const id = this.nodes.length;
          this.nodes.push({ id, x, y, z, cx, cz, links: [] });
          const k = this.key(cx, cz);
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k).push(id);
        }
      }
    }
    // links
    for (const a of this.nodes) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const ids = this.cells.get(this.key(a.cx + dx, a.cz + dz));
        if (!ids) continue;
        for (const bid of ids) {
          const b = this.nodes[bid];
          if (b.y - a.y > 52 || a.y - b.y > 210) continue;
          const w = this.walk(a.x, a.y, a.z, b.x, b.y, b.z);
          if (w) a.links.push({ to: bid, cost: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * (w.jump ? 1.6 : 1) + (w.drop ? 20 : 0), jump: w.jump });
        }
      }
    }
    this.prune();
    cw.dynamic.forEach((b, i) => { b.active = doorState[i]; });
    this.ms = Math.round(performance.now() - t0);
    return this;
  },

  // Can a player get from a to b in a straight line? -> { jump, drop } or null
  walk(ax, ay, az, bx, by, bz) {
    const cw = this.L.cw, tr = this.tr, dist = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(dist / 10));
    let prev = ay, jump = false, drop = false;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const top = Math.max(prev, by);
      cw.trace(tr, x, top + 52 + 36, z, x, Math.min(prev, by) - 220 + 36, z, 14, 36, 14, MASK_PLAYER);
      if (tr.startsolid) {
        cw.trace(tr, x, top + 20 + 36, z, x, Math.min(prev, by) - 220 + 36, z, 14, 36, 14, MASK_PLAYER);
        if (tr.startsolid) return null;
      }
      if (tr.fraction >= 1 || tr.ny < 0.7) return null;
      const g = tr.ey - 36, dy = g - prev;
      if (dy > 50) return null;
      if (dy > 18) jump = true;
      if (dy < -18) drop = true;
      prev = g;
    }
    return Math.abs(prev - by) < 10 ? { jump, drop } : null;
  },

  // Keep the largest strongly connected group: from every node left a bot can walk to every other,
  // so isolated ledges (wall caps, roofs) and one-way perches (container tops you can only drop
  // from) drop out. Kosaraju: finish order on the links, then groups on the reversed links.
  prune() {
    const N = this.nodes.length, rev = this.nodes.map(() => []);
    for (const a of this.nodes) for (const l of a.links) rev[l.to].push(a.id);
    const seen = new Uint8Array(N), order = [];
    for (let s = 0; s < N; s++) {
      if (seen[s]) continue;
      const st = [[s, 0]]; seen[s] = 1;
      while (st.length) {
        const top = st[st.length - 1], links = this.nodes[top[0]].links;
        if (top[1] < links.length) { const v = links[top[1]++].to; if (!seen[v]) { seen[v] = 1; st.push([v, 0]); } }
        else { order.push(top[0]); st.pop(); }
      }
    }
    const comp = new Int32Array(N).fill(-1);
    let best = -1, bestSize = 0;
    for (let k = N - 1, c = 0; k >= 0; k--) {
      const s = order[k];
      if (comp[s] >= 0) continue;
      const st = [s]; comp[s] = c; let size = 0;
      while (st.length) { const u = st.pop(); size++; for (const v of rev[u]) if (comp[v] < 0) { comp[v] = c; st.push(v); } }
      if (size > bestSize) { bestSize = size; best = c; }
      c++;
    }
    const remap = new Int32Array(N).fill(-1), keep = [];
    for (const a of this.nodes) if (comp[a.id] === best) { remap[a.id] = keep.length; keep.push(a); }
    for (const a of keep) { a.id = remap[a.id]; a.links = a.links.filter((l) => remap[l.to] >= 0).map((l) => Object.assign(l, { to: remap[l.to] })); }
    this.nodes = keep;
    this.cells = new Map();
    for (const a of keep) { const k = this.key(a.cx, a.cz); if (!this.cells.has(k)) this.cells.set(k, []); this.cells.get(k).push(a.id); }
  },

  // Nearest node a player at (x, y, z) can see and roughly stand level with.
  nearest(x, y, z) {
    const cx = Math.round(x / NAV_STEP), cz = Math.round(z / NAV_STEP), cand = [];
    for (let r = 0; r <= 3 && cand.length < 4; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const ids = this.cells.get(this.key(cx + i, cz + j));
        if (!ids) continue;
        for (const id of ids) {
          const n = this.nodes[id], dy = n.y - y;
          if (dy > 40 || dy < -80) continue;
          cand.push([Math.hypot(n.x - x, (n.y - y) * 2, n.z - z), id]);
        }
      }
    }
    cand.sort((p, q) => p[0] - q[0]);
    const cw = this.L.cw, tr = this.tr;
    for (const [, id] of cand) {
      const n = this.nodes[id];
      cw.trace(tr, x, y + 40, z, n.x, n.y + 40, n.z, 0, 0, 0, MASK_PLAYER);
      if (tr.fraction >= 1) return id;
    }
    return cand.length ? cand[0][1] : -1;
  },

  // A* over the graph -> [{x, y, z, jump}] (excluding the start node) or null.
  path(ax, ay, az, bx, by, bz) {
    const s = this.nearest(ax, ay, az), g = this.nearest(bx, by, bz);
    if (s < 0 || g < 0) return null;
    const N = this.nodes.length, gs = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), jumpIn = new Uint8Array(N), closed = new Uint8Array(N);
    const G = this.nodes[g], h = (n) => Math.hypot(n.x - G.x, n.y - G.y, n.z - G.z);
    const heap = [[h(this.nodes[s]), s]];
    gs[s] = 0;
    const push = (f, id) => { heap.push([f, id]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [, u] = pop();
      if (closed[u]) continue;
      if (u === g) break;
      closed[u] = 1;
      for (const l of this.nodes[u].links) {
        const ng = gs[u] + l.cost;
        if (ng < gs[l.to]) { gs[l.to] = ng; from[l.to] = u; jumpIn[l.to] = l.jump ? 1 : 0; push(ng + h(this.nodes[l.to]), l.to); }
      }
    }
    if (s !== g && from[g] < 0) return null;
    const out = [];
    for (let u = g; u !== s && u >= 0; u = from[u]) { const n = this.nodes[u]; out.push({ x: n.x, y: n.y, z: n.z, jump: !!jumpIn[u] }); }
    out.reverse();
    if (!out.length) out.push({ x: G.x, y: G.y, z: G.z, jump: false });
    return out;
  },

  randomNode(rnd) { return this.nodes[Math.floor(rnd() * this.nodes.length)]; },
};
