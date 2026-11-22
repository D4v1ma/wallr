// "Frostline" for the Godot version (assetgen): an original mountain radar station in snow at ten
// times the area of the original, 12,000 x 9,800 units, under a grey winter sky.
// Axes: +X east, +Y up, +Z south. Raiders come in from the Drop Zone (west), Wardens hold Barracks
// Row (east).
//   A: Hangar 2 (north-east, indoor) - a parked survey plane, a tow tractor, a mezzanine office
//      north lane: North Slope, Fuel Depot (tanks, a pipe rack walkway, lorries);  mid: Radio Path
//   B: Dish Array (south-east) - a platform raised 96 with two dishes and a control hut
//      south lane: South Slope, the Ice Cut (a trench) and its banks;  mid: Generator Path
//   Mid: the Pass between two rock ridges into the Comms Block, whose halls feed the Radio Path
//   (north), the Generator Path (south) and the Parade Ground (east, by the Mess Hall).

function buildFrostline() {
  const M = new MapBuilder(), K = mapKit(M);
  const sd = [0.32, 0.58, -0.55], sl = Math.hypot(...sd);
  M.env = {
    sunDir: sd.map((v) => v / sl), sunColor: [0.92, 0.95, 1.0], sunIntensity: 0.88,
    skyZenith: [0.46, 0.56, 0.7], skyHorizon: [0.84, 0.88, 0.93], skyIntensity: 0.92,
    fogColor: [0.82, 0.86, 0.91], fogDensity: 0.00008, ambient: 0.17,
    skySun: [0.95, 0.95, 0.92], skyGround: [0.86, 0.89, 0.93], skyMountains: [0.84, 0.88, 0.93],
    lmBig: 320, lmBigS: 32, lmSmall: 16, probeStep: 128, bakeRays: 9, navStep: 48, chunk: 2048,
    roundTime: 175, fuse: 45, buyRadius: 900, radarZoom: 0.42,
  };
  const G = [];
  const X0 = -6000, X1 = 6000, Z0 = -4900, Z1 = 4900, BIG = { lm: 48 };
  const RM = { sides: 'rock', top: 'snow', bottom: null };
  const bld = (x0, z0, x1, z1, o) => { G.push([x0, z0, x1, z1, o.floor ?? 'concrete_floor', o.y ?? 0]); return K.building(x0, z0, x1, z1, Object.assign({}, o, { floor: null })); };
  const plate = (x0, y0, z0, x1, y1, z1, face, tex) => K.sign(x0, y0, z0, x1, y1, z1, face, tex);
  const face = (x, z, tx, tz) => Math.round(Math.atan2(-(tx - x), -(tz - z)) * 180 / Math.PI);   // hold yaw (degrees) looking at (tx, tz)
  const lampC = [0.92, 0.95, 1.0], lampW = [1.0, 0.88, 0.7];

  // Stepped cliffs round the edge: each face stands on the boundary and the body runs outward.
  const cliff = (axis, a0, a1, c, dir, seed) => {
    const r = mulberry32(seed);
    const put = (s0, s1, u0, u1, y0, y1) => {
      const p = dir < 0 ? c - u1 : c + u0, q = dir < 0 ? c - u0 : c + u1;
      if (axis === 'x') M.box(s0, y0, p, s1, y1, q, RM, BIG); else M.box(p, y0, s0, q, y1, s1, RM, BIG);
    };
    for (let a = a0; a < a1 - 1;) {
      let len = 520 + r() * 680; if (a1 - a - len < 300) len = a1 - a;
      const h = 430 + r() * 230, d = 220 + r() * 180;
      put(a, a + len, 0, d, -192, h);
      if (r() < 0.55) put(a + len * (0.1 + r() * 0.2), a + len * (0.55 + r() * 0.4), 70 + r() * 60, d, h - 1, h + 90 + r() * 170);
      a += len;
    }
  };
  // A rock ridge split along its long side into blocks of varied height; the faces named in
  // `inset` step back unevenly (never forward into a lane) and some blocks carry a crag.
  const ridge = (x0, z0, x1, z1, h, seed, inset = 'nsew') => {
    const r = mulberry32(seed), alongX = x1 - x0 >= z1 - z0, A0 = alongX ? x0 : z0, A1 = alongX ? x1 : z1;
    for (let a = A0; a < A1 - 1;) {
      let len = 360 + r() * 520; if (A1 - a - len < 240) len = A1 - a;
      const hh = h * (0.72 + r() * 0.4);
      const lo = inset.includes(alongX ? 'n' : 'w') ? r() * 70 : 0, hi = inset.includes(alongX ? 's' : 'e') ? r() * 70 : 0;
      if (alongX) M.box(a, 0, z0 + lo, a + len, hh, z1 - hi, RM, { lm: 32 }); else M.box(x0 + lo, 0, a, x1 - hi, hh, a + len, RM, { lm: 32 });
      if (r() < 0.45) {
        const c0 = a + len * 0.25, c1 = a + len * (0.55 + r() * 0.35), top = hh + 60 + r() * 140;
        if (alongX) M.box(c0, hh - 1, z0 + lo + 90, c1, top, z1 - hi - 90, RM, { lm: 32 }); else M.box(x0 + lo + 90, hh - 1, c0, x1 - hi - 90, top, c1, RM, { lm: 32 });
      }
      a += len;
    }
  };
  // a boulder: a box turned every way and sunk into the ground, snow on its top
  const boulder = (x, z, s, seed, y = 0) => {
    const r = mulberry32(seed);
    K.tiltBox(x, y + s * 0.3, z, s * (0.8 + r() * 0.5), s * 0.75, s * (0.7 + r() * 0.4), r() * TAU, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3, { sides: 'rock', top: 'snow', bottom: 'rock' });
  };

  // =========================================================== outer edge
  cliff('x', X0 - 400, X1 + 400, Z0, -1, 11); cliff('x', X0 - 400, X1 + 400, Z1, 1, 12);
  cliff('z', Z0, Z1, X0, -1, 13); cliff('z', Z0, Z1, X1, 1, 14);
  G.push([X0, Z0, X1, Z1, 'snow']);

  // =========================================================== Drop Zone (Raider spawn)
  G.push([-6000, -1200, -4600, 1200, 'concrete_floor'], [-5600, -400, -5000, 400, 'hazard']);
  K.container(-5900, -1100, 'x', 'container_blue', 0, 320); K.container(-5900, 1000, 'x', 'container', 0, 320);
  K.crates(-4900, -900, 4, 11); K.crates(-4900, 950, 3, 12); K.barrels(-5900, -500, 4, 13); K.barrels(-5900, 400, 4, 14);
  K.block(-6000, -300, -5880, 300, 180, 'paint_white', 'roof');
  plate(-5880, 110, -120, -5876, 170, 120, 'e', 'sign_frost');
  for (const z of [-900, 900]) K.pole(-5300, z, 260, lampC);
  // a screen of stacked containers: nobody in the Pass sees into the Drop Zone
  for (const [z, tex] of [[-800, 'container'], [-400, 'container_blue'], [0, 'container'], [400, 'container_blue']]) K.container(-4950, z, 'z', tex, 0, 400);
  K.container(-4950, -700, 'z', 'container_blue', 104, 600); K.container(-4950, 100, 'z', 'container', 104, 600);

  // =========================================================== North Slope and the Fuel Depot (north lane to A)
  bld(-4400, -3600, -3900, -3100, { h: 160, wall: 'paint_white', inner: 'plywood', roof: 'roof', floor: 'wood_floor',
    doors: [{ side: 'e', at: -3350 }, { side: 's', at: -4150 }], windows: [{ side: 'n', at: -4150, w: 96 }], lamps: [[-4150, -3350]], lampK: 0.7, lampR: 240 });   // supply shed
  for (const [x, z, r, h] of [[-5300, -3500, 320, 260], [-4900, -2000, 240, 180], [-3300, -4300, 300, 240], [-4700, -4400, 220, 180], [-2900, -2900, 180, 140]]) K.heap(x, z, r, h, 'rock', r * 0.35);
  for (const [x, z, s, k] of [[-5600, -2500, 70, 1], [-4500, -2800, 90, 2], [-3600, -2600, 60, 3], [-3000, -3600, 80, 4], [-4600, -1500, 60, 5], [-5500, -4300, 100, 6], [-3700, -3900, 70, 7]]) boulder(x, z, s, 100 + k);
  K.truck(-5000, -2900, 0.6, 'paint_orange');                                                       // a snowed-in lorry
  K.barrels(-3800, -3000, 3, 15);
  for (const [x, z] of [[-5300, -2100], [-4200, -4500], [-3400, -3400]]) K.pole(x, z, 240, lampC);
  G.push([-2400, -4900, 2200, -2400, 'concrete_floor'], [-1600, -3200, 1400, -2800, 'asphalt']);
  for (const [x, z, r] of [[-1700, -4200, 300], [-900, -4250, 260], [-100, -4200, 300], [700, -4250, 240]]) K.tank(x, z, r, 360, 'paint_white');
  // the pipe rack: a walkway at 200 over two pipes, stairs up at its west end, a gap in the
  // south railing where a second stair comes up at its east end
  K.catwalk(-2200, -3700, 1800, -3560, 200, { rails: ['n'] });
  K.railing('x', -2200, 1400, -3562, 200);
  for (const dz of [-3660, -3600]) M.box(-2200, 140, dz - 10, 1800, 160, dz + 10, 'steel', K.ND);
  K.stairs(-2380, -3700, -2200, -3560, 0, 200, 'e', 'diamond', 'steel');
  K.stairs(1420, -3560, 1580, -3200, 0, 200, 'n', 'diamond', 'steel');
  K.truck(-800, -2700, Math.PI / 2, 'paint_orange'); K.truck(900, -3000, -Math.PI / 2 + 0.2, 'container_blue');
  bld(1400, -4900, 2200, -4300, { h: 200, wall: 'paint_orange', inner: 'steel', roof: 'roof', floor: 'concrete_floor',
    doors: [{ side: 's', at: 1800, w: 128, h: 144 }, { side: 'w', at: -4600 }], windows: [{ side: 's', at: 1550 }], lamps: [[1800, -4600]], lampCol: lampW });   // pump house
  M.box(1600, 0, -4800, 2000, 90, -4650, { sides: 'paint_orange', top: 'steel', bottom: null });          // pumps
  K.crates(-2200, -2600, 3, 21); K.barrels(1900, -2700, 5, 22); K.sandbags(200, -3000, 400, -2940, 44);
  K.container(-2000, -3200, 'z', 'container', 0, 240); K.crates(300, -3400, 3, 23);
  for (const x of [-1800, -300, 1200]) K.pole(x, -2500, 260, lampC);
  // solid rock behind the hangar and the pump house, so nothing back there is a dead end
  M.box(2200, 0, -4900, 5200, 300, -4600, RM, BIG); M.box(2200, 0, -4600, 2400, 300, -4300, RM, BIG);

  // =========================================================== the Pass (mid) between two rock ridges
  G.push([-4600, -900, -400, 900, 'snow'], [-4200, -300, -400, 300, 'ice']);
  ridge(-4200, -2400, -400, -900, 520, 31, 'ns'); ridge(-4200, 900, -400, 2400, 520, 32, 'ns');
  for (const [x, z, s, k] of [[-3600, -650, 80, 1], [-2400, 640, 90, 2], [-1400, -560, 70, 3], [-3000, 120, 55, 4], [-1900, -120, 60, 5], [-4100, 600, 75, 6]]) boulder(x, z, s, 200 + k);
  K.container(-2200, -820, 'x', 'container', 0, 240); K.container(-1100, 560, 'x', 'container_blue', 0, 240);
  K.sandbags(-800, -300, -700, 300, 44);
  for (const x of [-3800, -2000]) { K.pole(x, -860, 240, lampC); K.pole(x + 900, 860, 240, lampC); }

  // =========================================================== Comms Block: four halls round the server room
  bld(-400, -1200, 1600, 1200, { h: 220, wall: 'paint_white', inner: 'panel', roof: 'roof', floor: 'tiles', parapet: 24,
    doors: [{ side: 'w', at: 0, w: 128, h: 144, door: 'door_metal' }, { side: 'n', at: 600, w: 128, h: 144 }, { side: 's', at: 600, w: 128, h: 144 }, { side: 'e', at: 0, w: 128, h: 144 }],
    windows: [{ side: 'n', at: 0 }, { side: 'n', at: 1200 }, { side: 's', at: 0 }, { side: 's', at: 1200 }, { side: 'e', at: -700 }, { side: 'e', at: 700 }],
    lamps: [[200, -800], [1000, -800], [200, 800], [1000, 800], [-200, 0], [1400, 0]], lampCol: lampC });
  bld(200, -500, 1000, 500, { h: 220, wall: 'panel', inner: 'steel', roof: null, floor: 'concrete_floor', doors: [{ side: 'w', at: 0, w: 96 }, { side: 'e', at: 300, w: 96 }],
    windows: [{ side: 'n', at: 400, w: 160 }, { side: 's', at: 800, w: 160 }], lamps: [[600, 0]], lampCol: [0.6, 0.9, 0.7] });   // server room
  for (const [x, z] of [[400, -250], [800, -250], [400, 250], [800, 250]]) M.box(x - 70, 0, z - 30, x + 70, 150, z + 30, { sides: 'panel', top: 'steel', bottom: null });
  M.box(560, 110, -484, 640, 160, -482, 'screen_glow', K.ND);
  M.box(-370, 0, -1100, -330, 150, -700, { sides: 'steel', top: 'steel', bottom: null });                  // lockers
  M.box(1300, 0, -1170, 1570, 120, -950, { sides: 'panel', top: 'steel', bottom: null });                  // UPS cabinets
  K.crates(-250, 900, 2, 31); K.crates(1400, 950, 3, 32); K.crates(1350, -400, 2, 33);
  // the radome on the roof: a landmark from both lanes
  for (const [r, y0, y1] of [[150, 232, 300], [132, 300, 350], [100, 350, 386], [56, 386, 404]]) M.prism(1200, -800, y0, y1, r, 16, { side: 'paint_white', top: 'paint_white' }, { nocollide: true });
  // Radio Path (north to the Fuel Depot and the hangar) and Generator Path (south to the Dish Array)
  G.push([200, -2400, 1000, -1200, 'asphalt'], [200, 1200, 1000, 2400, 'asphalt']);
  ridge(-400, -2400, 200, -1200, 420, 41, 'ne'); ridge(1000, -2400, 1600, -1600, 380, 42, 'nw');
  ridge(-400, 1200, 200, 2400, 420, 43, 'se'); ridge(1000, 1600, 1600, 2400, 380, 44, 'sw');
  bld(1000, 1200, 1600, 1600, { h: 180, wall: 'paint_orange', inner: 'steel', roof: 'roof', floor: 'concrete_floor', doors: [{ side: 'w', at: 1400 }, { side: 'e', at: 1400 }], lamps: [[1300, 1400]], lampCol: lampW });   // generator shed
  M.box(1120, 0, 1240, 1480, 96, 1330, { sides: 'paint_orange', top: 'steel', bottom: null });
  plate(200, 120, -1900, 204, 200, -1700, 'e', 'sign_frost');
  K.crates(450, -2100, 3, 45); K.barrels(850, 2000, 4, 46);
  for (const z of [-1900, 1900]) K.pole(960, z, 240, lampC);

  // =========================================================== South Slope and the Ice Cut (south lane to B)
  for (const [x, z, r, h] of [[-5300, 3400, 320, 260], [-4900, 2000, 240, 180], [-3300, 4300, 300, 240], [-4800, 4400, 220, 180]]) K.heap(x, z, r, h, 'rock', r * 0.35);
  for (const [x, z, s, k] of [[-5600, 2500, 70, 1], [-4300, 2700, 90, 2], [-3500, 2700, 60, 3], [-3700, 3800, 80, 4], [-4600, 1500, 60, 5], [-5500, 4300, 100, 6], [-2900, 2700, 70, 7]]) boulder(x, z, s, 300 + k);
  K.block(-4600, 2900, -4100, 3300, 200, 'paint_white', 'roof');                                     // weather station
  M.prism(-4350, 3100, 200, 300, 4, 6, 'steel', K.ND); M.box(-4380, 296, 3070, -4320, 300, 3130, 'steel', K.ND);
  K.crates(-4000, 3500, 3, 51);
  for (const [x, z] of [[-5300, 2100], [-4200, 4500], [-3400, 3400]]) K.pole(x, z, 240, lampC);
  G.push([-2400, 2600, 2000, 4600, 'ice', -96], [-3000, 3200, -2400, 4000, 'snow', -96], [2000, 3200, 2600, 4000, 'snow', -96]);
  M.ramp(-3000, 3200, -2400, 4000, -96, 0, 'w', { top: 'snow', sides: 'rock' });
  M.ramp(2000, 3200, 2600, 4000, -96, 0, 'e', { top: 'snow', sides: 'rock' });
  for (const [x, z, r, h] of [[-1600, 3100, 160, 150], [-1100, 4200, 200, 170], [700, 3000, 150, 140], [1500, 4300, 180, 160]]) K.heap(x, z, r, h, 'ice', r * 0.3, -96);
  for (const [x, z, s, k] of [[-2000, 4100, 70, 1], [-900, 3600, 80, 2], [300, 3900, 60, 3], [1200, 3500, 75, 4]]) boulder(x, z, s, 400 + k, -96);
  // a footbridge over the cut, with steps down at its south end
  K.catwalk(-460, 2600, -340, 4600, 0, { rails: ['w', 'e'], base: -96 });
  K.stairs(-340, 4300, -220, 4600, -96, 0, 's', 'diamond', 'steel');
  for (const x of [-1700, 0, 1500]) { K.pole(x, 2520, 260, lampC); K.pole(x + 600, 4700, 260, lampC); }

  // =========================================================== Hangar 2 (A)
  bld(2400, -4600, 5200, -2000, { h: 440, wall: 'hangar', inner: 'hangar', roof: null, floor: 'concrete_floor',
    doors: [{ side: 'w', at: -3500, w: 720, h: 380 }, { side: 's', at: 3000, w: 128, h: 144 }, { side: 's', at: 4600, w: 128, h: 144 }],
    windows: [{ side: 'n', at: 3200, w: 320, y0: 320, y1: 410 }, { side: 'n', at: 4400, w: 320, y0: 320, y1: 410 }, { side: 's', at: 3800, w: 320, y0: 320, y1: 410 }],
    lamps: [[3200, -3800], [4400, -3800], [3200, -2900], [4400, -2900]], lampCol: lampC, lampK: 1.4, lampR: 720 });
  // the roof, with three skylights across it (glazing bars every 300) that let the sun onto the floor
  {
    const RF = { top: 'shed_roof', bottom: 'steel', sides: 'hangar' }, zs = [-4600, -4150, -4000, -3450, -3300, -2750, -2600, -2000];
    for (let i = 0; i < zs.length; i += 2) M.box(2400, 440, zs[i], 5200, 452, zs[i + 1], RF);
    for (let i = 1; i < zs.length - 1; i += 2) {
      M.box(2400, 440, zs[i], 2700, 452, zs[i + 1], RF); M.box(4900, 440, zs[i], 5200, 452, zs[i + 1], RF);
      for (let x = 3000; x < 4900; x += 300) M.box(x - 6, 440, zs[i], x + 6, 452, zs[i + 1], 'steel', K.ND);
    }
  }
  // the survey plane: fuselage and nose, wings, tailplane and fin, two engines, landing gear
  M.obb(3800, 110, -3300, 90, 70, 620, 0, { sides: 'paint_white', top: 'paint_white', bottom: 'steel' });
  M.obb(3800, 100, -3940, 60, 50, 40, 0, 'paint_white');
  M.box(2800, 150, -3420, 4800, 166, -3180, { top: 'paint_white', bottom: 'paint_white', sides: 'paint_orange' });
  M.box(3500, 170, -2760, 4100, 182, -2640, { top: 'paint_white', bottom: 'paint_white', sides: 'paint_orange' });
  M.box(3790, 180, -2780, 3810, 330, -2650, 'paint_orange');
  for (const x of [3300, 4300]) {
    M.box(x - 34, 118, -3560, x + 34, 176, -3220, { sides: 'paint_white', top: 'paint_white', bottom: 'steel' });
    M.box(x - 6, 140, -3576, x + 6, 154, -3560, 'steel', K.ND); M.box(x - 3, 92, -3580, x + 3, 202, -3576, 'steel', K.ND);
  }
  for (const [x, z] of [[3800, -3800], [3640, -3150], [3960, -3150]]) M.box(x - 12, 0, z - 20, x + 12, 40, z + 20, 'steel');
  K.truck(2900, -2700, 0.3, 'paint_orange');                                                         // tow tractor
  for (const [x, z] of [[2700, -4400], [3300, -4450], [4900, -2300], [2600, -2300]]) K.crates(x, z, 3, x + z);
  for (const [x, z] of [[4900, -4300], [4950, -3900]]) M.box(x - 60, 0, z - 30, x + 60, 72, z + 30, { sides: 'paint_orange', top: 'steel', bottom: null });   // tool chests
  // the mezzanine office in the north-east corner, stairs up from the south
  K.catwalk(4400, -4584, 5184, -4000, 176, { rails: ['w'] });
  K.railing('x', 4600, 5184, -4002, 176);
  K.building(4600, -4584, 5184, -4200, { y: 176, h: 128, wall: 'panel', inner: 'plywood', roof: 'steel', floor: null, doors: [{ side: 's', at: 4800 }],
    windows: [{ side: 's', at: 5000, w: 128 }, { side: 'w', at: -4400, w: 96 }], lamps: [[4890, -4400]], lampK: 0.7, lampR: 240 });
  K.stairs(4420, -4000, 4580, -3700, 0, 176, 'n', 'diamond', 'steel');
  plate(2396, 280, -3080, 2400, 360, -2880, 'w', 'sign_hangar'); plate(3600, 160, -2000, 3800, 260, -1996, 's', 'site_a');

  // =========================================================== Dish Array (B): raised platform, two dishes, a control hut
  G.push([2600, 2000, 5200, 4600, 'snow']);
  M.box(2800, 0, 2400, 4800, 96, 4400, { top: 'concrete_floor', sides: 'concrete', bottom: null });
  M.box(2800, 96, 2396, 4800, 100, 2404, 'hazard', K.ND);
  M.ramp(2600, 3200, 2800, 4000, 0, 96, 'e', { top: 'concrete_floor', sides: 'concrete' });        // carries on from the Ice Cut ramp
  K.stairs(2800, 2000, 3100, 2400, 0, 96, 's', 'diamond', 'steel');                                 // from the Generator Path and the north bank
  K.stairs(4800, 3200, 5100, 3600, 0, 96, 'w', 'diamond', 'steel');                                 // Warden stairs (east)
  K.railing('x', 3100, 4800, 2402, 96); K.railing('x', 2800, 4800, 4398, 96); K.railing('z', 2400, 3200, 4798, 96); K.railing('z', 3600, 4400, 4798, 96);
  for (const [x, z, yaw] of [[3400, 3000, 0.4], [4200, 3800, -0.6]]) {
    M.prism(x, z, 96, 260, 50, 10, { side: 'steel', top: 'steel' });                                 // pedestal
    M.box(x - 90, 96, z - 90, x + 90, 120, z + 90, 'concrete_plain');
    K.tiltDisc(x, 380, z, 230, 24, 16, yaw, 0.7, { sides: 'paint_white', top: 'paint_white', bottom: 'steel' });
    K.tiltBox(x, 330, z, 12, 60, 12, yaw, 0.7, 0, 'steel', K.ND);
  }
  K.building(4300, 2500, 4700, 2900, { y: 96, h: 150, wall: 'paint_white', inner: 'panel', roof: 'roof', floor: null,
    doors: [{ side: 'w', at: 2700 }, { side: 's', at: 4500 }], windows: [{ side: 'n', at: 4500, w: 128 }, { side: 'w', at: 2550 }], lamps: [[4500, 2700]], lampK: 0.8, lampR: 260 });   // control hut
  M.box(4400, 96 + 70, 2516, 4460, 96 + 100, 2518, 'screen_glow', K.ND);
  M.box(4560, 96, 2530, 4680, 96 + 36, 2600, { sides: 'panel', top: 'steel', bottom: null });           // desk
  K.crates(3000, 4280, 3, 61, 96); K.barrels(4650, 4300, 4, 62, 96);
  M.box(3800, 96, 2600, 4000, 140, 2660, { sides: 'sandbag', top: 'sandbag', bottom: null });
  K.crates(5000, 2300, 3, 63); K.crates(2700, 4500, 2, 64);
  plate(3600, 16, 4400, 3740, 86, 4404, 's', 'site_b'); plate(2796, 24, 2600, 2800, 80, 2800, 'w', 'sign_dish');
  for (const [x, z] of [[2700, 2200], [5000, 2200], [2700, 4500], [5000, 4500]]) K.pole(x, z, 280, lampC);

  // =========================================================== Parade Ground, Mess Hall, Barracks Row (Wardens)
  G.push([1600, -1600, 5200, 1600, 'concrete_floor']);
  bld(3200, -900, 4400, 900, { h: 200, wall: 'paint_white', inner: 'plaster', roof: 'roof', floor: 'tiles',
    doors: [{ side: 'w', at: 0, w: 96, door: 'door' }, { side: 'e', at: 0, w: 96 }, { side: 'n', at: 3800 }, { side: 's', at: 3800 }],
    windows: [{ side: 'w', at: -500 }, { side: 'w', at: 500 }, { side: 'e', at: -500 }, { side: 'e', at: 500 }, { side: 'n', at: 3500 }, { side: 's', at: 4100 }],
    lamps: [[3800, -400], [3800, 400]], lampCol: lampW });   // mess hall
  for (const z of [-450, 450]) for (const [a, b] of [[3350, 3700], [3900, 4250]]) M.box(a, 0, z - 40, b, 32, z + 40, 'timber');
  K.truck(2200, -1100, Math.PI / 2, 'paint_orange'); K.truck(2400, 1150, -Math.PI / 2, 'container_blue'); K.container(4800, -1400, 'x', 'container', 0, 320);
  K.crates(2100, 0, 3, 71); K.sandbags(2700, -200, 2780, 200, 44); K.crates(4700, 1200, 3, 72);
  // the radio mast: four legs, bands every 160 and a cross-arm at the top
  for (const [dx, dz] of [[-24, -24], [24, -24], [-24, 24], [24, 24]]) M.box(2600 + dx - 3, 0, -700 + dz - 3, 2600 + dx + 3, 1100, -700 + dz + 3, 'steel');
  for (let y = 160; y < 1100; y += 160) for (const [a, b, c, d] of [[-27, -27, 27, -21], [-27, 21, 27, 27], [-27, -21, -21, 21], [21, -21, 27, 21]]) M.box(2600 + a, y, -700 + b, 2600 + c, y + 4, -700 + d, 'steel', K.ND);
  M.box(2480, 1060, -704, 2720, 1068, -696, 'steel', K.ND); M.box(2596, 1100, -704, 2604, 1180, -696, 'steel', K.ND);
  for (const z of [-1300, 1300]) K.pole(3000, z, 260, lampC);
  G.push([5200, -1400, 6000, 1400, 'asphalt']);
  K.block(5200, -4900, 6000, -1400, 360, 'paint_white', 'roof'); K.block(5200, 1400, 6000, 4900, 360, 'paint_white', 'roof');
  for (const x of [5400, 5800]) { K.win(x - 100, 160, -1400, x + 100, 240, -1398, 's'); K.win(x - 100, 160, 1398, x + 100, 240, 1400, 'n'); }
  for (const z of [2200, 3200, 4200]) K.win(5198, 160, z - 100, 5200, 240, z + 100, 'w');
  K.truck(5700, -900, Math.PI); K.crates(5400, 1000, 3, 81);
  for (const z of [-1200, 1200]) K.pole(5300, z, 260, lampC);

  K.ground(G, 'rock', 0);

  // =========================================================== spawns, sites, places
  for (let i = 0; i < 8; i++) M.teamSpawn(0, -5600 + (i % 2) * 240, 0, -560 + Math.floor(i / 2) * 370, -Math.PI / 2);
  for (let i = 0; i < 8; i++) M.teamSpawn(1, 5750 - (i % 2) * 240, 0, -560 + Math.floor(i / 2) * 370, Math.PI / 2);
  M.spawn(-5500, 0, -400, -Math.PI / 2);
  M.site('A', 2600, -4400, 5000, -2200, -16, 440);
  M.site('B', 2700, 2300, 4900, 4500, -16, 300);
  for (const [x, y, z, n] of [[3800, 0, -3300, 'Hangar 2'], [3800, 0, -2560, 'under the tail'], [4890, 176, -4400, 'hangar office'], [-200, 0, -3300, 'Fuel Depot'],
    [-200, 200, -3630, 'pipe rack'], [1800, 0, -4600, 'pump house'], [-4150, 0, -3350, 'supply shed'], [-2500, 0, 0, 'the Pass'], [600, 0, 0, 'server room'],
    [600, 0, -900, 'Comms Block'], [600, 0, -1800, 'Radio Path'], [600, 0, 1800, 'Generator Path'], [0, -96, 3500, 'Ice Cut'], [3800, 96, 3400, 'Dish Array'],
    [4500, 96, 2700, 'control hut'], [3800, 0, 0, 'Mess Hall'], [2400, 0, 0, 'Parade Ground'], [5600, 0, 0, 'Barracks Row'], [-5300, 0, 0, 'Drop Zone']]) M.hotspot(x, y, z, n);
  for (const [n, x0, z0, x1, z1] of [['Drop Zone', -6000, -1200, -4600, 1200], ['Hangar 2', 2400, -4900, 5200, -2000], ['Fuel Depot', -2400, -4900, 2400, -2400],
    ['North Slope', -6000, -4900, -2400, -1200], ['the Pass', -4600, -900, -400, 900], ['North Ridge', -4600, -2400, -400, -900], ['South Ridge', -4600, 900, -400, 2400],
    ['Comms Block', -400, -1200, 1600, 1200], ['Radio Path', -400, -2400, 1600, -1200], ['Generator Path', -400, 1200, 1600, 2400], ['South Slope', -6000, 1200, -2400, 4900],
    ['Ice Cut', -2400, 2400, 2600, 4900], ['Dish Array', 2600, 2000, 5200, 4900], ['Parade Ground', 1600, -2000, 5200, 2000], ['Barracks Row', 5200, -4900, 6000, 4900]]) M.area(n, x0, z0, x1, z1);

  M.menuShots = [
    { from: [2700, 300, -2300], to: [3100, 280, -2400], look: [3800, 120, -3300], lookTo: [3900, 120, -3200] },
    { from: [-4200, 220, -40], to: [-2600, 240, 0], look: [600, 160, 0] },
    { from: [2300, 420, 2300], to: [2700, 400, 2200], look: [3800, 260, 3400], lookTo: [4000, 260, 3500] },
  ];

  const WD = [2400, -3500], SD1 = [3000, -2000], SD2 = [4600, -2000], RAMP = [2700, 3600], NST = [2950, 2300];
  const hold = (x, y, z, t) => [x, y, z, face(x, z, t[0], t[1])];
  M.tactics = {
    routes: {
      depot: { stack: [-5300, 0, -1700], yaw: face(-5300, -1700, -2400, -3000) * Math.PI / 180, via: [0, 0, -3000] },
      radio: { stack: [-4300, 0, 0], yaw: -Math.PI / 2, via: [600, 0, -1800] },
      generator: { stack: [-4300, 0, 0], yaw: -Math.PI / 2, via: [600, 0, 1800] },
      cut: { stack: [-5300, 0, 1700], yaw: face(-5300, 1700, -2400, 3600) * Math.PI / 180, via: [0, -96, 3600] },
    },
    siteRoutes: { A: ['radio', 'depot'], B: ['generator', 'cut'] },
    mid: [-4600, -900, 1600, 900],
    sites: {
      A: { hold: [hold(3300, 0, -2700, SD1), hold(4300, 0, -2500, SD2), hold(3100, 0, -4300, WD), hold(4890, 176, -4400, WD), hold(2750, 0, -2350, WD), hold(4900, 0, -3000, SD1), hold(3800, 0, -2560, WD), hold(4300, 0, -3900, WD)],
        plant: [[3800, 0, -2560], [3000, 0, -3900], [4600, 0, -3500]], smoke: [[2500, 0, -3500], [3000, 0, -2100]] },
      B: { hold: [hold(3000, 96, 2600, NST), hold(4500, 96, 2700, RAMP), hold(4600, 96, 4200, RAMP), hold(3100, 96, 4100, RAMP), hold(3800, 96, 3400, RAMP), hold(2650, 0, 2250, [2000, 2500]), hold(5000, 0, 3000, [5000, 4700]), hold(4100, 96, 2600, NST)],
        plant: [[3600, 96, 3400], [3200, 96, 4000], [4400, 96, 3200]], smoke: [[2750, 50, 3600], [2950, 96, 2450]] },
    },
  };
  return M;
}
