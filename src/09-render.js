// Renderer: lightmapped world shader, baked skybox cubemap, viewmodel pass, FOV/aspect modes.

const WORLD_VS = `
attribute vec2 lmuv;
varying vec2 vUv; varying vec2 vLm; varying vec3 vPos; varying vec3 vNrm; varying float vDepth;
void main() {
  vUv = uv; vLm = lmuv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz; vNrm = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * wp; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const WORLD_FS = `
uniform sampler2D map; uniform sampler2D lightMap; uniform float lmScale;
uniform vec3 fogColor; uniform float fogDensity;
uniform vec3 dlPos[4]; uniform vec3 dlCol[4]; uniform float dlRad[4]; uniform int dlCount;
varying vec2 vUv; varying vec2 vLm; varying vec3 vPos; varying vec3 vNrm; varying float vDepth;
void main() {
  vec3 albedo = texture2D(map, vUv).rgb;
  vec3 light = texture2D(lightMap, vLm).rgb * lmScale;
  vec3 N = normalize(vNrm);
  for (int i = 0; i < 4; i++) {
    if (i >= dlCount) break;
    vec3 L = dlPos[i] - vPos; float d = length(L);
    float a = clamp(1.0 - d / dlRad[i], 0.0, 1.0);
    light += dlCol[i] * (a * a) * clamp(dot(N, L / max(d, 0.001)) * 0.85 + 0.15, 0.0, 1.0);
  }
  vec3 col = albedo * light;
  float f = 1.0 - exp(-fogDensity * fogDensity * vDepth * vDepth);
  gl_FragColor = vec4(mix(col, fogColor, clamp(f, 0.0, 1.0)), 1.0);
}`;

const SKY_VS = `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = `
uniform vec3 sunDir; uniform vec3 zen; uniform vec3 hor; uniform vec3 sunCol; uniform vec3 ground;
varying vec3 vDir;
float h3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 6; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(hor, zen, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, hor * 1.04, exp(-abs(h) * 16.0) * 0.55);
  if (h > -0.05) {
    vec2 uv = d.xz / (h + 0.16);
    float c = fbm3(vec3(uv * 1.25, 0.5));
    float cov = smoothstep(0.52, 0.8, c);
    float sh = fbm3(vec3(uv * 1.25 + sunDir.xz * 0.07, 0.5));
    vec3 cl = mix(vec3(1.0, 0.985, 0.95), vec3(0.6, 0.64, 0.72), smoothstep(0.45, 0.86, sh));
    cl += sunCol * 0.18 * pow(max(dot(d, sunDir), 0.0), 5.0);
    col = mix(col, cl, cov * smoothstep(-0.02, 0.2, h) * 0.92);
  }
  float az = atan(d.z, d.x);
  vec3 q = vec3(cos(az) * 2.4, sin(az) * 2.4, 7.0);
  float ridge = 0.01 + 0.05 * fbm3(q) + 0.018 * fbm3(q * 3.1);
  float m = 1.0 - smoothstep(ridge - 0.0025, ridge + 0.0025, h);
  vec3 mc = mix(vec3(0.6, 0.53, 0.44), hor, 0.42 + 0.3 * smoothstep(ridge - 0.06, ridge, h));
  col = mix(col, mc, m);
  col = mix(col, ground, smoothstep(-0.005, -0.12, h));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(sd, 1100.0) * 9.0 + pow(sd, 70.0) * 0.32 + pow(sd, 6.0) * 0.08);
  gl_FragColor = vec4(col, 1.0);
}`;

const R = {
  renderer: null, scene: null, camera: null, vmScene: null, vmCamera: null,
  u: null, textures: {}, materials: {}, stats: { calls: 0, tris: 0 },
  vmLights: null, maxAniso: 1, viewW: 1, viewH: 1,

  init(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    renderer.setClearColor(0x000000, 1);
    this.renderer = renderer;
    this.maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, 16 / 9, 2, 14000);
    this.camera.rotation.order = 'YXZ';
    // lights for dynamic world objects (grenades, casings); their colours carry the baked probe light
    this.dynAmb = new THREE.AmbientLight(0xffffff, 0.85);
    this.dynSun = new THREE.DirectionalLight(0xffffff, 0.3);
    this.scene.add(this.dynAmb, this.dynSun);
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(54, 16 / 9, 0.5, 400);
    this.u = {
      lightMap: { value: null }, lmScale: { value: LM_SCALE },
      fogColor: { value: new THREE.Color(0, 0, 0) }, fogDensity: { value: 0 },
      dlPos: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
      dlCol: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
      dlRad: { value: [1, 1, 1, 1] }, dlCount: { value: 0 },
    };
    const amb = new THREE.AmbientLight(0xffffff, 0.5);
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    const fill = new THREE.DirectionalLight(0xffffff, 0.15);
    const flash = new THREE.PointLight(0xffb060, 0, 60, 1.5);
    fill.position.set(-0.3, 0.2, 1);
    this.vmScene.add(amb, sun, fill, flash);
    this.vmLights = { amb, sun, fill, flash };
  },

  // CanvasTextures for every generated canvas.
  makeTextures(tex) {
    for (const [name, t] of Object.entries(tex)) {
      if (!t.canvas) continue;
      const ct = new THREE.CanvasTexture(t.canvas);
      ct.wrapS = ct.wrapT = (t.def.fit || name === 'decals' || name === 'sprites' || name === 'smoke' || name === 'blade') ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      if (t.def.cyl) ct.wrapS = THREE.RepeatWrapping;
      ct.anisotropy = this.maxAniso;
      ct.minFilter = THREE.LinearMipmapLinearFilter;
      ct.magFilter = THREE.LinearFilter;
      ct.needsUpdate = true;
      this.textures[name] = ct;
    }
  },

  materialFor(name, tex) {
    if (this.materials[name]) return this.materials[name];
    const def = tex[name] ? tex[name].def : {};
    let m;
    if (def.fullbright) m = new THREE.MeshBasicMaterial({ color: new THREE.Color(...def.fullbright), fog: true });
    else {
      const u = this.u;
      m = new THREE.ShaderMaterial({
        uniforms: { map: { value: this.textures[name] || null }, lightMap: u.lightMap, lmScale: u.lmScale, fogColor: u.fogColor, fogDensity: u.fogDensity, dlPos: u.dlPos, dlCol: u.dlCol, dlRad: u.dlRad, dlCount: u.dlCount },
        vertexShader: WORLD_VS, fragmentShader: WORLD_FS,
      });
    }
    this.materials[name] = m;
    return m;
  },

  geometryFrom(g, ox = 0, oy = 0, oz = 0) {
    const geo = new THREE.BufferGeometry();
    let pos = g.pos;
    if (ox || oy || oz) { pos = g.pos.slice(); for (let i = 0; i < pos.length; i += 3) { pos[i] -= ox; pos[i + 1] -= oy; pos[i + 2] -= oz; } }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute('lmuv', new THREE.Float32BufferAttribute(g.lm, 2));
    geo.computeBoundingSphere();
    return geo;
  },

  buildWorld(L, bake) {
    const lmTex = new THREE.DataTexture(bake.lmData, L.atlasW, L.atlasH, THREE.RGBAFormat);
    lmTex.magFilter = THREE.LinearFilter; lmTex.minFilter = THREE.LinearFilter;
    lmTex.generateMipmaps = false; lmTex.flipY = false; lmTex.needsUpdate = true;
    this.u.lightMap.value = lmTex;
    const env = L.env;
    this.u.fogColor.value.setRGB(...env.fogColor);
    this.u.fogDensity.value = env.fogDensity;
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...env.fogColor), env.fogDensity);
    this.dynSun.position.set(env.sunDir[0], env.sunDir[1], env.sunDir[2]);
    for (const [mat, g] of L.groups) {
      const mesh = new THREE.Mesh(this.geometryFrom(g), this.materialFor(mat, L.tex));
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.scene.add(mesh);
    }
    this.buildSky(env);
  },

  // Brush entity (door/target) as a pivoted group; geometry is relative to the pivot.
  entityObject(L, mb, pivot) {
    const group = new THREE.Group();
    group.position.set(pivot[0], pivot[1], pivot[2]);
    const mats = L.entGroups.get(mb);
    if (mats) for (const [mat, g] of mats) group.add(new THREE.Mesh(this.geometryFrom(g, pivot[0], pivot[1], pivot[2]), this.materialFor(mat, L.tex)));
    this.scene.add(group);
    return group;
  },

  buildSky(env) {
    const skyScene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: new THREE.Vector3(...env.sunDir) }, zen: { value: new THREE.Vector3(...env.skyZenith) },
        hor: { value: new THREE.Vector3(...env.skyHorizon) }, sunCol: { value: new THREE.Vector3(1.0, 0.86, 0.62) },
        ground: { value: new THREE.Vector3(0.62, 0.55, 0.45) },
      },
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
    });
    const box = new THREE.BoxGeometry(100, 100, 100);
    skyScene.add(new THREE.Mesh(box, mat));
    const size = Math.min(1024, this.renderer.capabilities.maxCubemapSize || 1024);
    const rt = new THREE.WebGLCubeRenderTarget(size, { format: THREE.RGBAFormat, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const cc = new THREE.CubeCamera(1, 1000, rt);
    const prev = this.renderer.autoClear;
    this.renderer.autoClear = true;
    cc.update(this.renderer, skyScene);
    this.renderer.autoClear = prev;
    this.scene.background = rt.texture;
    box.dispose(); mat.dispose();
  },

  // Horizontal FOV is specified at 4:3 (classic convention); widescreen gets Hor+.
  vfovFrom(fov43) { return 2 * Math.atan(Math.tan(fov43 * DEG / 2) * 0.75) / DEG; },

  // Scoped weapons narrow the world camera (0 = no zoom). Only touches the projection when it changes.
  setZoom(fov43) {
    if ((this.zoomFov || 0) === fov43) return;
    this.zoomFov = fov43;
    this.camera.fov = this.vfovFrom(fov43 || Settings.v.fov); this.camera.updateProjectionMatrix();
  },

  resize() {
    const s = Settings.v, W = window.innerWidth, H = window.innerHeight;
    let cw = W, ch = H;
    if (s.aspect === 'box') { cw = Math.min(W, Math.round(H * 4 / 3)); ch = Math.min(H, Math.round(cw * 3 / 4)); }
    const canvas = this.renderer.domElement;
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    // keep the HUD inside the rendered frame (matters for 4:3 with black bars)
    const hud = document.getElementById('sf-hud');
    if (hud) { const ox = Math.round((W - cw) / 2), oy = Math.round((H - ch) / 2); hud.style.inset = `${oy}px ${ox}px`; }
    const dpr = Math.min(window.devicePixelRatio || 1, s.maxDpr) * (s.renderScale / 100);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cw, ch, false);
    const aspect = s.aspect === 'wide' ? cw / ch : 4 / 3;
    this.camera.aspect = aspect; this.camera.fov = this.vfovFrom(this.zoomFov || s.fov); this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = aspect; this.vmCamera.fov = this.vfovFrom(s.vmFov); this.vmCamera.updateProjectionMatrix();
    this.viewW = cw; this.viewH = ch;
  },

  render() {
    const r = this.renderer;
    r.info.reset();
    r.clear(true, true, true);
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.vmScene, this.vmCamera);
    this.stats.calls = r.info.render.calls; this.stats.tris = r.info.render.triangles;
  },
};
