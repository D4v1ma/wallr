// Viewmodel geometry (assetgen fork for the Godot version). Every weapon is rebuilt from bevelled
// side profiles, rounded boxes and lathed parts with smoothed normals; hands are gloves with jointed
// fingers and knuckles, arms are sleeves with cuffs and folds. Part names, pivots, anchors, sight
// heights and attachment mounts match the original builders (src/17-vm-models.js), so the animation
// clips, attachments and scoping line up unchanged.
// Gun space: -Z toward the muzzle, +Y up, +X right; units ~ inches.

// ------------------------------------------------------------------------------------------
// Original helpers (kept: other modules and old call sites use them)
// ------------------------------------------------------------------------------------------
function vmBox(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}
function vmCyl(r, len, seg, x, y, z, rx = 0) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.rotateX(Math.PI / 2 + rx); g.translate(x, y, z);
  return g;
}
function vmCylY(r, len, seg, x, y, z) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.translate(x, y, z);
  return g;
}
function vmLimb(a, b, r0, r1, seg = 8) { return limb(a, b, r0, r1, seg, true); }
function mergeGeos(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.computeBoundingSphere();
  return m;
}

// ------------------------------------------------------------------------------------------
// New primitives
// ------------------------------------------------------------------------------------------
const _vmM4 = new THREE.Matrix4(), _vmE = new THREE.Euler();
// Rotate (XYZ euler) then translate a geometry in place.
function xf(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  if (rx || ry || rz) g.applyMatrix4(_vmM4.makeRotationFromEuler(_vmE.set(rx, ry, rz)));
  if (x || y || z) g.translate(x, y, z);
  return g;
}

// Box with rounded edges and corners (radius r), smooth normals.
function rbox(w, h, d, r = 0.08, seg = 2) {
  const n = seg * 2 + 1;
  r = Math.max(0.0005, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n).toNonIndexed();
  const P = g.attributes.position.array, N = g.attributes.normal.array, half = 0.5 / n;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
  for (let i = 0; i < P.length; i += 3) {
    const sx = Math.sign(P[i]), sy = Math.sign(P[i + 1]), sz = Math.sign(P[i + 2]);
    let nx = P[i] - sx * half, ny = P[i + 1] - sy * half, nz = P[i + 2] - sz * half;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    P[i] = bx * sx + nx * r; P[i + 1] = by * sy + ny * r; P[i + 2] = bz * sz + nz * r;
    N[i] = nx; N[i + 1] = ny; N[i + 2] = nz;
  }
  return g;
}
const rb = (w, h, d, x, y, z, r = 0.08, rx = 0, ry = 0, rz = 0) => xf(rbox(w, h, d, r, Math.min(w, h, d) < 0.35 || r < 0.05 ? 1 : 2), x, y, z, rx, ry, rz);

// Side profile in gun space ([z, y] points, or {q: [cz, cy, z, y]} for a curve) extruded across X
// to width w, with a bevel that stays inside the outline. Normals are auto-smoothed.
function prof(pts, w, bevel = 0.1, x = 0) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => {
    if (p.q) s.quadraticCurveTo(p.q[0], p.q[1], p.q[2], p.q[3]);
    else if (i === 0) s.moveTo(p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  });
  const b = Math.max(0.001, Math.min(bevel, w * 0.45));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.002, w - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 8, steps: 1 });
  g.translate(0, 0, -(w - 2 * b) / 2);
  g.rotateY(-Math.PI / 2);
  const out = g.index ? g.toNonIndexed() : g;
  autoSmooth(out, 38);
  if (x) out.translate(x, 0, 0);
  return out;
}

// Surface of revolution round the Z axis through (x, y): pts [[r, z], ...] (z increasing).
function lathe(pts, seg, x = 0, y = 0) {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(Math.max(r, 0.0001), z)), seg);
  g.rotateX(Math.PI / 2);
  const out = g.toNonIndexed();
  autoSmooth(out, 50);
  out.translate(x, y, 0);
  return out;
}
// Solid cylinder along Z (capped), centred at (x, y, z).
function cylz(r, len, seg, x, y, z, bev = 0.04) {
  const b = Math.min(bev, r * 0.4, len * 0.25), h = len / 2;
  return lathe([[0, -h], [r - b, -h], [r, -h + b], [r, h - b], [r - b, h], [0, h]], seg, x, y).translate(0, 0, z);
}
// Solid cylinder along Y.
function cyly(r, len, seg, x, y, z, bev = 0.04) {
  return cylz(r, len, seg, 0, 0, 0, bev).rotateX(-Math.PI / 2).translate(x, y, z);
}
// Ring (torus) facing Z.
function ringz(R, r, x, y, z, seg = 18) { return new THREE.TorusGeometry(R, r, 8, seg).toNonIndexed().translate(x, y, z); }

// Capsule-like limb from a to b: rounded ends, radius r0 at a, r1 at b. UV v runs a (0) -> b (1).
function limb(a, b, r0, r1, seg = 10, caps = true) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz) || 1e-3;
  const pts = [];
  if (caps) for (let i = 0; i <= 3; i++) { const t = -Math.PI / 2 + (i / 3) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(r0 * Math.cos(t), 1e-4), r0 * Math.sin(t))); }
  else pts.push(new THREE.Vector2(1e-4, 0), new THREE.Vector2(r0, 0));
  pts.push(new THREE.Vector2(r1, len));
  if (caps) for (let i = 1; i <= 3; i++) { const t = (i / 3) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(r1 * Math.cos(t), 1e-4), len + r1 * Math.sin(t))); }
  else pts.push(new THREE.Vector2(1e-4, len));
  const g = new THREE.LatheGeometry(pts, seg).toNonIndexed();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  g.translate(a[0], a[1], a[2]);
  return g;
}

// Auto-smooth: coincident vertices share a normal when their faces meet at less than `deg`.
function autoSmooth(g, deg = 40) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, n = P.length / 3;
  const F = new Float32Array(n * 3);
  for (let t = 0; t + 2 < n; t += 3) {
    const a = t * 3, ux = P[a + 3] - P[a], uy = P[a + 4] - P[a + 1], uz = P[a + 5] - P[a + 2], vx = P[a + 6] - P[a], vy = P[a + 7] - P[a + 1], vz = P[a + 8] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 3; k++) { F[a + k * 3] = nx; F[a + k * 3 + 1] = ny; F[a + k * 3 + 2] = nz; }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const k = Math.round(P[i * 3] * 2000) + ',' + Math.round(P[i * 3 + 1] * 2000) + ',' + Math.round(P[i * 3 + 2] * 2000);
    let a = groups.get(k); if (!a) { a = []; groups.set(k, a); } a.push(i);
  }
  const c = Math.cos(deg * Math.PI / 180);
  for (const idx of groups.values()) {
    for (const i of idx) {
      let sx = 0, sy = 0, sz = 0;
      for (const j of idx) {
        const d = F[i * 3] * F[j * 3] + F[i * 3 + 1] * F[j * 3 + 1] + F[i * 3 + 2] * F[j * 3 + 2];
        if (d >= c) { sx += F[j * 3]; sy += F[j * 3 + 1]; sz += F[j * 3 + 2]; }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      N[i * 3] = sx / l; N[i * 3 + 1] = sy / l; N[i * 3 + 2] = sz / l;
    }
  }
  g.attributes.normal.needsUpdate = true;
  return g;
}

// Box-projected UVs (per triangle, from the dominant face axis): textures stay the same density on
// every part. k = UV units per inch.
function boxUV(g, k = 1 / 2.6, ox = 0.13, oy = 0.29) {
  const p = g.attributes.position.array, n = p.length / 3, uv = new Float32Array(n * 2);
  for (let t = 0; t + 2 < n; t += 3) {
    const a = t * 3, ux = p[a + 3] - p[a], uy = p[a + 4] - p[a + 1], uz = p[a + 5] - p[a + 2], vx = p[a + 6] - p[a], vy = p[a + 7] - p[a + 1], vz = p[a + 8] - p[a + 2];
    const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
    for (let v = t; v < t + 3; v++) {
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
      let s, q;
      if (nx >= ny && nx >= nz) { s = z; q = y; } else if (ny >= nz) { s = x; q = z; } else { s = x; q = y; }
      uv[v * 2] = s * k + ox; uv[v * 2 + 1] = q * k + oy;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// Merge parts into one mesh; box-projected UVs unless keepUV (sleeves keep their wrist->elbow v).
function vmMesh(list, mat, keepUV = false) {
  const g = mergeGeos(list);
  if (!keepUV) boxUV(g);
  return new THREE.Mesh(g, mat);
}

// ------------------------------------------------------------------------------------------
// Hands and sleeves
// ------------------------------------------------------------------------------------------
// Palm / back of the hand: a rounded block (w across, h along the fingers, d thick).
function vmPalm(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { return xf(rbox(w, h, d, Math.min(w, d) * 0.42, 2), x, y, z, rx, ry, rz); }
// A gloved finger: knuckle a -> middle joint b -> tip c, with a knuckle bump.
function vmFinger(a, b, c, r = 0.31) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return [limb(a, m, r * 1.02, r, 9), limb(m, b, r, r * 0.96, 9), limb(b, c, r * 0.95, r * 0.8, 9)];
}
// Thumb from base a through b; fatter at the base.
const vmThumb = (a, b, r0, r1) => [limb(a, b, r0 * 1.05, r1, 9)];
// Sleeve: forearm from the wrist (a) to past the elbow (b), radius r0 -> r1, with a cuff at the
// wrist and soft folds. v runs wrist (0) -> elbow (1) for the sleeve texture.
function vmSleeve(a, b, r0, r1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = t * len;
    let r = lerp(r0, r1, Math.pow(t, 0.8));
    if (t < 0.08) r *= 1.12;                       // cuff
    else if (t < 0.11) r *= 1.02;
    r *= 1 + 0.035 * Math.sin(t * 19.0) * smoothstep(0.1, 0.3, t);  // folds
    pts.push(new THREE.Vector2(r, y));
  }
  pts.unshift(new THREE.Vector2(r0 * 0.9, -0.15)); pts.unshift(new THREE.Vector2(0.0001, -0.15));
  const g = new THREE.LatheGeometry(pts, 14).toNonIndexed();
  const uv = g.attributes.uv.array;   // v = 0 at the wrist end
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  g.translate(a[0], a[1], a[2]);
  for (let i = 1; i < uv.length; i += 2) uv[i] = clamp(uv[i], 0, 1);
  return g;
}
// Glove cuff/wrist between the hand and the sleeve.
const vmWrist = (a, b, r0, r1) => [limb(a, b, r0, r1, 12)];

// ------------------------------------------------------------------------------------------
// Materials, flash, model bookkeeping (unchanged interfaces)
// ------------------------------------------------------------------------------------------
function vmMaterials() {
  const T = R.textures;
  return {
    metal: new THREE.MeshPhongMaterial({ map: T.gun_metal, shininess: 52, specular: new THREE.Color(0.26, 0.26, 0.28) }),
    poly: new THREE.MeshPhongMaterial({ map: T.gun_poly, shininess: 18, specular: new THREE.Color(0.12, 0.12, 0.12) }),
    tan: new THREE.MeshPhongMaterial({ map: T.gun_tan, shininess: 12, specular: new THREE.Color(0.08, 0.08, 0.07) }),
    glove: new THREE.MeshLambertMaterial({ map: T.glove1 }),
    sleeve: new THREE.MeshLambertMaterial({ map: T.sleeve1 }),
    blade: new THREE.MeshPhongMaterial({ map: T.blade, shininess: 95, specular: new THREE.Color(0.75, 0.75, 0.78) }),
    nade: new THREE.MeshPhongMaterial({ map: T.nade, shininess: 22, specular: new THREE.Color(0.14, 0.14, 0.12) }),
    flash: new THREE.MeshBasicMaterial({ map: T.sprites, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1.0, 0.78, 0.45) }),
    wood: new THREE.MeshPhongMaterial({ map: T.gun_wood, shininess: 30, specular: new THREE.Color(0.14, 0.12, 0.1) }),
    shell: new THREE.MeshPhongMaterial({ color: 0x9c2a1c, shininess: 40, specular: new THREE.Color(0.2, 0.15, 0.15) }),
    brass: new THREE.MeshPhongMaterial({ color: 0xc89a4c, shininess: 70, specular: new THREE.Color(0.5, 0.42, 0.3) }),
    putty: new THREE.MeshLambertMaterial({ color: 0xb8a67a }),
    tape: new THREE.MeshLambertMaterial({ color: 0x3a3a38 }),
    wireR: new THREE.MeshLambertMaterial({ color: 0xa8281c }), wireB: new THREE.MeshLambertMaterial({ color: 0x24509c }),
    screen: new THREE.MeshBasicMaterial({ color: 0x6ee88a }), led: new THREE.MeshBasicMaterial({ color: 0xff3020 }),
    lens: new THREE.MeshPhongMaterial({ color: 0x3a6a78, shininess: 120, specular: new THREE.Color(0.7, 0.75, 0.8), transparent: true, opacity: 0.55 }),
    band: new THREE.MeshLambertMaterial({ color: 0x3f9a4c }),
  };
}

function vmFlash(M, y, z) {
  const star = new THREE.PlaneGeometry(1, 1), uvA = star.attributes.uv;
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, 0.5 + uvA.getX(i) * 0.5, uvA.getY(i) * 0.5);
  const g = new THREE.Group();
  const f1 = new THREE.Mesh(star, M.flash);
  const f2 = new THREE.Mesh(star, M.flash); f2.rotation.y = Math.PI / 2; f2.scale.set(2.4, 1, 1); f2.position.z = -0.9;
  const f3 = new THREE.Mesh(star, M.flash); f3.rotation.x = Math.PI / 2; f3.rotation.z = Math.PI / 2; f3.scale.set(2.4, 1, 1); f3.position.z = -0.9;
  g.add(f1, f2, f3); g.position.set(0, y, z); g.visible = false;
  return g;
}

function vmModel(id, base) {
  return { id, base, root: new THREE.Group(), parts: {}, rest: {}, anchors: {}, flash: null, hidden: [], tris: 0 };
}
function vmPart(m, name, group, parent) {
  (parent || m.root).add(group);
  m.parts[name] = group;
  m.rest[name] = { p: group.position.clone(), r: group.rotation.clone() };
  return group;
}
function vmAnchor(m, name, x, y, z, parent) { const o = new THREE.Object3D(); o.position.set(x, y, z); (parent || m.root).add(o); m.anchors[name] = o; return o; }
function vmCount(m) { m.root.traverse((o) => { if (o.isMesh && o.material.blending !== THREE.AdditiveBlending) m.tris += o.geometry.attributes.position.count / 3; }); }

// Picatinny rail along Z (top at yTop) from z0 to z1.
function vmRail(yTop, z0, z1, w = 0.86, x = 0) {
  const parts = [rb(w, 0.2, z1 - z0, x, yTop - 0.16, (z0 + z1) / 2, 0.05)];
  for (let z = z0 + 0.2; z < z1 - 0.15; z += 0.52) parts.push(rb(w + 0.04, 0.12, 0.28, x, yTop - 0.06, z + 0.14, 0.03));
  return parts;
}
// Rows of small screws/pins on the side of a part.
const vmPins = (pts, r = 0.09, x = 0.58) => pts.map(([y, z]) => cylz(r, 0.12, 10, 0, 0, 0, 0.02).rotateY(Math.PI / 2).translate(x, y, z));

// ------------------------------------------------------------------------------------------
// Shared hands for the long guns: firing hand on a pistol grip at (0, -2.2, 3.15), support hand
// cupping a handguard (origin on the handguard axis).
// ------------------------------------------------------------------------------------------
function vmRifleHandGeo() {
  const h = [vmPalm(0.66, 2.35, 1.85, 0.74, -2.05, 3.45, -0.32), vmPalm(1.36, 1.0, 2.0, 0.42, -0.95, 3.95, -0.32),
    ...vmThumb([0.62, -1.28, 2.75], [0.52, -1.3, 1.1], 0.31, 0.27), ...vmWrist([0.64, -3.0, 4.35], [1.15, -4.3, 5.6], 1.0, 1.04)];
  for (let i = 0; i < 3; i++) { const y = -1.8 - 0.62 * i, z = 2.45 + 0.2 * i; h.push(...vmFinger([0.72, y, z + 0.45], [0.2, y - 0.06, z - 0.12], [-0.42, y, z + 0.12])); }
  h.push(...vmFinger([0.75, -1.18, 2.85], [0.55, -1.2, 1.85], [0.55, -1.3, 1.25], 0.29));   // trigger finger along the guard
  return h;
}
function vmRifleHand(M) {
  const g = new THREE.Group();
  g.add(vmMesh(vmRifleHandGeo(), M.glove), vmMesh([vmSleeve([1.05, -4.1, 5.3], [3.9, -11.2, 14.4], 1.14, 1.55)], M.sleeve, true));
  return g;
}
function vmSupportHand(M) {
  const lh = [vmPalm(1.8, 0.85, 3.05, 0.15, -1.3, 0, Math.PI / 2), vmPalm(1.55, 1.25, 1.65, 0.0, -1.55, 1.8),
    ...vmThumb([-0.7, -1.2, 0.8], [-1.12, -0.25, -0.65], 0.32, 0.28), ...vmWrist([-0.1, -1.75, 2.1], [-0.85, -2.75, 3.45], 1.02, 1.05)];
  for (let i = 0; i < 4; i++) { const z = -1.2 + i * 0.74; lh.push(...vmFinger([0.82, -1.18, z], [1.12, -0.18, z], [0.84, 0.62, z - 0.05], 0.3)); }
  const g = new THREE.Group();
  g.add(vmMesh(lh, M.glove), vmMesh([vmSleeve([-0.75, -2.6, 3.2], [-9.2, -8.9, 11.9], 1.16, 1.8)], M.sleeve, true));
  return g;
}

// ------------------------------------------------------------------------------------------
// Kestrel AR: flat-top rifle, free-float octagonal handguard, adjustable stock, curved mag.
// ------------------------------------------------------------------------------------------
function buildRifleVM(M) {
  const m = vmModel('rifle', { x: 6.2, y: -6.0, z: -18.5, rx: 0.06, ry: 0.075, rz: -0.12 });
  const metal = [
    // upper receiver with a brass deflector and forward assist
    prof([[-4.9, 0.02], [5.85, 0.02], [5.85, 1.0], [5.2, 1.12], [-4.9, 1.12]], 1.14, 0.1),
    rb(0.36, 0.5, 0.9, 0.6, 0.75, 2.35, 0.12), cylz(0.2, 0.95, 12, 0.62, 0.62, 3.25),
    // lower receiver: magwell, trigger area, grip mount
    prof([[-3.35, 0.02], [-3.45, -1.62], [-0.3, -1.62], [-0.1, -0.95], [2.0, -0.95], [2.45, -1.3], [4.0, -1.3], [4.35, -0.62], [5.7, -0.62], [5.7, 0.02]], 1.04, 0.1),
    rb(1.16, 0.18, 3.3, 0, -1.6, -1.9, 0.06),                                     // magwell flare
    // trigger guard and trigger
    rb(0.24, 0.16, 2.6, 0, -1.52, 1.3, 0.06), rb(0.2, 0.62, 0.2, 0, -1.25, 0.08, 0.06),
    prof([[0.0, 0.0], [0.15, -0.75], { q: [0.05, -0.95, -0.2, -0.9] }, [-0.12, -0.7], [-0.1, 0.0]], 0.18, 0.05, 0).translate(0, -0.9, 1.25),
    // selector, bolt catch, pins
    rb(0.08, 0.2, 0.62, 0.58, -0.28, 3.4, 0.03), rb(0.07, 0.62, 0.32, -0.55, -0.5, -0.1, 0.03),
    ...vmPins([[-0.45, 3.05], [-0.45, 0.4], [0.45, -3.9]], 0.1, 0.56), ...vmPins([[-0.45, 3.05], [-0.45, 0.4], [0.45, -3.9]], 0.1, -0.56),
    // top rail over receiver and handguard
    ...vmRail(1.46, -12.7, 5.55),
    // charging handle
    rb(0.62, 0.22, 0.9, 0, 1.0, 6.1, 0.06), rb(1.4, 0.2, 0.42, 0, 1.0, 6.45, 0.08),
    // buffer tube
    cylz(0.55, 4.2, 18, 0, 0.55, 7.6), rb(1.3, 0.45, 0.35, 0, 0.42, 5.85, 0.1),
    // barrel, gas block, gas tube
    lathe([[0.0, -18.6], [0.3, -18.6], [0.31, -18.5], [0.33, -14.0], [0.36, -12.6], [0.36, -12.2], [0.0, -12.2]], 18, 0, 0.5),
    rb(0.7, 0.62, 1.1, 0, 0.55, -12.85, 0.1), cylz(0.12, 1.4, 8, 0, 1.0, -11.9),
    // folding front sight: base, post with protective ears
    prof([[-13.0, 1.2], [-11.9, 1.2], [-12.1, 1.55], [-12.8, 1.55]], 0.62, 0.06),
    rb(0.12, 0.5, 0.14, 0, 1.75, -12.45, 0.03), rb(0.1, 0.62, 0.42, 0.28, 1.72, -12.45, 0.04), rb(0.1, 0.62, 0.42, -0.28, 1.72, -12.45, 0.04),
    // rear sight: base, ears, aperture ring (sight line y = 2.0)
    rb(0.72, 0.4, 0.82, 0, 1.64, 4.6, 0.08), rb(0.14, 0.5, 0.7, 0.27, 1.98, 4.6, 0.05), rb(0.14, 0.5, 0.7, -0.27, 1.98, 4.6, 0.05),
    ringz(0.13, 0.045, 0, 2.0, 4.6, 14), rb(0.1, 0.16, 0.2, 0, 1.86, 4.6, 0.03),
    // flash hider with slots cut round it
    lathe([[0.0, -20.45], [0.36, -20.45], [0.47, -20.3], [0.47, -18.9], [0.4, -18.55], [0.32, -18.5]], 18, 0, 0.5),
  ];
  const poly = [
    // pistol grip with finger grooves and a beavertail
    prof([[-0.62, 1.45], [-0.7, 0.85], { q: [-0.88, 0.62, -0.7, 0.35] }, { q: [-0.88, 0.08, -0.7, -0.2] }, { q: [-0.86, -0.48, -0.7, -0.78] },
      [-0.62, -1.42], [0.55, -1.5], [0.74, -0.9], [0.78, 0.6], { q: [0.95, 1.2, 0.72, 1.55] }], 0.98, 0.18).rotateX(-0.32).translate(0, -2.2, 3.15),
    // stock: adjustable body with cheek riser and rubber pad
    prof([[6.45, 0.95], [12.4, 1.15], [12.55, -1.25], [8.4, -1.0], [6.45, -0.15]], 1.18, 0.22),
    rb(0.86, 0.3, 3.2, 0, 1.22, 10.2, 0.14), rb(1.28, 2.6, 0.38, 0, -0.05, 12.7, 0.14),
    // ejection port (dark inset) and dust cover hinge
    rb(0.06, 0.48, 1.5, 0.585, 0.62, 0.45, 0.02), cylz(0.05, 1.6, 6, 0.6, 0.32, 0.45),
  ];
  // octagonal handguard with slots and an end ring
  const guard = new THREE.CylinderGeometry(0.98, 0.98, 9.0, 8, 1, false).toNonIndexed();
  guard.rotateX(Math.PI / 2); guard.rotateZ(Math.PI / 8); guard.translate(0, 0.45, -8.2);
  const tanParts = [guard, lathe([[0.0, -12.75], [0.92, -12.75], [1.0, -12.6], [1.0, -12.45], [0.0, -12.45]], 8).rotateZ(Math.PI / 8).translate(0, 0.45, 0)];
  const slots = [];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) slots.push(rb(0.08, 0.26, 1.15, s * 0.95, 0.45, -10.9 + i * 1.6, 0.04));
  for (let i = 0; i < 3; i++) slots.push(rb(0.26, 0.08, 1.15, 0, -0.5, -10.4 + i * 1.8, 0.04));
  m.root.add(vmMesh(metal, M.metal), vmMesh(poly.concat(slots), M.poly), vmMesh(tanParts, M.tan),
    vmMesh(vmRifleHandGeo(), M.glove), vmMesh([vmSleeve([1.05, -4.1, 5.3], [3.9, -11.2, 14.4], 1.14, 1.55)], M.sleeve, true));
  // curved polymer magazine with ribs and a base plate
  const magParts = [
    prof([[-1.02, 0.15], [1.02, 0.15], { q: [1.0, -1.9, 0.38, -3.9] }, [0.18, -4.25], [-1.9, -4.55], { q: [-1.32, -2.2, -1.02, 0.15] }], 0.95, 0.14),
    prof([[-2.1, -4.45], [0.32, -4.12], [0.36, -4.42], [-2.06, -4.8]], 1.06, 0.1),
  ];
  for (let i = 0; i < 4; i++) magParts.push(rb(1.0, 0.14, 2.1 - i * 0.05, 0, -0.55 - i * 0.82, -0.05 - i * 0.22, 0.06, 0.12 + i * 0.07));
  const mag = new THREE.Group(); mag.add(vmMesh(magParts, M.tan)); mag.position.set(0, -1.2, -1.5);
  vmPart(m, 'mag', mag);
  const left = vmSupportHand(M); left.position.set(0, 0.45, -9.0);
  vmPart(m, 'left', left);
  m.flash = vmFlash(M, 0.5, -20.9); m.root.add(m.flash); m.flashScale = 1;
  vmAnchor(m, 'muzzle', 0, 0.5, -20.6); vmAnchor(m, 'eject', 0.75, 0.62, 0.3);
  vmCount(m);
  return m;
}

// ------------------------------------------------------------------------------------------
// Wasp 9: striker pistol, serrated slide, three-dot sights, polymer frame with a stippled grip.
// ------------------------------------------------------------------------------------------
function buildPistolVM(M) {
  const m = vmModel('pistol', { x: 3.9, y: -5.1, z: -14.6, rx: 0.07, ry: 0.17, rz: -0.08 });
  // slide (group origin at (0, 0.95, -1.5)): profile with a sloped nose, sights on top
  const slideMetal = [
    prof([[-3.55, -0.55], [3.5, -0.55], [3.5, 0.48], [3.2, 0.58], [-3.1, 0.58], [-3.55, 0.25]], 1.0, 0.12),
    rb(0.16, 0.24, 0.32, 0, 0.7, -3.2, 0.04), rb(0.84, 0.28, 0.34, 0, 0.72, 3.15, 0.06),
    lathe([[0.0, -3.7], [0.26, -3.7], [0.3, -3.6], [0.3, -3.45], [0.0, -3.45]].sort((a, b) => a[1] - b[1]), 14, 0, -0.12),
  ];
  const slideDark = [rb(0.06, 0.46, 1.45, 0.5, 0.22, -0.2, 0.02), rb(0.26, 0.1, 0.26, -0.22, 0.88, 3.15, 0.03), rb(0.26, 0.1, 0.26, 0.22, 0.88, 3.15, 0.03),
    cylz(0.17, 0.12, 10, 0, 0.0, 0, 0.02).translate(0, -0.12, -3.72)];
  for (let i = 0; i < 7; i++) slideDark.push(rb(1.04, 0.72, 0.08, 0, -0.06, 2.0 + i * 0.2, 0.02));
  for (let i = 0; i < 4; i++) slideDark.push(rb(1.04, 0.6, 0.08, 0, -0.1, -2.6 + i * 0.2, 0.02));
  const dots = [cylz(0.045, 0.05, 8, 0, 0.78, -3.37), cylz(0.045, 0.05, 8, 0.2, 0.8, 2.97), cylz(0.045, 0.05, 8, -0.2, 0.8, 2.97)];
  const slide = new THREE.Group(); slide.add(vmMesh(slideMetal, M.metal), vmMesh(slideDark, M.poly), vmMesh(dots, M.screen)); slide.position.set(0, 0.95, -1.5);
  vmPart(m, 'slide', slide);
  const frame = [
    // dust cover with an accessory rail, trigger guard, grip
    prof([[-4.8, 0.45], [1.05, 0.45], [1.25, 0.1], [0.2, -0.3], [-1.5, -0.3], [-1.6, -0.12], [-4.8, -0.12]], 0.92, 0.1),
    prof([[-1.55, -0.2], [-1.75, -0.85], { q: [-1.6, -1.15, -0.95, -1.1] }, [0.45, -0.75], [0.45, -0.55], [-0.85, -0.85], { q: [-1.35, -0.9, -1.38, -0.2] }], 0.36, 0.08),
    prof([[0.45, 0.35], [0.25, -0.75], [-0.35, -3.25], [1.25, -3.6], { q: [1.55, -1.0, 1.85, 0.45] }, [1.55, 0.55]], 1.06, 0.16),
  ];
  for (let i = 0; i < 3; i++) frame.push(rb(0.82, 0.1, 0.28, 0, -0.18, -3.7 + i * 0.5, 0.03));
  const trig = [prof([[0.0, 0.0], [0.12, -0.55], { q: [0.02, -0.78, -0.18, -0.72] }, [-0.12, -0.45], [-0.1, 0.0]], 0.2, 0.05).translate(0, -0.18, -0.9),
    rb(0.08, 0.42, 0.06, 0, -0.42, -0.9, 0.02)];
  const hand = [vmPalm(0.62, 2.45, 1.8, 0.76, -1.55, 1.45, -0.3), vmPalm(1.4, 1.05, 1.95, 0.42, -0.42, 1.95, -0.3),
    ...vmThumb([-0.55, -0.15, 1.3], [-0.6, -0.05, -0.4], 0.31, 0.27), ...vmWrist([0.7, -2.6, 2.4], [1.1, -3.7, 3.5], 0.97, 1.0),
    ...vmFinger([0.62, -0.3, 0.5], [0.56, -0.28, -0.5], [0.4, -0.45, -1.05], 0.28)];
  for (let i = 0; i < 3; i++) { const y = -1.05 - 0.62 * i, z = 0.62 + 0.19 * i; hand.push(...vmFinger([0.72, y, z + 0.42], [0.16, y - 0.05, z - 0.16], [-0.46, y, z + 0.1])); }
  m.root.add(vmMesh(frame, M.poly), vmMesh(trig, M.metal), vmMesh(hand, M.glove),
    vmMesh([vmSleeve([1.05, -3.6, 3.4], [3.7, -9.9, 12.2], 1.12, 1.5)], M.sleeve, true));
  const mag = new THREE.Group();
  mag.add(vmMesh([rb(0.8, 3.1, 1.22, 0, -0.1, 0, 0.12)], M.metal), vmMesh([rb(1.1, 0.34, 1.62, 0, -1.78, 0.04, 0.12)], M.poly));
  mag.position.set(0, -1.65, 1.3); mag.rotation.x = -0.3;
  vmPart(m, 'mag', mag);
  const lh = [vmPalm(0.62, 2.15, 1.9, -0.8, -1.5, 1.2, -0.3), ...vmThumb([-0.62, -0.4, 0.9], [-0.62, -0.25, -0.9], 0.31, 0.27),
    ...vmWrist([-0.75, -2.5, 2.2], [-1.4, -3.5, 3.3], 0.97, 1.0)];
  for (let i = 0; i < 4; i++) { const y = -0.95 - 0.5 * i, z = 0.25 + 0.15 * i; lh.push(...vmFinger([-0.72, y, z + 0.5], [-0.1, y - 0.05, z - 0.2], [0.55, y, z - 0.05], 0.29)); }
  const left = new THREE.Group(); left.add(vmMesh(lh, M.glove), vmMesh([vmSleeve([-1.3, -3.4, 3.1], [-5.8, -9.7, 10.9], 1.12, 1.5)], M.sleeve, true));
  vmPart(m, 'left', left);
  m.flash = vmFlash(M, 0.85, -5.75); m.root.add(m.flash); m.flashScale = 0.62;
  vmAnchor(m, 'muzzle', 0, 0.85, -5.4); vmAnchor(m, 'eject', 0.6, 1.25, -1.6);
  vmCount(m);
  return m;
}

// ------------------------------------------------------------------------------------------
// Field knife: drop-point blade with a fuller, steel guard, ribbed grip, pommel.
// ------------------------------------------------------------------------------------------
function buildKnifeVM(M) {
  const m = vmModel('knife', { x: 5.4, y: -4.9, z: -13.2, rx: 0.32, ry: 0.55, rz: 0.15 });
  // blade in the YZ plane (z toward the tip at -7), ground edge below, spine above
  const bladePts = [[-0.25, 0.58], [-4.4, 0.58], { q: [-6.3, 0.55, -7.05, -0.2] }, { q: [-5.6, -0.55, -3.0, -0.62] }, [-0.25, -0.6]];
  const blade = prof(bladePts, 0.2, 0.08);
  // taper the edge: squeeze x toward the cutting edge (lower) and the tip
  const bp = blade.attributes.position.array;
  for (let i = 0; i < bp.length; i += 3) {
    const y = bp[i + 1], z = bp[i + 2], edge = smoothstep(0.1, -0.6, y), tip = smoothstep(-4.5, -7.0, z);
    bp[i] *= 1 - 0.85 * Math.max(edge, tip * 0.8);
  }
  blade.translate(0, -0.1, -0.35);
  autoSmooth(blade, 30);
  const fuller = [rb(0.205, 0.12, 2.8, 0, 0.18, -2.1, 0.05)];
  const knife = new THREE.Group();
  const grip = [lathe([[0.42, 0.35], [0.5, 0.6], [0.52, 1.3], [0.48, 2.0], [0.52, 2.8], [0.5, 3.6], [0.56, 4.1], [0.0, 4.35]], 14, 0, -0.1)];
  const rings = [];
  for (let i = 0; i < 5; i++) { const z = 0.9 + i * 0.62; rings.push(lathe([[0.0, z], [0.53, z], [0.56, z + 0.08], [0.53, z + 0.16], [0.0, z + 0.16]], 14, 0, -0.1)); }
  knife.add(vmMesh([blade], M.blade), vmMesh(fuller, M.metal),
    vmMesh([rb(0.42, 2.1, 0.36, 0, -0.1, 0.12, 0.1), lathe([[0.0, 4.3], [0.62, 4.32], [0.64, 4.6], [0.4, 4.82], [0.0, 4.86]], 14, 0, -0.1)], M.metal),
    vmMesh(grip.concat(rings), M.poly));
  vmPart(m, 'knife', knife);
  const hand = [vmPalm(0.68, 1.7, 3.05, 0.7, -0.2, 2.3, Math.PI / 2), vmPalm(1.0, 1.8, 3.15, 0.45, 0.1, 2.35, Math.PI / 2),
    ...vmThumb([0.2, 0.55, 3.2], [-0.35, 0.65, 1.4], 0.34, 0.29), ...vmWrist([0.5, -0.4, 4.3], [1.1, -1.4, 5.8], 0.97, 1.02)];
  for (let i = 0; i < 4; i++) {
    const z = 1.0 + i * 0.78;
    hand.push(...vmFinger([0.68, -0.55, z], [0.05, -0.85, z], [-0.6, -0.35, z + 0.05], 0.32), limb([-0.6, -0.35, z + 0.05], [-0.55, 0.25, z + 0.1], 0.27, 0.22, 8));
  }
  m.root.add(vmMesh(hand, M.glove), vmMesh([vmSleeve([1.0, -1.2, 5.5], [3.3, -7.3, 13.6], 1.12, 1.5)], M.sleeve, true));
  vmAnchor(m, 'tip', 0, -0.1, -6.9);
  vmCount(m);
  return m;
}

// ------------------------------------------------------------------------------------------
// Veil smoke: canister with crimped rims, spoon lever, fuse head and a pull ring.
// ------------------------------------------------------------------------------------------
function buildSmokeVM(M) {
  const m = vmModel('smoke', { x: 4.6, y: -4.4, z: -12.8, rx: 0.12, ry: 0.5, rz: 0.08 });
  const nade = new THREE.Group();
  const body = lathe([[0.0, -2.25], [1.1, -2.25], [1.2, -2.1], [1.2, 2.0], [1.12, 2.15], [0.0, 2.15]], 20).rotateX(-Math.PI / 2);
  nade.add(vmMesh([body], M.nade),
    vmMesh([lathe([[0.0, 2.1], [1.25, 2.1], [1.27, 2.25], [1.2, 2.4], [0.0, 2.4]], 20).rotateX(-Math.PI / 2),
      lathe([[0.0, -2.35], [1.17, -2.35], [1.22, -2.2], [1.17, -2.08], [0.0, -2.08]], 20).rotateX(-Math.PI / 2),
      cyly(0.56, 0.9, 14, 0, 2.8, 0), cyly(0.34, 0.35, 12, 0, 3.4, 0),
      prof([[0.1, 3.25], [1.35, 3.0], [1.45, 2.4], [1.34, -0.9], [1.18, -0.9], [1.26, 2.3], [1.2, 2.85], [0.1, 3.05]], 0.56, 0.06)], M.metal));
  vmPart(m, 'nade', nade);
  const pin = new THREE.Group();
  const ring = new THREE.TorusGeometry(0.5, 0.07, 8, 20).toNonIndexed(); ring.rotateY(Math.PI / 2); ring.translate(-0.95, 2.85, 0.25);
  pin.add(vmMesh([ring, rb(0.62, 0.08, 0.08, -0.6, 2.85, 0, 0.03)], M.metal));
  vmPart(m, 'pin', pin);
  const hand = [vmPalm(0.78, 2.85, 1.55, 1.15, 0.5, 0.75), ...vmThumb([-0.9, 1.3, 1.2], [-1.25, 2.0, 0.2], 0.33, 0.29), ...vmWrist([0.5, -1.2, 2.1], [1.4, -2.6, 3.6], 0.97, 1.02)];
  for (const y of [1.6, 0.8, 0, -0.8]) hand.push(...vmFinger([1.25, y, 0.9], [1.05, y - 0.05, -0.85], [-0.5, y, -1.25], 0.32));
  m.root.add(vmMesh(hand, M.glove), vmMesh([vmSleeve([1.3, -2.5, 3.4], [3.7, -9.1, 11.9], 1.12, 1.5)], M.sleeve, true));
  const lh = [vmPalm(0.72, 1.95, 1.8, -1.9, 2.4, 0.4), ...vmThumb([-1.65, 3.2, 0.2], [-1.05, 2.9, 0.25], 0.31, 0.27), ...vmWrist([-2.1, 1.5, 1.0], [-2.9, 0.4, 2.2], 0.97, 1.02)];
  for (let i = 0; i < 3; i++) lh.push(...vmFinger([-1.65, 2.6 - i * 0.55, 0.0], [-1.1, 2.5 - i * 0.55, -0.35], [-1.2, 2.45 - i * 0.55, 0.3], 0.29));
  const left = new THREE.Group(); left.add(vmMesh(lh, M.glove), vmMesh([vmSleeve([-2.8, 0.5, 2.0], [-8.8, -8.3, 9.3], 1.12, 1.5)], M.sleeve, true));
  vmPart(m, 'left', left);
  m.hidden = ['left'];
  vmCount(m);
  return m;
}

// ------------------------------------------------------------------------------------------
// Swift SMG: compact receiver, vented barrel shroud, side folding stock rods, straight mag.
// ------------------------------------------------------------------------------------------
function buildSmgVM(M) {
  const m = vmModel('smg', { x: 5.9, y: -5.7, z: -16.0, rx: 0.06, ry: 0.075, rz: -0.12 });
  const metal = [
    prof([[-3.8, -0.2], [4.2, -0.2], [4.2, 1.15], [3.6, 1.25], [-3.8, 1.25]], 1.12, 0.12),
    ...vmRail(1.425, -3.6, 3.9, 0.8),
    lathe([[0.0, -8.1], [0.55, -8.1], [0.6, -7.9], [0.6, -3.8], [0.0, -3.8]], 18, 0, 0.5),
    lathe([[0.0, -10.4], [0.26, -10.4], [0.28, -10.2], [0.26, -8.0], [0.0, -8.0]], 14, 0, 0.5),
    lathe([[0.0, -10.65], [0.32, -10.65], [0.37, -10.5], [0.37, -9.8], [0.3, -9.7], [0.0, -9.7]], 16, 0, 0.5),
    rb(0.3, 0.95, 0.32, 0, 1.2, -7.6, 0.06), rb(0.62, 0.3, 0.5, 0, 0.85, -7.6, 0.08), rb(0.1, 0.5, 0.36, 0.22, 1.4, -7.6, 0.03), rb(0.1, 0.5, 0.36, -0.22, 1.4, -7.6, 0.03),
    rb(0.7, 0.45, 0.7, 0, 1.6, 3.4, 0.08), rb(0.14, 0.36, 0.6, 0.22, 1.95, 3.4, 0.04), rb(0.14, 0.36, 0.6, -0.22, 1.95, 3.4, 0.04), ringz(0.12, 0.04, 0, 1.88, 3.4, 12),
    rb(0.22, 0.18, 2.3, 0, -1.48, 1.4, 0.06), rb(0.18, 0.62, 0.2, 0, -1.12, 1.15, 0.05),
    // folding stock: two rods, hinge block, butt plate
    cylz(0.13, 6.0, 10, 0.45, 0.62, 7.2), cylz(0.13, 6.3, 10, -0.45, 0.62, 7.2), rb(1.1, 0.55, 0.7, 0, 0.55, 4.45, 0.12),
    rb(1.22, 2.35, 0.36, 0, -0.15, 10.25, 0.14), rb(1.1, 0.3, 0.9, 0, 0.95, 10.0, 0.1),
    // charging handle (left) and ejection port (right)
    rb(0.5, 0.42, 1.25, -0.62, 0.75, -1.6, 0.12), rb(0.07, 0.55, 1.7, 0.58, 0.55, 0.5, 0.02),
    ...vmPins([[0.0, 2.6], [0.0, -2.8]], 0.1, 0.57), ...vmPins([[0.0, 2.6], [0.0, -2.8]], 0.1, -0.57),
  ];
  for (let i = 0; i < 5; i++) metal.push(rb(0.08, 0.34, 0.5, 0.6, 0.5, -4.4 - i * 0.72, 0.03), rb(0.08, 0.34, 0.5, -0.6, 0.5, -4.4 - i * 0.72, 0.03));
  const poly = [
    prof([[-0.62, 1.45], [-0.7, 0.85], { q: [-0.88, 0.62, -0.7, 0.35] }, { q: [-0.88, 0.08, -0.7, -0.2] }, { q: [-0.86, -0.48, -0.7, -0.78] },
      [-0.62, -1.42], [0.55, -1.5], [0.74, -0.9], [0.78, 0.6], { q: [0.95, 1.2, 0.72, 1.55] }], 0.98, 0.18).rotateX(-0.32).translate(0, -2.2, 3.15),
    prof([[-4.6, -0.2], [-1.2, -0.2], [-1.3, -0.95], [-4.4, -0.95]], 1.1, 0.16),
  ];
  m.root.add(vmMesh(metal, M.metal), vmMesh(poly, M.poly), vmRifleHand(M));
  const mag = new THREE.Group();
  mag.add(vmMesh([rb(0.82, 4.6, 1.3, 0, -1.9, 0, 0.14, 0.06), rb(0.98, 0.34, 1.46, 0, -4.25, 0.14, 0.12, 0.06),
    rb(0.86, 0.1, 1.2, 0, -0.6, -0.02, 0.03, 0.06), rb(0.86, 0.1, 1.2, 0, -1.6, 0.04, 0.03, 0.06)], M.metal));
  mag.position.set(0, -0.5, -0.7);
  vmPart(m, 'mag', mag);
  const left = vmSupportHand(M); left.position.set(0, 0.5, -5.6);
  vmPart(m, 'left', left);
  m.flash = vmFlash(M, 0.5, -11.0); m.root.add(m.flash); m.flashScale = 0.75;
  vmAnchor(m, 'muzzle', 0, 0.5, -10.7); vmAnchor(m, 'eject', 0.7, 0.6, 0.5);
  vmCount(m);
  return m;
}

// ------------------------------------------------------------------------------------------
// Bison 12: pump shotgun, ribbed barrel with a bead, tube magazine, ribbed wooden pump and stock.
// ------------------------------------------------------------------------------------------
function buildShotgunVM(M) {
  const m = vmModel('shotgun', { x: 6.0, y: -6.2, z: -18.0, rx: 0.05, ry: 0.07, rz: -0.12 });
  const metal = [
    prof([[-2.7, -0.42], [3.9, -0.42], [3.9, 1.05], [3.4, 1.32], [-2.4, 1.32], [-2.7, 1.1]], 1.26, 0.14),
    rb(0.7, 0.2, 6.2, 0, 1.4, 0.6, 0.06),
    lathe([[0.0, -19.95], [0.4, -19.95], [0.44, -19.8], [0.42, -17.0], [0.42, -2.7], [0.0, -2.7]], 18, 0, 0.85),
    rb(0.16, 0.08, 16.6, 0, 1.32, -11.3, 0.03),                     // vent rib
    lathe([[0.0, -15.4], [0.38, -15.4], [0.38, -2.7], [0.0, -2.7]], 16, 0, -0.18),
    lathe([[0.0, -15.95], [0.4, -15.95], [0.46, -15.8], [0.46, -15.2], [0.0, -15.1]], 16, 0, -0.18),
    prof([[-15.5, -0.2], [-14.9, -0.2], [-14.95, 0.95], [-15.45, 0.95]], 0.5, 0.06),
    cyly(0.09, 0.2, 8, 0, 1.42, -19.6), cylz(0.11, 0.24, 10, 0, 1.52, -19.6),          // bead (sight line y = 1.52)
    rb(0.24, 0.16, 2.3, 0, -1.48, 1.75, 0.06), rb(0.18, 0.62, 0.2, 0, -1.12, 1.5, 0.05),
    rb(0.08, 0.2, 0.62, 0.62, -0.1, 2.6, 0.03), ...vmPins([[0.6, 2.9], [0.6, -1.6]], 0.11, 0.63), ...vmPins([[0.6, 2.9], [0.6, -1.6]], 0.11, -0.63),
  ];
  const dark = [rb(0.07, 0.75, 2.5, 0.64, 0.55, -0.3, 0.02), rb(0.9, 0.08, 2.6, 0, -0.45, -0.4, 0.02)];
  const wood = [
    prof([[-0.62, 1.45], [-0.7, 0.85], { q: [-0.85, 0.3, -0.7, -0.25] }, [-0.62, -1.42], [0.55, -1.5], [0.74, -0.9], [0.78, 0.6], { q: [0.95, 1.2, 0.72, 1.55] }], 1.0, 0.2)
      .rotateX(-0.32).translate(0, -2.2, 3.15),
    prof([[3.8, 1.0], [11.0, 0.65], [11.25, -2.0], [8.0, -1.6], [5.0, -1.0], [3.8, -1.2]], 1.16, 0.25),
  ];
  const pad = [prof([[11.1, 0.75], [11.6, 0.72], [11.85, -2.05], [11.3, -2.08]], 1.22, 0.16)];
  m.root.add(vmMesh(metal, M.metal), vmMesh(dark, M.poly), vmMesh(wood, M.wood), vmMesh(pad, M.poly), vmRifleHand(M));
  const pumpGeo = [lathe([[0.0, -2.8], [0.6, -2.8], [0.72, -2.6], [0.72, 2.6], [0.6, 2.8], [0.0, 2.8]], 18)];
  for (let i = 0; i < 7; i++) pumpGeo.push(lathe([[0.0, -2.3 + i * 0.72], [0.74, -2.3 + i * 0.72], [0.79, -2.15 + i * 0.72], [0.74, -2.0 + i * 0.72], [0.0, -2.0 + i * 0.72]], 18));
  const pump = new THREE.Group(); pump.add(vmMesh(pumpGeo, M.wood)); pump.position.set(0, -0.18, -7.7);
  vmPart(m, 'pump', pump);
  const left = vmSupportHand(M); left.position.set(0, 0.0, -7.9);
  vmPart(m, 'left', left);
  const shell = new THREE.Group();
  shell.add(vmMesh([lathe([[0.0, -1.15], [0.33, -1.15], [0.36, -1.0], [0.36, 1.0], [0.0, 1.0]], 14)], M.shell),
    vmMesh([lathe([[0.0, 1.0], [0.37, 1.0], [0.39, 1.12], [0.39, 1.5], [0.0, 1.5]], 14)], M.brass));
  shell.position.set(0.15, -0.25, -0.4);
  vmPart(m, 'shell', shell, left);
  m.hidden = ['shell'];
  m.flash = vmFlash(M, 0.85, -20.4); m.root.add(m.flash); m.flashScale = 1.3;
  vmAnchor(m, 'muzzle', 0, 0.85, -20.0); vmAnchor(m, 'eject', 0.75, 0.6, -0.3);
  vmCount(m);
  return m;
}

// ------------------------------------------------------------------------------------------
// Osprey LR: bolt-action in a tan chassis, fluted barrel and brake, scope with turrets and rings.
// ------------------------------------------------------------------------------------------
function buildSniperVM(M) {
  const m = vmModel('sniper', { x: 6.6, y: -7.7, z: -20.5, rx: 0.05, ry: 0.07, rz: -0.1 });
  const metal = [
    lathe([[0.0, -4.1], [0.6, -4.1], [0.66, -3.9], [0.66, 4.6], [0.6, 4.85], [0.0, 4.85]], 20, 0, 0.45),    // round receiver
    lathe([[0.0, -24.5], [0.33, -24.5], [0.36, -20.0], [0.4, -5.5], [0.44, -4.2], [0.0, -4.2]], 18, 0, 0.55),
    lathe([[0.0, -26.8], [0.48, -26.8], [0.53, -26.6], [0.53, -24.6], [0.42, -24.4], [0.0, -24.4]], 18, 0, 0.55),
    // scope: tube, objective bell, ocular, turrets, rings
    lathe([[0.0, -7.6], [0.98, -7.6], [1.0, -7.4], [1.0, -6.2], [0.68, -5.2], [0.62, -4.6], [0.62, 3.2], [0.7, 3.6], [0.82, 4.0], [0.82, 5.7], [0.76, 5.75], [0.0, 5.75]], 24, 0, 2.75),
    cyly(0.42, 0.8, 16, 0, 3.55, -0.5), cyly(0.46, 0.18, 16, 0, 3.92, -0.5), cylz(0.38, 0.75, 16, 0, 0, 0).rotateY(Math.PI / 2).translate(0.72, 2.75, -0.5),
    lathe([[0.0, -3.6], [0.74, -3.6], [0.74, -2.8], [0.0, -2.8]], 18, 0, 2.75), lathe([[0.0, 1.6], [0.74, 1.6], [0.74, 2.4], [0.0, 2.4]], 18, 0, 2.75),
    rb(0.5, 1.25, 0.8, 0, 1.72, -3.2, 0.1), rb(0.5, 1.25, 0.8, 0, 1.72, 2.0, 0.1),
    ...vmRail(1.12, -4.0, 4.2, 0.7),
    rb(0.24, 0.16, 2.3, 0, -1.48, 1.75, 0.06), rb(0.18, 0.62, 0.2, 0, -1.12, 1.5, 0.05), rb(0.07, 0.58, 2.0, 0.64, 0.55, 1.0, 0.02),
  ];
  const ports = [];
  for (let i = 0; i < 6; i++) ports.push(rb(0.07, 0.1, 10.0, 0, 0.37, 0, 0.02).rotateZ(i * Math.PI / 3).translate(0, 0.55, -11.0));   // barrel flutes
  for (let i = 0; i < 3; i++) ports.push(rb(1.1, 0.16, 0.32, 0, 0.55, -26.2 + i * 0.6, 0.04));
  const stock = [
    prof([[-0.62, 1.45], [-0.7, 0.85], { q: [-0.88, 0.62, -0.7, 0.35] }, { q: [-0.88, 0.08, -0.7, -0.2] }, [-0.62, -1.42], [0.55, -1.5], [0.74, -0.9], [0.78, 0.6], { q: [0.95, 1.2, 0.72, 1.55] }], 0.98, 0.18)
      .rotateX(-0.32).translate(0, -2.2, 3.15),
    prof([[-13.6, 0.1], [4.6, 0.1], [4.6, -0.2], [5.2, -0.6], [12.8, -0.15], [12.95, -2.85], [10.4, -2.7], [7.6, -1.6], [4.4, -1.3], [-13.6, -1.0]], 1.24, 0.22),
    prof([[7.0, 0.32], [11.0, 0.7], [11.4, 1.15], [7.4, 0.75]], 0.92, 0.18),                      // cheek riser
    rb(1.28, 2.95, 0.4, 0, -1.4, 13.05, 0.16),
  ];
  m.root.add(vmMesh(metal, M.metal), vmMesh(ports, M.poly), vmMesh(stock, M.tan));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), new THREE.MeshBasicMaterial({ color: 0x1a2a2c }));
  lens.scale.setScalar(0.92); lens.position.set(0, 2.75, 5.71); m.root.add(lens);
  const bolt = new THREE.Group();
  bolt.add(vmMesh([limb([0, 0, 0], [1.7, -0.05, 0.1], 0.14, 0.13, 10), xf(new THREE.SphereGeometry(0.36, 14, 10).toNonIndexed(), 1.85, -0.05, 0.1),
    cylz(0.42, 2.6, 16, 0, 0, 0.6), lathe([[0.0, 1.85], [0.46, 1.85], [0.5, 2.0], [0.46, 2.3], [0.0, 2.35]], 16)], M.metal));
  bolt.position.set(0.5, 0.75, 2.4);
  vmPart(m, 'bolt', bolt);
  const mag = new THREE.Group(); mag.add(vmMesh([rb(0.9, 1.9, 2.5, 0, -0.85, 0, 0.14), rb(1.0, 0.28, 2.6, 0, -1.85, 0, 0.1)], M.poly)); mag.position.set(0, -0.8, -1.9);
  vmPart(m, 'mag', mag);
  vmPart(m, 'right', vmRifleHand(M));
  const left = vmSupportHand(M); left.position.set(0, 0.05, -9.8);
  vmPart(m, 'left', left);
  m.flash = vmFlash(M, 0.55, -27.4); m.root.add(m.flash); m.flashScale = 1.4;
  vmAnchor(m, 'muzzle', 0, 0.55, -27.0); vmAnchor(m, 'eject', 0.7, 0.6, 1.0);
  vmCount(m);
  return m;
}

// ------------------------------------------------------------------------------------------
// The charge: a taped brick with a keypad timer and wires, carried in both hands.
// ------------------------------------------------------------------------------------------
function buildChargeVM(M) {
  const m = vmModel('charge', { x: 2.6, y: -5.2, z: -11.5, rx: 0.68, ry: 0.1, rz: 0.02 });
  const brick = new THREE.Group();
  const keys = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) keys.push(rb(0.36, 0.14, 0.32, 0.15 + c * 0.5, 1.4, 0.2 + r * 0.42, 0.06));
  brick.add(vmMesh([rb(5.4, 1.5, 3.4, 0, 0, 0, 0.3)], M.putty),
    vmMesh([rb(5.5, 1.62, 0.45, 0, 0, -1.05, 0.12), rb(5.5, 1.62, 0.45, 0, 0, 1.05, 0.12), rb(0.45, 1.62, 3.5, -2.1, 0, 0, 0.12)], M.tape),
    vmMesh([rb(2.7, 0.62, 2.1, 0.65, 1.05, 0.05, 0.12), rb(0.9, 0.5, 0.9, -1.4, 1.0, -0.6, 0.1), cyly(0.16, 0.4, 10, -1.4, 1.35, -0.6)], M.poly),
    vmMesh([rb(1.3, 0.06, 0.6, 0.65, 1.38, -0.5, 0.02)], M.screen),
    vmMesh([limb([-1.0, 1.05, -0.3], [-0.6, 1.25, 0.6], 0.09, 0.09, 6), limb([-1.4, 1.2, -0.2], [-1.9, 0.8, 1.6], 0.09, 0.09, 6)], M.wireR),
    vmMesh([limb([-1.0, 1.0, 0.2], [-0.6, 1.2, 0.9], 0.09, 0.09, 6), limb([-1.2, 1.15, -0.9], [-2.3, 0.7, -1.4], 0.09, 0.09, 6)], M.wireB));
  brick.add(vmMesh(keys, M.metal));
  m.root.add(brick);
  const led = new THREE.Group(); led.add(vmMesh([rb(0.22, 0.14, 0.22, 1.75, 1.42, -0.55, 0.05)], M.led));
  vmPart(m, 'led', led);
  const rh = [vmPalm(1.8, 0.85, 2.6, 2.3, -1.05, 0.3), ...vmThumb([2.9, -0.6, 0.9], [3.0, 0.9, 0.5], 0.34, 0.3), ...vmWrist([2.4, -1.2, 1.4], [3.0, -2.6, 3.4], 0.97, 1.02)];
  for (let i = 0; i < 3; i++) { const z = -0.7 + i * 0.62; rh.push(...vmFinger([1.6, -1.0, z], [2.6, -1.25, z], [2.95, -0.4, z], 0.3)); }
  const right = new THREE.Group(); right.add(vmMesh(rh, M.glove), vmMesh([vmSleeve([2.9, -2.2, 2.8], [4.5, -8.7, 11.4], 1.12, 1.5)], M.sleeve, true));
  const finger = new THREE.Group(); finger.add(vmMesh(vmFinger([2.3, -0.7, -0.6], [1.7, 1.2, -0.4], [1.2, 1.55, 0.1], 0.3), M.glove));
  vmPart(m, 'right', right); vmPart(m, 'finger', finger, right);
  const lh = [vmPalm(1.8, 0.85, 2.6, -2.3, -1.05, 0.3), ...vmThumb([-2.9, -0.6, 0.9], [-3.0, 0.9, 0.5], 0.34, 0.3), ...vmWrist([-2.4, -1.2, 1.4], [-3.0, -2.6, 3.4], 0.97, 1.02)];
  for (let i = 0; i < 4; i++) { const z = -1.0 + i * 0.62; lh.push(...vmFinger([-1.6, -1.0, z], [-2.6, -1.25, z], [-2.95, -0.4, z], 0.3)); }
  const left = new THREE.Group(); left.add(vmMesh(lh, M.glove), vmMesh([vmSleeve([-2.9, -2.2, 2.8], [-5.5, -8.7, 11.4], 1.12, 1.5)], M.sleeve, true));
  vmPart(m, 'left', left);
  vmCount(m);
  return m;
}

// ------------------------------------------------------------------------------------------
// Attachments: the same mount points as the original (bore end, top rail, under the handguard);
// magazine additions ride on the 'mag' part. `ext` = how far a muzzle device moves the muzzle.
// ------------------------------------------------------------------------------------------
const VM_MOUNTS = {
  rifle: { bore: [0, 0.5, -20.45], r: 0.47, rail: [0, 1.46, -1.4], under: [0, -0.5, -12.2], laser: [0, -0.62, -6.4], supp: 6.6 },
  pistol: { bore: [0, 0.83, -5.1], r: 0.3, rail: [0, 1.525, 0.0], railPart: 'slide', under: [0, -0.18, -3.3], laser: [0, -0.2, -3.25], supp: 4.4 },
  smg: { bore: [0, 0.5, -10.65], r: 0.36, rail: [0, 1.425, -0.7], under: [0, -0.15, -7.9], laser: [0, -0.92, -3.6], supp: 5.6 },
  shotgun: { bore: [0, 0.85, -19.9], r: 0.42, rail: [0, 1.5, 0.6], laser: [0.62, 0.85, -14.2] },
  sniper: { bore: [0, 0.55, -26.8], r: 0.52, supp: 7.6 },
};

function vmBuildAttachments(m, M) {
  const mt = VM_MOUNTS[m.id];
  if (!mt) return;
  m.att = {}; m.attExt = {};
  const add = (id, group, parent) => { group.visible = false; (parent || m.root).add(group); m.att[id] = group; return group; };
  const [bx, by, bz] = mt.bore, r = mt.r;
  if (mt.supp) {
    // suppressor: tube with end caps, a knurled grip band and a vent ring
    const L = mt.supp, rr = Math.max(0.5, r + 0.2), z0 = bz + 0.7, g = new THREE.Group();
    g.add(vmMesh([lathe([[0.0, z0 - L], [rr - 0.06, z0 - L], [rr, z0 - L + 0.12], [rr, z0 - 0.15], [rr - 0.08, z0], [0.0, z0]], 22, bx, by)], M.poly),
      vmMesh([lathe([[0.0, z0 - 0.5], [rr + 0.04, z0 - 0.5], [rr + 0.05, z0 - 0.15], [0.0, z0 - 0.1]], 22, bx, by),
        lathe([[0.0, z0 - L - 0.02], [rr + 0.03, z0 - L - 0.02], [rr + 0.04, z0 - L + 0.3], [0.0, z0 - L + 0.3]], 22, bx, by),
        lathe([[0.0, z0 - L - 0.06], [r * 0.5, z0 - L - 0.06], [r * 0.5, z0 - L], [0.0, z0 - L]], 12, bx, by)], M.metal));
    for (let i = 0; i < 6; i++) g.add(vmMesh([lathe([[0.0, z0 - 1.4 - i * 0.22], [rr + 0.02, z0 - 1.4 - i * 0.22], [rr + 0.03, z0 - 1.3 - i * 0.22], [0.0, z0 - 1.3 - i * 0.22]], 22, bx, by)], M.metal));
    add('hush', g); m.attExt.hush = L - 0.7;
  }
  {
    // compensator: a short cylinder with three side ports each side and a top port
    const g = new THREE.Group(), rr = r + 0.1, z0 = bz - 0.55;
    g.add(vmMesh([lathe([[0.0, z0 - 0.8], [rr - 0.05, z0 - 0.8], [rr, z0 - 0.7], [rr, z0 + 0.8], [0.0, z0 + 0.8]], 18, bx, by)], M.metal));
    const ports = [];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) ports.push(rb(0.08, rr * 0.9, 0.24, s * (rr - 0.02), by + rr * 0.1, z0 - 0.45 + i * 0.38, 0.03));
    ports.push(rb(rr * 1.1, 0.08, 0.3, 0, by + rr - 0.02, z0 - 0.2, 0.03));
    g.add(vmMesh(ports, M.tape));
    add('brake', g); m.attExt.brake = 1.1;
  }
  if (m.id === 'shotgun') {
    const g = new THREE.Group();
    g.add(vmMesh([lathe([[0.0, bz - 0.75], [r + 0.08, bz - 0.75], [r + 0.08, bz + 0.25], [0.0, bz + 0.25]], 18, bx, by)], M.metal),
      vmMesh([lathe([[0.0, bz - 0.62], [r + 0.11, bz - 0.62], [r + 0.11, bz - 0.48], [0.0, bz - 0.48]], 18, bx, by)], M.tape));
    add('choke', g); m.attExt.choke = 0.65;
  }
  if (mt.rail) {
    const parent = mt.railPart ? m.parts[mt.railPart] : null, off = parent ? parent.position : null;
    const [rx, ry, rz] = off ? [mt.rail[0] - off.x, mt.rail[1] - off.y, mt.rail[2] - off.z] : mt.rail, k = m.id === 'pistol' ? 0.78 : 1;
    // reflex sight: low mount, hood, tilted lens, the dot
    const pip = new THREE.Group();
    pip.add(vmMesh([rb(0.64 * k, 0.3 * k, 1.5 * k, rx, ry + 0.15 * k, rz, 0.08 * k),
      prof([[rz - 0.65 * k, ry + 0.25 * k], [rz + 0.1 * k, ry + 0.25 * k], [rz + 0.0 * k, ry + 0.95 * k], [rz - 0.55 * k, ry + 0.95 * k]], 0.12, 0.04, 0.3 * k),
      prof([[rz - 0.65 * k, ry + 0.25 * k], [rz + 0.1 * k, ry + 0.25 * k], [rz + 0.0 * k, ry + 0.95 * k], [rz - 0.55 * k, ry + 0.95 * k]], 0.12, 0.04, -0.3 * k),
      rb(0.72 * k, 0.12 * k, 0.75 * k, rx, ry + 0.92 * k, rz - 0.25 * k, 0.05 * k)], M.poly),
      vmMesh([rb(0.5 * k, 0.5 * k, 0.04, rx, ry + 0.6 * k, rz - 0.42 * k, 0.015, -0.12)], M.lens),
      vmMesh([cylz(0.035, 0.04, 8, rx, ry + 0.58 * k, rz - 0.39 * k)], M.led));
    add('pip', pip, parent);
    if (m.id !== 'pistol') {
      // holographic sight: base with battery box, rectangular hood, two windows, the reticle
      const holo = new THREE.Group();
      holo.add(vmMesh([rb(0.82, 0.36, 2.3, rx, ry + 0.18, rz + 0.1, 0.08), rb(0.12, 1.0, 1.25, rx + 0.4, ry + 0.75, rz - 0.4, 0.05), rb(0.12, 1.0, 1.25, rx - 0.4, ry + 0.75, rz - 0.4, 0.05),
        rb(0.94, 0.14, 1.4, rx, ry + 1.27, rz - 0.4, 0.06), rb(0.52, 0.38, 0.62, rx, ry + 0.52, rz + 0.75, 0.08), cylz(0.12, 0.2, 10, rx + 0.3, ry + 0.55, rz + 1.1)], M.poly),
        vmMesh([rb(0.7, 0.8, 0.04, rx, ry + 0.78, rz - 0.95, 0.015)], M.lens), vmMesh([rb(0.6, 0.6, 0.04, rx, ry + 0.78, rz + 0.2, 0.015)], M.lens),
        vmMesh([ringz(0.09, 0.012, rx, ry + 0.78, rz - 0.93, 16), rb(0.025, 0.025, 0.03, rx, ry + 0.78, rz - 0.93, 0.008)], M.led));
      add('halo', holo);
    }
  }
  const mag = m.parts.mag;
  const magAdd = {
    rifle: { ext: [rb(0.95, 1.3, 2.05, 0, -4.95, -1.25, 0.14, 0.32), rb(1.05, 0.26, 2.25, 0, -5.62, -1.45, 0.1, 0.32)], loop: [0, -4.75, -1.1, 0.32], band: [0, -2.0, 0.08, 0.12, 0.99, 2.16] },
    pistol: { ext: [rb(0.82, 0.9, 1.27, 0, -2.2, 0.04, 0.12), rb(1.12, 0.3, 1.66, 0, -2.72, 0.04, 0.1)], loop: [0, -2.05, 0.04, 0], band: [0, -1.25, 0.0, 0, 0.84, 1.29] },
    smg: { ext: [rb(0.84, 1.5, 1.32, 0, -4.95, 0.18, 0.12, 0.06), rb(0.98, 0.32, 1.45, 0, -5.75, 0.22, 0.1, 0.06)], loop: [0, -4.5, 0.16, 0.06], band: [0, -2.6, 0.0, 0.06, 0.86, 1.34] },
    sniper: { ext: [rb(0.92, 0.85, 2.52, 0, -2.2, 0, 0.12)], loop: [0, -1.95, 0, 0], band: [0, -1.1, 0, 0, 0.94, 2.54] },
  }[m.id];
  if (magAdd && mag) {
    add('extmag', new THREE.Group().add(vmMesh(magAdd.ext, M.metal)), mag);
    const [lx, ly, lz, lr] = magAdd.loop;
    add('quick', new THREE.Group().add(vmMesh([limb([0, 0, -0.32], [0, -0.5, -0.32], 0.08, 0.08, 6), limb([0, 0, 0.32], [0, -0.5, 0.32], 0.08, 0.08, 6),
      limb([0, -0.5, -0.32], [0, -0.5, 0.32], 0.09, 0.09, 6)].map((g) => g.rotateX(lr).translate(lx, ly, lz)), M.wireR)), mag);
    const [cx, cy, cz, cr, w, d] = magAdd.band;
    add('hollow', new THREE.Group().add(vmMesh([rb(w, 0.28, d, cx, cy, cz, 0.04, cr)], M.band)), mag);
  }
  if (m.id === 'shotgun') {
    add('extmag', new THREE.Group().add(vmMesh([lathe([[0.0, -18.8], [0.38, -18.8], [0.38, -15.8], [0.0, -15.8]], 16, 0, -0.18)], M.metal),
      vmMesh([lathe([[0.0, -19.3], [0.44, -19.3], [0.47, -19.1], [0.47, -18.6], [0.0, -18.6]], 16, 0, -0.18), rb(0.5, 1.3, 0.4, 0, 0.33, -16.2, 0.1)], M.poly)));
    const shells = [];
    for (let i = 0; i < 4; i++) shells.push(lathe([[0.0, -0.65], [0.31, -0.65], [0.33, -0.5], [0.33, 0.65], [0.0, 0.65]], 12).rotateX(-Math.PI / 2).translate(0.72, -0.1, -1.9 + i * 0.76));
    const sad = new THREE.Group();
    sad.add(vmMesh([rb(0.12, 1.15, 3.4, 0.68, 0.05, -0.75, 0.05)], M.poly), vmMesh(shells, M.shell));
    add('quick', sad);
  }
  if (mt.under && (m.id === 'rifle' || m.id === 'smg')) {
    // vertical grip with finger ridges and a cap
    const [ux, uy, uz] = mt.under, gp = [];
    for (let i = 0; i <= 8; i++) { const y = -i * 0.29; gp.push([0.4 + 0.035 * Math.sin(i * 2.2), y]); }
    const gg = new THREE.LatheGeometry(gp.map(([rr, y]) => new THREE.Vector2(rr, y)), 16).toNonIndexed().translate(ux, uy - 0.1, uz);
    add('grip', new THREE.Group().add(vmMesh([gg, rb(0.72, 0.3, 1.3, ux, uy - 0.1, uz, 0.1)], M.poly),
      vmMesh([cyly(0.45, 0.24, 16, ux, uy - 2.45, uz)], M.metal)));
  }
  if (mt.laser) {
    const [lx, ly, lz] = mt.laser, g = new THREE.Group(), side = m.id === 'shotgun';
    g.add(vmMesh(side ? [rb(0.5, 0.55, 1.7, lx + 0.18, ly, lz, 0.1)] : [rb(0.6, 0.55, 1.7, lx, ly - 0.25, lz, 0.1), rb(0.4, 0.2, 1.2, lx, ly + 0.05, lz, 0.05)], M.poly),
      vmMesh([side ? cylz(0.1, 0.06, 10, lx + 0.18, ly + 0.05, lz - 0.86) : cylz(0.1, 0.06, 10, lx, ly - 0.25, lz - 0.86)], M.led));
    add('laser', g);
  }
  if (m.id === 'pistol') {
    const st = new THREE.Group();
    st.add(vmMesh([rb(0.05, 2.6, 1.3, 0.55, -1.75, 1.32, 0.02, -0.3), rb(0.05, 2.6, 1.3, -0.55, -1.75, 1.32, 0.02, -0.3)], M.tape));
    add('stipple', st);
  }
}
