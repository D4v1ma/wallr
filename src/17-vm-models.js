// Viewmodel geometry for every weapon. Gun space: -Z toward the muzzle, +Y up, +X right; units ~ inches.
// Each builder returns { id, root, parts, rest, anchors, base, flash, hidden }.

function vmBox(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}
function vmCyl(r, len, seg, x, y, z, rx = 0) {            // along Z
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.rotateX(Math.PI / 2 + rx); g.translate(x, y, z);
  return g;
}
function vmCylY(r, len, seg, x, y, z) {                    // along Y
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
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
const vmMesh = (list, mat) => new THREE.Mesh(mergeGeos(list), mat);
// Rounded block for palms and the backs of hands (8-sided prism scaled to w x h x d, long axis Y).
function vmPalm(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, false);
  g.scale(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}
// Finger wrapping round a grip: knuckle -> middle -> tip.
const vmFinger = (a, b, c, r = 0.31) => [vmLimb(a, b, r, r * 0.97, 6), vmLimb(b, c, r * 0.97, r * 0.87, 6)];

function vmMaterials() {
  const T = R.textures;
  return {
    metal: new THREE.MeshPhongMaterial({ map: T.gun_metal, shininess: 52, specular: new THREE.Color(0.26, 0.26, 0.28) }),
    poly: new THREE.MeshPhongMaterial({ map: T.gun_poly, shininess: 18, specular: new THREE.Color(0.12, 0.12, 0.12) }),
    tan: new THREE.MeshPhongMaterial({ map: T.gun_tan, shininess: 12, specular: new THREE.Color(0.08, 0.08, 0.07) }),
    glove: new THREE.MeshLambertMaterial({ map: T.glove1 }),     // team look set by Viewmodel.setTeam
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

function buildRifleVM(M) {
  const m = vmModel('rifle', { x: 6.2, y: -6.0, z: -18.5, rx: 0.06, ry: 0.075, rz: -0.12 });
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
  const gunPoly = [vmBox(0.95, 3.0, 1.35, 0, -2.2, 3.15, -0.32), vmBox(1.15, 2.0, 6.0, 0, 0.1, 9.4), vmBox(1.25, 2.6, 0.5, 0, -0.1, 12.6), vmBox(1.0, 0.6, 3.2, 0, -0.95, 8.0, 0.18)];
  for (let i = 0; i < 4; i++) gunPoly.push(vmBox(0.08, 0.32, 1.1, 0.95, 0.45, -10.8 + i * 1.6));
  const guard = new THREE.CylinderGeometry(0.98, 0.98, 9.0, 8, 1, false);
  guard.rotateX(Math.PI / 2); guard.rotateZ(Math.PI / 8); guard.translate(0, 0.45, -8.2);
  const rightHand = [vmPalm(0.62, 2.3, 1.8, 0.74, -2.05, 3.45, -0.32), vmPalm(1.3, 0.95, 1.95, 0.42, -0.95, 3.95, -0.32),
    vmLimb([0.62, -1.28, 2.75], [0.52, -1.3, 1.05], 0.29, 0.26, 7), vmLimb([0.64, -3.0, 4.35], [1.15, -4.3, 5.6], 0.98, 1.0, 9)];
  for (let i = 0; i < 3; i++) {
    const y = -1.8 - 0.62 * i, z = 2.45 + 0.2 * i;
    rightHand.push(...vmFinger([0.72, y, z + 0.45], [0.2, y - 0.06, z - 0.12], [-0.42, y, z + 0.12]));
  }
  m.root.add(vmMesh(gunMetal, M.metal), vmMesh(gunPoly, M.poly), vmMesh([guard], M.tan), vmMesh(rightHand, M.glove),
    vmMesh([vmLimb([1.05, -4.1, 5.3], [3.8, -10.8, 13.8], 1.12, 1.5, 10)], M.sleeve));
  const magParts = [vmBox(0.95, 3.3, 2.1, 0, -1.55, 0, 0.12), vmBox(0.9, 1.6, 2.0, 0, -3.5, -0.5, 0.3), vmBox(1.05, 0.25, 2.25, 0, -4.3, -0.78, 0.3)];
  for (let i = 0; i < 4; i++) magParts.push(vmBox(1.0, 0.12, 2.15, 0, -0.6 - i * 0.8, -0.05 - i * 0.1, 0.12 + i * 0.05));
  const mag = new THREE.Group(); mag.add(vmMesh(magParts, M.tan)); mag.position.set(0, -1.2, -1.5);
  vmPart(m, 'mag', mag);
  const lh = [vmPalm(1.75, 0.8, 3.0, 0.15, -1.3, 0, Math.PI / 2), vmPalm(1.5, 1.2, 1.6, 0.0, -1.55, 1.8), vmLimb([-0.7, -1.2, 0.8], [-1.12, -0.25, -0.65], 0.3, 0.27, 6),
    vmLimb([-0.1, -1.75, 2.1], [-0.85, -2.75, 3.45], 1.0, 1.02, 9)];
  for (let i = 0; i < 4; i++) { const z = -1.2 + i * 0.74; lh.push(...vmFinger([0.82, -1.18, z], [1.12, -0.18, z], [0.84, 0.62, z - 0.05], 0.3)); }
  const left = new THREE.Group();
  left.add(vmMesh(lh, M.glove), vmMesh([vmLimb([-0.75, -2.6, 3.2], [-8.8, -8.6, 11.5], 1.15, 1.75, 10)], M.sleeve));
  left.position.set(0, 0.45, -9.0);
  vmPart(m, 'left', left);
  m.flash = vmFlash(M, 0.5, -20.9); m.root.add(m.flash); m.flashScale = 1;
  vmAnchor(m, 'muzzle', 0, 0.5, -20.6); vmAnchor(m, 'eject', 0.75, 0.62, 0.3);
  vmCount(m);
  return m;
}

function buildPistolVM(M) {
  const m = vmModel('pistol', { x: 3.9, y: -5.1, z: -14.6, rx: 0.07, ry: 0.17, rz: -0.08 });
  const slideMetal = [vmBox(1.0, 1.15, 7.0, 0, 0, 0), vmBox(0.18, 0.26, 0.32, 0, 0.7, -3.25), vmBox(0.85, 0.3, 0.32, 0, 0.72, 3.15), vmCyl(0.27, 0.5, 10, 0, -0.12, -3.6)];
  const slideDark = [vmBox(0.06, 0.48, 1.4, 0.5, 0.25, -0.2), vmBox(0.28, 0.1, 0.26, -0.22, 0.88, 3.15), vmBox(0.28, 0.1, 0.26, 0.22, 0.88, 3.15)];
  for (let i = 0; i < 6; i++) slideDark.push(vmBox(1.04, 0.78, 0.1, 0, -0.05, 2.0 + i * 0.22));
  const slide = new THREE.Group(); slide.add(vmMesh(slideMetal, M.metal), vmMesh(slideDark, M.poly)); slide.position.set(0, 0.95, -1.5);
  vmPart(m, 'slide', slide);
  const frame = [vmBox(0.92, 0.7, 6.0, 0, 0.12, -1.8), vmBox(0.32, 0.18, 2.1, 0, -0.62, -0.45), vmBox(0.32, 0.85, 0.2, 0, -0.28, -1.45),
    vmBox(1.05, 3.4, 1.55, 0, -1.65, 1.3, -0.3), vmBox(0.95, 0.35, 0.9, 0, 0.02, 2.25, -0.3)];
  for (let i = 0; i < 3; i++) frame.push(vmBox(0.82, 0.12, 0.3, 0, -0.3, -3.7 + i * 0.5));
  for (let i = 0; i < 5; i++) frame.push(vmBox(1.09, 0.12, 1.2, 0, -0.85 - i * 0.48, 1.08 + i * 0.145, -0.3));
  const hand = [vmPalm(0.6, 2.4, 1.75, 0.76, -1.55, 1.45, -0.3), vmPalm(1.35, 1.0, 1.9, 0.42, -0.42, 1.95, -0.3),
    vmLimb([0.62, -0.3, 0.5], [0.56, -0.28, -1.5], 0.28, 0.26, 7), vmLimb([-0.55, -0.15, 1.3], [-0.6, -0.05, -0.4], 0.3, 0.27, 6),
    vmLimb([0.7, -2.6, 2.4], [1.1, -3.7, 3.5], 0.95, 0.98, 9)];
  for (let i = 0; i < 3; i++) { const y = -1.05 - 0.62 * i, z = 0.62 + 0.19 * i; hand.push(...vmFinger([0.72, y, z + 0.42], [0.16, y - 0.05, z - 0.16], [-0.46, y, z + 0.1])); }
  m.root.add(vmMesh(frame, M.poly), vmMesh([vmBox(0.18, 0.6, 0.22, 0, -0.26, -0.2, 0.3)], M.metal), vmMesh(hand, M.glove),
    vmMesh([vmLimb([1.05, -3.6, 3.4], [3.6, -9.6, 11.8], 1.1, 1.45, 10)], M.sleeve));
  const mag = new THREE.Group(); mag.add(vmMesh([vmBox(0.8, 3.1, 1.25, 0, -0.1, 0)], M.metal), vmMesh([vmBox(1.12, 0.32, 1.66, 0, -1.78, 0.04)], M.poly));
  mag.position.set(0, -1.65, 1.3); mag.rotation.x = -0.3;
  vmPart(m, 'mag', mag);
  const lh = [vmPalm(0.6, 2.1, 1.85, -0.8, -1.5, 1.2, -0.3), vmLimb([-0.62, -0.4, 0.9], [-0.62, -0.25, -0.9], 0.3, 0.27, 6), vmLimb([-0.75, -2.5, 2.2], [-1.4, -3.5, 3.3], 0.95, 0.98, 9)];
  for (let i = 0; i < 4; i++) { const y = -0.95 - 0.5 * i, z = 0.25 + 0.15 * i; lh.push(...vmFinger([-0.72, y, z + 0.5], [-0.1, y - 0.05, z - 0.2], [0.55, y, z - 0.05], 0.29)); }
  const left = new THREE.Group(); left.add(vmMesh(lh, M.glove), vmMesh([vmLimb([-1.3, -3.4, 3.1], [-5.6, -9.4, 10.6], 1.1, 1.45, 10)], M.sleeve));
  vmPart(m, 'left', left);
  m.flash = vmFlash(M, 0.85, -5.75); m.root.add(m.flash); m.flashScale = 0.62;
  vmAnchor(m, 'muzzle', 0, 0.85, -5.4); vmAnchor(m, 'eject', 0.6, 1.25, -1.6);
  vmCount(m);
  return m;
}

function buildKnifeVM(M) {
  const m = vmModel('knife', { x: 5.4, y: -4.9, z: -13.2, rx: 0.32, ry: 0.55, rz: 0.15 });
  const blade = new THREE.BoxGeometry(0.2, 1.2, 6.6, 1, 2, 8), pa = blade.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const z = pa.getZ(i), t = clamp((3.3 - z) / 6.6, 0, 1);           // 0 at the guard, 1 at the tip
    const top = 0.6 - (t > 0.62 ? Math.pow((t - 0.62) / 0.38, 1.6) * 0.5 : 0), bot = -0.6 + Math.pow(t, 2.2) * 0.98;
    const f = (pa.getY(i) + 0.6) / 1.2;
    const x = pa.getX(i) * (f < 0.25 ? 0.25 : f > 0.75 ? 0.9 : 1) * (1 - t * 0.5);
    pa.setXYZ(i, x, lerp(bot, top, f), z - 3.65);
  }
  blade.computeVertexNormals();
  const knife = new THREE.Group();
  const rings = [];
  for (let i = 0; i < 4; i++) rings.push(vmCyl(0.535, 0.12, 10, 0, -0.1, 0.95 + i * 0.8));
  knife.add(vmMesh([blade], M.blade), vmMesh([vmBox(0.42, 2.0, 0.34, 0, -0.1, 0), vmCyl(0.6, 0.45, 10, 0, -0.1, 4.45)], M.metal),
    vmMesh([vmCyl(0.5, 4.0, 10, 0, -0.1, 2.2)].concat(rings), M.poly));
  vmPart(m, 'knife', knife);
  const hand = [vmPalm(0.65, 1.65, 3.0, 0.7, -0.2, 2.3, Math.PI / 2), vmPalm(0.95, 1.75, 3.1, 0.45, 0.1, 2.35, Math.PI / 2), vmLimb([0.2, 0.55, 3.2], [-0.35, 0.65, 1.4], 0.32, 0.28, 6),
    vmLimb([0.5, -0.4, 4.3], [1.1, -1.4, 5.8], 0.95, 1.0, 9)];
  for (let i = 0; i < 4; i++) {
    const z = 1.0 + i * 0.78;
    hand.push(...vmFinger([0.68, -0.55, z], [0.05, -0.85, z], [-0.6, -0.35, z + 0.05], 0.32), vmLimb([-0.6, -0.35, z + 0.05], [-0.55, 0.25, z + 0.1], 0.28, 0.25, 6));
  }
  m.root.add(vmMesh(hand, M.glove), vmMesh([vmLimb([1.0, -1.2, 5.5], [3.2, -7.0, 13.2], 1.1, 1.45, 10)], M.sleeve));
  vmAnchor(m, 'tip', 0, -0.1, -6.9);
  vmCount(m);
  return m;
}

function buildSmokeVM(M) {
  const m = vmModel('smoke', { x: 4.6, y: -4.4, z: -12.8, rx: 0.12, ry: 0.5, rz: 0.08 });
  const nade = new THREE.Group();
  nade.add(vmMesh([vmCylY(1.2, 4.2, 14, 0, 0, 0)], M.nade),
    vmMesh([vmCylY(1.25, 0.3, 14, 0, 2.25, 0), vmCylY(0.55, 0.9, 10, 0, 2.8, 0), vmCylY(1.15, 0.2, 14, 0, -2.2, 0),
      vmBox(0.55, 3.2, 0.14, 0, 1.1, 1.28), vmBox(0.55, 0.14, 1.1, 0, 3.25, 0.75)], M.metal));
  vmPart(m, 'nade', nade);
  const ring = new THREE.TorusGeometry(0.5, 0.08, 6, 14); ring.rotateY(Math.PI / 2); ring.translate(-0.95, 2.85, 0.25);
  const pin = new THREE.Group(); pin.add(vmMesh([ring, vmBox(0.6, 0.08, 0.08, -0.6, 2.85, 0)], M.metal));
  vmPart(m, 'pin', pin);
  const hand = [vmPalm(0.75, 2.8, 1.5, 1.15, 0.5, 0.75), vmLimb([-0.9, 1.3, 1.2], [-1.25, 2.0, 0.2], 0.32, 0.28, 6), vmLimb([0.5, -1.2, 2.1], [1.4, -2.6, 3.6], 0.95, 1.0, 9)];
  for (const y of [1.6, 0.8, 0, -0.8]) hand.push(...vmFinger([1.25, y, 0.9], [1.05, y - 0.05, -0.85], [-0.5, y, -1.25], 0.32));
  m.root.add(vmMesh(hand, M.glove), vmMesh([vmLimb([1.3, -2.5, 3.4], [3.6, -8.8, 11.5], 1.1, 1.45, 10)], M.sleeve));
  // support hand, only shown while pulling the pin (rest pose sits at the ring)
  const lh = [vmPalm(0.7, 1.9, 1.75, -1.9, 2.4, 0.4), vmLimb([-1.65, 3.2, 0.2], [-1.05, 2.9, 0.25], 0.3, 0.27, 6), vmLimb([-2.1, 1.5, 1.0], [-2.9, 0.4, 2.2], 0.95, 1.0, 9)];
  for (let i = 0; i < 3; i++) lh.push(...vmFinger([-1.65, 2.6 - i * 0.55, 0.0], [-1.1, 2.5 - i * 0.55, -0.35], [-1.2, 2.45 - i * 0.55, 0.3], 0.29));
  const left = new THREE.Group(); left.add(vmMesh(lh, M.glove), vmMesh([vmLimb([-2.8, 0.5, 2.0], [-8.5, -8.0, 9.0], 1.1, 1.45, 10)], M.sleeve));
  vmPart(m, 'left', left);
  m.hidden = ['left'];
  vmCount(m);
  return m;
}

// ---------------------------------------------------------------------------
// Stage 4 weapons. Long guns share the rifle's grip layout: pistol grip at (0, -2.2, 3.15).
function vmRifleHand(M) {
  const h = [vmPalm(0.62, 2.3, 1.8, 0.74, -2.05, 3.45, -0.32), vmPalm(1.3, 0.95, 1.95, 0.42, -0.95, 3.95, -0.32),
    vmLimb([0.62, -1.28, 2.75], [0.52, -1.3, 1.05], 0.29, 0.26, 7), vmLimb([0.64, -3.0, 4.35], [1.15, -4.3, 5.6], 0.98, 1.0, 9)];
  for (let i = 0; i < 3; i++) { const y = -1.8 - 0.62 * i, z = 2.45 + 0.2 * i; h.push(...vmFinger([0.72, y, z + 0.45], [0.2, y - 0.06, z - 0.12], [-0.42, y, z + 0.12])); }
  const g = new THREE.Group();
  g.add(vmMesh(h, M.glove), vmMesh([vmLimb([1.05, -4.1, 5.3], [3.8, -10.8, 13.8], 1.12, 1.5, 10)], M.sleeve));
  return g;
}
// Support hand cupping a handguard; its origin sits on the handguard axis.
function vmSupportHand(M) {
  const lh = [vmPalm(1.75, 0.8, 3.0, 0.15, -1.3, 0, Math.PI / 2), vmPalm(1.5, 1.2, 1.6, 0.0, -1.55, 1.8), vmLimb([-0.7, -1.2, 0.8], [-1.12, -0.25, -0.65], 0.3, 0.27, 6),
    vmLimb([-0.1, -1.75, 2.1], [-0.85, -2.75, 3.45], 1.0, 1.02, 9)];
  for (let i = 0; i < 4; i++) { const z = -1.2 + i * 0.74; lh.push(...vmFinger([0.82, -1.18, z], [1.12, -0.18, z], [0.84, 0.62, z - 0.05], 0.3)); }
  const g = new THREE.Group();
  g.add(vmMesh(lh, M.glove), vmMesh([vmLimb([-0.75, -2.6, 3.2], [-8.8, -8.6, 11.5], 1.15, 1.75, 10)], M.sleeve));
  return g;
}

function buildSmgVM(M) {
  const m = vmModel('smg', { x: 5.9, y: -5.7, z: -16.0, rx: 0.06, ry: 0.075, rz: -0.12 });
  const metal = [
    vmBox(1.1, 1.35, 8.0, 0, 0.5, 0.2), vmBox(0.8, 0.25, 8.2, 0, 1.3, 0.0),
    vmCyl(0.6, 4.4, 10, 0, 0.5, -5.9), vmCyl(0.26, 2.4, 8, 0, 0.5, -9.2), vmCyl(0.36, 0.9, 8, 0, 0.5, -10.2),
    vmBox(0.3, 0.95, 0.32, 0, 1.2, -7.6), vmBox(0.62, 0.3, 0.5, 0, 0.85, -7.6),
    vmBox(0.7, 0.5, 0.7, 0, 1.6, 3.4), vmBox(0.14, 0.32, 0.6, 0.22, 1.95, 3.4), vmBox(0.14, 0.32, 0.6, -0.22, 1.95, 3.4),
    vmBox(0.22, 0.2, 2.2, 0, -1.45, 1.4), vmBox(0.18, 0.7, 0.22, 0, -1.1, 1.2, 0.25),
    vmBox(0.18, 0.22, 6.0, 0.45, 0.62, 7.2), vmBox(0.18, 0.22, 6.0, -0.45, 0.62, 7.2),
    vmBox(0.18, 0.22, 6.3, 0.45, -0.75, 7.0, 0.14), vmBox(0.18, 0.22, 6.3, -0.45, -0.75, 7.0, 0.14),
    vmBox(1.2, 2.3, 0.35, 0, -0.15, 10.2), vmBox(0.5, 0.4, 1.2, -0.62, 0.75, -1.6), vmBox(0.06, 0.55, 1.7, 0.58, 0.55, 0.5),
  ];
  for (let i = 0; i < 5; i++) metal.push(vmBox(0.08, 0.36, 0.5, 0.6, 0.55, -4.4 - i * 0.75), vmBox(0.08, 0.36, 0.5, -0.6, 0.55, -4.4 - i * 0.75));
  const poly = [vmBox(0.95, 3.0, 1.35, 0, -2.2, 3.15, -0.32), vmBox(1.05, 0.7, 3.4, 0, -0.55, -2.9)];
  m.root.add(vmMesh(metal, M.metal), vmMesh(poly, M.poly), vmRifleHand(M));
  const mag = new THREE.Group();
  mag.add(vmMesh([vmBox(0.82, 4.6, 1.3, 0, -1.9, 0, 0.06), vmBox(0.98, 0.32, 1.45, 0, -4.25, 0.14, 0.06)], M.metal));
  mag.position.set(0, -0.5, -0.7);
  vmPart(m, 'mag', mag);
  const left = vmSupportHand(M); left.position.set(0, 0.5, -5.6);
  vmPart(m, 'left', left);
  m.flash = vmFlash(M, 0.5, -11.0); m.root.add(m.flash); m.flashScale = 0.75;
  vmAnchor(m, 'muzzle', 0, 0.5, -10.7); vmAnchor(m, 'eject', 0.7, 0.6, 0.5);
  vmCount(m);
  return m;
}

function buildShotgunVM(M) {
  const m = vmModel('shotgun', { x: 6.0, y: -6.2, z: -18.0, rx: 0.05, ry: 0.07, rz: -0.12 });
  const metal = [
    vmBox(1.25, 1.75, 6.6, 0, 0.45, 0.6), vmBox(0.7, 0.2, 6.4, 0, 1.4, 0.6),
    vmCyl(0.42, 17.2, 10, 0, 0.85, -11.3), vmCyl(0.38, 12.6, 10, 0, -0.18, -9.0), vmCyl(0.45, 0.8, 10, 0, -0.18, -15.5),
    vmBox(0.5, 1.45, 0.55, 0, 0.33, -15.2), vmCyl(0.16, 0.36, 6, 0, 1.32, -19.6),
    vmBox(0.22, 0.2, 2.2, 0, -1.45, 1.7), vmBox(0.18, 0.7, 0.22, 0, -1.1, 1.5, 0.25),
  ];
  const dark = [vmBox(0.06, 0.75, 2.5, 0.64, 0.55, -0.3), vmBox(0.9, 0.08, 2.6, 0, -0.45, -0.4)];   // ejection and loading ports
  const wood = [vmBox(0.95, 3.0, 1.35, 0, -2.2, 3.15, -0.32), vmBox(1.15, 2.05, 7.0, 0, -0.4, 7.6, 0.06)];
  const pad = [vmBox(1.25, 2.75, 0.6, 0, -0.62, 11.3, 0.06)];
  m.root.add(vmMesh(metal, M.metal), vmMesh(dark, M.poly), vmMesh(wood, M.wood), vmMesh(pad, M.poly), vmRifleHand(M));
  const pumpGeo = [vmCyl(0.7, 5.6, 10, 0, 0, 0)];
  for (let i = 0; i < 6; i++) pumpGeo.push(vmCyl(0.77, 0.24, 10, 0, 0, -2.2 + i * 0.88));
  const pump = new THREE.Group(); pump.add(vmMesh(pumpGeo, M.wood)); pump.position.set(0, -0.18, -7.7);
  vmPart(m, 'pump', pump);
  const left = vmSupportHand(M); left.position.set(0, 0.0, -7.9);
  vmPart(m, 'left', left);
  const shell = new THREE.Group(); shell.add(vmMesh([vmCyl(0.36, 2.3, 8, 0, 0, 0)], M.shell), vmMesh([vmCyl(0.39, 0.5, 8, 0, 0, 1.25)], M.brass));
  shell.position.set(0.15, -0.25, -0.4);
  vmPart(m, 'shell', shell, left);
  m.hidden = ['shell'];
  m.flash = vmFlash(M, 0.85, -20.4); m.root.add(m.flash); m.flashScale = 1.3;
  vmAnchor(m, 'muzzle', 0, 0.85, -20.0); vmAnchor(m, 'eject', 0.75, 0.6, -0.3);
  vmCount(m);
  return m;
}

function buildSniperVM(M) {
  const m = vmModel('sniper', { x: 6.6, y: -7.7, z: -20.5, rx: 0.05, ry: 0.07, rz: -0.1 });
  const metal = [
    vmBox(1.2, 1.4, 9.0, 0, 0.45, 0.4), vmCyl(0.36, 21, 10, 0, 0.55, -14.0), vmCyl(0.52, 2.4, 10, 0, 0.55, -25.6),
    vmCyl(0.62, 9.4, 12, 0, 2.75, -0.6), vmCyl(0.98, 2.6, 12, 0, 2.75, -6.4), vmCyl(0.8, 1.0, 12, 0, 2.75, -4.7),
    vmCyl(0.8, 2.0, 12, 0, 2.75, 4.7), vmCyl(0.7, 1.0, 12, 0, 2.75, 3.3),
    vmCylY(0.42, 0.75, 10, 0, 3.55, -0.5), vmBox(0.75, 0.72, 0.72, 0.72, 2.75, -0.5),
    vmBox(0.5, 1.25, 0.8, 0, 1.72, -3.2), vmBox(0.5, 1.25, 0.8, 0, 1.72, 2.0),
    vmBox(0.22, 0.2, 2.2, 0, -1.45, 1.7), vmBox(0.18, 0.7, 0.22, 0, -1.1, 1.5, 0.25), vmBox(0.06, 0.6, 2.0, 0.62, 0.55, 1.0),
  ];
  const stock = [vmBox(0.95, 3.0, 1.35, 0, -2.2, 3.15, -0.32), vmBox(1.2, 1.6, 8.0, 0, -0.5, 8.6), vmBox(1.25, 3.0, 2.6, 0, -1.2, 11.6),
    vmBox(1.0, 0.8, 3.6, 0, 0.72, 9.4), vmBox(1.3, 1.5, 10.0, 0, -0.35, -8.6), vmBox(1.1, 0.5, 9.0, 0, -1.25, -8.4)];
  m.root.add(vmMesh(metal, M.metal), vmMesh(stock, M.tan));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.8, 14), new THREE.MeshBasicMaterial({ color: 0x1a2a2c }));
  lens.scale.setScalar(0.92); lens.position.set(0, 2.75, 5.71); m.root.add(lens);
  const bolt = new THREE.Group();
  bolt.add(vmMesh([vmBox(1.6, 0.28, 0.3, 0.85, 0, 0), vmBox(0.62, 0.62, 0.62, 1.75, 0, 0), vmCyl(0.42, 2.6, 8, 0, 0, 0.6)], M.metal));
  bolt.position.set(0.5, 0.75, 2.4);
  vmPart(m, 'bolt', bolt);
  const mag = new THREE.Group(); mag.add(vmMesh([vmBox(0.9, 1.9, 2.5, 0, -0.85, 0)], M.poly)); mag.position.set(0, -0.8, -1.9);
  vmPart(m, 'mag', mag);
  vmPart(m, 'right', vmRifleHand(M));
  const left = vmSupportHand(M); left.position.set(0, 0.05, -9.8);
  vmPart(m, 'left', left);
  m.flash = vmFlash(M, 0.55, -27.4); m.root.add(m.flash); m.flashScale = 1.4;
  vmAnchor(m, 'muzzle', 0, 0.55, -27.0); vmAnchor(m, 'eject', 0.7, 0.6, 1.0);
  vmCount(m);
  return m;
}

// The charge: a taped brick with a keypad timer, carried in both hands.
function buildChargeVM(M) {
  const m = vmModel('charge', { x: 2.6, y: -5.2, z: -11.5, rx: 0.68, ry: 0.1, rz: 0.02 });
  const brick = new THREE.Group();
  brick.add(vmMesh([vmBox(5.4, 1.5, 3.4, 0, 0, 0)], M.putty),
    vmMesh([vmBox(5.5, 1.6, 0.45, 0, 0, -1.05), vmBox(5.5, 1.6, 0.45, 0, 0, 1.05), vmBox(0.45, 1.6, 3.5, -2.1, 0, 0)], M.tape),
    vmMesh([vmBox(2.7, 0.62, 2.1, 0.65, 1.05, 0.05), vmBox(0.9, 0.5, 0.9, -1.4, 1.0, -0.6)], M.poly),
    vmMesh([vmBox(1.3, 0.06, 0.6, 0.65, 1.38, -0.5)], M.screen),
    vmMesh([vmLimb([-1.0, 1.05, -0.3], [-0.6, 1.25, 0.6], 0.09, 0.09, 5), vmLimb([-1.4, 1.2, -0.2], [-1.9, 0.8, 1.6], 0.09, 0.09, 5)], M.wireR),
    vmMesh([vmLimb([-1.0, 1.0, 0.2], [-0.6, 1.2, 0.9], 0.09, 0.09, 5), vmLimb([-1.2, 1.15, -0.9], [-2.3, 0.7, -1.4], 0.09, 0.09, 5)], M.wireB));
  const keys = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) keys.push(vmBox(0.34, 0.12, 0.3, 0.15 + c * 0.5, 1.4, 0.2 + r * 0.42));
  brick.add(vmMesh(keys, M.metal));
  m.root.add(brick);
  const led = new THREE.Group(); led.add(vmMesh([vmBox(0.22, 0.14, 0.22, 1.75, 1.42, -0.55)], M.led));
  vmPart(m, 'led', led);
  // hands under the ends of the brick, thumbs over the top edge
  const rh = [vmPalm(1.8, 0.8, 2.6, 2.3, -1.05, 0.3), vmLimb([2.9, -0.6, 0.9], [3.0, 0.9, 0.5], 0.33, 0.3, 6), vmLimb([2.4, -1.2, 1.4], [3.0, -2.6, 3.4], 0.95, 1.0, 9)];
  for (let i = 0; i < 3; i++) { const z = -0.7 + i * 0.62; rh.push(...vmFinger([1.6, -1.0, z], [2.6, -1.25, z], [2.95, -0.4, z], 0.3)); }
  const right = new THREE.Group(); right.add(vmMesh(rh, M.glove), vmMesh([vmLimb([2.9, -2.2, 2.8], [4.4, -8.4, 11.0], 1.1, 1.45, 10)], M.sleeve));
  const finger = new THREE.Group(); finger.add(vmMesh(vmFinger([2.3, -0.7, -0.6], [1.7, 1.2, -0.4], [1.2, 1.55, 0.1], 0.3), M.glove));
  vmPart(m, 'right', right); vmPart(m, 'finger', finger, right);
  const lh = [vmPalm(1.8, 0.8, 2.6, -2.3, -1.05, 0.3), vmLimb([-2.9, -0.6, 0.9], [-3.0, 0.9, 0.5], 0.33, 0.3, 6), vmLimb([-2.4, -1.2, 1.4], [-3.0, -2.6, 3.4], 0.95, 1.0, 9)];
  for (let i = 0; i < 4; i++) { const z = -1.0 + i * 0.62; lh.push(...vmFinger([-1.6, -1.0, z], [-2.6, -1.25, z], [-2.95, -0.4, z], 0.3)); }
  const left = new THREE.Group(); left.add(vmMesh(lh, M.glove), vmMesh([vmLimb([-2.9, -2.2, 2.8], [-5.4, -8.4, 11.0], 1.1, 1.45, 10)], M.sleeve));
  vmPart(m, 'left', left);
  vmCount(m);
  return m;
}
