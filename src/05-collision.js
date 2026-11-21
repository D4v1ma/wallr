// Brush-based collision. Every solid is a convex set of planes (n·p <= d inside).
// Box sweeps expand planes by the box support (Minkowski sum), with axial bevel
// planes added so corners stay tight. Static brushes live in a BVH; doors are dynamic.

const CONTENTS = { SOLID: 1, PLAYERCLIP: 2, OPAQUE: 4 };
const MASK_PLAYER = CONTENTS.SOLID | CONTENTS.PLAYERCLIP;
const MASK_SHOT = CONTENTS.SOLID;
const MASK_LIGHT = CONTENTS.OPAQUE;
const TRACE_EPS = 0.03125;

function makeTrace() {
  return { fraction: 1, startsolid: false, allsolid: false, nx: 0, ny: 0, nz: 0, ex: 0, ey: 0, ez: 0, brush: null, plane: -1, surf: 0 };
}

// Keep the part of a convex polygon with n·p <= d.
function clipPolygon(poly, nx, ny, nz, d) {
  const out = [], len = poly.length, E = 1e-7;
  for (let i = 0; i < len; i++) {
    const a = poly[i], b = poly[(i + 1) % len];
    const da = a[0] * nx + a[1] * ny + a[2] * nz - d;
    const db = b[0] * nx + b[1] * ny + b[2] * nz - d;
    if (da <= E) out.push(a);
    if ((da < -E && db > E) || (da > E && db < -E)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  // drop near-duplicate vertices
  const res = [];
  for (const p of out) {
    const q = res[res.length - 1];
    if (!q || Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 1e-5) res.push(p);
  }
  if (res.length > 1) {
    const a = res[0], b = res[res.length - 1];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= 1e-5) res.pop();
  }
  return res;
}

// Polygon for every plane of a convex brush (null where the plane contributes no face).
function brushPolygons(planes) {
  const polys = [];
  for (let i = 0; i < planes.length; i++) {
    const [nx, ny, nz, d] = planes[i];
    const ax = Math.abs(ny) < 0.9 ? 0 : 1, ay = Math.abs(ny) < 0.9 ? 1 : 0;
    let t1x = ny * 0 - nz * ay, t1y = nz * ax - nx * 0, t1z = nx * ay - ny * ax;
    const l1 = Math.hypot(t1x, t1y, t1z); t1x /= l1; t1y /= l1; t1z /= l1;
    const t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x;
    const cx = nx * d, cy = ny * d, cz = nz * d, B = 1e5;
    let poly = [
      [cx + (t1x + t2x) * B, cy + (t1y + t2y) * B, cz + (t1z + t2z) * B],
      [cx + (t1x - t2x) * B, cy + (t1y - t2y) * B, cz + (t1z - t2z) * B],
      [cx + (-t1x - t2x) * B, cy + (-t1y - t2y) * B, cz + (-t1z - t2z) * B],
      [cx + (-t1x + t2x) * B, cy + (-t1y + t2y) * B, cz + (-t1z + t2z) * B],
    ];
    for (let j = 0; j < planes.length && poly.length >= 3; j++) {
      if (j !== i) poly = clipPolygon(poly, planes[j][0], planes[j][1], planes[j][2], planes[j][3]);
    }
    polys.push(poly.length >= 3 ? poly : null);
  }
  return polys;
}

class Brush {
  // planes: [[nx,ny,nz,d], ...] (face planes only); surfs: surface id per plane
  constructor(planes, contents, surfs, surfDefault = 0) {
    this.contents = contents;
    this.id = -1;
    this.ent = null;
    this.active = true;
    this.surfDefault = surfDefault;
    this.setPlanes(planes, surfs);
  }

  setPlanes(planes, surfs) {
    const polys = brushPolygons(planes);
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const p of polys) if (p) for (const v of p) {
      if (v[0] < x0) x0 = v[0]; if (v[1] < y0) y0 = v[1]; if (v[2] < z0) z0 = v[2];
      if (v[0] > x1) x1 = v[0]; if (v[1] > y1) y1 = v[1]; if (v[2] > z1) z1 = v[2];
    }
    const all = planes.map((p) => p.slice(0, 4));
    const sf = surfs ? surfs.slice() : planes.map(() => this.surfDefault);
    const axes = [[1, 0, 0, x1], [-1, 0, 0, -x0], [0, 1, 0, y1], [0, -1, 0, -y0], [0, 0, 1, z1], [0, 0, -1, -z0]];
    for (const a of axes) {
      if (!planes.some((p) => p[0] * a[0] + p[1] * a[1] + p[2] * a[2] > 0.99999)) { all.push(a); sf.push(this.surfDefault); }
    }
    this.polys = polys;
    this.faceCount = planes.length;
    this.n = all.length;
    this.P = new Float64Array(all.length * 4);
    all.forEach((p, i) => { this.P[i * 4] = p[0]; this.P[i * 4 + 1] = p[1]; this.P[i * 4 + 2] = p[2]; this.P[i * 4 + 3] = p[3]; });
    this.surf = Int8Array.from(sf);
    this.min = [x0, y0, z0];
    this.max = [x1, y1, z1];
  }
}

// Segment/ray vs AABB slab test over t in [0, tmax].
function slabHit(sx, sy, sz, dx, dy, dz, x0, y0, z0, x1, y1, z1, tmax) {
  let t0 = 0, t1 = tmax;
  if (dx > -1e-12 && dx < 1e-12) { if (sx < x0 || sx > x1) return false; }
  else { const iv = 1 / dx; let a = (x0 - sx) * iv, b = (x1 - sx) * iv; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false; }
  if (dy > -1e-12 && dy < 1e-12) { if (sy < y0 || sy > y1) return false; }
  else { const iv = 1 / dy; let a = (y0 - sy) * iv, b = (y1 - sy) * iv; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false; }
  if (dz > -1e-12 && dz < 1e-12) { if (sz < z0 || sz > z1) return false; }
  else { const iv = 1 / dz; let a = (z0 - sz) * iv, b = (z1 - sz) * iv; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false; }
  return true;
}

class CollisionWorld {
  constructor() {
    this.brushes = [];
    this.dynamic = [];
    this.stack = new Int32Array(512);
    this.hitBrush = null;
    this.hitPlane = -1;
    this.nodeCount = 0;
  }

  add(b) { b.id = this.brushes.length; this.brushes.push(b); return b; }
  addDynamic(b) { b.id = -1 - this.dynamic.length; this.dynamic.push(b); return b; }

  build() {
    const B = this.brushes, N = B.length;
    const cen = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) for (let a = 0; a < 3; a++) cen[i * 3 + a] = (B[i].min[a] + B[i].max[a]) * 0.5;
    const mn = [], mx = [], left = [], right = [], start = [], count = [], items = [];
    const rec = (list) => {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      const clo = [Infinity, Infinity, Infinity], chi = [-Infinity, -Infinity, -Infinity];
      for (const i of list) {
        for (let a = 0; a < 3; a++) {
          if (B[i].min[a] < lo[a]) lo[a] = B[i].min[a];
          if (B[i].max[a] > hi[a]) hi[a] = B[i].max[a];
          const c = cen[i * 3 + a]; if (c < clo[a]) clo[a] = c; if (c > chi[a]) chi[a] = c;
        }
      }
      const ni = left.length;
      mn.push(lo[0], lo[1], lo[2]); mx.push(hi[0], hi[1], hi[2]);
      left.push(-1); right.push(-1); start.push(0); count.push(0);
      if (list.length <= 3) { start[ni] = items.length; count[ni] = list.length; items.push(...list); return ni; }
      let axis = 0, best = -1;
      for (let a = 0; a < 3; a++) if (chi[a] - clo[a] > best) { best = chi[a] - clo[a]; axis = a; }
      list.sort((p, q) => cen[p * 3 + axis] - cen[q * 3 + axis]);
      const mid = list.length >> 1;
      const l = rec(list.slice(0, mid)), r = rec(list.slice(mid));
      left[ni] = l; right[ni] = r;
      return ni;
    };
    if (N) rec([...Array(N).keys()]);
    this.nMin = Float64Array.from(mn); this.nMax = Float64Array.from(mx);
    this.nLeft = Int32Array.from(left); this.nRight = Int32Array.from(right);
    this.nStart = Int32Array.from(start); this.nCount = Int32Array.from(count);
    this.items = Int32Array.from(items);
    this.nodeCount = left.length;
  }

  // Sweep an axis-aligned box (center s -> e, half extents h) through the world.
  trace(tr, sx, sy, sz, ex, ey, ez, hx, hy, hz, mask) {
    tr.fraction = 1; tr.startsolid = false; tr.allsolid = false;
    tr.brush = null; tr.plane = -1; tr.nx = 0; tr.ny = 0; tr.nz = 0; tr.surf = 0;
    const dx = ex - sx, dy = ey - sy, dz = ez - sz;
    const mx = hx + 1, my = hy + 1, mz = hz + 1;
    if (this.nodeCount) {
      const st = this.stack, nMin = this.nMin, nMax = this.nMax, B = this.brushes;
      let sp = 0; st[sp++] = 0;
      while (sp > 0) {
        const ni = st[--sp], o = ni * 3;
        if (!slabHit(sx, sy, sz, dx, dy, dz, nMin[o] - mx, nMin[o + 1] - my, nMin[o + 2] - mz, nMax[o] + mx, nMax[o + 1] + my, nMax[o + 2] + mz, tr.fraction)) continue;
        const l = this.nLeft[ni];
        if (l < 0) {
          const s0 = this.nStart[ni], s1 = s0 + this.nCount[ni];
          for (let k = s0; k < s1; k++) {
            const b = B[this.items[k]];
            if (!(b.contents & mask)) continue;
            this.traceBrush(tr, b, sx, sy, sz, ex, ey, ez, hx, hy, hz);
            if (tr.allsolid) { this._finish(tr, sx, sy, sz, dx, dy, dz); return tr; }
          }
        } else { st[sp++] = l; st[sp++] = this.nRight[ni]; }
      }
    }
    for (const b of this.dynamic) {
      if (!b.active || !(b.contents & mask)) continue;
      if (!slabHit(sx, sy, sz, dx, dy, dz, b.min[0] - mx, b.min[1] - my, b.min[2] - mz, b.max[0] + mx, b.max[1] + my, b.max[2] + mz, tr.fraction)) continue;
      this.traceBrush(tr, b, sx, sy, sz, ex, ey, ez, hx, hy, hz);
      if (tr.allsolid) break;
    }
    this._finish(tr, sx, sy, sz, dx, dy, dz);
    return tr;
  }

  _finish(tr, sx, sy, sz, dx, dy, dz) {
    tr.ex = sx + dx * tr.fraction; tr.ey = sy + dy * tr.fraction; tr.ez = sz + dz * tr.fraction;
    if (tr.brush && tr.plane >= 0) tr.surf = tr.brush.surf[tr.plane];
    else if (tr.brush) tr.surf = tr.brush.surfDefault;
  }

  // Quake 3 style clip of a box sweep against one convex brush.
  traceBrush(tr, b, sx, sy, sz, ex, ey, ez, hx, hy, hz) {
    const P = b.P, n = b.n;
    let enterFrac = -1, leaveFrac = 1, clip = -1, getout = false, startout = false;
    for (let i = 0; i < n; i++) {
      const o = i * 4, nx = P[o], ny = P[o + 1], nz = P[o + 2];
      const dist = P[o + 3] + (nx < 0 ? -nx : nx) * hx + (ny < 0 ? -ny : ny) * hy + (nz < 0 ? -nz : nz) * hz;
      const d1 = sx * nx + sy * ny + sz * nz - dist;
      const d2 = ex * nx + ey * ny + ez * nz - dist;
      if (d2 > 0) getout = true;
      if (d1 > 0) startout = true;
      if (d1 > 0 && (d2 >= TRACE_EPS || d2 >= d1)) return;
      if (d1 <= 0 && d2 <= 0) continue;
      if (d1 > d2) {
        let f = (d1 - TRACE_EPS) / (d1 - d2); if (f < 0) f = 0;
        if (f > enterFrac) { enterFrac = f; clip = i; }
      } else {
        let f = (d1 + TRACE_EPS) / (d1 - d2); if (f > 1) f = 1;
        if (f < leaveFrac) leaveFrac = f;
      }
    }
    if (!startout) {
      tr.startsolid = true;
      if (!getout) { tr.allsolid = true; tr.fraction = 0; tr.brush = b; tr.plane = -1; }
      return;
    }
    if (enterFrac < leaveFrac && enterFrac > -1 && enterFrac < tr.fraction) {
      if (enterFrac < 0) enterFrac = 0;
      tr.fraction = enterFrac; tr.brush = b; tr.plane = clip;
      tr.nx = P[clip * 4]; tr.ny = P[clip * 4 + 1]; tr.nz = P[clip * 4 + 2];
    }
  }

  // Unit-direction ray for lighting. Returns hit distance or -1. Sets hitBrush/hitPlane.
  rayCast(ox, oy, oz, dx, dy, dz, tmax, mask, any) {
    let best = tmax, hb = null, hp = -1;
    if (this.nodeCount) {
      const st = this.stack, nMin = this.nMin, nMax = this.nMax, B = this.brushes;
      let sp = 0; st[sp++] = 0;
      while (sp > 0) {
        const ni = st[--sp], o = ni * 3;
        if (!slabHit(ox, oy, oz, dx, dy, dz, nMin[o], nMin[o + 1], nMin[o + 2], nMax[o], nMax[o + 1], nMax[o + 2], best)) continue;
        const l = this.nLeft[ni];
        if (l < 0) {
          const s0 = this.nStart[ni], s1 = s0 + this.nCount[ni];
          for (let k = s0; k < s1; k++) {
            const b = B[this.items[k]];
            if (!(b.contents & mask)) continue;
            const t = this.rayBrush(b, ox, oy, oz, dx, dy, dz, best);
            if (t >= 0 && t < best) {
              best = t; hb = b; hp = this._rp;
              if (any) { this.hitBrush = hb; this.hitPlane = hp; return t; }
            }
          }
        } else { st[sp++] = l; st[sp++] = this.nRight[ni]; }
      }
    }
    this.hitBrush = hb; this.hitPlane = hp;
    return hb ? best : -1;
  }

  rayBrush(b, ox, oy, oz, dx, dy, dz, tmax) {
    const P = b.P, n = b.n;
    let t0 = 0, t1 = tmax, plane = -1;
    for (let i = 0; i < n; i++) {
      const o = i * 4, nx = P[o], ny = P[o + 1], nz = P[o + 2];
      const den = nx * dx + ny * dy + nz * dz;
      const dist = P[o + 3] - (nx * ox + ny * oy + nz * oz);
      if (den > -1e-12 && den < 1e-12) { if (dist < 0) return -1; continue; }
      const t = dist / den;
      if (den < 0) { if (t > t0) { t0 = t; plane = i; } } else if (t < t1) t1 = t;
      if (t0 > t1) return -1;
    }
    this._rp = plane;
    return t0;
  }

  // First brush (matching mask) containing the point, or null.
  pointContents(x, y, z, mask) {
    if (this.nodeCount) {
      const st = this.stack, nMin = this.nMin, nMax = this.nMax, B = this.brushes;
      let sp = 0; st[sp++] = 0;
      while (sp > 0) {
        const ni = st[--sp], o = ni * 3;
        if (x < nMin[o] || y < nMin[o + 1] || z < nMin[o + 2] || x > nMax[o] || y > nMax[o + 1] || z > nMax[o + 2]) continue;
        const l = this.nLeft[ni];
        if (l < 0) {
          const s0 = this.nStart[ni], s1 = s0 + this.nCount[ni];
          for (let k = s0; k < s1; k++) {
            const b = B[this.items[k]];
            if ((b.contents & mask) && this.pointInBrush(b, x, y, z)) return b;
          }
        } else { st[sp++] = l; st[sp++] = this.nRight[ni]; }
      }
    }
    for (const b of this.dynamic) if (b.active && (b.contents & mask) && this.pointInBrush(b, x, y, z)) return b;
    return null;
  }

  pointInBrush(b, x, y, z) {
    const P = b.P;
    for (let i = 0, o = 0; i < b.n; i++, o += 4) if (P[o] * x + P[o + 1] * y + P[o + 2] * z - P[o + 3] > 0) return false;
    return true;
  }

  // Does the box (center c, half extents h) overlap brush b (with a small tolerance)?
  boxOverlaps(b, cx, cy, cz, hx, hy, hz) {
    const P = b.P;
    for (let i = 0, o = 0; i < b.n; i++, o += 4) {
      const nx = P[o], ny = P[o + 1], nz = P[o + 2];
      const dist = P[o + 3] + Math.abs(nx) * hx + Math.abs(ny) * hy + Math.abs(nz) * hz;
      if (nx * cx + ny * cy + nz * cz - dist > -0.05) return false;
    }
    return true;
  }
}
