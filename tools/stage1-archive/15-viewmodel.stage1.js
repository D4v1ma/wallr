// First-person viewmodel: low-poly rifle + gloved hands, rendered in its own pass.
// Gun space: -Z toward the muzzle, +Y up, +X right; units ~ inches.

function vmBox(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}
function vmCyl(r, len, seg, x, y, z, rx = 0) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.rotateX(Math.PI / 2 + rx);
  g.translate(x, y, z);
  return g;
}
// Tapered cylinder from point a to point b (fingers, forearms).
function vmLimb(a, b, r0, r1, seg = 8) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  g.translate(a[0], a[1], a[2]);
  return g;
}
// Merge non-indexed copies of geometries into one BufferGeometry.
function mergeGeos(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.computeBoundingSphere();
  return m;
}

const Viewmodel = {
  root: null, gun: null, mag: null, left: null, flash: null, tris: 0,
  base: { x: 6.2, y: -6.0, z: -18.5, rx: 0.06, ry: 0.075, rz: -0.12 },
  bob: 0, swayX: 0, swayY: 0, kick: 0, kickRoll: 0, flashT: 0, time: 0,
  lightProbe: [0, 0, 0, 0], tmpV: null,

  build() {
    const T = R.textures;
    const metal = new THREE.MeshPhongMaterial({ map: T.gun_metal, shininess: 52, specular: new THREE.Color(0.34, 0.34, 0.36) });
    const poly = new THREE.MeshPhongMaterial({ map: T.gun_poly, shininess: 18, specular: new THREE.Color(0.12, 0.12, 0.12) });
    const tan = new THREE.MeshPhongMaterial({ map: T.gun_tan, shininess: 12, specular: new THREE.Color(0.08, 0.08, 0.07) });
    const glove = new THREE.MeshLambertMaterial({ map: T.glove });
    const sleeve = new THREE.MeshLambertMaterial({ map: T.sleeve });

    const gunMetal = [
      vmBox(1.15, 1.25, 10.5, 0, 0.55, 0.5), vmBox(1.05, 0.95, 7.2, 0, -0.45, 1.0), vmBox(1.1, 1.3, 2.4, 0, -1.1, -1.4),
      vmBox(0.25, 0.18, 2.4, 0, -1.48, 1.35), vmBox(0.18, 0.7, 0.22, 0, -1.15, 1.15, 0.25),
      vmBox(0.75, 0.75, 2.6, 0, 0.55, 6.3), vmBox(0.85, 0.28, 13.5, 0, 1.32, -1.2),
      vmBox(0.32, 1.35, 0.42, 0, 1.45, -12.4, -0.12), vmBox(0.62, 0.5, 1.0, 0, 0.95, -12.4),
      vmBox(0.7, 0.42, 0.8, 0, 1.62, 4.6), vmBox(0.14, 0.34, 0.7, 0.24, 1.95, 4.6), vmBox(0.14, 0.34, 0.7, -0.24, 1.95, 4.6),
      vmBox(1.4, 0.25, 0.6, 0, 1.05, 5.9), vmBox(0.08, 0.55, 2.0, 0.6, 0.62, 0.2), vmBox(0.35, 0.35, 0.6, 0.62, 0.15, 2.6),
      vmCyl(0.32, 6.6, 10, 0, 0.5, -15.6), vmCyl(0.47, 1.9, 8, 0, 0.5, -19.5), vmCyl(0.2, 0.9, 6, 0, 1.0, -11.6),
    ];
    for (let i = 0; i < 3; i++) gunMetal.push(vmBox(0.1, 0.16, 0.9, 0.5, 0.5, -19.2 - i * 0.5 + 0.5));
    const gunPoly = [
      vmBox(0.95, 3.0, 1.35, 0, -2.2, 3.15, -0.32), vmBox(1.15, 2.0, 6.0, 0, 0.1, 9.4), vmBox(1.25, 2.6, 0.5, 0, -0.1, 12.6),
      vmBox(1.0, 0.6, 3.2, 0, -0.95, 8.0, 0.18),
    ];
    const guard = new THREE.CylinderGeometry(0.98, 0.98, 9.0, 8, 1, false);
    guard.rotateX(Math.PI / 2); guard.rotateZ(Math.PI / 8); guard.translate(0, 0.45, -8.2);
    const gunTan = [guard];
    for (let i = 0; i < 4; i++) gunPoly.push(vmBox(0.08, 0.32, 1.1, 0.95, 0.45, -10.8 + i * 1.6));

    // right hand: palm on the grip, three fingers round the front, index along the guard
    const rightHand = [
      vmBox(0.55, 2.3, 1.75, 0.74, -2.05, 3.45, -0.32), vmBox(1.25, 0.9, 1.9, 0.42, -0.95, 3.95, -0.32),
      vmLimb([0.62, -1.28, 2.75], [0.52, -1.3, 1.05], 0.29, 0.26, 7),
      vmLimb([0.64, -3.0, 4.35], [1.15, -4.3, 5.6], 0.98, 1.0, 9),
    ];
    for (let i = 0; i < 3; i++) {
      const y = -1.8 - 0.62 * i, z = 2.45 + 0.2 * i;
      rightHand.push(vmLimb([0.72, y, z + 0.45], [0.2, y - 0.06, z - 0.12], 0.31, 0.3, 6), vmLimb([0.2, y - 0.06, z - 0.12], [-0.42, y, z + 0.12], 0.3, 0.27, 6));
    }
    const rightArm = [vmLimb([1.05, -4.1, 5.3], [3.8, -10.8, 13.8], 1.12, 1.5, 10)];

    this.root = new THREE.Group();
    this.gun = new THREE.Group();
    this.gun.add(new THREE.Mesh(mergeGeos(gunMetal), metal), new THREE.Mesh(mergeGeos(gunPoly), poly), new THREE.Mesh(mergeGeos(gunTan), tan),
      new THREE.Mesh(mergeGeos(rightHand), glove), new THREE.Mesh(mergeGeos(rightArm), sleeve));
    // magazine (animated on reload)
    const magParts = [vmBox(0.95, 3.3, 2.1, 0, -1.55, 0, 0.12), vmBox(0.9, 1.6, 2.0, 0, -3.5, -0.5, 0.3), vmBox(1.05, 0.25, 2.25, 0, -4.3, -0.78, 0.3)];
    for (let i = 0; i < 4; i++) magParts.push(vmBox(1.0, 0.12, 2.15, 0, -0.6 - i * 0.8, -0.05 - i * 0.1, 0.12 + i * 0.05));
    this.mag = new THREE.Group();
    this.mag.add(new THREE.Mesh(mergeGeos(magParts), tan));
    this.mag.position.set(0, -1.2, -1.5);
    this.magBase = this.mag.position.clone();
    this.gun.add(this.mag);
    // support hand under the handguard (local origin on the handguard axis)
    const lh = [vmBox(1.7, 0.75, 3.0, 0.15, -1.3, 0), vmBox(1.5, 1.15, 1.5, 0.0, -1.55, 1.8), vmLimb([-0.7, -1.2, 0.8], [-1.12, -0.25, -0.65], 0.3, 0.27, 6),
      vmLimb([-0.1, -1.75, 2.1], [-0.85, -2.75, 3.45], 1.0, 1.02, 9)];
    for (let i = 0; i < 4; i++) {
      const z = -1.2 + i * 0.74;
      lh.push(vmLimb([0.82, -1.18, z], [1.12, -0.18, z], 0.3, 0.29, 6), vmLimb([1.12, -0.18, z], [0.84, 0.62, z - 0.05], 0.29, 0.26, 6));
    }
    this.left = new THREE.Group();
    this.left.add(new THREE.Mesh(mergeGeos(lh), glove), new THREE.Mesh(mergeGeos([vmLimb([-0.75, -2.6, 3.2], [-8.8, -8.6, 11.5], 1.15, 1.75, 10)]), sleeve));
    this.left.position.set(0, 0.45, -9.0);
    this.leftBase = this.left.position.clone();
    this.gun.add(this.left);
    // muzzle flash: camera-facing star + side petals (additive sprites)
    const fm = new THREE.MeshBasicMaterial({ map: T.sprites, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1.0, 0.78, 0.45) });
    const star = new THREE.PlaneGeometry(1, 1);
    const uvA = star.attributes.uv;
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, 0.5 + uvA.getX(i) * 0.5, uvA.getY(i) * 0.5);
    this.flash = new THREE.Group();
    const f1 = new THREE.Mesh(star, fm);
    const f2 = new THREE.Mesh(star, fm); f2.rotation.y = Math.PI / 2; f2.scale.set(2.4, 1, 1); f2.position.z = -0.9;
    const f3 = new THREE.Mesh(star, fm); f3.rotation.x = Math.PI / 2; f3.rotation.z = Math.PI / 2; f3.scale.set(2.4, 1, 1); f3.position.z = -0.9;
    this.flash.add(f1, f2, f3);
    this.flash.position.set(0, 0.5, -20.9);
    this.flash.visible = false;
    this.gun.add(this.flash);
    this.root.add(this.gun);
    R.vmScene.add(this.root);
    this.tmpV = new THREE.Vector3();
    this.tris = 0;
    this.root.traverse((o) => { if (o.isMesh && o !== f1 && o !== f2 && o !== f3) this.tris += o.geometry.attributes.position.count / 3; });
  },

  onShot() {
    this.kick = Math.min(this.kick + 1, 1.6);
    this.kickRoll = (Math.random() - 0.5) * 0.05;
    this.flashT = 0.045;
    const s = 3.2 + Math.random() * 1.6;
    this.flash.scale.set(s, s, s);
    this.flash.children[0].rotation.z = Math.random() * TAU;
    R.vmLights.flash.intensity = 2.2;
  },

  update(dt, pl, w, look, eye) {
    this.time += dt;
    const b = this.base, g = this.gun;
    let x = b.x, y = b.y, z = b.z, rx = b.rx, ry = b.ry, rz = b.rz;
    // movement bob (figure-eight), scaled by ground speed
    const sp = pl.onGround ? pl.speed() : 0, a = clamp(sp / 250, 0, 1);
    this.bob += sp * dt * 0.021;
    x += Math.sin(this.bob) * 0.32 * a; y += Math.sin(this.bob * 2) * 0.16 * a - a * 0.12;
    rz += Math.sin(this.bob) * 0.012 * a;
    // breathing
    y += Math.sin(this.time * 1.7) * 0.05; rx += Math.sin(this.time * 1.7) * 0.004;
    // mouse sway (lags behind the view)
    this.swayX = clamp(this.swayX - look[0] * 0.018, -1.3, 1.3); this.swayY = clamp(this.swayY - look[1] * 0.018, -1.0, 1.0);
    this.swayX = damp(this.swayX, 0, 9, dt); this.swayY = damp(this.swayY, 0, 9, dt);
    x += this.swayX * 0.45; y += this.swayY * 0.35; ry += this.swayX * 0.035; rx -= this.swayY * 0.03; rz += this.swayX * 0.05;
    // stance
    y += pl.duckAmt * 0.35 - pl.landKick * 0.08 + (!pl.onGround && !pl.noclip ? 0.25 : 0);
    rz -= pl.duckAmt * 0.04;
    // fire kick
    this.kick = damp(this.kick, 0, 15, dt);
    z += this.kick * 1.25; y += this.kick * 0.12; rx += this.kick * 0.055; rz += this.kickRoll * this.kick;
    // draw / reload choreography
    const mag = this.mag, left = this.left;
    mag.position.copy(this.magBase); mag.visible = true; left.position.copy(this.leftBase); left.rotation.set(0, 0, 0);
    if (w.state === 'draw') {
      const t = smoothstep(0, 1, w.t / w.def.drawTime);
      y -= (1 - t) * 9; rx -= (1 - t) * 0.6; rz += (1 - t) * 0.3;
    } else if (w.state === 'reload') {
      const t = w.t, T = w.def.reloadTime;
      const tilt = smoothstep(0, 0.3, t) * (1 - smoothstep(T - 0.45, T, t));
      rz -= tilt * 0.42; rx += tilt * 0.14; y += tilt * 0.6; x -= tilt * 0.6;
      // support hand keyframes: handguard -> off-screen (fetch mag) -> magwell -> handguard
      const LB = this.leftBase, MB = this.magBase;
      const BASE = [LB.x, LB.y, LB.z], OUT = [LB.x - 0.5, LB.y - 8, LB.z + 6], WELL = [LB.x - 0.2, LB.y - 2.8, LB.z + 7.5];
      let A = BASE, B = BASE, k = 0;
      if (t < 0.75) { B = OUT; k = smoothstep(0.3, 0.75, t); }
      else if (t < 0.95) { A = B = OUT; }
      else if (t < 1.36) { A = OUT; B = WELL; k = smoothstep(0.95, 1.36, t); }
      else if (t < 1.42) { A = B = WELL; }
      else { A = WELL; B = BASE; k = smoothstep(1.42, 1.8, t); }
      left.position.set(lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k));
      left.rotation.x = 0.35 * Math.sin(clamp((t - 0.3) / 1.5, 0, 1) * Math.PI);
      // magazine: old one drops away, the new one rides up with the hand and seats at 1.36s
      if (t >= 0.26 && t < 0.62) mag.position.y = MB.y - smoothstep(0.26, 0.6, t) * 9;
      else if (t >= 0.62 && t < 0.95) mag.visible = false;
      else if (t >= 0.95 && t < 1.36) { const m = smoothstep(0.95, 1.36, t); mag.position.set(MB.x, MB.y - (1 - m) * 6.5, MB.z + (1 - m)); }
      if (t > 1.36 && t < 1.5) y += Math.sin((t - 1.36) / 0.14 * Math.PI) * 0.35;
      if (w.emptyReload && t > 1.86 && t < 2.05) z += Math.sin((t - 1.86) / 0.19 * Math.PI) * 0.7;
    }
    g.position.set(x, y, z);
    g.rotation.set(rx, ry, rz);
    // muzzle flash
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    R.vmLights.flash.intensity = Math.max(0, R.vmLights.flash.intensity - dt * 50);
    R.vmLights.flash.position.set(x, y + 1, z - 18);
    // light the viewmodel from the baked probes at the eye
    const pr = sampleProbes(Game.L.probes, eye[0], eye[1], eye[2], this.lightProbe);
    const env = Game.L.env, L = R.vmLights;
    L.amb.color.setRGB(pr[0] * 0.95, pr[1] * 0.95, pr[2] * 0.95);
    L.sun.color.setRGB(env.sunColor[0], env.sunColor[1], env.sunColor[2]);
    L.sun.intensity = pr[3] * env.sunIntensity * 0.75;
    const sv = this.tmpV.set(env.sunDir[0], env.sunDir[1], env.sunDir[2]).transformDirection(R.camera.matrixWorldInverse);
    L.sun.position.copy(sv);
    L.fill.intensity = 0.08 + (pr[0] + pr[1] + pr[2]) * 0.03;
  },
};
