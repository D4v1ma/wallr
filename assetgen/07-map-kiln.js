// "Kilnworks" for the Godot version (assetgen): an original brick-and-tile works on a clay quarry at
// ten times the area of the original, 11,200 x 9,800 units, late-afternoon sun.
// Axes: +X east, +Y up, +Z south. Raiders climb out of the quarry (south); Wardens hold the office
// court (north).
//   A: Kiln Yard (north-west) - a firing kiln with an arch, a round updraught kiln, the big chimney
//      west lane: Clay Pits (terraced, a conveyor gantry), Pit Track;  mid: Clay Court, Kiln Alley
//   B: Press Hall (north-east, indoor) - two presses, a conveyor, a raised control booth
//      east lane: Rail Siding (tracks, wagons, gantry crane), roller door;  mid: Tile Store, Conveyor Room
//   Mid: the Clay Court with the pug-mill house, drying sheds to the west.

function buildKilnworks() {
  const M = new MapBuilder(), K = mapKit(M);
  const sd = [-0.55, 0.42, 0.55], sl = Math.hypot(...sd);
  M.env = {
    sunDir: sd.map((v) => v / sl), sunColor: [1.0, 0.8, 0.6], sunIntensity: 1.1,
    skyZenith: [0.34, 0.46, 0.68], skyHorizon: [0.95, 0.77, 0.58], skyIntensity: 0.8,
    fogColor: [0.84, 0.72, 0.6], fogDensity: 0.00006, ambient: 0.12,
    skySun: [1.0, 0.76, 0.48], skyGround: [0.6, 0.45, 0.35], skyMountains: [0.52, 0.42, 0.36],
    lmBig: 320, lmBigS: 32, lmSmall: 16, probeStep: 128, bakeRays: 9, navStep: 48, chunk: 2048,
    roundTime: 175, fuse: 45, buyRadius: 900, radarZoom: 0.44,
  };
  const G = [];
  const X0 = -5600, X1 = 5600, Z0 = -4900, Z1 = 4900, HP = 480, BIG = { lm: 48 };
  const bld = (x0, z0, x1, z1, o) => { G.push([x0, z0, x1, z1, o.floor ?? 'concrete_floor', o.y ?? 0]); return K.building(x0, z0, x1, z1, Object.assign({}, o, { floor: null })); };
  const plate = (x0, y0, z0, x1, y1, z1, face, tex) => K.sign(x0, y0, z0, x1, y1, z1, face, tex);
  const lampW = [1.0, 0.8, 0.56], lampC = [0.85, 0.9, 1.0];
  // brick stacks on pallets (the works' everyday cover)
  const bricks = (x, z, w, d, h, yaw = 0) => { M.box(x - w / 2, 0, z - d / 2, x + w / 2, 8, z + d / 2, 'timber', { yaw }); M.box(x - w / 2 + 2, 8, z - d / 2 + 2, x + w / 2 - 2, 8 + h, z + d / 2 - 2, { sides: 'brick', top: 'brick', bottom: null }, { yaw }); };
  // drying rack: a timber frame with shelves of green tiles
  const rack = (x, z, len = 320) => {
    for (const dx of [-len / 2, len / 2]) M.box(x + dx - 4, 0, z - 4, x + dx + 4, 150, z + 4, 'timber');
    for (const y of [40, 90, 140]) M.box(x - len / 2, y, z - 24, x + len / 2, y + 6, z + 24, { top: 'roof_tiles', sides: 'timber', bottom: 'timber' });
  };

  // =========================================================== outer walls: works brick north/east/west, quarry rock south
  K.wall(X0 - 64, Z0 - 64, X1 + 64, Z0, HP + 192, 'brick_yellow', -192, 'concrete_plain', BIG);
  K.wall(X0 - 64, Z1, X1 + 64, Z1 + 64, HP + 192, 'rock', -192, 'rock', BIG);
  K.wall(X0 - 64, Z0, X0, Z1, HP + 192, 'brick_yellow', -192, 'concrete_plain', BIG);
  K.wall(X1, Z0, X1 + 64, Z1, HP + 192, 'brick_yellow', -192, 'concrete_plain', BIG);
  for (let x = X0 + 320; x < X1; x += 640) K.wall(x - 16, Z0, x + 16, Z0 + 16, HP - 24, 'brick');
  for (let z = Z0 + 320; z < 2400; z += 640) { K.wall(X0, z - 16, X0 + 16, z + 16, HP - 24, 'brick'); K.wall(X1 - 16, z - 16, X1, z + 16, HP - 24, 'brick'); }
  G.push([X0, Z0, X1, Z1, 'dirt']);

  // =========================================================== the Quarry (Raider spawn), 96 below the works
  G.push([-1400, 3600, 1400, 4900, 'clay', -96], [-2400, 3800, -1400, 4400, 'clay', -96], [-400, 2800, 400, 3600, 'clay', -96], [1400, 3800, 2400, 4400, 'clay', -96]);
  M.ramp(-2400, 3800, -1400, 4400, -96, 0, 'w', { top: 'clay', sides: 'rock' });
  M.ramp(-400, 2800, 400, 3600, -96, 0, 'n', { top: 'clay', sides: 'rock' });
  M.ramp(1400, 3800, 2400, 4400, -96, 0, 'e', { top: 'clay', sides: 'rock' });
  for (const [x, z, r, h] of [[-1100, 4650, 220, 260], [1150, 4600, 200, 240], [-700, 3700, 120, 120], [800, 3720, 140, 110], [0, 4780, 260, 200]]) K.heap(x, z, r, h, 'rock', r * 0.35, -96);
  K.block(-1360, 3620, -1180, 3760, 64, 'steel', 'steel', -96); K.crates(500, 4200, 3, 11, -96); K.barrels(-450, 4300, 4, 12, -96);
  for (const [x, z] of [[-900, 4100], [900, 4100]]) K.lamp(x, 140, z, lampW, 1.0, 520, 0);
  // the rim: rock outcrops along the south edge
  for (let x = -5200; x <= 5200; x += 800) if (Math.abs(x) > 2600) K.heap(x, 4600, 320, 300, 'rock', 120);
  plate(-396, -20, 2900, -400, 30, 3060, 'w', 'sign_pits');

  // =========================================================== Clay Pits (west lane): terraces 64 down, ramps, heaps, a conveyor gantry
  G.push([-5600, -1200, -2400, 4900, 'clay']);
  G.push([-5000, 0, -3000, 2400, 'clay', -64], [-5000, 2400, -4200, 3400, 'clay', -64]);
  M.ramp(-3000, 600, -2600, 1200, -64, 0, 'e', { top: 'clay', sides: 'rock' }); G.push([-3000, 600, -2600, 1200, 'clay', -64]);
  M.ramp(-4600, -400, -3800, 0, -64, 0, 'n', { top: 'clay', sides: 'rock' }); G.push([-4600, -400, -3800, 0, 'clay', -64]);
  M.ramp(-4200, 2400, -3600, 3000, -64, 0, 'e', { top: 'clay', sides: 'rock' }); G.push([-4200, 2400, -3600, 3000, 'clay', -64]);
  for (const [x, z, r, h] of [[-4500, 600, 260, 200], [-3500, 1500, 220, 160], [-4400, 2000, 180, 140], [-3300, 300, 160, 120], [-4600, 3000, 200, 150]]) K.heap(x, z, r, h, 'clay', r * 0.3, -64);
  for (const [x, z, r, h] of [[-5200, -800, 240, 220], [-2800, 3800, 220, 180], [-5200, 4200, 260, 200]]) K.heap(x, z, r, h, 'clay', r * 0.3);
  K.catwalk(-5400, 1100, -2600, 1220, 230, { rails: ['n', 's'], base: -64 });                   // conveyor gantry
  M.box(-5400, 236, 1130, -2600, 250, 1190, { top: 'steel', sides: 'steel', bottom: 'steel' }, K.ND);
  K.stairs(-2760, 1220, -2640, 1540, 0, 230, 'n', 'diamond', 'steel');
  K.block(-5560, 1000, -5300, 1320, 300, 'shed', 'shed_roof');                                  // hopper house
  K.block(-4800, 3500, -4300, 3900, 150, 'paint_orange', 'steel');                              // the excavator
  M.box(-4700, 150, 3600, -4400, 200, 3800, { sides: 'paint_orange', top: 'steel', bottom: null });
  K.crates(-3400, 3700, 3, 21); K.barrels(-5300, 2600, 4, 22); K.sandbags(-3200, -800, -3000, -720, 44);
  for (const [x, z] of [[-3400, -600], [-5000, 1600], [-3300, 2600]]) K.pole(x, z, 240);
  // Pit Track north to the Kiln Yard's south gate
  G.push([-4100, -1600, -3300, -1200, 'cobble']);
  K.block(-5600, -1600, -4100, -1200, 300, 'brick', 'roof'); K.block(-3300, -1600, -2400, -1200, 280, 'brick_yellow', 'roof');

  // =========================================================== Drying Sheds (between the pits and the court)
  for (const [x0, x1] of [[-2400, -1950], [-1850, -1400]]) {
    bld(x0, -1200, x1, 2400, { h: 220, wall: 'brick', inner: 'brick', roof: 'roof_tiles', floor: 'concrete_floor',
      doors: [{ side: 'n', at: (x0 + x1) / 2, w: 128, h: 160 }, { side: 's', at: (x0 + x1) / 2, w: 128, h: 160 }, { side: 'w', at: 600, w: 96 }, { side: 'e', at: 1500, w: 96 }],
      windows: [{ side: 'w', at: -400, w: 128, y0: 140, y1: 190 }, { side: 'e', at: 0, w: 128, y0: 140, y1: 190 }, { side: 'w', at: 2000, w: 128, y0: 140, y1: 190 }],
      lamps: [[(x0 + x1) / 2, -400], [(x0 + x1) / 2, 1200]], lampCol: lampW, lampK: 1.0 });
    for (const z of [-700, 300, 1900]) rack((x0 + x1) / 2, z, 260);
  }
  G.push([-1950, -1200, -1850, 2400, 'dirt']);

  // =========================================================== Clay Court (mid) and the pug-mill house
  G.push([-1400, -1600, 1400, 2800, 'concrete_floor'], [-300, 2400, 300, 2800, 'cobble']);
  bld(-500, 200, 500, 1000, { h: 200, wall: 'brick', inner: 'plaster_warm', roof: 'roof_tiles', floor: 'concrete_floor',
    doors: [{ side: 'w', at: 600, w: 96, door: 'door' }, { side: 'e', at: 450 }, { side: 'n', at: 0, w: 128, h: 144 }, { side: 's', at: -200 }],
    windows: [{ side: 's', at: 250 }, { side: 'n', at: -300 }, { side: 'w', at: 300 }, { side: 'e', at: 800 }], lamps: [[0, 600]], lampCol: lampW });
  M.prism(0, 600, 0, 120, 110, 12, { side: 'steel', top: 'steel' }); M.prism(0, 600, 120, 260, 40, 8, 'steel');     // the pug mill
  for (const [x, z] of [[-900, -1000], [900, -1000], [-900, 1900], [900, 1900]]) rack(x, z, 320);
  for (const [x, z, w, d, h, a] of [[-1100, 300, 120, 80, 64, 0.1], [1100, -300, 120, 80, 72, -0.2], [-700, -400, 100, 70, 56, 0.5], [700, 1500, 120, 80, 64, 0], [0, -1300, 140, 90, 72, 0.2], [1150, 2500, 120, 80, 60, 0.4]]) bricks(x, z, w, d, h, a);
  K.block(-1400, 2400, -800, 2800, 260, 'brick_yellow', 'roof'); K.block(800, 2400, 1400, 2800, 260, 'brick_yellow', 'roof');   // weighbridge huts by the quarry gate
  for (const [x, z] of [[-1100, -600], [1100, -600], [-1100, 1400], [1100, 1400]]) K.pole(x, z, 250);
  plate(-504, 140, 520, -500, 190, 680, 'w', 'sign_kilnworks');

  // =========================================================== Kiln Alley (court -> A) and the Conveyor Room (court -> B)
  G.push([-1400, -2400, -800, -1600, 'cobble']);
  K.block(-800, -2400, 800, -1600, 300, 'brick', 'roof_tiles');                                   // the works stores between them
  bld(800, -2400, 1800, -1400, { h: 220, wall: 'brick_yellow', inner: 'concrete', roof: 'roof', floor: 'concrete_floor',
    doors: [{ side: 's', at: 1300, w: 128, h: 144 }, { side: 'e', at: -2000, w: 128, h: 160 }, { side: 'n', at: 1000 }],
    windows: [{ side: 'w', at: -2000, w: 96 }, { side: 's', at: 1650 }], lamps: [[1300, -1900]], lampCol: lampC });
  K.catwalk(820, -2000, 1780, -1900, 70, { rails: [], posts: true });                            // the belt into the press hall
  M.box(820, 70, -1990, 1780, 80, -1910, { top: 'steel', sides: 'steel', bottom: null }, K.ND);
  K.crates(-1200, -2200, 3, 31); K.barrels(1000, -1600, 3, 32);

  // =========================================================== Kiln Yard (A)
  G.push([-5000, -4600, -1400, -1600, 'concrete_floor'], [-5600, -4900, -5000, -1600, 'dirt'], [-1400, -2400, -1100, -1600, 'cobble']);
  // the firing kiln: brick block with an arched opening, walk-through
  bld(-4400, -4200, -3200, -3400, { h: 260, wall: 'firebrick', inner: 'firebrick', roof: 'firebrick', floor: 'concrete_floor', cap: 'firebrick',
    doors: [{ side: 's', at: -3800, w: 160, h: 176 }, { side: 'n', at: -3800, w: 128, h: 160 }, { side: 'e', at: -3800, w: 96 }], lamps: [[-3800, -3800]], lampCol: [1.0, 0.6, 0.3], lampK: 1.4 });
  M.prism(-3600, -3800, 260, 1500, 110, 12, { side: 'firebrick', top: 'concrete_plain' });                  // the big chimney
  // the round updraught kiln (solid, cover) and its stack
  M.prism(-2400, -3200, 0, 300, 300, 18, { side: 'brick', top: 'firebrick' }); M.prism(-2400, -3200, 300, 420, 140, 14, { side: 'firebrick', top: 'concrete_plain' });
  for (const [x, z, w, d, h, a] of [[-4600, -2400, 140, 90, 72, 0.1], [-3500, -2200, 120, 80, 64, 0.3], [-2900, -2600, 160, 100, 80, 0], [-1900, -2300, 120, 80, 64, -0.4],
    [-4700, -3400, 120, 80, 60, 0], [-2000, -4200, 140, 90, 72, 0.2], [-3000, -4400, 120, 80, 64, 0]]) bricks(x, z, w, d, h, a);
  K.crates(-4800, -4500, 3, 41); K.barrels(-1700, -3900, 4, 42); K.sandbags(-3300, -2000, -3100, -1940, 44);
  K.wall(-5000, -1632, -4100, -1600, 280, 'brick'); K.wall(-3300, -1632, -1400, -1600, 280, 'brick');            // south wall, gate to the Pit Track
  K.wall(-1432, -4900, -1400, -3900, 300, 'brick'); K.wall(-1432, -3300, -1400, -2400, 300, 'brick');           // east wall, gate to the court
  for (const [x, z] of [[-4600, -2000], [-2200, -2000], [-4600, -4400], [-1800, -3000]]) K.pole(x, z, 250);
  plate(-3804, 120, -3420, -3796, 220, -3416, 's', 'sign_kiln'); plate(-1436, 120, -2900, -1432, 220, -2800, 'w', 'site_a');

  // =========================================================== Office Court (Warden spawn) and the Works Office
  G.push([-1400, -4900, 1800, -2400, 'cobble']);
  bld(-800, -4900, 800, -4200, { h: 176, floors: 2, wall: 'brick_yellow', inner: 'plaster', roof: 'roof_tiles', floor: 'wood_floor', upperFloor: 'wood_floor', parapet: 0,
    doors: [{ side: 's', at: 0, w: 96, door: 'door' }, { side: 'w', at: -4500 }, { side: 'e', at: -4500 }],
    windows: [{ side: 's', at: -500 }, { side: 's', at: 500 }, { side: 's', at: -500, level: 1 }, { side: 's', at: 0, level: 1 }, { side: 's', at: 500, level: 1 }],
    stairs: { x0: 560, z0: -4880, x1: 780, z1: -4560, up: 'n' }, lamps: [[-300, -4550], [300, -4550, 1]], lampCol: lampW });
  for (const x of [-1100, 1100]) { M.box(x - 60, 0, -3000, x + 60, 64, -2800, { top: 'sand', sides: 'brick', bottom: null }); K.pole(x, -2700, 240); }
  K.truck(1500, -3400, Math.PI / 2 + 0.1, 'container_blue'); K.crates(-1200, -4600, 3, 51);
  plate(-200, 150, -4204, 200, 200, -4200, 's', 'sign_kilnworks');

  // =========================================================== Press Hall (B)
  bld(1800, -4600, 5000, -1600, { h: 420, wall: 'brick_yellow', inner: 'brick', roof: 'shed_roof', ceiling: 'steel', floor: 'concrete_floor',
    doors: [{ side: 'w', at: -2000, w: 128, h: 160 }, { side: 'w', at: -3800, w: 128, h: 144 }, { side: 's', at: 4000, w: 320, h: 260 }, { side: 's', at: 2600, w: 96 }],
    windows: [{ side: 'n', at: 2600, w: 240, y0: 280, y1: 380 }, { side: 'n', at: 3600, w: 240, y0: 280, y1: 380 }, { side: 'n', at: 4500, w: 240, y0: 280, y1: 380 },
      { side: 'e', at: -3000, w: 240, y0: 280, y1: 380 }, { side: 'w', at: -3000, w: 160, y0: 280, y1: 380 }],
    lamps: [[2600, -3800], [4200, -3800], [2600, -2400], [4200, -2400]], lampCol: lampC, lampK: 1.4, lampR: 700 });
  // two presses: a bed on legs (crawl space under), a ram frame above
  for (const [x, z] of [[2900, -3400], [4100, -3400]]) {
    for (const [dx, dz] of [[-200, -150], [200, -150], [-200, 150], [200, 150]]) M.box(x + dx - 24, 0, z + dz - 24, x + dx + 24, 64, z + dz + 24, 'steel');
    M.box(x - 240, 64, z - 190, x + 240, 104, z + 190, { top: 'diamond', sides: 'paint_orange', bottom: 'steel' });
    for (const dx of [-210, 210]) M.box(x + dx - 20, 104, z - 20, x + dx + 20, 320, z + 20, 'paint_orange');
    M.box(x - 230, 320, z - 60, x + 230, 380, z + 60, { sides: 'paint_orange', top: 'steel', bottom: 'steel' });
  }
  K.catwalk(1820, -2100, 4980, -1950, 64, { rails: [], posts: true });                                     // the conveyor line
  M.box(1820, 64, -2090, 4980, 74, -1960, { top: 'steel', sides: 'steel', bottom: null }, K.ND);
  // control booth on a mezzanine in the south-east corner, up a ramp
  K.catwalk(4300, -2460, 4980, -1620, 176, { rails: ['w', 'n'] });
  K.building(4500, -2400, 4960, -1980, { y: 176, h: 128, wall: 'panel', inner: 'plywood', roof: 'steel', floor: null, doors: [{ side: 'w', at: -2200 }],
    windows: [{ side: 'n', at: 4730, w: 160 }, { side: 'w', at: -2340 }], lamps: [[4730, -2200]], lampK: 0.7, lampR: 220 });
  M.ramp(3500, -2460, 4300, -2300, 0, 176, 'e', { top: 'diamond', sides: 'steel' });
  for (const [x, z] of [[2200, -4300], [3500, -4400], [4700, -4300]]) K.crates(x, z, 3, x);
  K.barrels(2000, -2700, 4, 61); K.container(3300, -2900, 'z', 'container', 0, 240);
  plate(1804, 200, -2900, 1800, 280, -2700, 'w', 'sign_press'); plate(3000, 140, -1620, 3200, 240, -1616, 'n', 'site_b');

  // =========================================================== Tile Store (mid -> siding)
  bld(1400, -1000, 2600, 2600, { h: 260, wall: 'brick', inner: 'plaster_warm', roof: 'roof_tiles', floor: 'concrete_floor',
    doors: [{ side: 'w', at: 0, w: 128, h: 160 }, { side: 'w', at: 1800, w: 96 }, { side: 'e', at: 400, w: 160, h: 176 }, { side: 'e', at: 2000, w: 96 }, { side: 'n', at: 2000, w: 96 }],
    windows: [{ side: 'w', at: 900, w: 128, y0: 160, y1: 220 }, { side: 'e', at: -500, w: 128, y0: 160, y1: 220 }, { side: 's', at: 2000, w: 160, y0: 160, y1: 220 }],
    lamps: [[2000, -400], [2000, 1000], [2000, 2200]], lampCol: lampW });
  for (const z of [-600, 300, 1300, 2200]) { rack(1750, z, 300); rack(2250, z + 250, 300); }

  // =========================================================== Rail Siding (east lane)
  G.push([2600, -1600, 5600, 4900, 'dirt'], [3500, -1600, 3700, 4900, 'ballast'], [4500, -1600, 4700, 4900, 'ballast']);
  for (const x of [3600, 4600]) {
    M.box(x - 64, -16, -1600, x + 64, 0, 4900, { top: 'ballast', sides: 'concrete', bottom: null }, { lm: 24 });
    for (let z = -1580; z < 4880; z += 40) M.box(x - 46, 0, z - 8, x + 46, 4, z + 8, { top: 'timber', sides: 'timber' }, Object.assign({ lm: 32 }, K.ND));
    for (const s of [-1, 1]) M.box(x + s * 30 - 2, 4, -1600, x + s * 30 + 2, 10, 4900, 'steel', Object.assign({ lm: 32 }, K.ND));
  }
  // wagons along the tracks (bodies run north-south)
  for (const [x, z0, len, tex] of [[3600, -800, 520, 'wagon'], [3600, 1600, 480, 'wagon_blue'], [4600, 400, 560, 'wagon'], [4600, 3000, 520, 'wagon_blue']]) {
    M.box(x - 56, 34, z0, x + 56, 40, z0 + len, 'steel'); M.box(x - 54, 40, z0 + 8, x + 54, 176, z0 + len - 8, { e: tex, w: tex, n: 'steel', s: 'steel', top: 'roof', bottom: null });
    for (const dz of [60, len - 60]) M.box(x - 40, 6, z0 + dz - 30, x + 40, 34, z0 + dz + 30, 'steel');
  }
  // loading shed and a gantry crane across the tracks
  bld(2800, 1000, 3300, 2200, { h: 200, wall: 'shed', inner: 'shed', roof: 'shed_roof', floor: 'concrete_floor',
    doors: [{ side: 'w', at: 1600, w: 128, h: 160 }, { side: 'e', at: 1300, w: 128, h: 160 }, { side: 'n', at: 3050 }], lamps: [[3050, 1600]], lampCol: lampW });
  K.catwalk(3000, 2600, 5560, 2760, 320, { rails: ['n', 's'], posts: 'ends' });
  for (const x of [3000, 5560]) for (const z of [2600, 2760]) M.box(x - 10, 0, z - 10, x + 10, 314, z + 10, 'paint_orange');
  M.box(4000, 260, 2620, 4200, 320, 2740, { sides: 'paint_orange', top: 'steel', bottom: 'steel' }, K.ND);
  K.stairs(5400, 2760, 5560, 3100, 0, 320, 'n', 'diamond', 'steel');
  for (const [x, z] of [[5200, -1000], [5200, 4300]]) { K.tank(x, z, 160, 300, 'steel'); }
  K.crates(2900, 3600, 4, 71); K.barrels(5300, 800, 4, 72); K.sandbags(4100, -1200, 4300, -1140, 44);
  for (const z of [-900, 600, 2100, 3700]) { K.pole(4100, z, 260); }

  K.ground(G, 'rock', 0);

  // =========================================================== spawns, sites, places
  for (let i = 0; i < 8; i++) M.teamSpawn(0, -500 + (i % 4) * 330, -96, 4200 + Math.floor(i / 4) * 300, 0);
  for (let i = 0; i < 8; i++) M.teamSpawn(1, -600 + (i % 4) * 400, 0, -3800 + Math.floor(i / 4) * 300, Math.PI);
  M.spawn(0, -96, 4300, 0);
  M.site('A', -4600, -4400, -1600, -1900, -16, 400);
  M.site('B', 2000, -4400, 4800, -1700, -16, 420);
  for (const [x, y, z, n] of [[-3800, 0, -3800, 'firing kiln'], [-2400, 0, -2700, 'round kiln'], [-3000, 0, -2500, 'Kiln Yard'], [-3700, 0, -1400, 'Pit Track'],
    [-4000, -64, 1200, 'Clay Pits'], [-3900, 230, 1160, 'gantry'], [-2170, 0, 600, 'drying sheds'], [0, 0, 0, 'Clay Court'], [0, 0, 600, 'pug-mill house'],
    [-1100, 0, -2000, 'Kiln Alley'], [1300, 0, -1900, 'Conveyor Room'], [0, 0, -3500, 'Office Court'], [0, 176, -4500, 'office upstairs'],
    [3400, 0, -3200, 'Press Hall'], [4700, 176, -2200, 'control booth'], [2000, 0, 800, 'Tile Store'], [4100, 0, 1000, 'Rail Siding'], [3050, 0, 1600, 'loading shed'],
    [4100, 320, 2680, 'gantry crane'], [0, -96, 4200, 'Quarry'], [0, 0, 2600, 'Quarry Gate']]) M.hotspot(x, y, z, n);
  for (const [n, x0, z0, x1, z1] of [['Kiln Yard', -5600, -4900, -1400, -1600], ['Pit Track', -5600, -1600, -2400, -1200], ['Clay Pits', -5600, -1200, -2400, 4900],
    ['Drying Sheds', -2400, -1200, -1400, 2400], ['Clay Court', -1400, -1600, 1400, 2400], ['Quarry Gate', -1400, 2400, 1400, 3600], ['Quarry', -2400, 3600, 2400, 4900],
    ['Kiln Alley', -1400, -2400, -800, -1600], ['Works Stores', -800, -2400, 800, -1600], ['Conveyor Room', 800, -2400, 1800, -1400], ['Office Court', -1400, -4900, 1800, -2400],
    ['Press Hall', 1800, -4900, 5600, -1600], ['Tile Store', 1400, -1400, 2600, 2600], ['Rail Siding', 2600, -1600, 5600, 4900]]) M.area(n, x0, z0, x1, z1);

  M.menuShots = [
    { from: [-2000, 420, -1800], to: [-2300, 400, -2200], look: [-3700, 160, -3700], lookTo: [-3500, 160, -3900] },
    { from: [-900, 160, 2300], to: [800, 170, 2200], look: [0, 120, -1500] },
    { from: [2400, 340, -1900], to: [2900, 320, -2000], look: [3500, 60, -3500], lookTo: [3800, 60, -3400] },
  ];

  M.tactics = {
    routes: {
      pits: { stack: [-1600, 0, 3600], yaw: 0.6, via: [-3700, 0, -1400] },
      alley: { stack: [-200, 0, 2550], yaw: 0, via: [-1100, 0, -2000] },
      conveyor: { stack: [200, 0, 2550], yaw: 0, via: [1300, 0, -1900] },
      siding: { stack: [1600, 0, 3600], yaw: -0.5, via: [4100, 0, -1200] },
    },
    siteRoutes: { A: ['alley', 'pits'], B: ['conveyor', 'siding'] },
    mid: [-1400, -1600, 1400, 2400],
    sites: {
      A: { hold: [[-2200, 0, -2000, 220], [-3800, 0, -3300, 180], [-4700, 0, -2300, 150], [-1700, 0, -3500, 120], [-3100, 0, -4300, 200], [-2400, 0, -2700, 180], [-4500, 0, -4400, 160], [-2700, 0, -1900, 200]],
        plant: [[-3000, 0, -2700], [-3800, 0, -3800], [-2000, 0, -3800]], smoke: [[-1450, 0, -2900], [-3700, 0, -1650]] },
      B: { hold: [[2600, 0, -2700, 160], [4700, 176, -2200, 200], [3300, 0, -2350, 180], [2100, 0, -4300, 120], [3500, 0, -3400, 180], [4600, 0, -4300, 160], [2300, 0, -3200, 140], [4200, 0, -1800, 190]],
        plant: [[3500, 0, -2800], [2400, 0, -3800], [4300, 0, -3900]], smoke: [[1850, 0, -2000], [4000, 0, -1700]] },
    },
  };
  return M;
}
