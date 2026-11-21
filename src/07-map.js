// "Hall B" test range. Units ~ inches: player 72 tall, crates 32/48/64, stairs 16.
// Axes: +X east, +Y up, +Z south. Hall interior X[-1024,0] Z[-640,640]; yard X[32,1280].

function buildTestRange() {
  const M = new MapBuilder();
  const sd = [-0.25, 0.8, 0.55], sl = Math.hypot(...sd);
  M.env = {
    sunDir: sd.map((v) => v / sl), sunColor: [1.0, 0.93, 0.8], sunIntensity: 1.05,
    skyZenith: [0.34, 0.52, 0.8], skyHorizon: [0.8, 0.8, 0.78], skyIntensity: 0.8,
    fogColor: [0.74, 0.73, 0.69], fogDensity: 0.00011, ambient: 0.12,
  };
  const ND = { nocollide: true, noshadow: true };

  // ---------------- Hall ----------------
  const TOP = 352;
  M.box(-1056, -16, -672, 32, 0, 672, { top: 'concrete_floor' });
  M.box(-1088, 0, -704, -1024, TOP, 704, { e: 'brick' });
  M.box(-1056, 0, -704, 32, TOP, -640, { s: 'brick' });
  M.box(-1056, 0, 640, 32, TOP, 704, { n: 'brick' });
  const EW = { w: 'brick', e: 'plaster', n: 'concrete', s: 'concrete', bottom: 'concrete' };
  M.box(0, 0, -640, 32, TOP, -128, EW);
  M.box(0, 192, -128, 32, TOP, 128, EW);
  M.box(0, 0, 128, 32, TOP, 416, EW);
  M.box(0, 112, 416, 32, TOP, 480, EW);
  M.box(0, 0, 480, 32, TOP, 640, EW);
  // baseboards
  M.box(-1024, 0, -640, -1020, 20, 640, 'concrete_plain');
  M.box(-1020, 0, -640, 0, 20, -636, 'concrete_plain');
  M.box(-1020, 0, 636, 0, 20, 640, 'concrete_plain');
  // roof with three skylights
  const RF = { bottom: 'roof', n: 'steel', s: 'steel', e: 'steel', w: 'steel' };
  M.box(-1056, 320, -672, 32, TOP, 32, { bottom: 'roof', s: 'steel' });
  M.box(-1056, 320, 192, 32, TOP, 672, { bottom: 'roof', n: 'steel' });
  for (const [x0, x1] of [[-1056, -832], [-704, -576], [-448, -320], [-192, 32]]) M.box(x0, 320, 32, x1, TOP, 192, RF);
  for (const x of [-896, -640, -384, -128]) M.box(x - 8, 300, -640, x + 8, 320, 640, 'steel');

  // catwalk along the north wall
  M.box(-1024, 120, -640, -320, 128, -528, { top: 'diamond', bottom: 'steel', s: 'hazard', e: 'steel' }, { uvScale: 0.5 });
  for (const x of [-928, -800, -672, -544, -416, -320]) M.box(x - 2, 128, -532, x + 2, 168, -528, 'rail');
  M.box(-928, 164, -532, -320, 168, -528, 'rail');
  M.box(-928, 144, -531, -320, 147, -529, 'rail');
  for (const x of [-896, -640, -416]) M.box(x - 6, 0, -542, x + 6, 120, -530, 'steel');
  // stairs up to the catwalk (8 x 16)
  for (let k = 0; k < 8; k++) {
    const x1 = -192 - 16 * k;
    M.box(x1 - 16, 0, -640, x1, 16 * (k + 1), -544, { top: 'diamond', e: 'steel', s: 'steel' });
  }
  // ramp from the hall floor to the catwalk (west end)
  M.ramp(-1024, -528, -928, -144, 0, 128, 'n', { top: 'wood_floor', e: 'steel', n: 'steel' });

  // crates
  M.box(-640, 0, 256, -576, 64, 320, 'crate');
  M.box(-576, 0, 256, -512, 64, 320, 'crate_b');
  M.box(-608, 64, 262, -544, 128, 326, 'crate', { yaw: 0.14 });
  M.box(-470, 0, 296, -422, 48, 344, 'crate_b', { yaw: -0.32 });
  M.box(-780, 0, -270, -684, 56, -190, 'crate_mil');
  M.box(-760, 56, -262, -704, 96, -206, 'crate_b', { yaw: 0.2 });
  M.box(-176, 0, -430, -112, 64, -366, 'crate');
  M.box(-166, 64, -424, -118, 112, -376, 'crate_b', { yaw: 0.28 });
  // barrels
  M.prism(-52, -300, 0, 44, 13, 12, { side: 'barrel', top: 'barrel_top' });
  M.prism(-58, -262, 0, 44, 13, 12, { side: 'barrel_red', top: 'barrel_top' }, { rot: 0.4 });
  M.prism(-88, -282, 0, 44, 13, 12, { side: 'barrel', top: 'barrel_top' }, { rot: 1.1 });

  // jump test boxes on the south wall
  [['jump32', 32, -960], ['jump48', 48, -864], ['jump64', 64, -768], ['jump72', 72, -672]].forEach(([m, h, x]) => {
    M.box(x, 0, 560, x + 64, h, 624, { sides: m, top: 'concrete_plain' });
  });
  M.box(-880, 150, 636, -720, 230, 640, { n: 'sign_jump', sides: 'steel', bottom: 'steel', top: 'steel' });
  M.box(-1024, 160, -96, -1020, 224, 32, { e: 'sign_hall', n: 'steel', s: 'steel', top: 'steel', bottom: 'steel' });
  M.box(-4, 212, 150, 0, 252, 230, { w: 'sign_out', n: 'steel', s: 'steel', top: 'steel', bottom: 'steel' });
  M.box(-24, 0, -128, 0, 0.5, 128, 'hazard');

  // hanging lamps
  for (const [x, z] of [[-800, -360], [-480, -360], [-800, 400], [-480, 400], [-224, 40]]) {
    M.box(x - 0.6, 272, z - 0.6, x + 0.6, 320, z + 0.6, 'steel', ND);
    M.prism(x, z, 264, 272, 12, 8, 'steel', { nocollide: true });
    M.box(x - 4, 258, z - 4, x + 4, 264, z + 4, 'lamp', ND);
    M.light(x, 252, z, [1.0, 0.78, 0.52], 1.9, 640);
  }
  // wall lamp over the hall door
  M.box(-6, 128, 440, 0, 136, 456, 'steel', { nocollide: true });
  M.box(-5, 124, 444, -1, 128, 452, 'lamp', ND);
  M.light(-14, 120, 448, [1.0, 0.8, 0.55], 0.9, 340);
  // hall door (wood), hinge on the north jamb
  M.door(14, 0, 416, 18, 111, 480, [16, 416], 'door');

  // ---------------- Yard / range ----------------
  M.box(32, -16, -672, 1312, 0, 672, { top: 'sand' });
  const YW = 256;
  M.box(32, 0, -704, 1312, YW, -640, { s: 'plaster' });
  M.box(32, 0, 640, 1312, YW, 704, { n: 'plaster' });
  M.box(1280, 0, -640, 1344, YW, 640, { w: 'plaster' });
  M.box(32, YW, -708, 1316, YW + 8, -636, 'concrete_plain');
  M.box(32, YW, 636, 1316, YW + 8, 708, 'concrete_plain');
  M.box(1276, YW, -636, 1348, YW + 8, 636, 'concrete_plain');
  M.box(32, 0, -640, 1280, 22, -636, 'concrete_plain');
  M.box(32, 0, 636, 1280, 22, 640, 'concrete_plain');
  M.box(1276, 0, -636, 1280, 22, 636, 'concrete_plain');

  // firing line + spread board + steel plates
  M.box(152, 0, -608, 168, 0.5, -224, 'hazard');
  M.box(96, 140, -636, 224, 204, -632, { s: 'sign_range', e: 'steel', w: 'steel', top: 'steel', bottom: 'steel' });
  for (const z of [-544, -416, -288]) {
    for (const x of [416, 672, 928]) {
      M.box(x - 6, 0, z - 10, x + 10, 4, z + 10, 'steel');
      M.box(x + 2, 4, z - 2, x + 6, 36, z + 2, 'steel');
      M.target(x, 52, z, 16, 16, 'target');
    }
  }
  M.box(416, 16, -208, 420, 112, -112, { w: 'paper', e: 'plywood', n: 'plywood', s: 'plywood', top: 'plywood', bottom: 'plywood' });
  M.box(418, 0, -206, 422, 16, -200, 'plywood');
  M.box(418, 0, -120, 422, 16, -114, 'plywood');
  M.box(418, 0, -94, 422, 22, -90, 'steel');
  M.target(416, 30, -92, 8, 8, 'target_reset', { action: 'reset' });
  // backstop
  M.box(1184, 0, -624, 1264, 112, -224, 'sandbag');
  M.box(1160, 0, -560, 1184, 40, -440, 'sandbag', { yaw: 0.05 });

  // container + climb crates
  M.box(640, 0, 320, 960, 104, 416, { sides: 'container', top: 'steel' });
  for (const [x, z] of [[640, 320], [952, 320], [640, 408], [952, 408]]) M.box(x, 96, z, x + 8, 104, z + 8, 'steel');
  M.box(528, 0, 376, 576, 32, 424, 'crate_b');
  // mid container (Stage 4): blocks the hall-to-spawn sightline through the roller door
  M.box(744, 0, -200, 840, 104, 100, { sides: 'container', top: 'steel' });
  for (const [x, z] of [[744, -200], [832, -200], [744, 92], [832, 92]]) M.box(x, 96, z, x + 8, 104, z + 8, 'steel');
  M.box(576, 0, 344, 640, 64, 408, 'crate');

  // shed with a metal door and a north window
  const PN = { all: 'panel', top: 'steel' };
  M.box(1000, 0, 72, 1240, 2, 248, { top: 'tiles' });
  M.box(992, 0, 64, 1000, 136, 128, PN);
  M.box(992, 104, 128, 1000, 136, 184, PN);
  M.box(992, 0, 184, 1000, 136, 256, PN);
  M.box(1000, 0, 64, 1100, 136, 72, PN);
  M.box(1100, 0, 64, 1160, 64, 72, PN);
  M.box(1100, 104, 64, 1160, 136, 72, PN);
  M.box(1160, 0, 64, 1248, 136, 72, PN);
  M.box(1000, 0, 248, 1248, 136, 256, PN);
  M.box(1240, 0, 72, 1248, 136, 248, PN);
  M.box(984, 136, 56, 1256, 144, 264, { top: 'roof', bottom: 'roof', sides: 'steel' });
  M.box(1116, 130, 156, 1124, 136, 164, 'lamp', ND);
  M.light(1120, 124, 160, [0.86, 0.92, 1.0], 1.1, 320);
  M.box(1176, 2, 196, 1236, 42, 244, 'crate_mil');
  M.door(994, 1, 128, 998, 104, 184, [996, 128], 'door_metal');

  // cover pieces
  M.box(320, 0, 64, 448, 40, 96, 'concrete_plain');
  M.box(512, 0, -24, 544, 40, 104, 'concrete_plain', { yaw: 0.32 });
  M.box(240, 0, 200, 368, 36, 232, 'sandbag');
  M.box(820, 0, 120, 884, 64, 184, 'crate_mil', { yaw: 0.6 });

  // step test
  [['step16', 16, 96], ['step18', 18, 192], ['step20', 20, 288]].forEach(([m, h, x]) => {
    M.box(x, 0, 520, x + 64, h, 584, { sides: m, top: 'concrete_plain' });
  });
  M.box(160, 120, 632, 288, 184, 636, { n: 'sign_step', e: 'steel', w: 'steel', top: 'steel', bottom: 'steel' });

  // ---------------- plant sites (Stage 4) ----------------
  // A: the range by the backstop. B: the container yard (the container roof counts).
  M.site('A', 700, -630, 1170, -232, -16, 70);
  M.site('B', 560, 300, 1010, 632, -16, 140);
  const plate = (x0, y0, z0, x1, y1, z1, face, tex) => M.box(x0, y0, z0, x1, y1, z1, { [face]: tex, sides: 'steel', top: 'steel', bottom: 'steel' });
  plate(900, 128, -640, 980, 208, -636, 's', 'site_a');
  plate(1276, 120, -420, 1280, 200, -340, 'w', 'site_a');
  plate(700, 128, 636, 780, 208, 640, 'n', 'site_b');
  plate(860, 30, 416, 920, 90, 418, 's', 'site_b');
  // painted corner marks on the ground
  for (const s of M.sites) {
    const [x0, , z0] = s.min, [x1, , z1] = s.max, A = 64, T = 6;
    for (const [cx, cz, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x0, z1, 1, -1], [x1, z1, -1, -1]]) {
      M.box(Math.min(cx, cx + sx * A), 0, Math.min(cz, cz + sz * T), Math.max(cx, cx + sx * A), 0.5, Math.max(cz, cz + sz * T), 'hazard');
      M.box(Math.min(cx, cx + sx * T), 0, Math.min(cz + sz * T, cz + sz * A), Math.max(cx, cx + sx * T), 0.5, Math.max(cz + sz * T, cz + sz * A), 'hazard');
    }
  }

  M.spawn(96, 0, -416, -Math.PI / 2);
  // team skirmish: raiders start in the hall, wardens in the east yard
  for (const [x, z] of [[-900, -100], [-900, 60], [-860, 200], [-780, -40], [-760, 120], [-700, -120], [-640, 40], [-860, 360]]) M.teamSpawn(0, x, 0, z, -Math.PI / 2);
  for (const [x, z] of [[1120, -60], [1060, 10], [1150, -250], [1120, -170], [1210, -110], [1220, 10], [1010, -150], [1060, -230]]) M.teamSpawn(1, x, 0, z, Math.PI / 2);
  // places bots like to check
  for (const [x, y, z, n] of [[-500, 0, 0, 'hall'], [-700, 128, -580, 'catwalk'], [-820, 0, 470, 'jump boxes'], [-60, 0, 0, 'roller door'], [-60, 0, 448, 'hall door'],
    [500, 0, 100, 'yard'], [800, 104, 368, 'container roof'], [1120, 2, 160, 'shed'], [600, 0, -400, 'range'], [380, 0, 150, 'cover'], [-150, 0, -590, 'stairs'],
    [300, 0, 450, 'south yard'], [100, 0, 448, 'door yard'], [-380, 0, -300, 'hall north'], [1000, 0, -480, 'A site'], [780, 0, 520, 'B site']]) M.hotspot(x, y, z, n);
  // bot tactics: Raiders gather beside each hall exit (roller door, hall door), out of sight
  M.tactics = {
    routes: {
      roller: { stack: [-60, 0, -190], yaw: Math.atan2(-(16 + 60), -(0 + 190)), via: [40, 0, 0] },
      door: { stack: [-60, 0, 345], yaw: Math.atan2(-(16 + 60), -(448 - 345)), via: [60, 0, 448] },
    },
    siteRoutes: { A: ['roller', 'door'], B: ['door', 'roller'] },
    sites: {
      A: { hold: [[1150, 0, -200, 95], [1110, 0, -600, 70], [960, 0, -570, 75], [900, 0, -330, 95], [1180, 0, -420, 90]], plant: [[980, 0, -470], [1110, 0, -330], [830, 0, -520]],
        smoke: [[560, 0, -170], [760, 0, -260]] },
      B: { hold: [[800, 104, 368, 95], [1000, 0, 560, 90], [620, 0, 470, 80], [940, 0, 610, 95], [990, 0, 450, 100]], plant: [[760, 0, 520], [920, 0, 480], [640, 0, 600]],
        smoke: [[420, 0, 380], [600, 0, 300]] },
    },
  };
  return M;
}

// Map registry: the defuse map and the practice range.
const MAPS = {
  depot: { name: 'Saltpan Depot', build: buildDepot, blurb: 'Salt-works rail yard · A Platform 2, B Shed 4' },
  kiln: { name: 'Kilnworks', build: buildKilnworks, blurb: 'Brick works on a clay quarry · A Kiln Yard, B Press Hall' },
  frost: { name: 'Frostline', build: buildFrostline, blurb: 'Mountain radar station in snow · A Hangar 2, B Dish Array' },
  range: { name: 'Hall B', build: buildTestRange, blurb: 'Small practice hall · plates, spray board, jump boxes', practice: true },
};
