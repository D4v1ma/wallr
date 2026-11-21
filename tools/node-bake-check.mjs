// Headless check of collision + level compile + lightmap bake (no DOM needed).
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../src/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^0[1-8]-.*\.js$/.test(f)).sort();
const src = files.map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const api = new Function(`${src}\nreturn { TEX_DEFS, SURF, buildTestRange, compileLevel, bakeLighting, makeTrace, MASK_PLAYER, MASK_SHOT, CONTENTS };`)();
globalThis.performance ??= { now: () => Date.now() };
const tex = Object.fromEntries(Object.entries(api.TEX_DEFS).map(([n, def]) => [n, { def, avg: def.fullbright || [0.5, 0.5, 0.5] }]));
let t = performance.now();
const map = api.buildTestRange();
const L = api.compileLevel(map, tex);
console.log(`compile: ${(performance.now() - t).toFixed(0)} ms, brushes ${L.cw.brushes.length} (+${L.cw.dynamic.length} dynamic), faces ${L.faces.length}, luxels ${L.luxels}, atlas ${L.atlasW}x${L.atlasH}, BVH nodes ${L.cw.nodeCount}`);
const groups = [...L.groups.entries()].map(([m, g]) => `${m}:${g.pos.length / 9}`).join(' ');
console.log('tris by material:', groups);
t = performance.now();
const res = await api.bakeLighting(L, () => {});
console.log(`bake: ${(performance.now() - t).toFixed(0)} ms`, res.stats, 'probes', res.probes.nx, res.probes.ny, res.probes.nz);
// quick trace sanity: drop a player hull onto the floor at spawn
const tr = api.makeTrace();
L.cw.trace(tr, 96, 100 + 36, -416, 96, -50 + 36, -416, 16, 36, 16, api.MASK_PLAYER);
console.log('drop trace: fraction', tr.fraction.toFixed(4), 'end feet y', (tr.ey - 36).toFixed(3), 'normal', tr.nx, tr.ny, tr.nz, 'surf', tr.surf);
// lightmap stats
let mx = 0, sum = 0; for (let i = 0; i < res.lmData.length; i += 4) { mx = Math.max(mx, res.lmData[i]); sum += res.lmData[i]; }
console.log('lm max byte', mx, 'avg byte', (sum / (res.lmData.length / 4)).toFixed(1));
