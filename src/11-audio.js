// All sounds are synthesised with WebAudio: filtered noise bursts, tones and a generated reverb.

const Snd = {
  ctx: null, master: null, revSend: null, noise: null, ready: false, space: 0.2,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC(); } catch (e) { return; }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volumeGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.16;
    this.master.connect(comp); comp.connect(ctx.destination);
    const rev = ctx.createConvolver();
    rev.buffer = this.makeIR(1.8, 3.0);
    this.revSend = ctx.createGain(); this.revSend.gain.value = this.space;
    this.revSend.connect(rev); rev.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ready = true;
  },

  volumeGain() { const v = Settings.v.volume / 100; return v * v * 0.9; },
  setVolume() { if (this.master) this.master.gain.setTargetAtTime(this.volumeGain(), this.ctx.currentTime, 0.02); },

  makeIR(dur, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
        d[i] = lp * Math.pow(1 - i / n, decay) * (i < 40 ? i / 40 : 1);
      }
    }
    return buf;
  },

  // Indoor spaces get a wetter reverb send (0..1 openness from the light probes).
  setSpace(openSky) {
    const target = lerp(0.5, 0.12, clamp(openSky, 0, 1));
    this.space = target;
    if (this.revSend) this.revSend.gain.setTargetAtTime(target, this.ctx.currentTime, 0.3);
  },

  listener(x, y, z, fx, fy, fz) {
    if (!this.ready) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(x, t); L.positionY.setValueAtTime(y, t); L.positionZ.setValueAtTime(z, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(fy, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else { L.setPosition(x, y, z); L.setOrientation(fx, fy, fz, 0, 1, 0); }
  },

  // Destination nodes for a sound: positional panner (pos) or direct; plus reverb send.
  dest(pos, wet = 0.6) {
    let node = this.master;
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
      p.refDistance = 110; p.rolloffFactor = 1.1; p.maxDistance = 8000;
      if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; } else p.setPosition(pos[0], pos[1], pos[2]);
      p.connect(this.master);
      node = p;
    }
    const outs = [node];
    if (wet > 0) {
      const g = this.ctx.createGain(); g.gain.value = wet; g.connect(this.revSend);
      if (pos) node.connect(g); else outs.push(g);
    }
    return outs;
  },

  nz(t, outs, o) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noise; src.playbackRate.value = o.rate || 0.92 + Math.random() * 0.16;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.value = o.f || 1000; f.Q.value = o.q ?? 0.7;
    const g = ctx.createGain(), a = o.a ?? 0.001, d = o.d ?? 0.08;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    src.connect(f); f.connect(g); for (const n of outs) g.connect(n);
    src.start(t, Math.random() * 0.7, a + d + 0.05);
  },

  tone(t, outs, o) {
    const ctx = this.ctx, osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const g = ctx.createGain(), a = o.a ?? 0.002;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); for (const n of outs) g.connect(n);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  },

  rifleShot(pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos || null, 1.0), dry = pos ? o : [this.master];
    const p = 0.96 + Math.random() * 0.08;
    this.nz(t, o, { type: 'bandpass', f: 2300 * p, q: 0.8, g: 0.95, d: 0.07 });
    this.nz(t, o, { type: 'lowpass', f: 1350 * p, q: 0.6, g: 0.9, d: 0.17 });
    this.tone(t, dry, { f0: 155 * p, f1: 44, dur: 0.15, g: 1.0 });
    this.nz(t, dry, { type: 'highpass', f: 5200, q: 0.5, g: 0.22, a: 0.0005, d: 0.02 });
    this.nz(t + 0.012, [this.revSend], { type: 'lowpass', f: 720, q: 0.4, g: 0.6, a: 0.01, d: 0.55 });
  },

  footstep(surf, vol = 1, pos = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos, 0.25), k = vol * (pos ? 1.4 : 1);
    switch (surf) {
      case 'metal':
        this.nz(t, o, { type: 'bandpass', f: 3100 + Math.random() * 500, q: 5, g: 0.34 * k, d: 0.06 });
        this.tone(t, o, { type: 'triangle', f0: 1350 + Math.random() * 200, dur: 0.09, g: 0.05 * k });
        this.nz(t, o, { type: 'lowpass', f: 420, g: 0.3 * k, d: 0.05 });
        break;
      case 'wood':
        this.nz(t, o, { type: 'lowpass', f: 950, g: 0.42 * k, d: 0.06 });
        this.tone(t, o, { f0: 190, f1: 120, dur: 0.07, g: 0.28 * k });
        break;
      case 'sand':
        for (let i = 0; i < 3; i++) this.nz(t + i * 0.013, o, { type: 'highpass', f: 2600, g: 0.1 * k, d: 0.03 });
        this.nz(t, o, { type: 'lowpass', f: 1300, g: 0.24 * k, d: 0.08 });
        break;
      case 'cloth':
        this.nz(t, o, { type: 'lowpass', f: 600, g: 0.25 * k, d: 0.06 });
        break;
      default:
        this.nz(t, o, { type: 'bandpass', f: 1900 + Math.random() * 400, q: 1.2, g: 0.36 * k, d: 0.035 });
        this.nz(t, o, { type: 'lowpass', f: 520, g: 0.34 * k, d: 0.05 });
        if (surf === 'tile') this.tone(t, o, { f0: 2500, dur: 0.03, g: 0.04 * k });
    }
  },

  land(surf, speed) {
    if (!this.ready) return;
    const k = clamp(speed / 450, 0.4, 1.6);
    this.footstep(surf, 1.2 * k);
    const t = this.ctx.currentTime;
    this.tone(t, [this.master], { f0: 95, f1: 48, dur: 0.12, g: 0.35 * k });
  },

  jump() { if (this.ready) this.nz(this.ctx.currentTime, [this.master], { type: 'lowpass', f: 900, g: 0.1, d: 0.1 }); },

  impact(surf, pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos, 0.5);
    switch (surf) {
      case 'metal':
        this.nz(t, o, { type: 'bandpass', f: 4200, q: 2, g: 0.45, d: 0.03 });
        this.tone(t, o, { f0: 2700 + Math.random() * 600, dur: 0.22, g: 0.1 });
        this.tone(t, o, { f0: 4400 + Math.random() * 500, dur: 0.15, g: 0.05 });
        if (Math.random() < 0.35) this.ricochet(pos);
        break;
      case 'wood': case 'paper':
        this.nz(t, o, { type: 'lowpass', f: 1200, g: 0.5, d: 0.07 });
        this.tone(t, o, { f0: 240, f1: 140, dur: 0.08, g: 0.22 });
        break;
      case 'sand': case 'cloth':
        this.nz(t, o, { type: 'lowpass', f: 1400, g: 0.32, d: 0.06 });
        this.nz(t, o, { type: 'highpass', f: 3200, g: 0.1, d: 0.1 });
        break;
      default:
        this.nz(t, o, { type: 'bandpass', f: 2600 + Math.random() * 600, q: 1.3, g: 0.5, d: 0.05 });
        this.nz(t, o, { type: 'lowpass', f: 720, g: 0.3, d: 0.08 });
    }
  },

  ricochet(pos) {
    const ctx = this.ctx, t = ctx.currentTime + 0.01, o = this.dest(pos, 0.6);
    const osc = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    const f0 = 2600 + Math.random() * 1400, dur = 0.22 + Math.random() * 0.15;
    osc.type = 'sine'; osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f0 * 0.38, t + dur);
    lfo.frequency.value = 38 + Math.random() * 20; lg.gain.value = 120; lfo.connect(lg); lg.connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); for (const n of o) g.connect(n);
    osc.start(t); lfo.start(t); osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  },

  plate(pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos, 0.7);
    for (const [f, g, d] of [[820, 0.22, 0.7], [1370, 0.14, 0.55], [2250, 0.08, 0.4], [3480, 0.04, 0.25]]) this.tone(t, o, { f0: f * (0.98 + Math.random() * 0.04), dur: d, g });
    this.nz(t, o, { type: 'bandpass', f: 3000, q: 1, g: 0.35, d: 0.03 });
  },

  dry() { if (!this.ready) return; const t = this.ctx.currentTime; this.nz(t, [this.master], { type: 'highpass', f: 4200, g: 0.28, d: 0.015 }); this.tone(t, [this.master], { f0: 1900, dur: 0.025, g: 0.05 }); },

  reload(part) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = [this.master];
    if (part === 'out') { this.nz(t, o, { type: 'bandpass', f: 1500, q: 2, g: 0.35, d: 0.05 }); this.nz(t + 0.05, o, { type: 'lowpass', f: 600, g: 0.2, d: 0.08 }); }
    else if (part === 'in') { this.nz(t, o, { type: 'bandpass', f: 2600, q: 3, g: 0.45, d: 0.025 }); this.nz(t + 0.06, o, { type: 'highpass', f: 3000, g: 0.35, d: 0.02 }); this.tone(t, o, { f0: 820, dur: 0.05, g: 0.06 }); }
    else if (part === 'bolt') { this.nz(t, o, { type: 'bandpass', f: 2100, q: 2, g: 0.5, d: 0.04 }); this.nz(t + 0.085, o, { type: 'bandpass', f: 2700, q: 2.5, g: 0.55, d: 0.035 }); }
    else if (part === 'cloth') this.nz(t, o, { type: 'lowpass', f: 700, g: 0.12, d: 0.12 });
  },

  door(pos, metal, opening) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, o = this.dest(pos, 0.5);
    this.nz(t, o, { type: 'highpass', f: 2500, g: 0.25, d: 0.02 });
    if (metal) {
      this.tone(t + 0.02, o, { f0: 310, dur: 0.25, g: 0.12 }); this.tone(t + 0.02, o, { f0: 470, dur: 0.2, g: 0.07 });
      this.nz(t, o, { type: 'lowpass', f: 500, g: 0.35, d: 0.18 });
    } else {
      const osc = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), dur = 0.45;
      osc.type = 'sawtooth';
      const f0 = opening ? 110 : 150;
      osc.frequency.setValueAtTime(f0, t); osc.frequency.linearRampToValueAtTime(f0 * 1.6, t + dur * 0.6); osc.frequency.linearRampToValueAtTime(f0 * 1.2, t + dur);
      bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1500, t + dur); bp.Q.value = 6;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(bp); bp.connect(g); for (const n of o) g.connect(n);
      osc.start(t); osc.stop(t + dur + 0.05);
      this.nz(t, o, { type: 'lowpass', f: 400, g: 0.2, d: 0.12 });
    }
  },

  pistolShot(pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos || null, 0.9), dry = pos ? o : [this.master], p = 0.95 + Math.random() * 0.1;
    this.nz(t, o, { type: 'bandpass', f: 3100 * p, q: 0.9, g: 0.85, d: 0.05 });
    this.nz(t, o, { type: 'lowpass', f: 1900 * p, q: 0.6, g: 0.6, d: 0.1 });
    this.tone(t, dry, { f0: 230 * p, f1: 70, dur: 0.09, g: 0.65 });
    this.nz(t, dry, { type: 'highpass', f: 6000, g: 0.2, a: 0.0005, d: 0.015 });
    this.nz(t + 0.01, [this.revSend], { type: 'lowpass', f: 900, q: 0.4, g: 0.4, a: 0.01, d: 0.4 });
  },

  // Gunshot by sound id; positional when pos is given (other players), direct for your own gun.
  shot(kind, pos) {
    if (kind === 'pistol') this.pistolShot(pos); else if (kind === 'smg') this.smgShot(pos);
    else if (kind === 'shotgun') this.shotgunShot(pos); else if (kind === 'sniper') this.sniperShot(pos); else this.rifleShot(pos);
  },

  smgShot(pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos || null, 0.8), dry = pos ? o : [this.master], p = 0.95 + Math.random() * 0.1;
    this.nz(t, o, { type: 'bandpass', f: 2700 * p, q: 0.9, g: 0.75, d: 0.045 });
    this.nz(t, o, { type: 'lowpass', f: 1700 * p, q: 0.6, g: 0.55, d: 0.09 });
    this.tone(t, dry, { f0: 200 * p, f1: 60, dur: 0.07, g: 0.6 });
    this.nz(t, dry, { type: 'highpass', f: 6200, g: 0.16, a: 0.0005, d: 0.012 });
    this.nz(t + 0.01, [this.revSend], { type: 'lowpass', f: 900, q: 0.4, g: 0.35, a: 0.01, d: 0.32 });
  },

  shotgunShot(pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos || null, 1.1), dry = pos ? o : [this.master], p = 0.95 + Math.random() * 0.08;
    this.nz(t, o, { type: 'lowpass', f: 950 * p, q: 0.5, g: 1.0, d: 0.28 });
    this.nz(t, o, { type: 'bandpass', f: 1700 * p, q: 0.7, g: 0.85, d: 0.12 });
    this.tone(t, dry, { f0: 95 * p, f1: 32, dur: 0.26, g: 1.0 });
    this.nz(t, dry, { type: 'highpass', f: 4200, g: 0.3, a: 0.0005, d: 0.03 });
    this.nz(t + 0.015, [this.revSend], { type: 'lowpass', f: 600, q: 0.4, g: 0.8, a: 0.015, d: 0.8 });
  },

  sniperShot(pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos || null, 1.2), dry = pos ? o : [this.master], p = 0.97 + Math.random() * 0.06;
    this.nz(t, dry, { type: 'highpass', f: 3800, q: 0.6, g: 0.55, a: 0.0004, d: 0.025 });          // supersonic crack
    this.nz(t, o, { type: 'bandpass', f: 2000 * p, q: 0.7, g: 1.0, d: 0.09 });
    this.nz(t, o, { type: 'lowpass', f: 1100 * p, q: 0.5, g: 1.0, d: 0.34 });
    this.tone(t, dry, { f0: 125 * p, f1: 34, dur: 0.32, g: 1.0 });
    this.nz(t + 0.02, [this.revSend], { type: 'lowpass', f: 650, q: 0.4, g: 1.0, a: 0.02, d: 1.1 });
  },

  // Named one-shot effects used by weapon animation marks.
  sfx(part) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = [this.master];
    switch (part) {
      case 'magout': this.reload('out'); break;
      case 'magin': this.reload('in'); break;
      case 'bolt': this.reload('bolt'); break;
      case 'cloth': this.reload('cloth'); break;
      case 'slide':
        this.nz(t, o, { type: 'bandpass', f: 2400, q: 2.5, g: 0.45, d: 0.035 });
        this.nz(t + 0.07, o, { type: 'bandpass', f: 3200, q: 3, g: 0.55, d: 0.03 });
        this.tone(t + 0.07, o, { f0: 1500, dur: 0.04, g: 0.05 });
        break;
      case 'knifeDraw':
        this.nz(t, o, { type: 'highpass', f: 5000, g: 0.14, a: 0.02, d: 0.25 });
        this.tone(t, o, { f0: 4300, dur: 0.35, g: 0.03 }); this.tone(t, o, { f0: 6150, dur: 0.28, g: 0.02 });
        break;
      case 'pin':
        this.nz(t, o, { type: 'bandpass', f: 3600, q: 4, g: 0.35, d: 0.02 });
        this.tone(t + 0.02, o, { f0: 3900, dur: 0.12, g: 0.05 }); this.tone(t + 0.05, o, { f0: 5200, dur: 0.09, g: 0.035 });
        this.nz(t + 0.1, o, { type: 'bandpass', f: 2200, q: 3, g: 0.3, d: 0.02 });
        break;
      case 'throw':
        this.nz(t, o, { type: 'bandpass', f: 900, q: 0.8, g: 0.22, a: 0.04, d: 0.16 });
        break;
      case 'pumpBack':
        this.nz(t, o, { type: 'bandpass', f: 1500, q: 1.6, g: 0.5, d: 0.06 });
        this.nz(t + 0.03, o, { type: 'bandpass', f: 2600, q: 3, g: 0.35, d: 0.03 });
        break;
      case 'pumpFwd':
        this.nz(t, o, { type: 'bandpass', f: 1900, q: 1.8, g: 0.5, d: 0.05 });
        this.nz(t + 0.04, o, { type: 'bandpass', f: 3100, q: 3, g: 0.45, d: 0.025 }); this.tone(t + 0.04, o, { f0: 1250, dur: 0.05, g: 0.05 });
        break;
      case 'shellIn':
        this.nz(t, o, { type: 'bandpass', f: 2300, q: 2.5, g: 0.35, d: 0.03 }); this.nz(t + 0.05, o, { type: 'bandpass', f: 1400, q: 2, g: 0.25, d: 0.03 });
        break;
      case 'boltUp': this.nz(t, o, { type: 'bandpass', f: 2900, q: 3, g: 0.35, d: 0.025 }); break;
      case 'boltBack': this.nz(t, o, { type: 'bandpass', f: 1800, q: 1.8, g: 0.45, d: 0.07 }); break;
      case 'boltFwd': this.nz(t, o, { type: 'bandpass', f: 2200, q: 1.8, g: 0.45, d: 0.06 }); this.tone(t + 0.05, o, { f0: 1700, dur: 0.04, g: 0.04 }); break;
      case 'boltDown': this.nz(t, o, { type: 'bandpass', f: 3300, q: 3, g: 0.4, d: 0.02 }); break;
      case 'zoom': this.nz(t, o, { type: 'bandpass', f: 3600, q: 4, g: 0.18, d: 0.018 }); this.tone(t, o, { f0: 2600, dur: 0.03, g: 0.025 }); break;
      case 'key': this.tone(t, o, { f0: 1800 + Math.random() * 700, dur: 0.07, g: 0.06, type: 'square' }); this.nz(t, o, { type: 'highpass', f: 4000, g: 0.08, d: 0.01 }); break;
    }
  },

  knifeSwish(heavy) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), dur = heavy ? 0.26 : 0.18;
    src.buffer = this.noise; bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(heavy ? 500 : 800, t); bp.frequency.exponentialRampToValueAtTime(heavy ? 1800 : 2800, t + dur * 0.7);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(heavy ? 0.32 : 0.24, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  },

  knifeHit(surf, pos, heavy) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos, 0.4), k = heavy ? 1.3 : 1;
    if (surf === 'metal') {
      this.nz(t, o, { type: 'highpass', f: 3500, g: 0.4 * k, d: 0.04 });
      this.tone(t, o, { f0: 3300 + Math.random() * 400, dur: 0.18, g: 0.08 * k }); this.tone(t, o, { f0: 5100, dur: 0.12, g: 0.04 * k });
    } else if (surf === 'wood' || surf === 'paper') {
      this.nz(t, o, { type: 'lowpass', f: 1400, g: 0.5 * k, d: 0.06 }); this.tone(t, o, { f0: 260, f1: 160, dur: 0.07, g: 0.2 * k });
    } else if (surf === 'sand' || surf === 'cloth') {
      this.nz(t, o, { type: 'lowpass', f: 1000, g: 0.35 * k, d: 0.07 });
    } else {
      this.nz(t, o, { type: 'bandpass', f: 3000, q: 1.5, g: 0.45 * k, d: 0.04 }); this.nz(t, o, { type: 'highpass', f: 5000, g: 0.18 * k, d: 0.06 });
    }
  },

  nadeBounce(surf, speed, pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos, 0.3), k = clamp(speed / 400, 0.25, 1.2);
    if (surf === 'sand' || surf === 'cloth') this.nz(t, o, { type: 'lowpass', f: 700, g: 0.3 * k, d: 0.06 });
    else if (surf === 'wood') { this.nz(t, o, { type: 'lowpass', f: 1200, g: 0.35 * k, d: 0.05 }); this.tone(t, o, { f0: 330, dur: 0.06, g: 0.12 * k }); }
    else { this.nz(t, o, { type: 'bandpass', f: 2600, q: 2, g: 0.4 * k, d: 0.03 }); this.tone(t, o, { f0: 1750 + Math.random() * 300, dur: 0.12, g: 0.06 * k }); this.tone(t, o, { f0: 2900, dur: 0.09, g: 0.035 * k }); }
  },

  smokePop(pos) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, o = this.dest(pos, 0.6);
    this.tone(t, o, { f0: 120, f1: 50, dur: 0.18, g: 0.35 });
    this.nz(t, o, { type: 'lowpass', f: 900, g: 0.4, d: 0.12 });
    const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain(), dur = 3.2;
    src.buffer = this.noise; src.loop = true;
    hp.type = 'bandpass'; hp.Q.value = 0.6; hp.frequency.setValueAtTime(4200, t); hp.frequency.exponentialRampToValueAtTime(1400, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.08); g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp); hp.connect(g); for (const n of o) g.connect(n);
    src.start(t); src.stop(t + dur + 0.05);
  },

  shell(pos, kind, n, surf) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos, 0.15), k = (n === 0 ? 1 : 0.55) * (kind === 'pistol' ? 0.8 : 1);
    if (surf === 'sand' || surf === 'cloth') { this.nz(t, o, { type: 'highpass', f: 2500, g: 0.05 * k, d: 0.02 }); return; }
    if (kind === 'shotgun') { this.nz(t, o, { type: 'bandpass', f: 1300, q: 2.5, g: 0.16 * k, d: 0.035 }); this.tone(t, o, { f0: 820, dur: 0.05, g: 0.03 * k }); return; }
    const f = (kind === 'pistol' ? 5200 : 4300) * (0.95 + Math.random() * 0.1);
    this.tone(t, o, { f0: f, dur: 0.12, g: 0.05 * k }); this.tone(t, o, { f0: f * 1.37, dur: 0.09, g: 0.03 * k }); this.tone(t, o, { f0: f * 1.71, dur: 0.06, g: 0.02 * k });
  },

  bodyHit(pos, helmet) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos, 0.2);
    if (helmet) { this.tone(t, o, { f0: 2350, dur: 0.12, g: 0.12 }); this.tone(t, o, { f0: 3600, dur: 0.08, g: 0.07 }); this.nz(t, o, { type: 'highpass', f: 4000, g: 0.3, d: 0.02 }); }
    else { this.nz(t, o, { type: 'lowpass', f: 520, g: 0.5, d: 0.06 }); this.tone(t, o, { f0: 110, f1: 70, dur: 0.07, g: 0.25 }); }
  },

  hurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(t, [this.master], { f0: 85, f1: 50, dur: 0.18, g: 0.5 }); this.nz(t, [this.master], { type: 'lowpass', f: 300, g: 0.4, d: 0.12 });
  },

  death(pos) { if (this.ready) this.nz(this.ctx.currentTime + 0.25, this.dest(pos, 0.2), { type: 'lowpass', f: 380, g: 0.45, d: 0.18 }); },

  // The charge: armed chirp, fuse beeps (higher and shorter as time runs out), defuse kit clicks, the blast.
  armed(pos) { if (!this.ready) return; const t = this.ctx.currentTime, o = this.dest(pos, 0.3); for (let i = 0; i < 3; i++) this.tone(t + i * 0.09, o, { f0: 1650 + i * 330, dur: 0.07, g: 0.1, type: 'square' }); },
  beep(pos, urgency) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos, 0.25);
    this.tone(t, o, { f0: 2100 + urgency * 500, dur: 0.11 - urgency * 0.05, g: 0.16, type: 'square' });
  },
  defuseStart(pos) { if (!this.ready) return; const t = this.ctx.currentTime, o = this.dest(pos, 0.2); this.nz(t, o, { type: 'bandpass', f: 2400, q: 3, g: 0.3, d: 0.04 }); this.nz(t + 0.12, o, { type: 'bandpass', f: 1700, q: 3, g: 0.25, d: 0.04 }); },
  defused(pos) { if (!this.ready) return; const t = this.ctx.currentTime, o = this.dest(pos, 0.2); this.tone(t, o, { f0: 1400, f1: 700, dur: 0.35, g: 0.12, type: 'triangle' }); this.nz(t, o, { type: 'bandpass', f: 3000, q: 4, g: 0.3, d: 0.03 }); },
  explosion(pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos, 1.4);
    this.nz(t, o, { type: 'lowpass', f: 700, q: 0.4, g: 1.0, a: 0.004, d: 1.6 });
    this.nz(t, o, { type: 'bandpass', f: 1600, q: 0.6, g: 0.8, d: 0.35 });
    this.tone(t, o, { f0: 70, f1: 24, dur: 1.4, g: 1.0 });
    this.nz(t + 0.05, [this.revSend], { type: 'lowpass', f: 420, q: 0.4, g: 1.0, a: 0.05, d: 2.6 });
    for (let i = 0; i < 6; i++) this.nz(t + 0.4 + Math.random() * 1.2, o, { type: 'bandpass', f: 1800 + Math.random() * 2000, q: 2, g: 0.12, d: 0.05 });
  },
  buy() { if (!this.ready) return; const t = this.ctx.currentTime, o = [this.master]; this.nz(t, o, { type: 'bandpass', f: 2600, q: 2, g: 0.25, d: 0.03 }); this.tone(t + 0.03, o, { f0: 1320, dur: 0.06, g: 0.05 }); this.tone(t + 0.08, o, { f0: 1760, dur: 0.08, g: 0.05 }); },
  roundGo() { if (!this.ready) return; const t = this.ctx.currentTime, o = [this.master]; this.tone(t, o, { f0: 660, dur: 0.12, g: 0.08, type: 'triangle' }); this.tone(t + 0.13, o, { f0: 990, dur: 0.2, g: 0.08, type: 'triangle' }); },
  // Round over: a rising figure when your side wins, a falling one when it loses.
  roundEnd(won) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = [this.master], notes = won ? [523, 659, 784, 1047] : [622, 523, 440, 349];
    notes.forEach((f, i) => { this.tone(t + i * 0.14, o, { f0: f, dur: 0.32, g: 0.07, type: 'triangle' }); this.tone(t + i * 0.14, o, { f0: f * 2, dur: 0.18, g: 0.015 }); });
  },
  pickup() { if (!this.ready) return; const t = this.ctx.currentTime, o = [this.master]; this.nz(t, o, { type: 'bandpass', f: 1900, q: 1.5, g: 0.3, d: 0.05 }); this.nz(t + 0.07, o, { type: 'bandpass', f: 2900, q: 2.5, g: 0.32, d: 0.03 }); },
  itemDrop(pos, kind) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.dest(pos, 0.2), heavy = kind === 'charge';
    this.nz(t, o, { type: 'bandpass', f: heavy ? 650 : 1500, q: 1.2, g: 0.32, d: 0.08 }); this.tone(t, o, { f0: heavy ? 210 : 560, dur: 0.08, g: 0.05 });
  },
  ui() { if (this.ready) this.tone(this.ctx.currentTime, [this.master], { f0: 1250, dur: 0.035, g: 0.04 }); },
};
