// Keyboard / mouse / touch input. Edge-triggered presses are latched until a tick consumes them.

const GAME_KEYS = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyE', 'KeyR', 'KeyV', 'KeyH', 'KeyF', 'KeyQ', 'KeyX', 'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'F1', 'Backquote', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight']);

const Input = {
  keys: new Set(), edges: new Set(), mouse: [false, false, false], mouseEdge: [false, false, false],
  mdx: 0, mdy: 0, wheel: 0, locked: false, freeMouse: false, active: false, lockFails: 0, canvas: null,
  touch: { enabled: false, mx: 0, mz: 0, fire: false, duck: false, jumpEdge: false, reloadEdge: false, useEdge: false, useDown: false, switchEdge: false, buyEdge: false, ldx: 0, ldy: 0 },
  uiCapture: false,          // a menu (buy menu) owns number keys and the mouse buttons
  onLockChange: null,

  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (!this.locked && !this.freeMouse) { this.requestLock(); return; }
      if (!this.mouse[e.button]) this.mouseEdge[e.button] = true;
      this.mouse[e.button] = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.active || !(this.locked || this.freeMouse)) return;
      let dx = e.movementX || 0, dy = e.movementY || 0;
      if (Math.abs(dx) > 900 || Math.abs(dy) > 900) return; // browser glitch spikes
      this.mdx += dx; this.mdy += dy;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockFails = 0;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.lockFailed());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { if (!this.active) return; this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    window.addEventListener('blur', () => this.releaseAll());
    this.initTouch();
  },

  releaseAll() { this.keys.clear(); this.edges.clear(); this.mouse.fill(false); const t = this.touch; t.fire = false; t.mx = t.mz = 0; },

  onKey(e, down) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const c = e.code;
    if (down) { if (!this.keys.has(c)) this.edges.add(c); this.keys.add(c); } else this.keys.delete(c);
    if (this.active && GAME_KEYS.has(c)) e.preventDefault();
  },

  pressed(code) { if (this.edges.has(code)) { this.edges.delete(code); return true; } return false; },
  down(code) { return this.keys.has(code); },
  takeMouseEdge(b) { const v = this.mouseEdge[b]; this.mouseEdge[b] = false; return v; },

  requestLock() {
    const c = this.canvas;
    if (!c.requestPointerLock) { this.lockFailed(true); return; }
    const plain = () => { try { const q = c.requestPointerLock(); if (q && q.catch) q.catch(() => this.lockFailed()); } catch (e) { this.lockFailed(); } };
    try {
      const p = Settings.v.rawInput ? c.requestPointerLock({ unadjustedMovement: true }) : c.requestPointerLock();
      if (p && p.catch) p.catch((err) => { if (Settings.v.rawInput && err && err.name === 'NotSupportedError') plain(); else this.lockFailed(); });
    } catch (e) { plain(); }
  },

  // Pointer lock refused (sandboxed frame, too-fast relock...). After repeated failures, look with the free cursor.
  lockFailed(hard) {
    this.lockFails++;
    if (hard || this.lockFails >= 2) {
      this.freeMouse = true;
      if (this.onLockChange) this.onLockChange(false, true);
    }
  },

  exitLock() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); },

  initTouch() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (!coarse || !('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;
    const t = this.touch; t.enabled = true;
    const zoneMove = document.getElementById('t-move'), zoneLook = document.getElementById('t-look'), stick = document.getElementById('t-stick');
    let moveId = null, ox = 0, oy = 0, lookId = null, lx = 0, ly = 0;
    zoneMove.addEventListener('touchstart', (e) => {
      const p = e.changedTouches[0]; moveId = p.identifier; ox = p.clientX; oy = p.clientY;
      stick.style.display = 'block'; stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; e.preventDefault();
    }, { passive: false });
    zoneMove.addEventListener('touchmove', (e) => {
      for (const p of e.changedTouches) if (p.identifier === moveId) {
        let dx = (p.clientX - ox) / 50, dy = (p.clientY - oy) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        t.mx = dx; t.mz = dy; stick.firstElementChild.style.transform = `translate(${dx * 32}px, ${dy * 32}px)`;
      }
      e.preventDefault();
    }, { passive: false });
    const endMove = (e) => { for (const p of e.changedTouches) if (p.identifier === moveId) { moveId = null; t.mx = t.mz = 0; stick.style.display = 'none'; stick.firstElementChild.style.transform = ''; } };
    zoneMove.addEventListener('touchend', endMove); zoneMove.addEventListener('touchcancel', endMove);
    zoneLook.addEventListener('touchstart', (e) => { const p = e.changedTouches[0]; lookId = p.identifier; lx = p.clientX; ly = p.clientY; e.preventDefault(); }, { passive: false });
    zoneLook.addEventListener('touchmove', (e) => {
      for (const p of e.changedTouches) if (p.identifier === lookId) { t.ldx += (p.clientX - lx) * 2.2; t.ldy += (p.clientY - ly) * 2.2; lx = p.clientX; ly = p.clientY; }
      e.preventDefault();
    }, { passive: false });
    const endLook = (e) => { for (const p of e.changedTouches) if (p.identifier === lookId) lookId = null; };
    zoneLook.addEventListener('touchend', endLook); zoneLook.addEventListener('touchcancel', endLook);
    document.querySelectorAll('#sf-touch [data-act]').forEach((b) => {
      const act = b.dataset.act;
      b.addEventListener('touchstart', (e) => {
        if (act === 'fire') t.fire = true;
        else if (act === 'duck') t.duck = !t.duck;
        else if (act === 'jump') t.jumpEdge = true;
        else if (act === 'reload') t.reloadEdge = true;
        else if (act === 'use') { t.useEdge = true; t.useDown = true; }
        else if (act === 'switch') t.switchEdge = true;
        else if (act === 'buy') t.buyEdge = true;
        else if (act === 'wallbang') t.wbEdge = true;
        e.preventDefault();
      }, { passive: false });
      b.addEventListener('touchend', (e) => { if (act === 'fire') t.fire = false; if (act === 'use') t.useDown = false; e.preventDefault(); }, { passive: false });
    });
  },

  // Movement/action command for one tick (edges consumed here).
  buildCmd(cmd) {
    const t = this.touch, fs = !!document.fullscreenElement;
    let fwd = (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0);
    let side = (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0);
    if (t.enabled) { fwd = clamp(fwd - t.mz, -1, 1); side = clamp(side + t.mx, -1, 1); }
    cmd.fwd = fwd; cmd.side = side;
    cmd.jump = this.pressed('Space') || t.jumpEdge; t.jumpEdge = false;
    cmd.jumpHeld = this.down('Space');
    cmd.duck = this.down('KeyC') || (fs && (this.down('ControlLeft') || this.down('ControlRight'))) || t.duck;
    cmd.walk = this.down('ShiftLeft') || this.down('ShiftRight');
    const ui = this.uiCapture;
    cmd.fire = !ui && (this.mouse[0] || t.fire);
    cmd.reload = this.pressed('KeyR') || t.reloadEdge; t.reloadEdge = false;
    cmd.use = this.pressed('KeyE') || t.useEdge; t.useEdge = false;
    cmd.useHeld = this.down('KeyE') || t.useDown;
    cmd.drop = this.pressed('KeyG');
    cmd.alt = !ui && this.mouse[2];
    cmd.inspect = this.pressed('KeyF');
    cmd.wallbang = (!ui && this.pressed('KeyX')) || t.wbEdge; t.wbEdge = false;
    cmd.slot = ui ? 0 : this.pressed('Digit1') ? 1 : this.pressed('Digit2') ? 2 : this.pressed('Digit3') ? 3 : this.pressed('Digit4') ? 4 : this.pressed('Digit5') ? 5 : 0;
    cmd.last = this.pressed('KeyQ');
    cmd.cycle = this.wheel > 0 ? 1 : this.wheel < 0 ? -1 : t.switchEdge ? 1 : 0;
    this.wheel = 0; t.switchEdge = false;
    return cmd;
  },

  // Mouse/touch look deltas since the last frame, in degrees.
  takeLook(out, dt) {
    const s = Settings.v, k = s.sensitivity * 0.022;
    out[0] = (this.mdx + this.touch.ldx) * k;
    out[1] = (this.mdy + this.touch.ldy) * k * (s.invertY ? -1 : 1);
    // arrow keys turn at a fixed rate (fallback when the mouse can't be captured)
    if (this.down('ArrowLeft')) out[0] -= 160 * dt; if (this.down('ArrowRight')) out[0] += 160 * dt;
    if (this.down('ArrowUp')) out[1] -= 110 * dt; if (this.down('ArrowDown')) out[1] += 110 * dt;
    this.mdx = this.mdy = 0; this.touch.ldx = this.touch.ldy = 0;
    return out;
  },
};
