// Effects: bullet-hole decals, billboard particles, short-lived dynamic lights.

const DECAL_VS = `varying vec2 vUv; varying float vDepth;
void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
const DECAL_FS = `uniform sampler2D map; uniform float fogDensity; varying vec2 vUv; varying float vDepth;
void main() {
  vec3 c = texture2D(map, vUv).rgb;
  float f = 1.0 - exp(-fogDensity * fogDensity * vDepth * vDepth);
  gl_FragColor = vec4(mix(c, vec3(0.5), clamp(f, 0.0, 1.0)), 1.0);
}`;

// Ring buffer of decals; each slot holds up to 6 triangles (clipped octagon fan).
class DecalSet {
  constructor(max, parent) {
    this.max = max; this.next = 0; this.vpd = 18;
    this.pos = new Float32Array(max * this.vpd * 3);
    this.uv = new Float32Array(max * this.vpd * 2);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aUv = new THREE.BufferAttribute(this.uv, 2); this.aUv.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('uv', this.aUv);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: R.textures.decals }, fogDensity: R.u.fogDensity },
      vertexShader: DECAL_VS, fragmentShader: DECAL_FS,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
  }

  clear() { this.pos.fill(0); this.aPos.needsUpdate = true; this.next = 0; }

  // p,n in the parent's space; clip = convex face polygon (same space) or null.
  add(px, py, pz, nx, ny, nz, size, cell, clip, rnd) {
    const ax = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let t1x = ny * ax[2] - nz * ax[1], t1y = nz * ax[0] - nx * ax[2], t1z = nx * ax[1] - ny * ax[0];
    const l = Math.hypot(t1x, t1y, t1z); t1x /= l; t1y /= l; t1z /= l;
    let t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x;
    const a = rnd() * TAU, c = Math.cos(a), s = Math.sin(a);
    const r1x = t1x * c + t2x * s, r1y = t1y * c + t2y * s, r1z = t1z * c + t2z * s;
    t2x = t2x * c - t1x * s; t2y = t2y * c - t1y * s; t2z = t2z * c - t1z * s;
    const h = size / 2, off = 0.12;
    let poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [
      px + (r1x * u + t2x * v) * h + nx * off, py + (r1y * u + t2y * v) * h + ny * off, pz + (r1z * u + t2z * v) * h + nz * off]);
    if (clip && clip.length >= 3) {
      let cx = 0, cy = 0, cz = 0;
      for (const v of clip) { cx += v[0]; cy += v[1]; cz += v[2]; }
      cx /= clip.length; cy /= clip.length; cz /= clip.length;
      for (let i = 0; i < clip.length && poly.length >= 3; i++) {
        const A = clip[i], B = clip[(i + 1) % clip.length];
        const ex = B[0] - A[0], ey = B[1] - A[1], ez = B[2] - A[2];
        let enx = ey * nz - ez * ny, eny = ez * nx - ex * nz, enz = ex * ny - ey * nx;
        const el = Math.hypot(enx, eny, enz); if (el < 1e-9) continue;
        enx /= el; eny /= el; enz /= el;
        if (enx * (cx - A[0]) + eny * (cy - A[1]) + enz * (cz - A[2]) > 0) { enx = -enx; eny = -eny; enz = -enz; }
        poly = clipPolygon(poly, enx, eny, enz, enx * A[0] + eny * A[1] + enz * A[2]);
      }
      if (poly.length < 3) return;
    }
    const slot = this.next; this.next = (this.next + 1) % this.max;
    const base = slot * this.vpd;
    const cu = cell & 1, cv = 1 - (cell >> 1);
    const uvOf = (v) => {
      const dx = v[0] - px, dy = v[1] - py, dz = v[2] - pz;
      const lu = clamp((dx * r1x + dy * r1y + dz * r1z) / size + 0.5, 0.01, 0.99);
      const lv = clamp((dx * t2x + dy * t2y + dz * t2z) / size + 0.5, 0.01, 0.99);
      return [(cu + lu) * 0.5, (cv + lv) * 0.5];
    };
    let vi = 0;
    for (let i = 1; i < poly.length - 1 && vi < this.vpd; i++) {
      for (const k of [0, i, i + 1]) {
        const v = poly[k], uv = uvOf(v), q = base + vi;
        this.pos[q * 3] = v[0]; this.pos[q * 3 + 1] = v[1]; this.pos[q * 3 + 2] = v[2];
        this.uv[q * 2] = uv[0]; this.uv[q * 2 + 1] = uv[1];
        vi++;
      }
    }
    for (; vi < this.vpd; vi++) { const q = base + vi; this.pos[q * 3] = this.pos[q * 3 + 1] = this.pos[q * 3 + 2] = 0; }
    this.aPos.needsUpdate = true; this.aUv.needsUpdate = true;
  }
}

const PART_VS = `
attribute vec2 corner; attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec4 iMisc;
uniform float fogDensity;
varying vec2 vUv; varying vec4 vCol; varying float vFog;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float size = iMisc.x; float rot = iMisc.y; float cell = iMisc.z; float stretch = iMisc.w;
  vec2 off;
  if (stretch > 0.0) {
    vec3 vv = mat3(viewMatrix) * iVel;
    vec2 d = vv.xy; float len = length(d);
    vec2 dir = len > 0.001 ? d / len : vec2(1.0, 0.0);
    vec2 perp = vec2(-dir.y, dir.x);
    off = dir * corner.x * (size + len * stretch) + perp * corner.y * size;
  } else {
    float c = cos(rot); float s = sin(rot);
    off = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * size;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  float cu = mod(cell, 2.0); float cv = 1.0 - floor(cell / 2.0);
  vUv = vec2(cu + (corner.x * 0.49 + 0.5), cv + (corner.y * 0.49 + 0.5)) * 0.5;
  vCol = iCol;
  float dist = -mv.z;
  vFog = clamp(1.0 - exp(-fogDensity * fogDensity * dist * dist), 0.0, 1.0);
}`;
const PART_FS = `
uniform sampler2D map; uniform vec3 fogColor; uniform float additive;
varying vec2 vUv; varying vec4 vCol; varying float vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vCol.a;
  if (a < 0.004) discard;
  vec3 c = t.rgb * vCol.rgb;
  if (additive > 0.5) c *= 1.0 - vFog; else c = mix(c, fogColor, vFog);
  gl_FragColor = vec4(c, a);
}`;

class Particles {
  constructor(max, additive, parent) {
    this.max = max; this.n = 0;
    this.s = new Float32Array(max * 20); // state per particle (see spawn)
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    geo.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(3); this.aVel = mk(3); this.aCol = mk(4); this.aMisc = mk(4);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iVel', this.aVel); geo.setAttribute('iCol', this.aCol); geo.setAttribute('iMisc', this.aMisc);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: R.textures.sprites }, fogColor: R.u.fogColor, fogDensity: R.u.fogDensity, additive: { value: additive ? 1 : 0 } },
      vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 3 : 2;
    parent.add(this.mesh);
  }

  // o: { p:[x,y,z], v:[x,y,z], life, s0, s1, c:[r,g,b], a0, a1, rot, spin, cell, grav, drag, stretch }
  spawn(o) {
    if (this.n >= this.max) return;
    const s = this.s, q = this.n++ * 20;
    s[q] = o.p[0]; s[q + 1] = o.p[1]; s[q + 2] = o.p[2];
    s[q + 3] = o.v[0]; s[q + 4] = o.v[1]; s[q + 5] = o.v[2];
    s[q + 6] = 0; s[q + 7] = o.life;
    s[q + 8] = o.s0; s[q + 9] = o.s1 ?? o.s0;
    s[q + 10] = o.c[0]; s[q + 11] = o.c[1]; s[q + 12] = o.c[2];
    s[q + 13] = o.a0 ?? 1; s[q + 14] = o.a1 ?? 0;
    s[q + 15] = o.rot ?? 0; s[q + 16] = o.spin ?? 0; s[q + 17] = o.cell ?? 0;
    s[q + 18] = o.grav ?? 0; s[q + 19] = (o.drag ?? 0) + (o.stretch ? 1000 : 0);
  }

  update(dt) {
    const s = this.s, P = this.aPos.array, V = this.aVel.array, C = this.aCol.array, M = this.aMisc.array;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const q = i * 20;
      s[q + 6] += dt;
      if (s[q + 6] >= s[q + 7]) continue;
      const dragPack = s[q + 19], stretch = dragPack >= 1000 ? 0.035 : 0, drag = dragPack >= 1000 ? dragPack - 1000 : dragPack;
      const k = Math.exp(-drag * dt);
      s[q + 3] *= k; s[q + 4] = s[q + 4] * k - s[q + 18] * dt; s[q + 5] *= k;
      s[q] += s[q + 3] * dt; s[q + 1] += s[q + 4] * dt; s[q + 2] += s[q + 5] * dt;
      s[q + 15] += s[q + 16] * dt;
      if (w !== i) { const d = w * 20; for (let j = 0; j < 20; j++) s[d + j] = s[q + j]; }
      const d = w * 20, t = s[d + 6] / s[d + 7];
      P[w * 3] = s[d]; P[w * 3 + 1] = s[d + 1]; P[w * 3 + 2] = s[d + 2];
      V[w * 3] = s[d + 3]; V[w * 3 + 1] = s[d + 4]; V[w * 3 + 2] = s[d + 5];
      C[w * 4] = s[d + 10]; C[w * 4 + 1] = s[d + 11]; C[w * 4 + 2] = s[d + 12]; C[w * 4 + 3] = lerp(s[d + 13], s[d + 14], t);
      M[w * 4] = lerp(s[d + 8], s[d + 9], Math.sqrt(t)); M[w * 4 + 1] = s[d + 15]; M[w * 4 + 2] = s[d + 17]; M[w * 4 + 3] = stretch;
      w++;
    }
    this.n = w;
    this.geo.instanceCount = w;
    if (w) { this.aPos.needsUpdate = this.aVel.needsUpdate = this.aCol.needsUpdate = this.aMisc.needsUpdate = true; }
  }
}

// ---------------------------------------------------------------------------
// Tracers: short glowing streaks racing from the muzzle to the impact point.
const TRACER_VS = `
attribute vec2 corner; attribute vec3 iA; attribute vec3 iB; attribute float iAlpha;
uniform float fogDensity;
varying float vU; varying float vV; varying float vA;
void main() {
  vec4 va = viewMatrix * vec4(iA, 1.0); vec4 vb = viewMatrix * vec4(iB, 1.0);
  vec2 d = vb.xy / max(-vb.z, 1.0) - va.xy / max(-va.z, 1.0);
  float l = length(d); vec2 dir = l > 1e-5 ? d / l : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  vec4 p = mix(va, vb, corner.x);
  float w = max(0.75, -p.z * 0.0032);
  p.xy += perp * corner.y * w;
  gl_Position = projectionMatrix * p;
  vU = corner.x; vV = corner.y;
  vA = iAlpha * (1.0 - clamp(1.0 - exp(-fogDensity * fogDensity * p.z * p.z), 0.0, 1.0));
}`;
const TRACER_FS = `uniform vec3 color; varying float vU; varying float vV; varying float vA;
void main() { float core = 1.0 - abs(vV); float a = vA * (0.2 + 0.8 * vU) * core; if (a < 0.003) discard; gl_FragColor = vec4(color * (1.0 + core), a); }`;

function quadInstGeo(cornerData) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
  geo.setAttribute('corner', new THREE.Float32BufferAttribute(cornerData, 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.instanceCount = 0;
  return geo;
}
function instAttr(geo, name, max, n) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n);
  a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a);
  return a;
}

class Tracers {
  constructor(max, parent) {
    this.max = max; this.list = [];
    this.geo = quadInstGeo([0, -1, 1, -1, 1, 1, 0, 1]);
    this.aA = instAttr(this.geo, 'iA', max, 3); this.aB = instAttr(this.geo, 'iB', max, 3); this.aAl = instAttr(this.geo, 'iAlpha', max, 1);
    const mat = new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(1.0, 0.8, 0.48) }, fogDensity: R.u.fogDensity },
      vertexShader: TRACER_VS, fragmentShader: TRACER_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(this.geo, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    parent.add(this.mesh);
  }
  spawn(s, e, speed = 6500, len = 170) {
    const dx = e[0] - s[0], dy = e[1] - s[1], dz = e[2] - s[2], dist = Math.hypot(dx, dy, dz);
    if (dist < 48) return;
    this.list.push({ s: s.slice(), d: [dx / dist, dy / dist, dz / dist], dist, travel: 0, speed, len });
    if (this.list.length > this.max) this.list.shift();
  }
  update(dt) {
    this.list = this.list.filter((t) => (t.travel += t.speed * dt) - t.len < t.dist);
    const A = this.aA.array, B = this.aB.array, AL = this.aAl.array;
    let n = 0;
    for (const t of this.list) {
      const head = Math.min(t.travel, t.dist), tail = clamp(t.travel - t.len, 0, t.dist);
      for (let k = 0; k < 3; k++) { A[n * 3 + k] = t.s[k] + t.d[k] * tail; B[n * 3 + k] = t.s[k] + t.d[k] * head; }
      AL[n] = 0.95; n++;
    }
    this.geo.instanceCount = n;
    if (n) this.aA.needsUpdate = this.aB.needsUpdate = this.aAl.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Shell casings: instanced brass cylinders with bounce physics; they settle and fade.
class Shells {
  constructor(max, parent) {
    this.max = max; this.list = []; this.tr = makeTrace(); this.dummy = new THREE.Object3D(); this.col = new THREE.Color();
    const mk = (len, r) => {
      const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, len, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      parent.add(m);
      return m;
    };
    this.mesh = { rifle: mk(1.75, 0.21), pistol: mk(0.78, 0.2), shotgun: mk(2.5, 0.36) };
    this.tint = { rifle: [0.84, 0.68, 0.38], pistol: [0.84, 0.68, 0.38], shotgun: [0.62, 0.12, 0.09] };
  }
  spawn(kind, p, v, light) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ kind, p: p.slice(), v: v.slice(), rot: [Math.random() * TAU, Math.random() * TAU, Math.PI / 2], spin: [18 + Math.random() * 20, 6, 10 + Math.random() * 12],
      rest: false, age: 0, bounces: 0, light: light.slice() });
  }
  update(dt, cw) {
    const tr = this.tr;
    for (const s of this.list) {
      s.age += dt;
      if (s.rest) continue;
      const v = s.v;
      v[1] -= 800 * dt;
      cw.trace(tr, s.p[0], s.p[1], s.p[2], s.p[0] + v[0] * dt, s.p[1] + v[1] * dt, s.p[2] + v[2] * dt, 0, 0, 0, MASK_SHOT);
      if (tr.fraction < 1 && !tr.startsolid) {
        s.p[0] = tr.ex + tr.nx * 0.25; s.p[1] = tr.ey + tr.ny * 0.25; s.p[2] = tr.ez + tr.nz * 0.25;
        const vn = v[0] * tr.nx + v[1] * tr.ny + v[2] * tr.nz;
        v[0] -= 1.4 * vn * tr.nx; v[1] -= 1.4 * vn * tr.ny; v[2] -= 1.4 * vn * tr.nz;
        v[0] *= 0.55; v[1] *= 0.55; v[2] *= 0.55; s.spin[0] *= 0.5; s.spin[2] *= 0.5;
        if (-vn > 45 && s.bounces < 3) { Snd.shell(s.p.slice(), s.kind, s.bounces, SURF_NAMES[tr.surf]); s.bounces++; }
        if (tr.ny > 0.7 && Math.hypot(v[0], v[1], v[2]) < 30) { s.rest = true; s.rot = [Math.PI / 2, Math.random() * TAU, 0]; s.p[1] = tr.ey + 0.2; }
      } else if (tr.startsolid) { s.rest = true; }
      else { s.p[0] += v[0] * dt; s.p[1] += v[1] * dt; s.p[2] += v[2] * dt; }
      if (!s.rest) { s.rot[0] += s.spin[0] * dt; s.rot[1] += s.spin[1] * dt; s.rot[2] += s.spin[2] * dt; }
    }
    this.list = this.list.filter((s) => s.age < 16);
    const counts = { rifle: 0, pistol: 0, shotgun: 0 }, d = this.dummy;
    for (const s of this.list) {
      const m = this.mesh[s.kind], i = counts[s.kind]++;
      const k = s.age > 14 ? Math.max(0.01, 1 - (s.age - 14) / 2) : 1;
      d.position.set(s.p[0], s.p[1], s.p[2]); d.rotation.set(s.rot[0], s.rot[1], s.rot[2], 'YXZ'); d.scale.setScalar(k);
      d.updateMatrix(); m.setMatrixAt(i, d.matrix);
      const c = this.tint[s.kind];
      m.setColorAt(i, this.col.setRGB(c[0] * s.light[0], c[1] * s.light[1], c[2] * s.light[2]));
    }
    for (const kind of Object.keys(this.mesh)) {
      const m = this.mesh[kind]; m.count = counts[kind];
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Smoke: large lit billboards from every active cloud, sorted back to front each frame.
const SMOKE_VS = `
attribute vec2 corner; attribute vec3 iPos; attribute vec4 iMisc; attribute vec3 iCol;
uniform float fogDensity;
varying vec2 vUv; varying vec3 vCol; varying float vA; varying float vFog;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float c = cos(iMisc.y); float s = sin(iMisc.y);
  mv.xy += vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * iMisc.x * 0.5;
  gl_Position = projectionMatrix * mv;
  float cu = mod(iMisc.w, 2.0); float cv = 1.0 - floor(iMisc.w / 2.0);
  vUv = vec2(cu + (corner.x * 0.49 + 0.5), cv + (corner.y * 0.49 + 0.5)) * 0.5;
  vCol = iCol;
  float dist = -mv.z;
  vA = iMisc.z * smoothstep(14.0, 75.0, dist);
  vFog = clamp(1.0 - exp(-fogDensity * fogDensity * dist * dist), 0.0, 1.0);
}`;
const SMOKE_FS = `uniform sampler2D map; uniform vec3 fogColor; varying vec2 vUv; varying vec3 vCol; varying float vA; varying float vFog;
void main() { vec4 t = texture2D(map, vUv); float a = t.a * vA; if (a < 0.004) discard; gl_FragColor = vec4(mix(vCol * t.rgb, fogColor, vFog * 0.6), a); }`;

class SmokeRenderer {
  constructor(max, parent) {
    this.max = max; this.items = []; this.n = 0;
    this.geo = quadInstGeo([-1, -1, 1, -1, 1, 1, -1, 1]);
    this.aPos = instAttr(this.geo, 'iPos', max, 3); this.aMisc = instAttr(this.geo, 'iMisc', max, 4); this.aCol = instAttr(this.geo, 'iCol', max, 3);
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: R.textures.smoke }, fogColor: R.u.fogColor, fogDensity: R.u.fogDensity },
      vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false, blending: THREE.NormalBlending });
    this.mesh = new THREE.Mesh(this.geo, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    parent.add(this.mesh);
    for (let i = 0; i < max; i++) this.items.push({ x: 0, y: 0, z: 0, size: 0, rot: 0, a: 0, v: 0, r: 0, g: 0, b: 0, depth: 0 });
  }
  update(clouds, cam) {
    const e = cam.matrixWorld.elements, fx = -e[8], fy = -e[9], fz = -e[10], cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    let n = 0;
    const items = this.items;
    for (const c of clouds) {
      c.each((x, y, z, size, rot, a, v, shade) => {
        if (n >= this.max || a <= 0.003) return;
        const it = items[n++];
        it.x = x; it.y = y; it.z = z; it.size = size; it.rot = rot; it.a = a; it.v = v;
        it.r = c.light[0] * shade; it.g = c.light[1] * shade; it.b = c.light[2] * shade;
        it.depth = (x - cx) * fx + (y - cy) * fy + (z - cz) * fz;
      });
    }
    const view = items.slice(0, n).sort((p, q) => q.depth - p.depth);
    const P = this.aPos.array, M = this.aMisc.array, C = this.aCol.array;
    view.forEach((it, i) => {
      P[i * 3] = it.x; P[i * 3 + 1] = it.y; P[i * 3 + 2] = it.z;
      M[i * 4] = it.size; M[i * 4 + 1] = it.rot; M[i * 4 + 2] = it.a; M[i * 4 + 3] = it.v;
      C[i * 3] = it.r; C[i * 3 + 1] = it.g; C[i * 3 + 2] = it.b;
    });
    this.geo.instanceCount = n; this.n = n;
    if (n) this.aPos.needsUpdate = this.aMisc.needsUpdate = this.aCol.needsUpdate = true;
  }
}

const DLights = {
  list: [],
  add(x, y, z, col, radius, life) {
    this.list.push({ x, y, z, col, radius, life, max: life });
    if (this.list.length > 12) this.list.shift();
  },
  update(dt) {
    const u = R.u;
    this.list = this.list.filter((l) => (l.life -= dt) > 0);
    const active = this.list.slice(-4);
    active.forEach((l, i) => {
      const k = l.life / l.max;
      u.dlPos.value[i].set(l.x, l.y, l.z);
      u.dlCol.value[i].set(l.col[0] * k, l.col[1] * k, l.col[2] * k);
      u.dlRad.value[i] = l.radius;
    });
    u.dlCount.value = active.length;
  },
};

const SURF_FX = {
  concrete: { cell: 0, dust: [0.62, 0.6, 0.56], chip: [0.36, 0.35, 0.33] },
  brick:    { cell: 0, dust: [0.64, 0.47, 0.38], chip: [0.46, 0.25, 0.17] },
  plaster:  { cell: 0, dust: [0.84, 0.78, 0.66], chip: [0.72, 0.66, 0.54] },
  tile:     { cell: 0, dust: [0.86, 0.85, 0.8], chip: [0.9, 0.89, 0.85] },
  wood:     { cell: 1, dust: [0.62, 0.5, 0.34], chip: [0.5, 0.36, 0.2] },
  paper:    { cell: 1, dust: [0.92, 0.91, 0.88], chip: [0.95, 0.94, 0.9] },
  metal:    { cell: 2, dust: [0.42, 0.42, 0.42], chip: [0.3, 0.3, 0.3], sparks: true },
  sand:     { cell: 3, dust: [0.8, 0.69, 0.5], chip: [0.7, 0.6, 0.42], puff: true },
  cloth:    { cell: 3, dust: [0.64, 0.56, 0.42], chip: [0.55, 0.47, 0.33], puff: true },
};

const FX = {
  decals: null, dust: null, sparks: null, rnd: mulberry32(77), probe: [0, 0, 0, 0],
  init(L) {
    this.L = L;
    this.decals = new DecalSet(320, R.scene);
    this.dust = new Particles(900, false, R.scene);
    this.sparks = new Particles(500, true, R.scene);
    this.tracers = new Tracers(48, R.scene);
    this.shells = new Shells(96, R.scene);
    this.smoke = new SmokeRenderer(200, R.scene);
  },

  // Light at a point (probe ambient + visible sun), for dynamic objects.
  lightAt(x, y, z, out) {
    const pr = sampleProbes(this.L.probes, x, y, z, this.probe), env = this.L.env, s = pr[3] * env.sunIntensity * 0.6;
    out[0] = pr[0] + env.sunColor[0] * s; out[1] = pr[1] + env.sunColor[1] * s; out[2] = pr[2] + env.sunColor[2] * s;
    return out;
  },

  muzzleSmoke(p, dir, heat) {
    const L = this.lightAt(p[0], p[1], p[2], [0, 0, 0]), k = (L[0] + L[1] + L[2]) / 3;
    const n = heat > 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.dust.spawn({ p: [p[0] + dir[0] * 4, p[1] + dir[1] * 4, p[2] + dir[2] * 4], v: [dir[0] * 30 + (Math.random() - 0.5) * 10, 10 + Math.random() * 14, dir[2] * 30 + (Math.random() - 0.5) * 10],
        life: 0.9 + Math.random() * 0.9, s0: 1.4, s1: 7 + heat * 7, c: [0.62 * k, 0.62 * k, 0.6 * k], a0: 0.14 + heat * 0.24, a1: 0, rot: Math.random() * TAU, spin: (Math.random() - 0.5), cell: 1, grav: -16, drag: 2.2 });
    }
  },

  // Impact at p with surface normal n. decalSet/clip optional (null = no decal).
  impact(p, n, surfId, decalSet, clip, decalP, decalN, decalScale = 1) {
    const name = SURF_NAMES[surfId] || 'concrete', S = SURF_FX[name] || SURF_FX.concrete, rnd = this.rnd;
    if (decalSet) {
      const dp = decalP || p, dn = decalN || n;
      decalSet.add(dp[0], dp[1], dp[2], dn[0], dn[1], dn[2], (S.cell === 3 ? 7 : 5.5 + rnd() * 1.5) * decalScale, S.cell, clip, rnd);
    }
    sampleProbes(this.L.probes, p[0], p[1], p[2], this.probe);
    const lum = clamp((this.probe[0] + this.probe[1] + this.probe[2]) / 3 + this.probe[3] * 0.9, 0.5, 1.4);
    const tint = (c, k = 1) => [c[0] * lum * k, c[1] * lum * k, c[2] * lum * k];
    const base = [p[0] + n[0] * 1.5, p[1] + n[1] * 1.5, p[2] + n[2] * 1.5];
    const rv = (m) => [(rnd() - 0.5) * m, (rnd() - 0.5) * m, (rnd() - 0.5) * m];
    const puffs = S.puff ? 4 : 2;
    for (let i = 0; i < puffs; i++) {
      const j = rv(40), sp = 25 + rnd() * (S.puff ? 70 : 40);
      this.dust.spawn({ p: base, v: [n[0] * sp + j[0], n[1] * sp + j[1] + (S.puff ? 25 : 6), n[2] * sp + j[2]], life: 0.55 + rnd() * 0.5,
        s0: 2.5 + rnd() * 2, s1: (S.puff ? 20 : 13) + rnd() * 6, c: tint(S.dust), a0: S.puff ? 0.75 : 0.6, a1: 0, rot: rnd() * TAU, spin: (rnd() - 0.5) * 2, cell: 1, grav: -12, drag: 3.2 });
    }
    const chips = S.sparks ? 2 : 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < chips; i++) {
      const j = rv(220), sp = 70 + rnd() * 140;
      this.dust.spawn({ p: base, v: [n[0] * sp + j[0], n[1] * sp + j[1] + 50, n[2] * sp + j[2]], life: 0.45 + rnd() * 0.4,
        s0: 0.5 + rnd() * 0.6, c: tint(S.chip, 0.9), a0: 1, a1: 1, cell: 0, grav: 700, drag: 0.6 });
    }
    if (S.cell === 0) {
      // hard masonry: a couple of quick sparks and a tiny flash so hits read in dark corners
      for (let i = 0; i < 3; i++) {
        const j = rv(300), sp = 140 + rnd() * 160;
        this.sparks.spawn({ p: base, v: [n[0] * sp + j[0], n[1] * sp + j[1] + 40, n[2] * sp + j[2]], life: 0.08 + rnd() * 0.12,
          s0: 0.35 + rnd() * 0.25, c: [1.0, 0.78, 0.45], a0: 0.9, a1: 0, cell: 2, grav: 400, drag: 1.5, stretch: true });
      }
      this.sparks.spawn({ p: base, v: [0, 0, 0], life: 0.05, s0: 3.5, s1: 4.5, c: [1, 0.85, 0.6], a0: 0.7, a1: 0, cell: 0 });
    }
    if (S.sparks) {
      const k = 6 + Math.floor(rnd() * 7);
      for (let i = 0; i < k; i++) {
        const j = rv(420), sp = 120 + rnd() * 260;
        this.sparks.spawn({ p: base, v: [n[0] * sp + j[0], n[1] * sp + j[1] + 60, n[2] * sp + j[2]], life: 0.12 + rnd() * 0.3,
          s0: 0.45 + rnd() * 0.35, c: [1.0, 0.72 + rnd() * 0.2, 0.32], a0: 1, a1: 0.2, cell: 2, grav: 520, drag: 1.2, stretch: true });
      }
      this.sparks.spawn({ p: base, v: [0, 0, 0], life: 0.07, s0: 5, s1: 7, c: [1, 0.8, 0.45], a0: 0.9, a1: 0, cell: 0 });
      DLights.add(base[0] + n[0] * 6, base[1] + n[1] * 6, base[2] + n[2] * 6, [0.9, 0.6, 0.25], 70, 0.08);
    }
  },

  blood(p, dir) {
    const L = this.lightAt(p[0], p[1], p[2], [0, 0, 0]), k = clamp((L[0] + L[1] + L[2]) / 3, 0.35, 1.2), c = [0.42 * k, 0.06 * k, 0.05 * k];
    for (let i = 0; i < 3; i++) {
      this.dust.spawn({ p, v: [dir[0] * 40 + (Math.random() - 0.5) * 50, 10 + Math.random() * 30, dir[2] * 40 + (Math.random() - 0.5) * 50], life: 0.35 + Math.random() * 0.3,
        s0: 1.5, s1: 6 + Math.random() * 4, c, a0: 0.7, a1: 0, rot: Math.random() * TAU, cell: 1, grav: 40, drag: 3 });
    }
    for (let i = 0; i < 5; i++) {
      this.dust.spawn({ p, v: [dir[0] * 120 + (Math.random() - 0.5) * 120, 40 + Math.random() * 80, dir[2] * 120 + (Math.random() - 0.5) * 120], life: 0.4 + Math.random() * 0.3,
        s0: 0.45 + Math.random() * 0.35, c, a0: 1, a1: 1, cell: 0, grav: 700, drag: 0.5 });
    }
  },

  // Muzzle flash seen from the outside (other players).
  // The charge going off: a white-hot core, textured fire puffs, sparks, a rising smoke column, a big light.
  explosion(p) {
    const rnd = this.rnd, fire = [[1, 0.52, 0.14], [1, 0.72, 0.3], [0.95, 0.3, 0.08], [1, 0.86, 0.5]];
    for (let i = 0; i < 4; i++) {
      this.sparks.spawn({ p: [p[0], p[1] + 20 + i * 10, p[2]], v: [0, 30, 0], life: 0.22 + i * 0.04, s0: 40, s1: 150, c: [1, 0.9, 0.7], a0: 1, a1: 0, cell: 0 });
    }
    for (let i = 0; i < 28; i++) {
      const a = rnd() * TAU, r = rnd() * 40, out = 150 + rnd() * 220, c = fire[i % 4];
      this.sparks.spawn({ p: [p[0] + Math.cos(a) * r, p[1] + 12 + rnd() * 50, p[2] + Math.sin(a) * r], v: [Math.cos(a) * out, 90 + rnd() * 160, Math.sin(a) * out],
        life: 0.45 + rnd() * 0.45, s0: 22 + rnd() * 16, s1: 75 + rnd() * 60, c, a0: 1, a1: 0, rot: rnd() * TAU, spin: (rnd() - 0.5) * 3, cell: 1, drag: 3.2, grav: -60 });
    }
    for (let i = 0; i < 50; i++) {
      const a = rnd() * TAU, e = rnd() * 0.9 + 0.1, sp = 500 + rnd() * 900;
      this.sparks.spawn({ p: [p[0], p[1] + 12, p[2]], v: [Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp], life: 0.5 + rnd() * 0.7,
        s0: 2.2, s1: 1.2, c: [1, 0.7, 0.35], a0: 1, a1: 0.2, cell: 0, grav: 600, drag: 0.8, stretch: true });
    }
    const L = this.lightAt(p[0], p[1] + 60, p[2], [0, 0, 0]), lk = (L[0] + L[1] + L[2]) / 3;
    for (let i = 0; i < 30; i++) {
      const a = rnd() * TAU, r = rnd() * 55, k = (0.16 + rnd() * 0.1) * clamp(lk * 1.4, 0.5, 1.2);
      this.dust.spawn({ p: [p[0] + Math.cos(a) * r, p[1] + 20 + rnd() * 70, p[2] + Math.sin(a) * r], v: [Math.cos(a) * 45, 70 + rnd() * 110, Math.sin(a) * 45], life: 4.5 + rnd() * 3,
        s0: 38 + rnd() * 22, s1: 130 + rnd() * 80, c: [k * 1.05, k, k * 0.95], a0: 0.95, a1: 0, rot: rnd() * TAU, spin: (rnd() - 0.5) * 0.3, cell: 1, grav: -22, drag: 0.85 });
    }
    DLights.add(p[0], p[1] + 60, p[2], [1.0, 0.62, 0.3], 1500, 0.9);
  },

  worldFlash(p, dir, scale) {
    this.sparks.spawn({ p: [p[0] + dir[0] * 2, p[1] + dir[1] * 2, p[2] + dir[2] * 2], v: [0, 0, 0], life: 0.05, s0: 7 * scale, s1: 9 * scale, c: [1, 0.78, 0.45], a0: 1, a1: 0.4, rot: Math.random() * TAU, cell: 3 });
    this.sparks.spawn({ p, v: [0, 0, 0], life: 0.07, s0: 10 * scale, s1: 13 * scale, c: [1, 0.6, 0.3], a0: 0.5, a1: 0, cell: 0 });
  },

  update(dt) {
    this.dust.update(dt); this.sparks.update(dt); this.tracers.update(dt);
    this.shells.update(dt, this.L.cw); this.smoke.update(Grenades.clouds, R.camera);
    DLights.update(dt);
  },
};
