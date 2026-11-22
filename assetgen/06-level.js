// Map DSL + compiler: brushes -> collision, visible faces, texture UVs, lightmap atlas.
// assetgen fork (Godot assets): render groups are split into spatial chunks so the engine can cull
// them, and the lightmap atlas grows to 2048/4096 wide for big maps.

class MapBuilder {
  constructor() {
    this.brushes = []; this.lights = []; this.doors = []; this.targets = []; this.spawns = []; this.teamSpawns = []; this.hotspots = []; this.sites = [];
    this.areas = []; this.tactics = null;
    this.env = null;
  }

  // Material spec: 'name' | { all, top, bottom, sides, n, s, e, w, side } ; null = nodraw.
  static resolveMat(spec, key) {
    if (spec === null || spec === undefined) return null;
    if (typeof spec === 'string') return spec;
    if (key in spec) return spec[key];
    if ((key === 'n' || key === 's' || key === 'e' || key === 'w' || key === 'side') && 'sides' in spec) return spec.sides;
    if ('all' in spec) return spec.all;
    return null;
  }

  addBrush(planes, keys, mat, o = {}) {
    const faces = planes.map((p, i) => ({ plane: p, key: keys[i], mat: MapBuilder.resolveMat(mat, keys[i]) }));
    const b = { faces, o: Object.assign({}, o) };
    this.brushes.push(b);
    return b;
  }

  box(x0, y0, z0, x1, y1, z1, mat, o = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    return this.obb((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, o.yaw || 0, mat, o);
  }

  // Oriented box rotated by yaw about +Y (three.js convention).
  obb(cx, cy, cz, hx, hy, hz, yaw, mat, o = {}) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ex = [c, 0, -s], ez = [s, 0, c];
    const pl = (n, h) => [n[0], n[1], n[2], n[0] * cx + n[1] * cy + n[2] * cz + h];
    const planes = [pl(ex, hx), pl([-ex[0], 0, -ex[2]], hx), pl([0, 1, 0], hy), pl([0, -1, 0], hy), pl(ez, hz), pl([-ez[0], 0, -ez[2]], hz)];
    return this.addBrush(planes, ['e', 'w', 'top', 'bottom', 's', 'n'], mat, o);
  }

  // Solid ramp over [x0,x1]x[z0,z1], from y0 rising to y1 toward side `up`.
  ramp(x0, z0, x1, z1, y0, y1, up, mat, o = {}) {
    const planes = [], keys = [];
    const add = (n, d, k) => { planes.push([n[0], n[1], n[2], d]); keys.push(k); };
    add([0, -1, 0], -y0, 'bottom');
    const H = y1 - y0;
    if (up === 'n' || up === 's') {
      add([1, 0, 0], x1, 'e'); add([-1, 0, 0], -x0, 'w');
      const k = H / (z1 - z0), len = Math.hypot(1, k);
      if (up === 'n') { add([0, 0, -1], -z0, 'n'); add([0, 1 / len, k / len], (y0 + k * z1) / len, 'top'); }
      else { add([0, 0, 1], z1, 's'); add([0, 1 / len, -k / len], (y0 - k * z0) / len, 'top'); }
    } else {
      add([0, 0, 1], z1, 's'); add([0, 0, -1], -z0, 'n');
      const k = H / (x1 - x0), len = Math.hypot(1, k);
      if (up === 'e') { add([1, 0, 0], x1, 'e'); add([-k / len, 1 / len, 0], (y0 - k * x0) / len, 'top'); }
      else { add([-1, 0, 0], -x0, 'w'); add([k / len, 1 / len, 0], (y0 + k * x1) / len, 'top'); }
    }
    return this.addBrush(planes, keys, mat, o);
  }

  // Vertical n-gon prism (barrels, pillars). r = apothem.
  prism(cx, cz, y0, y1, r, sides, mat, o = {}) {
    const planes = [], keys = [], rot = o.rot || 0;
    for (let i = 0; i < sides; i++) {
      const a = rot + (i + 0.5) * TAU / sides, nx = Math.cos(a), nz = Math.sin(a);
      planes.push([nx, 0, nz, nx * cx + nz * cz + r]); keys.push('side');
    }
    planes.push([0, 1, 0, y1]); keys.push('top');
    planes.push([0, -1, 0, -y0]); keys.push('bottom');
    const b = this.addBrush(planes, keys, mat, o);
    b.o.cyl = { cx, cz, y0, y1 };
    return b;
  }

  light(x, y, z, color, intensity = 1, radius = 420) { this.lights.push({ pos: [x, y, z], color, intensity, radius }); }
  spawn(x, y, z, yaw) { this.spawns.push({ pos: [x, y, z], yaw }); }
  teamSpawn(team, x, y, z, yaw) { (this.teamSpawns[team] || (this.teamSpawns[team] = [])).push({ pos: [x, y, z], yaw }); }
  hotspot(x, y, z, name) { this.hotspots.push({ pos: [x, y, z], name }); }
  // Named place for the radar and callouts (first match wins).
  area(name, x0, z0, x1, z1) { this.areas.push({ name, x0, z0, x1, z1 }); }
  // Plant site: the charge can be planted anywhere inside this box.
  site(name, x0, z0, x1, z1, y0 = -16, y1 = 140) {
    this.sites.push({ name, min: [x0, y0, z0], max: [x1, y1, z1], center: [(x0 + x1) / 2, 0, (z0 + z1) / 2], spots: [] });
  }

  // Hinged door slab; hinge = [x, z] of the hinge edge.
  door(x0, y0, z0, x1, y1, z1, hinge, mat, o = {}) {
    const b = this.box(x0, y0, z0, x1, y1, z1, mat, Object.assign({ entity: 'door', noshadow: true }, o));
    const d = { mb: b, hinge, opts: o };
    b.o.doorDef = d; this.doors.push(d);
    return d;
  }

  // Steel plate facing -X (toward the firing line), hinged at its bottom edge.
  target(cx, cy, cz, hw, hh, mat, o = {}) {
    const b = this.box(cx - 1, cy - hh, cz - hw, cx + 1, cy + hh, cz + hw,
      { w: mat, e: 'steel', top: 'steel', bottom: 'steel', n: 'steel', s: 'steel' },
      Object.assign({ entity: 'target', noshadow: true, nocollide: true, lm: 4 }, o));
    const t = { mb: b, center: [cx, cy, cz], half: [1, hh, hw], opts: o };
    b.o.targetDef = t; this.targets.push(t);
    return t;
  }
}

function isHiddenFace(cw, poly, nx, ny, nz) {
  let cx = 0, cy = 0, cz = 0;
  for (const v of poly) { cx += v[0]; cy += v[1]; cz += v[2]; }
  cx /= poly.length; cy /= poly.length; cz /= poly.length;
  const pts = [[cx, cy, cz]];
  for (const v of poly) pts.push([lerp(v[0], cx, 0.12), lerp(v[1], cy, 0.12), lerp(v[2], cz, 0.12)]);
  for (const p of pts) {
    if (!cw.pointContents(p[0] + nx * 0.5, p[1] + ny * 0.5, p[2] + nz * 0.5, CONTENTS.OPAQUE)) return false;
  }
  return true;
}

const nextPow2 = (v) => { let p = 1; while (p < v) p <<= 1; return p; };

function compileLevel(map, tex) {
  const cw = new CollisionWorld();
  const surfOf = (mat) => (mat && tex[mat] ? SURF[tex[mat].def.surf] : SURF.concrete) | 0;

  // 1) collision
  for (const mb of map.brushes) {
    const planes = mb.faces.map((f) => f.plane);
    const main = (mb.faces.find((f) => f.mat) || {}).mat;
    const surfs = mb.faces.map((f) => surfOf(f.mat || main));
    let contents = 0;
    if (mb.o.clip) contents = CONTENTS.PLAYERCLIP;
    else {
      if (!mb.o.nocollide) contents |= CONTENTS.SOLID;
      if (!mb.o.noshadow && !mb.o.entity) contents |= CONTENTS.OPAQUE;
    }
    const b = new Brush(planes, contents, surfs, surfOf(main));
    b.mb = mb; mb.cbrush = b;
    if (mb.o.entity === 'door') cw.addDynamic(b);
    else if (!mb.o.entity && contents) cw.add(b);
  }
  cw.build();

  // 2) visible faces
  const faces = [];
  for (const mb of map.brushes) {
    const b = mb.cbrush;
    b.faceIndex = new Int32Array(b.n).fill(-1);
    mb.faces.forEach((f, pi) => {
      if (!f.mat || mb.o.clip) return;
      const poly = b.polys[pi];
      if (!poly) return;
      const [nx, ny, nz, d] = f.plane;
      if (!mb.o.entity && isHiddenFace(cw, poly, nx, ny, nz)) return;
      b.faceIndex[pi] = faces.length;
      faces.push({ mb, brush: b, plane: pi, n: [nx, ny, nz], d, poly, mat: f.mat, ent: mb.o.entity || null, lm: null, uv: null });
    });
  }

  // 3) texture + lightmap axes
  let luxels = 0;
  for (const f of faces) {
    const [nx, ny, nz] = f.n;
    let rx, ry, rz;
    if (Math.abs(ny) > 0.7) {
      const dd = nx; rx = 1 - nx * dd; ry = -ny * dd; rz = -nz * dd;
    } else { rx = nz; ry = 0; rz = -nx; }
    const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
    const tx = ny * rz - nz * ry, ty = nz * rx - nx * rz, tz = nx * ry - ny * rx;
    let minR = Infinity, maxR = -Infinity, minT = Infinity, maxT = -Infinity;
    for (const v of f.poly) {
      const R = v[0] * rx + v[1] * ry + v[2] * rz, T = v[0] * tx + v[1] * ty + v[2] * tz;
      if (R < minR) minR = R; if (R > maxR) maxR = R; if (T < minT) minT = T; if (T > maxT) maxT = T;
    }
    f.axes = { r: [rx, ry, rz], t: [tx, ty, tz], minR, maxR, minT, maxT };
    const td = tex[f.mat] && tex[f.mat].def;
    if (td && td.fullbright) continue;
    const ext = Math.max(maxR - minR, maxT - minT);
    const env = map.env || {}, s = f.mb.o.lm || (ext > (env.lmBig || 640) ? (env.lmBigS || 16) : (env.lmSmall || 8));
    const w = Math.max(2, Math.ceil((maxR - minR) / s) + 1), h = Math.max(2, Math.ceil((maxT - minT) / s) + 1);
    f.lm = { s, w, h, x: 0, y: 0, start: 0 };
    luxels += w * h;
  }

  // 4) shelf-pack the lightmap atlas
  const ATLAS_W = luxels > 3000000 ? 4096 : luxels > 900000 ? 2048 : 1024;
  const lmFaces = faces.filter((f) => f.lm).sort((a, b) => b.lm.h - a.lm.h);
  let px = 0, py = 0, rowH = 0, start = 0;
  for (const f of lmFaces) {
    const w = f.lm.w + 1, h = f.lm.h + 1;
    if (px + w > ATLAS_W) { px = 0; py += rowH; rowH = 0; }
    f.lm.x = px; f.lm.y = py; f.lm.start = start; start += f.lm.w * f.lm.h;
    px += w; if (h > rowH) rowH = h;
  }
  const atlasW = ATLAS_W, atlasH = nextPow2(Math.max(8, py + rowH));

  // 5) render geometry
  const groups = new Map();   // static: 'chunk|mat' -> arrays
  const entGroups = new Map(); // mb -> Map(mat -> arrays)
  const CH = (map.env && map.env.chunk) || 1536;
  const getGroup = (map_, mat, chunk = 0) => {
    const key = chunk + '|' + mat;
    let g = map_.get(key);
    if (!g) { g = { mat, chunk, pos: [], nrm: [], uv: [], lm: [] }; map_.set(key, g); }
    return g;
  };
  for (const f of faces) {
    const td = tex[f.mat] ? tex[f.mat].def : {};
    const { r, t, minR, maxR, minT, maxT } = f.axes;
    const poly = f.poly.slice();
    // winding: three.js front faces are counter-clockwise
    const a = poly[0], b = poly[1], c = poly[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cxn = uy * vz - uz * vy, cyn = uz * vx - ux * vz, czn = ux * vy - uy * vx;
    if (cxn * f.n[0] + cyn * f.n[1] + czn * f.n[2] < 0) poly.reverse();
    const o = f.mb.o;
    const worldSize = (td.world || 128) * (o.uvScale || 1);
    const off = o.uvOff || [0, 0];
    let cylRef = 0;
    if (td.cyl && o.cyl) {
      let mx = 0, mz = 0; for (const v of poly) { mx += v[0]; mz += v[2]; }
      cylRef = Math.atan2(mz / poly.length - o.cyl.cz, mx / poly.length - o.cyl.cx);
    }
    const uvOf = (v) => {
      const R = v[0] * r[0] + v[1] * r[1] + v[2] * r[2], T = v[0] * t[0] + v[1] * t[1] + v[2] * t[2];
      if (td.cyl && o.cyl) {
        let ang = Math.atan2(v[2] - o.cyl.cz, v[0] - o.cyl.cx) - cylRef;
        while (ang > Math.PI) ang -= TAU; while (ang < -Math.PI) ang += TAU;
        return [-(cylRef + ang) / TAU, (v[1] - o.cyl.y0) / (o.cyl.y1 - o.cyl.y0)];
      }
      if (td.fit) return [(R - minR) / Math.max(1e-6, maxR - minR), (T - minT) / Math.max(1e-6, maxT - minT)];
      if (o.uvRot) return [T / worldSize + off[0], -R / worldSize + off[1]];
      return [R / worldSize + off[0], T / worldSize + off[1]];
    };
    const lmOf = (v) => {
      if (!f.lm) return [0, 0];
      const R = v[0] * r[0] + v[1] * r[1] + v[2] * r[2], T = v[0] * t[0] + v[1] * t[1] + v[2] * t[2];
      return [(f.lm.x + 0.5 + (R - minR) / f.lm.s) / atlasW, (f.lm.y + 0.5 + (T - minT) / f.lm.s) / atlasH];
    };
    let g;
    if (f.ent) { let m = entGroups.get(f.mb); if (!m) { m = new Map(); entGroups.set(f.mb, m); } g = getGroup(m, f.mat); }
    else {
      let mx = 0, mz = 0; for (const v of poly) { mx += v[0]; mz += v[2]; }
      const cx = Math.floor(mx / poly.length / CH), cz = Math.floor(mz / poly.length / CH);
      g = getGroup(groups, f.mat, (cx + 512) * 1024 + (cz + 512));
    }
    const uvs = poly.map(uvOf), lms = poly.map(lmOf);
    for (let i = 1; i < poly.length - 1; i++) {
      for (const k of [0, i, i + 1]) {
        g.pos.push(poly[k][0], poly[k][1], poly[k][2]);
        g.nrm.push(f.n[0], f.n[1], f.n[2]);
        g.uv.push(uvs[k][0], uvs[k][1]);
        g.lm.push(lms[k][0], lms[k][1]);
      }
    }
  }

  // world bounds (static brushes)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const b of cw.brushes) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], b.min[i]); hi[i] = Math.max(hi[i], b.max[i]); }

  return { cw, faces, luxels, atlasW, atlasH, groups, entGroups, lights: map.lights, doors: map.doors, targets: map.targets, spawns: map.spawns,
    teamSpawns: map.teamSpawns, hotspots: map.hotspots, sites: map.sites, areas: map.areas, tactics: map.tactics, menuShots: map.menuShots || null, env: map.env, bounds: { lo, hi }, tex };
}
