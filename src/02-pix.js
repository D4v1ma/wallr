// Float RGB pixel buffer for procedural texture synthesis, plus canvas helpers.

const makeCanvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const STENCIL_FONT = 'Impact, "Arial Black", "Helvetica Neue", Arial, sans-serif';

class Pix {
  constructor(w, h = w) { this.w = w; this.h = h; this.d = new Float32Array(w * h * 3); }

  fill(r, g, b) {
    const d = this.d;
    for (let i = 0; i < d.length; i += 3) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
    return this;
  }

  // fn(x, y, c) where c is [r,g,b] (read/write).
  map(fn) {
    const { w, h, d } = this, c = [0, 0, 0];
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 3) {
        c[0] = d[i]; c[1] = d[i + 1]; c[2] = d[i + 2];
        fn(x, y, c);
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      }
    }
    return this;
  }

  // Paint rgb through a mask drawn with the 2D canvas API (anything drawn counts).
  // wear > 0 erodes the paint with noise, like an old stencil.
  stamp(draw, rgb, alpha = 1, wear = 0, seed = 1) {
    const { w, h, d } = this;
    const cv = makeCanvas(w, h), ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    draw(ctx, w, h);
    const m = ctx.getImageData(0, 0, w, h).data;
    const sx = 24, sy = Math.max(1, Math.round(24 * h / w));
    for (let p = 0, i = 0; p < w * h; p++, i += 3) {
      let a = m[p * 4 + 3] / 255;
      if (a <= 0) continue;
      if (wear > 0) {
        const x = p % w, y = (p / w) | 0;
        const n = fbm(x / w * sx, y / h * sy, sx, sy, 3, seed) * 0.75 + hashi(x, y, seed) * 0.25;
        a *= clamp(1 - wear * smoothstep(0.42, 0.62, n) * 1.4, 0, 1);
      }
      a *= alpha;
      d[i] += (rgb[0] - d[i]) * a; d[i + 1] += (rgb[1] - d[i + 1]) * a; d[i + 2] += (rgb[2] - d[i + 2]) * a;
    }
    return this;
  }

  // Multiply brightness by k where the drawn mask is opaque.
  shade(draw, k) {
    const { w, h, d } = this;
    const cv = makeCanvas(w, h), ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    draw(ctx, w, h);
    const m = ctx.getImageData(0, 0, w, h).data;
    for (let p = 0, i = 0; p < w * h; p++, i += 3) {
      const a = m[p * 4 + 3] / 255;
      if (a <= 0) continue;
      const f = 1 + (k - 1) * a;
      d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
    }
    return this;
  }

  toCanvas() {
    const { w, h, d } = this;
    const cv = makeCanvas(w, h), ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h), o = img.data;
    for (let i = 0, j = 0; i < d.length; i += 3, j += 4) {
      o[j] = d[i] * 255; o[j + 1] = d[i + 1] * 255; o[j + 2] = d[i + 2] * 255; o[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

// Average colour of a canvas (0..1), used as albedo for bounce lighting.
function canvasAverage(cv) {
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return [r / n / 255, g / n / 255, b / n / 255];
}

// Small rivet / nail head: dark ring, lit top-left, shadow bottom-right.
function stampRivets(P, pts, r = 2.6, base = 0.55) {
  P.stamp((ctx) => { for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x + 0.8, y + 0.9, r + 0.6, 0, TAU); ctx.fill(); } }, [0.05, 0.05, 0.05], 0.45);
  P.stamp((ctx) => { for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); } }, [base, base, base * 0.98], 0.9);
  P.stamp((ctx) => { for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.45, 0, TAU); ctx.fill(); } }, [0.85, 0.85, 0.82], 0.5);
}
