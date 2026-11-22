// Map kit for the large Godot maps: building blocks on top of MapBuilder's brushes. Buildings with
// door and window openings, upper floors and stairwells; stairs, catwalks with railings, ramps;
// containers, wagons on track, tanks, lorries; crates, barrels, pallets, sandbags, barriers,
// fences; lamps and signs. Units: 1 ~ an inch; doors 64 x 112, storeys 176, steps of 16 or less.

function mapKit(M) {
  const ND = { nocollide: true, noshadow: true };
  const K = { M, ND };
  const rnd = mulberry32(4242);
  K.r = () => rnd();

  // ---------------------------------------------------------------- basics
  K.slab = (x0, z0, x1, z1, tex, y = 0, t = 16, side = null, o = {}) => M.box(x0, y - t, z0, x1, y, z1, { top: tex, sides: side, bottom: null }, o);
  K.wall = (x0, z0, x1, z1, h, tex, y0 = 0, cap = 'concrete_plain', o = {}) => M.box(x0, y0, z0, x1, y0 + h, z1, { sides: tex, top: cap, bottom: null }, o);
  // a building nobody enters: textured sides, a roof seen from above
  K.block = (x0, z0, x1, z1, h, side, top = 'roof', y0 = 0, o = {}) => M.box(x0, y0, z0, x1, y0 + h, z1, { sides: side, top, bottom: null }, o);
  // invisible player clip (keeps people off roofs and inside the map)
  K.clip = (x0, y0, z0, x1, y1, z1) => M.box(x0, y0, z0, x1, y1, z1, null, { clip: true });

  // Ground: rectangles [x0, z0, x1, z1, tex, y = 0]. Later rectangles cut earlier ones out, so no
  // two floors overlap (no flicker), and a lower area gets walls from its neighbours' sides.
  K.ground = (rects, side = 'concrete', lm = 0) => {
    const minus = (a, b) => {
      if (b[0] >= a[2] || b[2] <= a[0] || b[1] >= a[3] || b[3] <= a[1]) return [a];
      const [x0, z0, x1, z1] = a, rest = a.slice(4), out = [];
      const ix0 = Math.max(x0, b[0]), ix1 = Math.min(x1, b[2]), iz0 = Math.max(z0, b[1]), iz1 = Math.min(z1, b[3]);
      if (z0 < iz0) out.push([x0, z0, x1, iz0, ...rest]);
      if (iz1 < z1) out.push([x0, iz1, x1, z1, ...rest]);
      if (x0 < ix0) out.push([x0, iz0, ix0, iz1, ...rest]);
      if (ix1 < x1) out.push([ix1, iz0, x1, iz1, ...rest]);
      return out;
    };
    let out = [];
    for (const r of rects) { const next = []; for (const q of out) next.push(...minus(q, r)); next.push(r); out = next; }
    for (const [x0, z0, x1, z1, tex, y = 0] of out) {
      if (x1 - x0 > 0.5 && z1 - z0 > 0.5) M.box(x0, y - 192, z0, x1, y, z1, { top: tex, sides: side, bottom: null }, lm ? { lm } : {});
    }
  };
  // Four-sided heap / mound (salt, clay, gravel), base half-width r, top half-width rt.
  K.heap = (x, z, r, h, tex = 'sand', rt = r * 0.3, y = 0) => {
    const planes = [], keys = [], L = Math.hypot(h, r - rt), a = h / L, b = (r - rt) / L;
    for (const [sx, sz, k] of [[1, 0, 'e'], [-1, 0, 'w'], [0, 1, 's'], [0, -1, 'n']]) {
      const nx = sx * a, nz = sz * a, px = x + sx * r, pz = z + sz * r;
      planes.push([nx, b, nz, nx * px + b * y + nz * pz]); keys.push(k);
    }
    planes.push([0, 1, 0, y + h]); keys.push('top');
    planes.push([0, -1, 0, -y]); keys.push('bottom');
    return M.addBrush(planes, keys, { sides: tex, top: tex, bottom: null });
  };

  // ---------------------------------------------------------------- walls with openings
  // A straight wall along X (axis 'x': from a0 to a1 at z = c .. c + t) or along Z, floor y0,
  // height h. holes: [{ a0, a1, y0, y1, door, frame }] along the wall / above its floor.
  K.run = (axis, a0, a1, c, t, y0, h, faces, holes = []) => {
    const seg = (s0, s1, yb, yt) => {
      if (s1 - s0 < 0.5 || yt - yb < 0.5) return;
      if (axis === 'x') M.box(s0, y0 + yb, c, s1, y0 + yt, c + t, faces);
      else M.box(c, y0 + yb, s0, c + t, y0 + yt, s1, faces);
    };
    let cur = a0;
    for (const o of holes.slice().sort((p, q) => p.a0 - q.a0)) {
      const b0 = Math.max(o.a0, a0), b1 = Math.min(o.a1, a1), hy0 = o.y0 || 0, hy1 = Math.min(o.y1, h);
      if (b1 <= b0) continue;
      seg(cur, b0, 0, h);
      seg(b0, b1, 0, hy0);
      seg(b0, b1, hy1, h);
      if (o.door) {
        const m = c + t / 2;
        if (axis === 'x') M.door(b0, y0 + hy0 + 1, m - 2, b1, y0 + hy1 - 1, m + 2, [b0, m], o.door);
        else M.door(m - 2, y0 + hy0 + 1, b0, m + 2, y0 + hy1 - 1, b1, [m, b0], o.door);
      }
      if (o.frame) {                                     // window sill and lintel trims
        if (axis === 'x') { M.box(b0 - 4, y0 + hy0 - 4, c - 3, b1 + 4, y0 + hy0, c + t + 3, 'concrete_plain', ND); M.box(b0 - 4, y0 + hy1, c - 2, b1 + 4, y0 + hy1 + 4, c + t + 2, 'concrete_plain', ND); }
        else { M.box(c - 3, y0 + hy0 - 4, b0 - 4, c + t + 3, y0 + hy0, b1 + 4, 'concrete_plain', ND); M.box(c - 2, y0 + hy1, b0 - 4, c + t + 2, y0 + hy1 + 4, b1 + 4, 'concrete_plain', ND); }
      }
      cur = b1;
    }
    seg(cur, a1, 0, h);
  };

  // ---------------------------------------------------------------- buildings
  // Hollow building on (x0, z0)-(x1, z1). o: { y, t, h (storey), floors, wall, inner, floor, roof,
  // ceiling, cap, parapet, doors: [{ side, at, w, h, level, door }], windows: [{ side, at, w, y0, y1,
  // level }], stairs: { x0, z0, x1, z1, up } (each upper floor), lamps: [[x, z], ...], lampCol }.
  // `at` is the absolute x (north/south walls) or z (east/west walls) of the opening's centre.
  K.building = (x0, z0, x1, z1, o = {}) => {
    const y = o.y ?? 0, t = o.t ?? 16, fh = o.h ?? 176, floors = o.floors ?? 1, H = fh * floors;
    const ext = o.wall ?? 'brick', inn = o.inner ?? 'plaster', cap = o.cap ?? 'concrete_plain';
    if (o.floor !== null) K.slab(x0, z0, x1, z1, o.floor ?? 'concrete_floor', y, 16);
    const holes = { n: [], s: [], e: [], w: [] };
    for (const d of o.doors || []) {
      const w = d.w ?? 64, lv = (d.level ?? 0) * fh;
      holes[d.side].push({ a0: d.at - w / 2, a1: d.at + w / 2, y0: lv, y1: lv + (d.h ?? 112), door: d.door });
    }
    for (const wd of o.windows || []) {
      const w = wd.w ?? 64, lv = (wd.level ?? 0) * fh;
      holes[wd.side].push({ a0: wd.at - w / 2, a1: wd.at + w / 2, y0: lv + (wd.y0 ?? 52), y1: lv + (wd.y1 ?? 116), frame: wd.frame !== false });
    }
    K.run('x', x0, x1, z0, t, y, H, { n: ext, s: inn, e: ext, w: ext, top: cap, bottom: null }, holes.n);
    K.run('x', x0, x1, z1 - t, t, y, H, { s: ext, n: inn, e: ext, w: ext, top: cap, bottom: null }, holes.s);
    K.run('z', z0 + t, z1 - t, x0, t, y, H, { w: ext, e: inn, n: inn, s: inn, top: cap, bottom: null }, holes.w);
    K.run('z', z0 + t, z1 - t, x1 - t, t, y, H, { e: ext, w: inn, n: inn, s: inn, top: cap, bottom: null }, holes.e);
    // upper floors with a stairwell hole, and the stairs up to each
    const st = o.stairs;
    for (let k = 1; k < floors; k++) {
      const fy = y + k * fh, ix0 = x0 + t, ix1 = x1 - t, iz0 = z0 + t, iz1 = z1 - t, mat = { top: o.upperFloor ?? 'wood_floor', bottom: o.ceiling ?? 'plaster', sides: inn };
      if (st) {
        M.box(ix0, fy - 12, iz0, st.x0, fy, iz1, mat); M.box(st.x1, fy - 12, iz0, ix1, fy, iz1, mat);
        M.box(st.x0, fy - 12, iz0, st.x1, fy, st.z0, mat); M.box(st.x0, fy - 12, st.z1, st.x1, fy, iz1, mat);
        K.stairs(st.x0, st.z0, st.x1, st.z1, fy - fh, fy, st.up, o.stairTex ?? 'concrete_plain', inn);
      } else M.box(ix0, fy - 12, iz0, ix1, fy, iz1, mat);
    }
    if (o.roof !== null) {
      M.box(x0, y + H, z0, x1, y + H + 12, z1, { top: o.roof ?? 'roof', bottom: o.ceiling ?? 'plaster', sides: ext });
      if (o.parapet) for (const [a, b, c2, d] of [[x0, z0, x1, z0 + 8], [x0, z1 - 8, x1, z1], [x0, z0 + 8, x0 + 8, z1 - 8], [x1 - 8, z0 + 8, x1, z1 - 8]]) M.box(a, y + H + 12, b, c2, y + H + 12 + o.parapet, d, { sides: ext, top: cap, bottom: null });
    }
    for (const [lx, lz, lv] of o.lamps || []) K.lamp(lx, y + (lv ?? 0) * fh + fh - 12, lz, o.lampCol, o.lampK ?? 1.2, o.lampR ?? 420, 0);
    return { y, t, H, fh };
  };

  // Straight solid stairs on (x0, z0)-(x1, z1) from y0 up to y1, rising toward `up` (n/s/e/w).
  K.stairs = (x0, z0, x1, z1, y0, y1, up, tex = 'concrete_plain', side = 'concrete') => {
    const n = Math.max(1, Math.ceil((y1 - y0) / 16 - 1e-6)), dy = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const top = y0 + dy * (i + 1), f0 = i / n, f1 = (i + 1) / n, mat = { top: tex, sides: side, bottom: null };
      if (up === 'n') M.box(x0, y0, z1 - (z1 - z0) * f1, x1, top, z1 - (z1 - z0) * f0, mat);
      else if (up === 's') M.box(x0, y0, z0 + (z1 - z0) * f0, x1, top, z0 + (z1 - z0) * f1, mat);
      else if (up === 'w') M.box(x1 - (x1 - x0) * f1, y0, z0, x1 - (x1 - x0) * f0, top, z1, mat);
      else M.box(x0 + (x1 - x0) * f0, y0, z0, x0 + (x1 - x0) * f1, top, z1, mat);
    }
  };
  // Railing along X or Z (top rail + posts), solid to walk against.
  K.railing = (axis, a0, a1, c, y, h = 40, tex = 'rail') => {
    if (axis === 'x') M.box(a0, y + h - 3, c - 1.5, a1, y + h, c + 1.5, tex); else M.box(c - 1.5, y + h - 3, a0, c + 1.5, y + h, a1, tex);
    if (axis === 'x') M.box(a0, y, c - 1, a1, y + h - 3, c + 1, null, { clip: true }); else M.box(c - 1, y, a0, c + 1, y + h - 3, a1, null, { clip: true });
    for (let a = a0; a <= a1 + 0.1; a += Math.max(48, (a1 - a0) / Math.ceil((a1 - a0) / 96))) {
      if (axis === 'x') M.box(a - 1.5, y, c - 1.5, a + 1.5, y + h - 3, c + 1.5, tex, ND); else M.box(c - 1.5, y, a - 1.5, c + 1.5, y + h - 3, a + 1.5, tex, ND);
    }
  };
  // Catwalk deck at height y with railings on the listed sides and posts underneath.
  K.catwalk = (x0, z0, x1, z1, y, o = {}) => {
    M.box(x0, y - 6, z0, x1, y, z1, { top: o.tex ?? 'diamond', bottom: 'steel', sides: 'steel' });
    for (const s of o.rails ?? []) {
      if (s === 'n') K.railing('x', x0, x1, z0 + 2, y); if (s === 's') K.railing('x', x0, x1, z1 - 2, y);
      if (s === 'w') K.railing('z', z0, z1, x0 + 2, y); if (s === 'e') K.railing('z', z0, z1, x1 - 2, y);
    }
    if (o.posts !== false) {
      const sx = Math.max(1, Math.round((x1 - x0) / 192)), sz = Math.max(1, Math.round((z1 - z0) / 192));
      for (let i = 0; i <= sx; i++) for (let j = 0; j <= sz; j++) {
        if (i > 0 && i < sx && j > 0 && j < sz) continue;
        if (o.posts === 'ends' && i > 0 && i < sx) continue;
        const px = lerp(x0 + 4, x1 - 4, sx ? i / sx : 0.5), pz = lerp(z0 + 4, z1 - 4, sz ? j / sz : 0.5);
        M.box(px - 3, o.base ?? 0, pz - 3, px + 3, y - 6, pz + 3, 'steel');
      }
    }
  };

  // A box or n-sided prism turned by yaw (about Y), then pitch (about its own X) and roll: planes are
  // built in the local frame and rotated, so anything leaning (dishes, struts, ramps) stays a brush.
  const rot = (v, yaw, pitch, roll) => {
    let [x, y, z] = v;
    let c = Math.cos(roll), s = Math.sin(roll); [x, y] = [x * c - y * s, x * s + y * c];
    c = Math.cos(pitch); s = Math.sin(pitch); [y, z] = [y * c - z * s, y * s + z * c];
    c = Math.cos(yaw); s = Math.sin(yaw); [x, z] = [x * c + z * s, -x * s + z * c];
    return [x, y, z];
  };
  K.tilted = (cx, cy, cz, local, yaw, pitch, roll, mat, o = {}) => {
    const planes = [], keys = [];
    for (const [n, h, k] of local) {
      const w = rot(n, yaw, pitch, roll);
      planes.push([w[0], w[1], w[2], w[0] * cx + w[1] * cy + w[2] * cz + h]); keys.push(k);
    }
    return M.addBrush(planes, keys, mat, o);
  };
  K.tiltBox = (cx, cy, cz, hx, hy, hz, yaw, pitch, roll, mat, o = {}) =>
    K.tilted(cx, cy, cz, [[[1, 0, 0], hx, 'e'], [[-1, 0, 0], hx, 'w'], [[0, 1, 0], hy, 'top'], [[0, -1, 0], hy, 'bottom'], [[0, 0, 1], hz, 's'], [[0, 0, -1], hz, 'n']], yaw, pitch, roll, mat, o);
  // flat disc (radius r, thickness t) on its local Y axis, leaned back by pitch and turned by yaw
  K.tiltDisc = (cx, cy, cz, r, t, sides, yaw, pitch, mat, o = {}) => {
    const local = [];
    for (let i = 0; i < sides; i++) { const a = (i + 0.5) * TAU / sides; local.push([[Math.cos(a), 0, Math.sin(a)], r, 'side']); }
    local.push([[0, 1, 0], t / 2, 'top'], [[0, -1, 0], t / 2, 'bottom']);
    return K.tilted(cx, cy, cz, local, yaw, pitch, 0, mat, o);
  };

  // ---------------------------------------------------------------- props
  K.crate = (x, z, s, tex = 'crate', y = 0, yaw = 0) => M.box(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, tex, { yaw });
  // a small stack: 2-4 crates (some stacked), seeded
  K.crates = (x, z, n = 3, seed = 1, y = 0) => {
    const r = mulberry32(seed), tex = ['crate', 'crate_b', 'crate_mil'];
    for (let i = 0; i < n; i++) {
      const s = [48, 56, 64][Math.floor(r() * 3)], ox = (r() - 0.5) * 90, oz = (r() - 0.5) * 90;
      K.crate(x + ox, z + oz, s, tex[Math.floor(r() * 3)], y, (r() - 0.5) * 0.6);
      if (r() < 0.4) K.crate(x + ox, z + oz, s * 0.8, tex[Math.floor(r() * 3)], y + s, (r() - 0.5) * 0.8);
    }
  };
  K.barrel = (x, z, tex = 'barrel', y = 0) => M.prism(x, z, y, y + 44, 13, 12, { side: tex, top: 'barrel_top' }, { rot: x * 0.01 });
  K.barrels = (x, z, n = 3, seed = 2, y = 0) => {
    const r = mulberry32(seed);
    for (let i = 0; i < n; i++) K.barrel(x + (i % 2) * 28 + (r() - 0.5) * 6, z + Math.floor(i / 2) * 28 + (r() - 0.5) * 6, r() < 0.35 ? 'barrel_red' : 'barrel', y);
  };
  K.pallet = (x, z, y = 0, yaw = 0) => M.box(x - 24, y, z - 20, x + 24, y + 6, z + 20, { top: 'timber', sides: 'timber', bottom: null }, { yaw });
  K.sandbags = (x0, z0, x1, z1, h = 44) => M.box(x0, 0, z0, x1, h, z1, { sides: 'sandbag', top: 'sandbag', bottom: null });
  K.barrier = (x0, z0, x1, z1, y = 0) => M.box(x0, y, z0, x1, y + 40, z1, { sides: 'concrete_plain', top: 'concrete_plain', bottom: null });
  // corrugated fence panels on a low plinth
  K.fence = (axis, a0, a1, c, h = 120, tex = 'shed') => {
    if (axis === 'x') { M.box(a0, 0, c - 4, a1, h, c + 4, { sides: tex, top: 'steel', bottom: null }); }
    else M.box(c - 4, 0, a0, c + 4, h, a1, { sides: tex, top: 'steel', bottom: null });
  };
  // shipping container 96 x 104 x len along X or Z, end doors as a trim
  K.container = (x, z, axis = 'x', tex = 'container', y = 0, len = 240) => {
    const w = 96, h = 104;
    if (axis === 'x') { M.box(x, y, z, x + len, y + h, z + w, { sides: tex, top: tex, bottom: null }); M.box(x + len, y + 4, z + 4, x + len + 2, y + h - 4, z + w - 4, 'steel', ND); }
    else { M.box(x, y, z, x + w, y + h, z + len, { sides: tex, top: tex, bottom: null }); M.box(x + 4, y + 4, z + len, x + w - 4, y + h - 4, z + len + 2, 'steel', ND); }
  };
  // rail track along X at z (centre), sleepers and rails, on a ballast bed
  K.rails = (x0, x1, z, y = 0, bed = 'ballast') => {
    M.box(x0, y - 16, z - 64, x1, y, z + 64, { top: bed, sides: 'concrete', bottom: null }, { lm: 24 });
    for (let x = x0 + 20; x < x1 - 10; x += 40) M.box(x - 8, y, z - 46, x + 8, y + 4, z + 46, { top: 'timber', sides: 'timber' }, Object.assign({ lm: 32 }, ND));
    for (const s of [-1, 1]) M.box(x0, y + 4, z + s * 30 - 2, x1, y + 10, z + s * 30 + 2, 'steel', Object.assign({ lm: 32 }, ND));
  };
  // freight wagon on the track (body + bogies + a roof line), length along X
  K.wagon = (x0, z, len = 480, tex = 'wagon', y = 0) => {
    M.box(x0 + 40, y + 6, z - 40, x0 + 100, y + 34, z + 40, 'steel'); M.box(x0 + len - 100, y + 6, z - 40, x0 + len - 40, y + 34, z + 40, 'steel');
    M.box(x0, y + 34, z - 56, x0 + len, y + 40, z + 56, 'steel');
    M.box(x0 + 8, y + 40, z - 54, x0 + len - 8, y + 176, z + 54, { n: tex, s: tex, e: 'steel', w: 'steel', top: 'roof', bottom: null });
  };
  // cylindrical tank with a cap ring
  K.tank = (x, z, r, h, tex = 'paint_white', y = 0, sides = 16) => {
    M.prism(x, z, y, y + h, r, sides, { side: tex, top: 'steel' });
    M.prism(x, z, y + h, y + h + 10, r * 0.4, 8, 'steel', ND);
  };
  // parked lorry facing yaw (cab + box body + wheels as blocks)
  K.truck = (x, z, yaw = 0, body = 'container_blue') => {
    const c = Math.cos(yaw), s = Math.sin(yaw), at = (fx, fz) => [x + fx * c + fz * s, z - fx * s + fz * c];
    const [bx, bz] = at(0, 40), [cx, cz] = at(0, -130);
    M.obb(bx, 70, bz, 46, 54, 120, yaw, { sides: body, top: 'roof', bottom: null });
    M.obb(cx, 50, cz, 44, 40, 40, yaw, { sides: 'paint_white', top: 'steel', bottom: null });
    M.obb(bx, 12, bz, 48, 12, 150, yaw, 'steel', ND);
  };
  // decorative window panel on a wall face (no hole)
  K.win = (x0, y0, z0, x1, y1, z1, face) => M.box(x0, y0, z0, x1, y1, z1, { [face]: 'window', sides: 'steel', top: 'steel', bottom: 'steel' }, ND);
  // sign plate facing `face`
  K.sign = (x0, y0, z0, x1, y1, z1, face, tex) => M.box(x0, y0, z0, x1, y1, z1, { [face]: tex, sides: 'steel', top: 'steel', bottom: 'steel' });
  // ceiling / wall lamp: a fitting and a baked light just under it
  K.lamp = (x, y, z, col = [1.0, 0.84, 0.62], k = 1.3, r = 520, hang = 0) => {
    if (hang > 0) M.box(x - 0.6, y + 8, z - 0.6, x + 0.6, y + 8 + hang, z + 0.6, 'steel', ND);
    M.prism(x, z, y + 4, y + 10, 9, 8, 'steel', { nocollide: true });
    M.box(x - 4, y, z - 4, x + 4, y + 4, z + 4, 'lamp', ND);
    M.light(x, y - 8, z, col, k, r);
  };
  // street lamp post
  K.pole = (x, z, h = 240, col = [1.0, 0.86, 0.62]) => {
    M.prism(x, z, 0, h, 3, 8, 'steel');
    M.box(x - 3, h - 4, z - 16, x + 3, h, z + 16, 'steel', ND);
    K.lamp(x, h - 10, z + 14, col, 1.0, 520);
  };
  return K;
}
