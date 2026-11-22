// Exports wallr's original generated assets and level data from the JS sources into the Godot
// project (godot/assets). Everything still comes from the same original generators:
//   textures  procedural canvas textures -> PNG (+ textures.json with tiling, surface and average colour)
//   sounds    the WebAudio synth, rendered offline -> 16-bit mono WAV (+ sounds.json)
//   maps      map compiler + lightmap bake + light probes + nav graph + radar -> JSON + binary + PNG
//   models    viewmodels with attachments, character bodies, world weapons -> JSON + binary
//   data      weapon table and viewmodel animation clips -> JSON
// Sources: src/ (the browser game), with assetgen/ on top: a file in assetgen/ replaces the src/ file
// of the same name, and new assetgen/ files are added (PBR materials, the Godot-only map changes).
// Usage: node tools/godot-export.mjs <three.min.js> [textures,sounds,maps,models,data] [map keys]
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const [threePath, onlyArg, mapsArg] = process.argv.slice(2);
if (!threePath) {
  console.error('usage: node tools/godot-export.mjs <three.min.js> [textures,sounds,maps,models,data] [depot,kiln,frost,range]');
  process.exit(2);
}
const want = new Set((onlyArg || 'textures,sounds,maps,models,data').split(','));
const here = dirname(fileURLToPath(import.meta.url));
const OUT = `${here}/../godot/assets`;
// Straight (non-premultiplied) RGBA PNG: canvases premultiply alpha, which would wipe the colour of
// lightmap texels whose alpha (sky visibility) is low.
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function pngRGBA(w, h, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const put = (rel, data) => { const p = `${OUT}/${rel}`; mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data); };
const json = (v) => JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 1e5) / 1e5 : x));
// The bots' graph as little-endian binary (godot/scripts/bots/nav.gd reads it): "NAV2", node count N,
// link count M, grid step; then float32 x, y, z per node; int32 grid column x, z per node; int32 link
// offsets (N + 1); int32 link targets, bit 30 set on jump links.
const navBin = (nav) => {
  const N = nav.nodes.length, M = nav.links.reduce((s, l) => s + l.length, 0);
  const b = Buffer.alloc(16 + 12 * N + 8 * N + 4 * (N + 1) + 4 * M);
  b.write('NAV2', 0, 'ascii'); b.writeInt32LE(N, 4); b.writeInt32LE(M, 8); b.writeFloatLE(nav.step, 12);
  let o = 16, k = 0;
  for (const n of nav.nodes) { b.writeFloatLE(n[0], o); b.writeFloatLE(n[1], o + 4); b.writeFloatLE(n[2], o + 8); o += 12; }
  for (const n of nav.nodes) { b.writeInt32LE(n[3], o); b.writeInt32LE(n[4], o + 4); o += 8; }
  for (let i = 0; i <= N; i++) { b.writeInt32LE(k, o); o += 4; if (i < N) k += nav.links[i].length; }
  for (const ls of nav.links) for (const l of ls) { b.writeInt32LE(l[0] | (l[2] ? 1 << 30 : 0), o); o += 4; }
  return b;
};
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---------------------------------------------------------------------------
// The page: the original sources (minus the WebGL renderer, DOM UI and the boot code) with stubs.
// ---------------------------------------------------------------------------
const srcDir = `${here}/../src`, genDir = `${here}/../assetgen`;
const wanted = (f) => /^(0[1-8]|11|13|14|15|16|17|18|20|21|22|23|24|25|26|27|28)-.*\.js$/.test(f);
const genFiles = new Set(readdirSync(genDir).filter(wanted));
const files = [...new Set([...readdirSync(srcDir).filter(wanted), ...genFiles])].sort()
  .map((f) => (genFiles.has(f) ? `${genDir}/${f}` : `${srcDir}/${f}`));
const stubs = `
const noop = () => {};
const HUD = new Proxy({}, { get: () => noop });
const Menu = new Proxy({}, { get: () => noop });
const Input = { pressed: () => false };
const FX = { L: null, probe: [0, 0, 0, 0], lightAt: (x, y, z, o) => o, explosion: noop };
const DLights = { add: noop };
const Ents = { targets: [], doors: [], doorInReach: () => null, tick: noop };
const Game = { L: null, player: null, loadout: null, time: 0, shake: 0, tex: null };
const Session = { checkpoint: noop };
const R = { scene: null, maxAniso: 1, vmScene: { add: noop }, textures: {} };`;
const helpers = `
function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
const f32 = (a) => toB64(new Uint8Array(Float32Array.from(a).buffer));
const u8 = (a) => toB64(Uint8Array.from(a));
// three.js uploads canvases flipped (v = 0 at the bottom); Godot samples v = 0 at the top row
const flipV = (a) => { const o = Float32Array.from(a); for (let i = 1; i < o.length; i += 2) o[i] = 1 - o[i]; return o; };
// three.js front faces wind counter-clockwise, Godot's clockwise: swap the 2nd and 3rd vertex of each triangle
const wind = (a, k) => {
  const o = a instanceof Uint8Array ? Uint8Array.from(a) : Float32Array.from(a);
  for (let t = 0; t + 3 * k <= o.length; t += 3 * k) for (let c = 0; c < k; c++) { const x = o[t + k + c]; o[t + k + c] = o[t + 2 * k + c]; o[t + 2 * k + c] = x; }
  return o;
};
const A3 = (a) => f32(wind(a, 3)), A2 = (a) => f32(wind(a, 2)), UV = (a) => f32(wind(flipV(a), 2));
const png = (cv) => cv.toDataURL('image/png').split(',')[1];
let TEX = null;
// The browser textures, with the PBR set (512 px albedo + normal + ORM) replacing world materials;
// the PBR world size also drives the level UVs.
async function texturesOnce() {
  if (TEX) return TEX;
  TEX = await generateTextures(noop);
  for (const [name, pd] of Object.entries(PBR_DEFS)) {
    if (!TEX[name]) TEX[name] = { canvas: null, avg: [0.5, 0.5, 0.5], def: { world: pd.world, surf: pd.surf || 'concrete' } };   // new materials
    const t = TEX[name], r = pd.gen();
    t.canvas = r.albedo; t.normal = r.normal; t.orm = r.orm; t.avg = r.avg; t.pbr = true;
    t.def.world = pd.world;
  }
  for (const t of Object.values(TEX)) {
    if (t.pbr || !t.canvas || (t.def && (t.def.aux || t.def.fullbright))) continue;
    const r = pbrDerive(t.canvas, t.def.surf, t.def.world || 64);
    t.normal = r.normal; t.orm = r.orm;
  }
  for (const [name, gen] of Object.entries(typeof PBR_AUX === 'object' ? PBR_AUX : {})) if (TEX[name]) TEX[name].canvas = gen();
  // weapons, gloves and sleeves get normal maps too (fine surface relief on the viewmodels)
  const AUX_N = { gun_metal: ['metal', 10], gun_poly: ['cloth', 6], gun_tan: ['cloth', 6], gun_wood: ['wood', 12], glove0: ['cloth', 8], glove1: ['cloth', 8],
    sleeve0: ['cloth', 14], sleeve1: ['cloth', 14], blade: ['metal', 8], nade: ['metal', 10] };
  for (const [name, [surf, world]] of Object.entries(AUX_N)) {
    const t = TEX[name];
    if (!t || !t.canvas) continue;
    const r = pbrDerive(t.canvas, surf, world);
    t.normal = r.normal;
  }
  Game.tex = TEX;
  return TEX;
}

async function exportTextures() {
  const tex = await texturesOnce(), out = {};
  for (const [name, t] of Object.entries(tex)) {
    const d = t.def || {};
    out[name] = { def: { world: d.world || 0, fit: !!d.fit, cyl: !!d.cyl, surf: d.surf || '', fullbright: d.fullbright || null, aux: !!d.aux, pbr: !!t.pbr }, avg: t.avg,
      png: t.canvas ? png(t.canvas) : null, w: t.canvas ? t.canvas.width : 0, h: t.canvas ? t.canvas.height : 0,
      normal: t.normal ? png(t.normal) : null, orm: t.orm ? png(t.orm) : null };
  }
  for (const team of [0, 1]) { const cv = chAtlas(team); out['ch' + team] = { def: { aux: true }, avg: [0.5, 0.5, 0.5], png: png(cv), w: cv.width, h: cv.height }; }
  for (const id of Object.keys(CAMOS)) { const cv = Arsenal.camoCanvas(id); out['camo_' + id] = { def: { aux: true }, avg: [0.5, 0.5, 0.5], png: png(cv), w: cv.width, h: cv.height }; }
  WeaponIcons.build();
  const icons = {};
  for (const [id, url] of Object.entries(WeaponIcons.url)) if (id !== 'blast') icons[id] = url.split(',')[1];
  const thumbs = {};
  for (const key of Object.keys(MAPS)) thumbs[key] = png(Radar.thumb(key));
  return { tex: out, icons, thumbs };
}

// --- maps ---
const plainOpts = (o) => { const r = {}; for (const [k, v] of Object.entries(o || {})) if (k !== 'doorDef' && k !== 'targetDef' && typeof v !== 'function') r[k] = v; return r; };
async function exportMap(key) {
  const tex = await texturesOnce(), def = MAPS[key], mb = def.build(), L = compileLevel(mb, tex);
  const bake = await bakeLighting(L, noop);
  L.probes = bake.probes;
  Nav.build(L);
  Radar.build(L);
  const groups = [];
  for (const g of L.groups.values()) groups.push({ mat: g.mat, chunk: g.chunk, n: g.pos.length / 3, pos: A3(g.pos), nrm: A3(g.nrm), uv: UV(g.uv), lm: A2(g.lm) });
  const ents = [];
  for (const [b, m] of L.entGroups) {
    const list = [];
    for (const g of m.values()) list.push({ mat: g.mat, n: g.pos.length / 3, pos: A3(g.pos), nrm: A3(g.nrm), uv: UV(g.uv), lm: A2(g.lm) });
    ents.push({ brush: mb.brushes.indexOf(b), groups: list });
  }
  const brushes = mb.brushes.map((b) => {
    const cb = b.cbrush;
    return { planes: b.faces.map((f) => f.plane), mats: b.faces.map((f) => f.mat), polys: cb.polys, contents: cb.contents, surfs: Array.from(cb.surf).slice(0, cb.faceCount),
      surf: cb.surfDefault, entity: b.o.entity || null, o: plainOpts(b.o), min: cb.min, max: cb.max };
  });
  const pr = bake.probes;
  const nav = { step: typeof NAV_STEP === 'number' ? NAV_STEP : 40, nodes: Nav.nodes.map((n) => [n.x, n.y, n.z, n.cx, n.cz]), links: Nav.nodes.map((n) => n.links.map((l) => [l.to, Math.round(l.cost * 100) / 100, l.jump ? 1 : 0])) };
  const meta = {
    key, name: def.name, blurb: def.blurb, practice: !!def.practice, env: L.env, lights: L.lights, spawns: L.spawns, teamSpawns: L.teamSpawns, hotspots: L.hotspots,
    sites: L.sites, areas: L.areas, tactics: L.tactics, menuShots: L.menuShots, bounds: L.bounds, atlasW: L.atlasW, atlasH: L.atlasH, bakeStats: bake.stats,
    doors: mb.doors.map((d) => ({ brush: mb.brushes.indexOf(d.mb), hinge: d.hinge, opts: plainOpts(d.opts) })),
    targets: mb.targets.map((t) => ({ brush: mb.brushes.indexOf(t.mb), center: t.center, half: t.half, opts: plainOpts(t.opts) })),
    radar: { s: Radar.s, lo: Radar.lo, w: Radar.img.width, h: Radar.img.height },
    probes: { nx: pr.nx, ny: pr.ny, nz: pr.nz, x0: pr.x0, y0: pr.y0, z0: pr.z0, step: pr.step, stride: pr.stride || 4 },
    lmRange: typeof LM_RANGE === 'number' ? LM_RANGE : 0,
  };
  return { meta, brushes, groups, ents, nav, lightmap: toB64(bake.lmData), radar: png(Radar.img), probeData: f32(pr.data), probeValid: u8(pr.valid) };
}

// --- sounds: each effect rendered offline through the same synth graph and reverb ---
async function renderSound(call, dur, rate, space) {
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * rate), rate);
  const S = Object.create(Snd);
  S.ctx = ctx; S.ready = true;
  S.master = ctx.createGain(); S.master.connect(ctx.destination);
  const rev = ctx.createConvolver(); rev.buffer = S.makeIR(1.8, 3.0);
  S.revSend = ctx.createGain(); S.revSend.gain.value = space; S.revSend.connect(rev); rev.connect(S.master);
  S.noise = ctx.createBuffer(1, rate, rate);
  const nd = S.noise.getChannelData(0); for (let i = 0; i < rate; i++) nd[i] = Math.random() * 2 - 1;
  call(S);
  const buf = await ctx.startRendering(), L = buf.getChannelData(0), Rr = buf.getChannelData(1), n = L.length;
  const mono = new Float32Array(n); let end = 0, peak = 0;
  for (let i = 0; i < n; i++) { const v = (L[i] + Rr[i]) * 0.5; mono[i] = v; const a = Math.abs(v); if (a > 0.0009) end = i; if (a > peak) peak = a; }
  end = Math.min(n, end + Math.round(rate * 0.01));
  const out = mono.slice(0, end), fade = Math.min(end, Math.round(rate * 0.006));
  for (let i = 0; i < fade; i++) out[end - 1 - i] *= i / fade;
  return { data: f32(out), peak, len: end / rate };
}
async function exportSounds(list, rate, space) {
  const out = {};
  for (const [name, variants, dur, body] of list) {
    const call = new Function('S', body);
    out[name] = [];
    for (let v = 0; v < variants; v++) out[name].push(await renderSound(call, dur, rate, space));
  }
  return out;
}

// --- models: object trees with meshes, materials by name and tagged parts ---
function texName(t) { return t && t.name ? t.name : null; }
function matInfo(m) {
  return { type: m.isMeshBasicMaterial ? 'basic' : m.isMeshPhongMaterial ? 'phong' : 'lambert', map: texName(m.map), color: m.color ? m.color.toArray() : [1, 1, 1],
    shininess: m.shininess || 0, specular: m.specular ? m.specular.toArray() : [0, 0, 0], transparent: !!m.transparent, opacity: m.opacity,
    additive: m.blending === THREE.AdditiveBlending, depthWrite: m.depthWrite !== false, vertexColors: !!m.vertexColors };
}
function exportTree(root, names, extra) {
  const nodes = [];
  const walk = (o, parent) => {
    const id = nodes.length;
    const n = { name: o.name || '', parent, p: o.position.toArray(), q: o.quaternion.toArray(), s: o.scale.toArray(), visible: o.visible };
    if (o.userData.tag) n.tag = o.userData.tag;
    if (o.isMesh) {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, a = g.attributes;
      const uvBase = g.userData.uvBase || a.uv;
      n.mesh = { n: a.position.count, pos: A3(a.position.array), nrm: A3(a.normal.array), uv: uvBase ? UV(uvBase.array) : null,
        color: a.color ? A3(a.color.array) : null, mat: names.get(o.material) || 'unknown' };
      if (extra && extra.camo && extra.camo.has(o)) n.mesh.uvCamo = UV(camoUV(g).array);
    }
    nodes.push(n);
    for (const c of o.children) walk(c, id);
  };
  walk(root, -1);
  return nodes;
}
function exportModels() {
  for (const n of ['gun_metal', 'gun_poly', 'gun_tan', 'glove0', 'glove1', 'sleeve0', 'sleeve1', 'blade', 'nade', 'sprites', 'gun_wood']) { const t = new THREE.Texture(); t.name = n; R.textures[n] = t; }
  const M = vmMaterials(), mats = {}, names = new Map();
  for (const [k, m] of Object.entries(M)) { names.set(m, k); mats[k] = matInfo(m); }
  const vm = {};
  for (const fn of [buildRifleVM, buildPistolVM, buildKnifeVM, buildSmokeVM, buildSmgVM, buildShotgunVM, buildSniperVM, buildChargeVM]) {
    const gun = fn === buildRifleVM || fn === buildPistolVM || fn === buildSmgVM || fn === buildShotgunVM || fn === buildSniperVM;
    const Mg = gun ? vmMatsFor(M) : M;
    if (gun) for (const k of ['metal', 'poly', 'tan', 'wood']) names.set(Mg[k], k);
    const m = fn(Mg);
    if (gun) vmPrepareKit(m, Mg);
    for (const [k, o] of Object.entries(m.parts)) o.userData.tag = 'part:' + k;
    for (const [k, o] of Object.entries(m.anchors)) o.userData.tag = 'anchor:' + k;
    if (m.flash) m.flash.userData.tag = 'flash';
    for (const [k, o] of Object.entries(m.att || {})) o.userData.tag = 'att:' + k;
    const camo = new Set(m.bodyMeshes || []);
    const rest = {}; for (const [k, r] of Object.entries(m.rest)) rest[k] = { p: r.p.toArray(), r: [r.r.x, r.r.y, r.r.z] };
    vm[m.id] = { id: m.id, base: m.base, rest, flashScale: m.flashScale || 1, attExt: m.attExt || {}, ironY: m.ironY || 0, adsPose: m.adsPose || null,
      hidden: (m.hidden || []).slice(), tris: m.tris, nodes: exportTree(m.root, names, { camo }) };
  }
  const chars = {};
  for (const team of [0, 1]) {
    const g = chGeometry(team), a = g.attributes, n = a.position.count, bi = new Uint8Array(n * 4);
    for (let i = 0; i < n * 4; i++) bi[i] = a.skinIndex.array[i];
    chars[team] = { n, pos: A3(a.position.array), nrm: A3(a.normal.array), uv: UV(a.uv.array), bones: toB64(wind(bi, 4)), weights: f32(wind(a.skinWeight.array, 4)) };
  }
  const weapons = {};
  for (const id of ['rifle', 'pistol', 'knife', 'smoke', 'smg', 'shotgun', 'sniper', 'charge']) {
    const { surfaces, muzzle } = chWeaponGeo(id);
    weapons[id] = { muzzle, surfaces: surfaces.map(({ mat, geo }) => { const a = geo.attributes; return { mat, n: a.position.count, pos: A3(a.position.array), nrm: A3(a.normal.array), uv: UV(a.uv.array) }; }) };
  }
  return { mats, vm, chars, weapons, bones: CH_BONES, holds: HOLDS, hitboxes: HITBOXES, mounts: VM_MOUNTS };
}

function exportData() {
  const strip = (o, fn) => { const r = {}; for (const [id, a] of Object.entries(o)) { const c = {}; for (const [k, v] of Object.entries(a)) if (k !== fn && typeof v !== 'function') c[k] = v; r[id] = c; } return r; };
  return { weapons: WEAPONS, clips: VM_CLIPS, arsenal: { attachments: strip(ATTACHMENTS, 'apply'), camos: strip(CAMOS, 'paint'), slots: ATT_SLOTS, armory: ARMORY_GUNS, priceK: GUN_PRICE_K, tiers: CAMO_TIERS } };
}
`;

// sound list: [name, variants, render seconds, body using S (a Snd bound to an offline context)]
const steps = ['concrete', 'metal', 'wood', 'sand', 'cloth', 'tile'];
const SOUNDS = [
  ['shot_rifle', 3, 2.6, 'S.rifleShot(null)'], ['shot_pistol', 3, 2.4, 'S.pistolShot(null)'], ['shot_smg', 3, 2.4, 'S.smgShot(null)'],
  ['shot_shotgun', 3, 2.8, 'S.shotgunShot(null)'], ['shot_sniper', 3, 3.0, 'S.sniperShot(null)'],
  ['supp_rifle', 3, 2.0, "S.suppShot(null, 'rifle')"], ['supp_pistol', 3, 2.0, "S.suppShot(null, 'pistol')"], ['supp_sniper', 3, 2.0, "S.suppShot(null, 'sniper')"],
  ['wallbang', 2, 2.8, 'S.wallbang(null)'],
  ...steps.map((s) => [`step_${s}`, 4, 1.6, `S.footstep('${s}', 1, null)`]),
  ['land', 1, 1.4, 'S.tone(S.ctx.currentTime, [S.master], { f0: 95, f1: 48, dur: 0.12, g: 0.35 })'], ['jump', 1, 1.0, 'S.jump()'],
  ['impact_metal', 3, 1.8, 'S.ricochet = () => {}; S.impact("metal", null)'], ['impact_wood', 3, 1.6, 'S.impact("wood", null)'],
  ['impact_sand', 3, 1.6, 'S.impact("sand", null)'], ['impact_concrete', 3, 1.6, 'S.impact("concrete", null)'],
  ['ricochet', 3, 1.8, 'S.ricochet(null)'], ['plate', 2, 2.0, 'S.plate(null)'], ['dry', 1, 0.6, 'S.dry()'],
  ...['wbArm', 'wbOff', 'magout', 'magin', 'bolt', 'cloth', 'slide', 'knifeDraw', 'pin', 'throw', 'pumpBack', 'pumpFwd', 'shellIn', 'boltUp', 'boltBack', 'boltFwd', 'boltDown', 'zoom']
    .map((p) => [`sfx_${p}`, 1, 0.8, `S.sfx('${p}')`]),
  ['sfx_key', 3, 0.5, "S.sfx('key')"],
  ['door_metal', 1, 1.8, 'S.door(null, true, true)'], ['door_wood_open', 1, 1.8, 'S.door(null, false, true)'], ['door_wood_close', 1, 1.8, 'S.door(null, false, false)'],
  ['swish', 3, 0.6, 'S.knifeSwish(false)'], ['swish_heavy', 3, 0.7, 'S.knifeSwish(true)'],
  ['knifehit_metal', 2, 1.4, "S.knifeHit('metal', null, false)"], ['knifehit_wood', 2, 1.4, "S.knifeHit('wood', null, false)"],
  ['knifehit_sand', 2, 1.4, "S.knifeHit('sand', null, false)"], ['knifehit_concrete', 2, 1.4, "S.knifeHit('concrete', null, false)"],
  ['bounce_soft', 2, 1.2, "S.nadeBounce('sand', 400, null)"], ['bounce_wood', 2, 1.2, "S.nadeBounce('wood', 400, null)"], ['bounce_hard', 2, 1.4, "S.nadeBounce('metal', 400, null)"],
  ['smoke_pop', 1, 5.0, 'S.smokePop(null)'],
  ['shell_rifle', 2, 1.0, "S.shell(null, 'rifle', 0, 'concrete')"], ['shell_pistol', 2, 1.0, "S.shell(null, 'pistol', 0, 'concrete')"],
  ['shell_shotgun', 2, 1.0, "S.shell(null, 'shotgun', 0, 'concrete')"], ['shell_soft', 1, 0.8, "S.shell(null, 'rifle', 0, 'sand')"],
  ['bodyhit', 2, 1.2, 'S.bodyHit(null, false)'], ['bodyhit_helmet', 2, 1.2, 'S.bodyHit(null, true)'], ['hurt', 1, 1.0, 'S.hurt()'], ['death', 1, 1.6, 'S.death(null)'],
  ['armed', 1, 1.4, 'S.armed(null)'], ['beep_0', 1, 1.0, 'S.beep(null, 0)'], ['beep_1', 1, 1.0, 'S.beep(null, 0.5)'], ['beep_2', 1, 1.0, 'S.beep(null, 1)'],
  ['defuse_start', 1, 1.2, 'S.defuseStart(null)'], ['defused', 1, 1.6, 'S.defused(null)'], ['explosion', 2, 6.0, 'S.explosion(null)'],
  ['buy', 1, 0.8, 'S.buy()'], ['round_go', 1, 1.0, 'S.roundGo()'], ['round_win', 1, 1.4, 'S.roundEnd(true)'], ['round_lose', 1, 1.4, 'S.roundEnd(false)'],
  ['pickup', 1, 0.8, 'S.pickup()'], ['drop', 1, 1.0, "S.itemDrop(null, 'rifle')"], ['drop_heavy', 1, 1.0, "S.itemDrop(null, 'charge')"], ['ui', 1, 0.4, 'S.ui()'],
];
const SOUND_RATE = 32000, SOUND_SPACE = 0.25;

// ---------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('page:', m.text()); });
await page.route('http://wallr.export/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>wallr export</title>' }));
await page.goto('http://wallr.export/');
await page.addScriptTag({ content: readFileSync(threePath, 'utf8') });
const code = stubs + '\n' + files.map((f) => readFileSync(f, 'utf8')).join('\n') + '\n' + helpers +
  '\nreturn { exportTextures, exportMap, exportSounds, exportModels, exportData, MAPS };';
await page.evaluate((c) => { window.X = new Function(c)(); }, code);
page.setDefaultTimeout(0);
log('sources loaded:', files.length, 'files');

const writeB64 = (rel, b64) => put(rel, Buffer.from(b64, 'base64'));

if (want.has('textures')) {
  const r = await page.evaluate(() => window.X.exportTextures());
  const index = {};
  for (const [name, t] of Object.entries(r.tex)) {
    index[name] = { ...t.def, avg: t.avg, w: t.w, h: t.h, file: t.png ? `${name}.png` : null, normal: t.normal ? `${name}_n.png` : null, orm: t.orm ? `${name}_orm.png` : null };
    if (t.png) writeB64(`textures/${name}.png`, t.png);
    if (t.normal) writeB64(`textures/${name}_n.png`, t.normal);
    if (t.orm) writeB64(`textures/${name}_orm.png`, t.orm);
  }
  put('textures/textures.json', json(index));
  for (const [id, b] of Object.entries(r.icons)) writeB64(`ui/icon_${id}.png`, b);
  for (const [key, b] of Object.entries(r.thumbs)) writeB64(`ui/thumb_${key}.png`, b);
  log('textures:', Object.keys(index).length, 'icons:', Object.keys(r.icons).length);
}

if (want.has('data')) {
  const r = await page.evaluate(() => window.X.exportData());
  put('data/weapons.json', json(r.weapons));
  put('data/vm_clips.json', json(r.clips));
  put('data/arsenal.json', json(r.arsenal));
  log('data: weapons', Object.keys(r.weapons).length);
}

if (want.has('models')) {
  const r = await page.evaluate(() => window.X.exportModels());
  // binary blobs: every base64 field becomes a slice of one .bin file per model set
  const pack = (obj, bin) => JSON.parse(JSON.stringify(obj), function (k, v) {
    if (typeof v === 'string' && ['pos', 'nrm', 'uv', 'lm', 'color', 'uvCamo', 'bone', 'bones', 'weights'].includes(k)) {
      const b = Buffer.from(v, 'base64'), off = bin.len;
      bin.parts.push(b); bin.len += b.length;
      return [off, b.length];
    }
    return v;
  });
  const bin = { parts: [], len: 0 };
  const out = pack(r, bin);
  put('models/models.json', json(out));
  put('models/models.bin', Buffer.concat(bin.parts));
  log('models: viewmodels', Object.keys(r.vm).length, 'bytes', bin.len);
}

if (want.has('maps')) {
  const keys = mapsArg ? mapsArg.split(',') : await page.evaluate(() => Object.keys(window.X.MAPS));
  for (const key of keys) {
    const r = await page.evaluate((k) => window.X.exportMap(k), key);
    const bin = { parts: [], len: 0 };
    const add = (b64) => { const b = Buffer.from(b64, 'base64'), off = bin.len; bin.parts.push(b); bin.len += b.length; return [off, b.length]; };
    const geo = (g) => ({ mat: g.mat, chunk: g.chunk ?? 0, n: g.n, pos: add(g.pos), nrm: add(g.nrm), uv: add(g.uv), lm: add(g.lm) });
    const level = { ...r.meta, groups: r.groups.map(geo), ents: r.ents.map((e) => ({ brush: e.brush, groups: e.groups.map(geo) })), probeData: add(r.probeData), probeValid: add(r.probeValid) };
    put(`maps/${key}/level.json`, json(level));
    put(`maps/${key}/level.bin`, Buffer.concat(bin.parts));
    put(`maps/${key}/brushes.json`, json(r.brushes));
    put(`maps/${key}/nav.bin`, navBin(r.nav));
    put(`maps/${key}/lightmap.png`, pngRGBA(r.meta.atlasW, r.meta.atlasH, Buffer.from(r.lightmap, 'base64')));
    writeB64(`maps/${key}/radar.png`, r.radar);
    log(`map ${key}:`, r.brushes.length, 'brushes,', r.nav.nodes.length, 'nav nodes,', `atlas ${r.meta.atlasW}x${r.meta.atlasH},`, `bake ${r.meta.bakeStats.ms} ms`);
  }
}

if (want.has('sounds')) {
  const r = await page.evaluate(([list, rate, space]) => window.X.exportSounds(list, rate, space), [SOUNDS, SOUND_RATE, SOUND_SPACE]);
  let peak = 0;
  for (const vs of Object.values(r)) for (const v of vs) peak = Math.max(peak, v.peak);
  const gain = 0.97 / peak, index = { rate: SOUND_RATE, gain, sounds: {} };
  const wav = (f) => {
    const n = f.length, b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(SOUND_RATE, 24); b.writeUInt32LE(SOUND_RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(f[i] * gain * 32767))), 44 + i * 2);
    return b;
  };
  let bytes = 0;
  for (const [name, vs] of Object.entries(r)) {
    index.sounds[name] = vs.length;
    vs.forEach((v, i) => { const f = new Float32Array(Buffer.from(v.data, 'base64').buffer.slice(0)); const b = wav(f); bytes += b.length; put(`sounds/${name}_${i}.wav`, b); });
  }
  put('sounds/sounds.json', json(index));
  log('sounds:', Object.keys(r).length, 'effects,', `${(bytes / 1e6).toFixed(1)} MB, gain ${gain.toFixed(3)}`);
}

await browser.close();
log('done');
