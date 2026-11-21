// Viewmodel runtime: keyframed clips per weapon (draw / reload / inspect / attacks / throws)
// layered over procedural motion (bob, mouse sway, breathing, stance, fire kick).
// Key format: [time, px, py, pz, rx, ry, rz] = offsets from the rest pose, smoothstep-interpolated.

const Z6 = [0, 0, 0, 0, 0, 0];
const k6 = (t, a = Z6) => [t, ...a];
const RIFLE_TILT = [-0.6, 0.6, 0, 0.14, 0, -0.42], RIFLE_TILT_UP = [-0.6, 0.95, 0, 0.16, 0, -0.42];
const PISTOL_TILT = [-0.4, 0.8, 0, 0.12, -0.15, 0.32], PISTOL_TILT_UP = [-0.4, 1.1, 0, 0.14, -0.15, 0.32];
const NADE_OVER = [1.5, 2.5, 4, -0.5, 0.1, 0.2], NADE_UNDER = [0, -2.5, 1, 0.45, 0, 0];
const NADE_HAND_OUT = [-6, -12, 5.5, 0, 0, 0], NADE_HAND_AWAY = [-3.5, -2, 2, 0.3, 0, -0.3];

const VM_CLIPS = {
  rifle: {
    draw: { root: [k6(0, [0, -9, 2, -0.6, 0, 0.3]), k6(0.45, [0, 0.3, 0.5, 0.05, 0, -0.05]), k6(0.58, [0, 0, 1.0, 0, 0, 0]), k6(0.75)] },
    reload: {
      root: [k6(0), k6(0.3, RIFLE_TILT), k6(1.36, RIFLE_TILT), k6(1.43, RIFLE_TILT_UP), k6(1.5, RIFLE_TILT), k6(2.0, RIFLE_TILT), k6(2.45)],
      parts: {
        left: [k6(0.3), k6(0.75, [-0.5, -8, 6, 0.35, 0, 0]), k6(0.95, [-0.5, -8, 6, 0.35, 0, 0]), k6(1.36, [-0.2, -2.8, 7.5, 0.3, 0, 0]), k6(1.42, [-0.2, -2.8, 7.5, 0.3, 0, 0]), k6(1.8)],
        mag: [k6(0.26), k6(0.6, [0, -9, 0, 0, 0, 0]), k6(0.95, [0, -6.5, 1, 0, 0, 0]), k6(1.36)],
      },
      hide: { mag: [[0.62, 0.95]] },
    },
    reloadEmpty: {
      root: [k6(0), k6(0.3, RIFLE_TILT), k6(1.36, RIFLE_TILT), k6(1.43, RIFLE_TILT_UP), k6(1.5, RIFLE_TILT), k6(2.2, RIFLE_TILT), k6(2.27, [-0.6, 0.6, 0.8, 0.12, 0, -0.42]), k6(2.36, RIFLE_TILT), k6(2.85)],
      parts: {
        left: [k6(0.3), k6(0.75, [-0.5, -8, 6, 0.35, 0, 0]), k6(0.95, [-0.5, -8, 6, 0.35, 0, 0]), k6(1.36, [-0.2, -2.8, 7.5, 0.3, 0, 0]), k6(1.5, [-0.2, -2.8, 7.5, 0.3, 0, 0]),
          k6(1.9, [-1.6, 0.2, 7.8, 0.1, 0, 0.3]), k6(2.2, [-1.4, 0.4, 7.6, 0.1, 0, 0.3]), k6(2.55)],
        mag: [k6(0.26), k6(0.6, [0, -9, 0, 0, 0, 0]), k6(0.95, [0, -6.5, 1, 0, 0, 0]), k6(1.36)],
      },
      hide: { mag: [[0.62, 0.95]] },
    },
    inspect: { root: [k6(0), k6(0.55, [-1.2, 1.3, 0.8, 0.12, 0.42, -0.62]), k6(1.6, [-1.0, 1.5, 0.6, 0.2, 0.5, -0.7]), k6(2.25, [0.9, 0.7, 0, -0.08, -0.3, 0.4]), k6(2.9, [0.7, 0.5, 0, -0.04, -0.25, 0.35]), k6(3.4)] },
  },
  pistol: {
    draw: { root: [k6(0, [0, -7, 1, -0.5, 0.2, 0.6]), k6(0.32, [0, 0.25, 0, 0.06, 0, 0]), k6(0.42, [0, 0, 0.5, 0, 0, 0]), k6(0.6)] },
    reload: {
      root: [k6(0), k6(0.25, PISTOL_TILT), k6(1.3, PISTOL_TILT), k6(1.38, PISTOL_TILT_UP), k6(1.46, PISTOL_TILT), k6(1.7, PISTOL_TILT), k6(2.15)],
      parts: {
        mag: [k6(0.22), k6(0.5, [0, -7, 0.6, 0, 0, 0]), k6(0.95, [0, -5, 0.4, 0, 0, 0]), k6(1.3)],
        left: [k6(0.25), k6(0.65, [-1, -6, 3, 0.3, 0, 0]), k6(0.95, [-1, -6, 3, 0.3, 0, 0]), k6(1.3, [-0.3, -2.5, 1.0, 0.2, 0, 0]), k6(1.6)],
      },
      hide: { mag: [[0.5, 0.95]] },
    },
    reloadEmpty: {
      root: [k6(0), k6(0.25, PISTOL_TILT), k6(1.3, PISTOL_TILT), k6(1.38, PISTOL_TILT_UP), k6(1.46, PISTOL_TILT), k6(1.85, PISTOL_TILT), k6(1.92, [-0.4, 0.8, 0.6, 0.1, -0.15, 0.32]), k6(2.0, PISTOL_TILT), k6(2.35)],
      parts: {
        mag: [k6(0.22), k6(0.5, [0, -7, 0.6, 0, 0, 0]), k6(0.95, [0, -5, 0.4, 0, 0, 0]), k6(1.3)],
        left: [k6(0.25), k6(0.65, [-1, -6, 3, 0.3, 0, 0]), k6(0.95, [-1, -6, 3, 0.3, 0, 0]), k6(1.3, [-0.3, -2.5, 1.0, 0.2, 0, 0]), k6(1.55), k6(1.78, [-0.6, 1.6, -0.6, 0, 0, 0.2]), k6(1.88, [-0.6, 1.5, 0.2, 0, 0, 0.2]), k6(2.1)],
      },
      hide: { mag: [[0.5, 0.95]] },
    },
    inspect: { root: [k6(0), k6(0.4, [-1.4, 1.3, 1.0, 0.1, -0.55, 0.8]), k6(1.25, [-1.4, 1.4, 1.0, 0.12, -0.6, 0.85]), k6(1.8, [0.9, 0.9, 0, 0, 0.45, -0.6]), k6(2.2, [0.8, 0.8, 0, 0, 0.4, -0.55]), k6(2.6)] },
  },
  knife: {
    draw: { root: [k6(0, [1, -7, 2, -0.6, 0.6, 0]), k6(0.45, [0, 0.4, 0, 0.1, 0, 0]), k6(0.75)], parts: { knife: [k6(0.1), k6(0.5, [0, 0, 0, 0, 0, TAU])] } },
    slashL: { root: [k6(0), k6(0.07, [4, 3.4, 1.0, 0.1, -0.5, -0.7]), k6(0.17, [-7, -0.6, -2.5, -0.25, 0.9, 0.6]), k6(0.42)] },
    slashR: { root: [k6(0), k6(0.07, [-4, 2.6, 0.5, 0.05, 0.6, 0.7]), k6(0.17, [4, -1.0, -2, -0.2, -0.7, -0.6]), k6(0.42)] },
    stab: { root: [k6(0), k6(0.16, [1, 1.2, 3.6, -0.15, 0.1, 0]), k6(0.27, [-1.5, 0.5, -7.5, 0.15, -0.3, 0]), k6(0.45, [-1.5, 0.5, -7.2, 0.15, -0.3, 0]), k6(1.05)] },
    inspect: {
      root: [k6(0), k6(0.5, [-2.5, 2.4, 2, 0.4, 0.2, 1.2]), k6(1.4, [-2.5, 2.5, 2, 0.4, 0.2, 1.3]), k6(1.8, [-2.5, 2.5, 2, 0.4, 0.2, -1.6]), k6(2.4, [-1.6, 2.0, 1, 0.55, -0.4, -1.4]), k6(3.0)],
      parts: { knife: [k6(1.1), k6(1.6, [0, 0, 0, 0, 0, Math.PI]), k6(2.6, [0, 0, 0, 0, 0, Math.PI]), k6(2.95, [0, 0, 0, 0, 0, TAU])] },
    },
  },
  smoke: {
    draw: { root: [k6(0, [0, -7, 1, -0.4, 0, 0.3]), k6(0.4, [0, 0.2, 0, 0.05, 0, 0]), k6(0.55)] },
    pullOver: { root: [k6(0), k6(0.15, [0, 0.5, 0.5, 0, 0, 0]), k6(0.35, NADE_OVER)], parts: { left: [k6(0, NADE_HAND_OUT), k6(0.12), k6(0.26, NADE_HAND_AWAY), k6(0.35, NADE_HAND_OUT)], pin: [k6(0.12), k6(0.26, NADE_HAND_AWAY)] },
      show: { left: [[0, 0.34]] }, hide: { pin: [[0.27, 99]] } },
    pullUnder: { root: [k6(0), k6(0.15, [0, 0.5, 0.5, 0, 0, 0]), k6(0.35, NADE_UNDER)], parts: { left: [k6(0, NADE_HAND_OUT), k6(0.12), k6(0.26, NADE_HAND_AWAY), k6(0.35, NADE_HAND_OUT)], pin: [k6(0.12), k6(0.26, NADE_HAND_AWAY)] },
      show: { left: [[0, 0.34]] }, hide: { pin: [[0.27, 99]] } },
    throwOver: { root: [k6(0, NADE_OVER), k6(0.09, [-1, 3, -9, 0.8, 0, -0.2]), k6(0.45, [0, -10, 0, 0.6, 0, 0])], hide: { nade: [[0.09, 99]], pin: [[0, 99]] } },
    throwUnder: { root: [k6(0, NADE_UNDER), k6(0.09, [0, 1, -8, -0.6, 0, 0]), k6(0.45, [0, -10, 0, -0.3, 0, 0])], hide: { nade: [[0.09, 99]], pin: [[0, 99]] } },
  },
};

// --- Stage 4 clips
const SMG_LH_MAG = [-0.4, -7.0, 4.6, 0.35, 0, 0], SMG_LH_IN = [-0.2, -3.0, 4.9, 0.3, 0, 0];
const SMG_LH_KNOB = [-1.5, 1.1, 3.8, 0, 0, 0.5], SMG_LH_KNOB_BACK = [-1.5, 1.1, 5.2, 0, 0, 0.5];
const PUMP_BACK = [0, 0, 3.0, 0, 0, 0];
const SG_TILT = [-1.8, 2.6, 0.4, 0.22, 0.28, -0.95], SG_TILT_PUSH = [-1.8, 2.75, 0.2, 0.22, 0.28, -0.95];
const SG_LH_PORT = [-0.2, -0.75, 7.5, 0.1, 0, 0], SG_LH_POUCH = [-3.5, -8.5, 9.5, 0.5, 0, -0.3], SG_LH_PUSH = [-0.1, -0.3, 7.1, 0.05, 0, 0];
const SG_KICK = [0.2, -0.35, 0.5, 0.04, 0, 0.08];
const SN_RH_KNOB = [1.95, 3.1, -0.3, 0, 0, 0], SN_RH_UP = [0.95, 4.4, -0.3, 0, 0, 0], SN_RH_BACK = [0.95, 4.4, 2.3, 0, 0, 0];
const BOLT_UP = [0, 0, 0, 0, 0, 1.1], BOLT_BACK = [0, 0, 2.6, 0, 0, 1.1];
const SN_TILT = [-0.4, 0.3, 0.6, 0.04, 0.05, 0.16];
const SN_LH_MAG = [-0.2, -4.2, 6.6, 0.3, 0, 0], SN_LH_IN = [-0.1, -2.2, 7.4, 0.25, 0, 0];
// bolt cycle starting at time t0 (right hand + bolt), used after shots and at the end of an empty reload
const boltCycle = (t0) => ({
  right: [k6(t0), k6(t0 + 0.2, SN_RH_KNOB), k6(t0 + 0.3, SN_RH_UP), k6(t0 + 0.44, SN_RH_BACK), k6(t0 + 0.64, SN_RH_UP), k6(t0 + 0.78, SN_RH_KNOB), k6(t0 + 1.0)],
  bolt: [k6(t0 + 0.22), k6(t0 + 0.3, BOLT_UP), k6(t0 + 0.44, BOLT_BACK), k6(t0 + 0.64, BOLT_UP), k6(t0 + 0.78)],
});
const tapKeys = (marks) => { const k = [k6(0)]; for (const [t] of marks) k.push(k6(t - 0.07), k6(t, [0, -0.32, 0, 0, 0, 0]), k6(t + 0.07)); return k; };

Object.assign(VM_CLIPS, {
  smg: {
    draw: { root: [k6(0, [0, -9, 2, -0.6, 0, 0.3]), k6(0.4, [0, 0.3, 0.5, 0.05, 0, -0.05]), k6(0.52, [0, 0, 0.8, 0, 0, 0]), k6(0.7)] },
    reload: {
      root: [k6(0), k6(0.28, RIFLE_TILT), k6(1.25, RIFLE_TILT), k6(1.32, RIFLE_TILT_UP), k6(1.4, RIFLE_TILT), k6(1.85, RIFLE_TILT), k6(2.25)],
      parts: {
        left: [k6(0.28), k6(0.66, SMG_LH_MAG), k6(0.88, SMG_LH_MAG), k6(1.25, SMG_LH_IN), k6(1.3, SMG_LH_IN), k6(1.68)],
        mag: [k6(0.24), k6(0.55, [0, -9, 0, 0, 0, 0]), k6(0.88, [0, -6.5, 0.8, 0, 0, 0]), k6(1.25)],
      },
      hide: { mag: [[0.57, 0.88]] },
    },
    reloadEmpty: {
      root: [k6(0), k6(0.28, RIFLE_TILT), k6(1.25, RIFLE_TILT), k6(1.32, RIFLE_TILT_UP), k6(1.4, RIFLE_TILT), k6(2.0, RIFLE_TILT), k6(2.06, [-0.6, 0.6, 0.6, 0.12, 0, -0.42]), k6(2.14, RIFLE_TILT), k6(2.6)],
      parts: {
        left: [k6(0.28), k6(0.66, SMG_LH_MAG), k6(0.88, SMG_LH_MAG), k6(1.25, SMG_LH_IN), k6(1.3, SMG_LH_IN), k6(1.72, SMG_LH_KNOB), k6(1.94, SMG_LH_KNOB), k6(2.02, SMG_LH_KNOB_BACK), k6(2.08, SMG_LH_KNOB), k6(2.4)],
        mag: [k6(0.24), k6(0.55, [0, -9, 0, 0, 0, 0]), k6(0.88, [0, -6.5, 0.8, 0, 0, 0]), k6(1.25)],
      },
      hide: { mag: [[0.57, 0.88]] },
    },
    inspect: { root: [k6(0), k6(0.5, [-1.2, 1.3, 0.8, 0.12, 0.42, -0.62]), k6(1.45, [-1.0, 1.5, 0.6, 0.2, 0.5, -0.7]), k6(2.0, [0.9, 0.7, 0, -0.08, -0.3, 0.4]), k6(2.6, [0.7, 0.5, 0, -0.04, -0.25, 0.35]), k6(3.0)] },
  },
  shotgun: {
    draw: { root: [k6(0, [0, -9, 2, -0.6, 0, 0.3]), k6(0.38, [0, 0.3, 0.5, 0.05, 0, -0.05]), k6(0.6, [0, 0, 0.6, 0, 0, 0]), k6(0.85)],
      parts: { pump: [k6(0.36), k6(0.44, PUMP_BACK), k6(0.5, PUMP_BACK), k6(0.58)], left: [k6(0.36), k6(0.44, PUMP_BACK), k6(0.5, PUMP_BACK), k6(0.58)] } },
    fire: { root: [k6(0.16), k6(0.32, SG_KICK), k6(0.6)],
      parts: { pump: [k6(0.2), k6(0.31, PUMP_BACK), k6(0.4, PUMP_BACK), k6(0.5)], left: [k6(0.2), k6(0.31, PUMP_BACK), k6(0.4, PUMP_BACK), k6(0.5)] } },
    reloadStart: { root: [k6(0), k6(0.42, SG_TILT)], parts: { left: [k6(0), k6(0.42, SG_LH_PORT)] } },
    reloadShell: {
      root: [k6(0, SG_TILT), k6(0.3, SG_TILT), k6(0.37, SG_TILT_PUSH), k6(0.48, SG_TILT)],
      parts: { left: [k6(0, SG_LH_PORT), k6(0.13, SG_LH_POUCH), k6(0.19, SG_LH_POUCH), k6(0.3, SG_LH_PUSH), k6(0.37, SG_LH_PORT), k6(0.48, SG_LH_PORT)] },
      show: { shell: [[0.15, 0.33]] },
    },
    reloadEnd: { root: [k6(0, SG_TILT), k6(0.3)], parts: { left: [k6(0, SG_LH_PORT), k6(0.3)] } },
    reloadEndPump: {
      root: [k6(0, SG_TILT), k6(0.12), k6(0.2, SG_KICK), k6(0.55)],
      parts: { left: [k6(0, SG_LH_PORT), k6(0.08), k6(0.14, PUMP_BACK), k6(0.24, PUMP_BACK), k6(0.32)], pump: [k6(0.08), k6(0.14, PUMP_BACK), k6(0.24, PUMP_BACK), k6(0.32)] },
    },
    inspect: { root: [k6(0), k6(0.55, [-1.4, 1.5, 0.8, 0.14, 0.45, -0.7]), k6(1.5, [-1.2, 1.7, 0.6, 0.22, 0.5, -0.78]), k6(2.05, [0.8, 0.8, 0, -0.06, -0.28, 0.42]), k6(2.6, [0.6, 0.6, 0, -0.03, -0.22, 0.36]), k6(3.0)] },
  },
  sniper: {
    draw: { root: [k6(0, [0, -10, 2, -0.6, 0, 0.3]), k6(0.5, [0, 0.3, 0.5, 0.05, 0, -0.05]), k6(0.95, [0, 0, 0.6, 0, 0, 0]), k6(1.1)], parts: boltCycle(0.4) },
    fire: { root: [k6(0.1), k6(0.4, SN_TILT), k6(1.0, SN_TILT), k6(1.3)], parts: boltCycle(0.16) },
    reload: {
      root: [k6(0), k6(0.35, RIFLE_TILT), k6(1.7, RIFLE_TILT), k6(1.78, RIFLE_TILT_UP), k6(1.86, RIFLE_TILT), k6(2.5, RIFLE_TILT), k6(3.0)],
      parts: {
        left: [k6(0.35), k6(0.8, SN_LH_MAG), k6(1.15, SN_LH_MAG), k6(1.7, SN_LH_IN), k6(1.76, SN_LH_IN), k6(2.2)],
        mag: [k6(0.38), k6(0.7, [0, -8, 0.5, 0, 0, 0]), k6(1.15, [0, -5.5, 0.8, 0, 0, 0]), k6(1.7)],
      },
      hide: { mag: [[0.72, 1.15]] },
    },
    reloadEmpty: {
      root: [k6(0), k6(0.35, RIFLE_TILT), k6(1.7, RIFLE_TILT), k6(1.78, RIFLE_TILT_UP), k6(1.86, RIFLE_TILT), k6(2.3, RIFLE_TILT), k6(2.5, SN_TILT), k6(3.2, SN_TILT), k6(3.6)],
      parts: Object.assign({
        left: [k6(0.35), k6(0.8, SN_LH_MAG), k6(1.15, SN_LH_MAG), k6(1.7, SN_LH_IN), k6(1.76, SN_LH_IN), k6(2.2)],
        mag: [k6(0.38), k6(0.7, [0, -8, 0.5, 0, 0, 0]), k6(1.15, [0, -5.5, 0.8, 0, 0, 0]), k6(1.7)],
      }, boltCycle(2.38)),
      hide: { mag: [[0.72, 1.15]] },
    },
    inspect: { root: [k6(0), k6(0.6, [-1.3, 1.4, 0.8, 0.12, 0.42, -0.62]), k6(1.6, [-1.1, 1.6, 0.6, 0.2, 0.48, -0.7]), k6(2.2, [0.8, 0.8, 0, -0.06, -0.28, 0.4]), k6(2.8, [0.6, 0.6, 0, -0.03, -0.22, 0.34]), k6(3.2)] },
  },
  charge: {
    draw: { root: [k6(0, [0, -8, 1, -0.4, 0, 0.2]), k6(0.5, [0, 0.2, 0, 0.04, 0, 0]), k6(0.8)] },
    plant: { root: [k6(0), k6(0.3, [0, -0.6, -0.8, 0.18, 0, 0]), k6(2.6, [0, -0.9, -1.0, 0.22, 0, 0]), k6(3.2, [0, -5.5, -2.5, 0.55, 0, 0])], parts: { finger: tapKeys(WEAPONS.charge.plantMarks) } },
  },
});

function sampleKeys(keys, t, out) {
  if (!keys || !keys.length) { for (let i = 0; i < 6; i++) out[i] = 0; return out; }
  if (t <= keys[0][0]) { for (let i = 0; i < 6; i++) out[i] = keys[0][i + 1]; return out; }
  const last = keys[keys.length - 1];
  if (t >= last[0]) { for (let i = 0; i < 6; i++) out[i] = last[i + 1]; return out; }
  let k = 1;
  while (keys[k][0] < t) k++;
  const a = keys[k - 1], b = keys[k], f = smoothstep(0, 1, (t - a[0]) / (b[0] - a[0]));
  for (let i = 0; i < 6; i++) out[i] = a[i + 1] + (b[i + 1] - a[i + 1]) * f;
  return out;
}
const inWindows = (wins, t) => !!wins && wins.some(([a, b]) => t >= a && t < b);

const Viewmodel = {
  rig: null, models: {}, cur: null, tris: 0,
  bob: 0, swayX: 0, swayY: 0, kick: 0, kickRoll: 0, flashT: 0, time: 0,
  lightProbe: [0, 0, 0, 0], tmpV: null, tmpV2: null, s6: [0, 0, 0, 0, 0, 0],

  build() {
    const M = vmMaterials();
    this.M = M;
    this.rig = new THREE.Group();
    for (const fn of [buildRifleVM, buildPistolVM, buildKnifeVM, buildSmokeVM, buildSmgVM, buildShotgunVM, buildSniperVM, buildChargeVM]) {
      const m = fn(M);
      m.root.visible = false;
      this.models[m.id] = m;
      this.rig.add(m.root);
    }
    R.vmScene.add(this.rig);
    this.tmpV = new THREE.Vector3(); this.tmpV2 = new THREE.Vector3();
    this.tris = Math.max(...Object.values(this.models).map((m) => m.tris));
  },

  // Hands and sleeves follow the local player's team (same uniform as the third-person model).
  setTeam(team) {
    if (!this.M) return;
    this.M.glove.map = R.textures['glove' + team]; this.M.sleeve.map = R.textures['sleeve' + team];
  },

  show(id) {
    if (this.cur && this.cur.id === id) return;
    for (const m of Object.values(this.models)) m.root.visible = m.id === id;
    this.cur = this.models[id] || null;
    this.kick = 0; this.flashT = 0;
  },

  onShot(w) {
    this.kick = Math.min(this.kick + w.def.kick, 1.6 * w.def.kick);
    this.kickRoll = (Math.random() - 0.5) * 0.05;
    const m = this.cur;
    if (!m || !m.flash) return;
    this.flashT = 0.045;
    const s = (3.2 + Math.random() * 1.6) * m.flashScale;
    m.flash.scale.set(s, s, s);
    m.flash.children[0].rotation.z = Math.random() * TAU;
    R.vmLights.flash.intensity = 2.2 * m.flashScale;
  },

  // World-space point that appears at a viewmodel anchor on screen (for tracers, casings, smoke).
  anchorWorld(name, depth, out) {
    const m = this.cur, a = m && m.anchors[name];
    if (!a) return null;
    this.rig.updateMatrixWorld(true);
    const v = a.getWorldPosition(this.tmpV).project(R.vmCamera);
    const cam = R.camera, d = this.tmpV2.set(v.x, v.y, 0.5).unproject(cam).sub(cam.position).normalize();
    out[0] = cam.position.x + d.x * depth; out[1] = cam.position.y + d.y * depth; out[2] = cam.position.z + d.z * depth;
    return out;
  },

  update(dt, pl, w, look, eye, alpha) {
    this.show(w.def.id);
    const m = this.cur;
    if (!m) return;
    this.time += dt;
    // --- procedural layer on the rig
    let x = 0, y = 0, rx = 0, ry = 0, rz = 0;
    const sp = pl.onGround ? pl.speed() : 0, a = clamp(sp / 250, 0, 1);
    this.bob += sp * dt * 0.021;
    x += Math.sin(this.bob) * 0.32 * a; y += Math.sin(this.bob * 2) * 0.16 * a - a * 0.12; rz += Math.sin(this.bob) * 0.012 * a;
    y += Math.sin(this.time * 1.7) * 0.05; rx += Math.sin(this.time * 1.7) * 0.004;
    this.swayX = clamp(this.swayX - look[0] * 0.018, -1.3, 1.3); this.swayY = clamp(this.swayY - look[1] * 0.018, -1.0, 1.0);
    this.swayX = damp(this.swayX, 0, 9, dt); this.swayY = damp(this.swayY, 0, 9, dt);
    x += this.swayX * 0.45; y += this.swayY * 0.35; ry += this.swayX * 0.035; rx -= this.swayY * 0.03; rz += this.swayX * 0.05;
    y += pl.duckAmt * 0.35 - pl.landKick * 0.08 + (!pl.onGround && !pl.noclip ? 0.25 : 0);
    rz -= pl.duckAmt * 0.04;
    this.rig.position.set(x, y, 0);
    this.rig.rotation.set(rx, ry, rz);
    // --- weapon pose: base + clip + kick
    const t = w.animTime() + alpha * TICK, clips = VM_CLIPS[m.id], clip = clips[w.anim], s = this.s6, b = m.base;
    sampleKeys(clip ? clip.root : null, t, s);
    this.kick = damp(this.kick, 0, 15, dt);
    m.root.position.set(b.x + s[0], b.y + s[1] + this.kick * 0.12, b.z + s[2] + this.kick * 1.15);
    m.root.rotation.set(b.rx + s[3] + this.kick * 0.055, b.ry + s[4], b.rz + s[5] + this.kickRoll * this.kick);
    for (const [name, part] of Object.entries(m.parts)) {
      const rest = m.rest[name];
      sampleKeys(clip && clip.parts ? clip.parts[name] : null, t, s);
      part.position.set(rest.p.x + s[0], rest.p.y + s[1], rest.p.z + s[2]);
      part.rotation.set(rest.r.x + s[3], rest.r.y + s[4], rest.r.z + s[5]);
      let vis = !m.hidden.includes(name);
      if (clip && clip.show && clip.show[name]) vis = inWindows(clip.show[name], t);
      if (clip && clip.hide && inWindows(clip.hide[name], t)) vis = false;
      part.visible = vis;
    }
    if (m.id === 'charge') m.parts.led.visible = (this.time * 1.25) % 1 < 0.18 || w.state === 'plant';
    if (m.id === 'pistol') {
      // slide blowback, lock-back on empty, release during the empty reload
      const ts = w.clock - w.lastShotClock + alpha * TICK;
      let back = ts < 0.025 ? ts / 0.025 : Math.max(0, 1 - (ts - 0.025) / 0.06);
      const releasing = w.anim === 'reloadEmpty' && t > 1.85;
      if (w.slideLocked && !releasing) back = 1;
      m.parts.slide.position.z += back * 1.2;
    }
    // --- muzzle flash + lighting from the baked probes at the eye
    this.flashT -= dt;
    if (m.flash) m.flash.visible = this.flashT > 0;
    const LV = R.vmLights;
    LV.flash.intensity = Math.max(0, LV.flash.intensity - dt * 50);
    LV.flash.position.set(m.root.position.x, m.root.position.y + 1, m.root.position.z - 6);
    const pr = sampleProbes(Game.L.probes, eye[0], eye[1], eye[2], this.lightProbe), env = Game.L.env;
    LV.amb.color.setRGB(pr[0] * 0.95, pr[1] * 0.95, pr[2] * 0.95);
    LV.sun.color.setRGB(env.sunColor[0], env.sunColor[1], env.sunColor[2]);
    LV.sun.intensity = pr[3] * env.sunIntensity * 0.6;
    LV.sun.position.copy(this.tmpV.set(env.sunDir[0], env.sunDir[1], env.sunDir[2]).transformDirection(R.camera.matrixWorldInverse));
    LV.fill.intensity = 0.08 + (pr[0] + pr[1] + pr[2]) * 0.03;
  },
};
