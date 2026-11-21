// Core helpers: math, deterministic noise, settings persistence.
// All game modules share this IIFE scope; keep names stable.

const GAME_VERSION = 'stage-6';
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Frame-rate independent exponential approach.
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const yieldUI = () => new Promise((r) => setTimeout(r, 0));

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash -> [0,1). Murmur-style mixing; stable across runs.
function hashi(x, y, s) {
  let h = Math.imul((s | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (x | 0), 0xcc9e2d51); h = (h << 15) | (h >>> 17);
  h = Math.imul(h ^ (y | 0), 0x1b873593); h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Tileable value noise. x,y are in lattice units; px,py are integer periods.
function vnoise(x, y, px, py, s) {
  const xf = Math.floor(x), yf = Math.floor(y);
  let fx = x - xf, fy = y - yf;
  let x0 = xf % px; if (x0 < 0) x0 += px;
  let y0 = yf % py; if (y0 < 0) y0 += py;
  const x1 = x0 + 1 === px ? 0 : x0 + 1;
  const y1 = y0 + 1 === py ? 0 : y0 + 1;
  const a = hashi(x0, y0, s), b = hashi(x1, y0, s), c = hashi(x0, y1, s), d = hashi(x1, y1, s);
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// Fractal sum of tileable value noise, normalised to [0,1].
function fbm(x, y, px, py, oct, s) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x, y, px, py, s + i * 131);
    norm += amp; x *= 2; y *= 2; px *= 2; py *= 2; amp *= 0.5;
  }
  return sum / norm;
}

// Tileable Worley noise: out = [F1, F2, cellHash].
function worley(x, y, p, s, out) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      let wx = cx % p; if (wx < 0) wx += p;
      let wy = cy % p; if (wy < 0) wy += p;
      const dx = cx + hashi(wx, wy, s) - x, dy = cy + hashi(wx, wy, s + 7) - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = hashi(wx, wy, s + 13); } else if (d < f2) f2 = d;
    }
  }
  out[0] = f1; out[1] = f2; out[2] = id;
  return out;
}

// Surface types drive footsteps, impact effects and decals.
const SURF_NAMES = ['concrete', 'brick', 'plaster', 'wood', 'metal', 'sand', 'tile', 'cloth', 'paper'];
const SURF = Object.fromEntries(SURF_NAMES.map((n, i) => [n, i]));

// ---------------------------------------------------------------------------
// Settings (per-viewer convenience; storage may be unavailable, so never rely on it)
// ---------------------------------------------------------------------------
const Settings = {
  key: 'shortfuse.settings.v1',
  defaults: {
    sensitivity: 2.0, invertY: false, rawInput: true,
    fov: 90, aspect: 'wide', vmFov: 64, renderScale: 100, maxDpr: 1.5,
    xhStyle: 'dynamic', xhColor: '#4cff6a', xhSize: 6, xhGap: 3, xhThick: 2, xhDot: false, xhOutline: true, xhRecoil: false,
    volume: 70, showFps: true, showSpeed: true, showHints: true, botSkill: 'normal', team: 1, ff: false, mode: 'defuse', matchLen: 'standard', map: 'depot',
  },
  v: null,
  listeners: [],
  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.key) || 'null'); } catch (e) { saved = null; }
    this.v = Object.assign({}, this.defaults);
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(this.defaults)) {
        if (k in saved && typeof saved[k] === typeof this.defaults[k]) this.v[k] = saved[k];
      }
    }
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.v)); } catch (e) { /* storage blocked */ } },
  set(k, val) {
    this.v[k] = val; this.save();
    for (const f of this.listeners) f(k, val);
  },
  on(f) { this.listeners.push(f); },
};
Settings.load();
