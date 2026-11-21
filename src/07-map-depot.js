// "Saltpan Depot": the Stage 5 defuse map. An original salt-works rail depot.
// Axes: +X east, +Y up, +Z south. Raiders spawn in the West Yard, Wardens east of the service road.
//   A: Platform 2 (freight wagons, canopy, signal hut)  - via the sunken rail cut, the Scales gate, the service road
//   B: Shed 4 (warehouse, containers, foreman's office)  - via the culvert, the back alley door, the loading bay
//   Mid: the street, the plaza and the two-floor weighbridge office overlooking the Scales Yard.

function buildDepot() {
  const M = new MapBuilder();
  const sd = [-0.52, 0.66, 0.38], sl = Math.hypot(...sd);
  M.env = {
    sunDir: sd.map((v) => v / sl), sunColor: [1.0, 0.9, 0.74], sunIntensity: 1.12,
    skyZenith: [0.33, 0.5, 0.78], skyHorizon: [0.86, 0.8, 0.7], skyIntensity: 0.78,
    fogColor: [0.78, 0.74, 0.66], fogDensity: 0.00008, ambient: 0.12,
    lmBig: 256, lmSmall: 12, probeStep: 96, bakeRays: 9,
  };
  const ND = { nocollide: true, noshadow: true };
  const H = 384;                                                         // outer wall height
  const floor = (x0, z0, x1, z1, tex, y = 0, t = 16) => M.box(x0, y - t, z0, x1, y, z1, { top: tex });
  // tall buildings nobody can enter: textured sides, no top (never seen from the ground)
  const block = (x0, z0, x1, z1, h, side, y0 = 0) => M.box(x0, y0, z0, x1, h, z1, { sides: side, top: null, bottom: null });
  const wall = (x0, z0, x1, z1, h, tex, y0 = 0, cap = 'concrete_plain') => M.box(x0, y0, z0, x1, h, z1, { sides: tex, top: cap, bottom: null });
  const plate = (x0, y0, z0, x1, y1, z1, face, tex) => M.box(x0, y0, z0, x1, y1, z1, { [face]: tex, sides: 'steel', top: 'steel', bottom: 'steel' });
  const win = (x0, y0, z0, x1, y1, z1, face) => M.box(x0, y0, z0, x1, y1, z1, { [face]: 'window', sides: 'steel', top: 'steel', bottom: 'steel' }, ND);
  const crate = (x, z, s, tex, y = 0, yaw = 0) => M.box(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, tex, { yaw });
  const barrel = (x, z, tex = 'barrel', y = 0) => M.prism(x, z, y, y + 44, 13, 12, { side: tex, top: 'barrel_top' }, { rot: x * 0.01 });
  const lamp = (x, y, z, col = [1.0, 0.8, 0.56], k = 1.6, r = 560, hang = 0) => {
    if (hang > 0) M.box(x - 0.6, y + 8, z - 0.6, x + 0.6, y + 8 + hang, z + 0.6, 'steel', ND);
    M.prism(x, z, y + 4, y + 10, 9, 8, 'steel', { nocollide: true });
    M.box(x - 4, y, z - 4, x + 4, y + 4, z + 4, 'lamp', ND);
    M.light(x, y - 8, z, col, k, r);
  };
  const pole = (x, z, h = 220) => { M.prism(x, z, 0, h, 3, 8, 'steel'); M.box(x - 3, h - 4, z - 16, x + 3, h, z + 16, 'steel', ND); lamp(x, h - 10, z + 14, [1.0, 0.86, 0.62], 1.0, 460); };
  const barrier = (x0, z0, x1, z1) => M.box(x0, 0, z0, x1, 40, z1, { sides: 'concrete_plain', top: 'concrete_plain', bottom: null });

  // ---------------- outer walls ----------------
  // only the inside faces are ever seen; coarse lightmap on these tall plain walls
  M.box(-2000, -64, -1500, 2000, H, -1450, { s: 'concrete' }, { lm: 32 });
  M.box(-2000, -64, 1450, 2000, H, 1500, { n: 'concrete' }, { lm: 32 });
  M.box(-2000, -64, -1450, -1950, H, 1450, { e: 'concrete' }, { lm: 32 });
  M.box(1950, -64, -1450, 2000, H, 1450, { w: 'concrete' }, { lm: 32 });
  // pilasters along the inside of the perimeter (hidden ones are culled at compile time)
  const PIL = { sides: 'concrete_plain', top: 'concrete_plain', bottom: null };
  for (let x = -1760; x <= 1760; x += 320) { M.box(x - 14, 0, -1450, x + 14, H - 24, -1436, PIL, { lm: 16 }); M.box(x - 14, 0, 1436, x + 14, H - 24, 1450, PIL, { lm: 16 }); }
  for (let z = -1280; z <= 1280; z += 320) { M.box(-1950, 0, z - 14, -1936, H - 24, z + 14, PIL, { lm: 16 }); M.box(1936, 0, z - 14, 1950, H - 24, z + 14, PIL, { lm: 16 }); }

  // ---------------- West Yard (Raider spawn) + North Yard + Sluice Yard ----------------
  floor(-1950, -500, -1350, 500, 'sand');
  floor(-1950, -1450, -1250, -560, 'sand');
  floor(-1250, -1250, -1050, -560, 'sand');
  floor(-1950, 560, -1100, 1450, 'sand'); floor(-1100, 560, -900, 1170, 'sand'); floor(-1100, 1310, -900, 1450, 'sand');
  // yard dividers with gates
  wall(-1950, -560, -1750, -500, 256, 'brick'); wall(-1550, -560, -1350, -500, 256, 'brick');
  wall(-1950, 500, -1750, 560, 256, 'brick'); wall(-1550, 500, -1350, 560, 256, 'brick');
  floor(-1750, -560, -1550, -500, 'sand'); floor(-1750, 500, -1550, 560, 'sand');                // the gates' ground
  block(-1350, -560, -1050, -140, 256, 'brick');                        // pump house
  win(-1052, 110, -460, -1048, 170, -400, 'e'); win(-1352, 110, -300, -1348, 170, -240, 'w');
  // West Yard props: a site office, a shed of drums, crates
  block(-1950, -300, -1830, -120, 150, 'panel'); win(-1830, 60, -260, -1828, 110, -200, 'e');
  crate(-1540, 220, 64, 'crate'); crate(-1540, 220, 48, 'crate_b', 64, 0.2); crate(-1480, 260, 48, 'crate_mil', 0, -0.3);
  barrel(-1880, 380); barrel(-1850, 410, 'barrel_red'); barrel(-1890, 430);
  crate(-1480, -330, 56, 'crate_mil', 0, 0.4);
  // North Yard: water tower on four legs, sleeper stacks
  for (const [x, z] of [[-1600, -1080], [-1440, -1080], [-1600, -920], [-1440, -920]]) M.prism(x, z, 0, 300, 7, 8, 'steel');
  M.prism(-1520, -1000, 300, 420, 96, 14, { side: 'panel', top: 'roof', bottom: 'steel' });
  M.box(-1620, 296, -1100, -1420, 304, -900, 'steel', ND);
  crate(-1300, -800, 64, 'crate'); M.box(-1800, 0, -1300, -1640, 24, -1200, 'timber'); M.box(-1790, 24, -1290, -1650, 48, -1210, 'timber');
  barrier(-1150, -700, -1050, -670);
  // Sluice Yard: settling tanks and a pump shed
  M.prism(-1600, 950, 0, 110, 90, 16, { side: 'concrete', top: 'concrete_plain' });
  M.prism(-1300, 1260, 0, 110, 80, 16, { side: 'concrete', top: 'concrete_plain' });
  block(-1300, 640, -1080, 800, 170, 'shed'); win(-1302, 90, 690, -1298, 140, 750, 'w');
  crate(-1750, 1300, 64, 'crate_b', 0, 0.3); barrel(-1150, 960, 'barrel_red'); barrel(-1180, 990);
  M.box(-1880, 0, 1060, -1640, 104, 1156, { sides: 'container_blue', top: 'steel', bottom: null });      // old container
  barrier(-1500, 640, -1400, 670); barrier(-1100, 1380, -1000, 1410);
  M.box(-1460, 0, 1380, -1400, 24, 1440, 'timber'); M.box(-1456, 24, 1384, -1404, 48, 1436, 'timber');
  for (const z of [700, 900, 1060]) win(-902, 120, z, -900, 180, z + 80, 'w');
  plate(-904, 8, 980, -900, 104, 1040, 'w', 'door_metal');
  M.box(-910, 150, 600, -900, 162, 1150, 'steel', { lm: 16 }); M.box(-910, 128, 600, -900, 140, 1150, 'steel', { lm: 16 });   // pipes

  // ---------------- Rail cut (sunken track from the North Yard to Platform 2) ----------------
  floor(-1050, -1450, 1350, -1250, 'ballast', -48);
  M.ramp(-1250, -1450, -1050, -1250, -48, 0, 'w', { top: 'ballast', sides: 'concrete' });
  M.box(-1250, -48, -1250, -1050, 0, -1232, { sides: 'concrete', top: 'concrete_plain', bottom: null });     // ramp trench side
  M.box(1350, -48, -1450, 1366, 0, -1250, { sides: 'concrete', top: null, bottom: null });                   // track bed end wall
  // track: sleepers and rails all the way to the buffer stop
  for (let x = -1030; x < 1320; x += 64) M.box(x, -48, -1406, x + 12, -44, -1294, 'timber', { lm: 16 });
  M.box(-1050, -44, -1384, 1330, -38, -1378, 'steel', { lm: 16 }); M.box(-1050, -44, -1322, 1330, -38, -1316, 'steel', { lm: 16 });
  // the Salt Store: brick building between the cut and the street, its east face walls Platform 2
  M.box(-1050, -48, -1252, 500, 40, -1232, { sides: 'concrete', top: 'concrete_plain', bottom: null });
  block(-1050, -1250, 500, -780, 320, 'brick', -48);
  for (const z of [-1200, -1040, -900]) win(500, 150, z, 504, 210, z + 70, 'e');
  for (const x of [-900, -600, -300, 0, 300]) win(x, 120, -1254, x + 80, 180, -1252, 'n');
  plate(500, 230, -1110, 504, 290, -990, 'e', 'sign_salt');
  // cover in the cut: a sleeper stack and a parked trolley
  M.box(-460, -48, -1446, -330, -10, -1410, 'timber'); M.box(-450, -10, -1446, -340, 12, -1414, 'timber');
  M.box(120, -48, -1300, 240, -10, -1258, { sides: 'panel', top: 'diamond', bottom: null });

  // ---------------- A: Platform 2 ----------------
  M.box(500, -48, -1250, 1350, 0, -780, { top: 'concrete_floor', sides: 'concrete', bottom: null });
  M.box(500, 0, -1250, 1350, 0.5, -1238, 'hazard');
  // steps up from the track (west end and between the wagons)
  for (const [x0, x1] of [[520, 590], [930, 990]]) {
    M.box(x0, -48, -1298, x1, -32, -1282, 'concrete_plain'); M.box(x0, -48, -1282, x1, -16, -1266, 'concrete_plain'); M.box(x0, -48, -1266, x1, 0, -1250, 'concrete_plain');
  }
  // freight wagons on the track (not climbable), buffer stop
  const wagon = (x0, x1, tex) => {
    M.box(x0, -22, -1405, x1, 102, -1295, { n: tex, s: tex, e: 'panel', w: 'panel', top: 'roof', bottom: 'steel' });
    for (const x of [x0 + 30, x1 - 80]) M.box(x, -48, -1385, x + 50, -22, -1315, 'steel');
  };
  wagon(600, 920, 'wagon'); wagon(1000, 1300, 'wagon_blue');
  M.box(1320, -48, -1400, 1350, 0, -1300, { sides: 'rail', top: 'rail', bottom: null });
  // canopy over the middle of the platform
  for (const x of [700, 900, 1100]) M.prism(x, -1030, 0, 176, 7, 8, 'steel');
  M.box(640, 176, -1180, 1160, 184, -880, { bottom: 'roof', top: 'roof', sides: 'steel' });
  lamp(800, 160, -1030, [1.0, 0.82, 0.6], 0.8, 380); lamp(1000, 160, -1030, [1.0, 0.82, 0.6], 0.8, 380);
  // signal hut (enterable from the west)
  const HUT = { sides: 'panel', top: 'steel', bottom: null };
  M.box(1180, 0, -1230, 1188, 120, -1176, HUT); M.box(1180, 0, -1112, 1188, 120, -1080, HUT); M.box(1180, 96, -1176, 1188, 120, -1112, HUT);
  M.box(1180, 0, -1230, 1330, 120, -1222, HUT); M.box(1322, 0, -1230, 1330, 120, -1080, HUT);
  M.box(1180, 0, -1088, 1330, 50, -1080, HUT); M.box(1180, 100, -1088, 1330, 120, -1080, HUT);
  M.box(1180, 50, -1088, 1230, 100, -1080, HUT); M.box(1290, 50, -1088, 1330, 100, -1080, HUT);   // window gap x 1230..1290
  M.box(1170, 120, -1240, 1340, 128, -1070, { bottom: 'steel', top: 'roof', sides: 'steel' });
  M.box(1260, 0, -1215, 1315, 36, -1180, 'plywood');
  lamp(1255, 108, -1150, [1.0, 0.85, 0.65], 0.9, 260);
  // cover on the platform
  crate(700, -860, 64, 'crate'); crate(704, -860, 48, 'crate_b', 64, 0.3);
  crate(1030, -1200, 48, 'crate_b', 0, 0.15); crate(860, -830, 56, 'crate_mil', 0, 0.5);
  M.box(560, 0, -980, 660, 40, -950, { sides: 'concrete_plain', top: 'concrete_plain', bottom: null });
  barrel(1240, -1050); barrel(1275, -1040, 'barrel_red');
  // signs: platform name, site plates
  plate(500, 140, -1000, 504, 190, -900, 'e', 'sign_platform');
  plate(500, 110, -880, 504, 190, -800, 'e', 'site_a'); plate(1176, 30, -1228, 1180, 90, -1180, 'w', 'site_a');
  // south wall with the Scales gate (x 720..840)
  wall(500, -780, 720, -760, 200, 'plaster_warm'); wall(840, -780, 1350, -760, 200, 'plaster_warm');
  floor(720, -780, 840, -760, 'concrete_floor');

  // ---------------- Scales Yard ----------------
  floor(500, -760, 1350, -300, 'asphalt');
  M.box(760, 0, -600, 1100, 2, -460, { top: 'diamond', sides: 'steel', bottom: null });
  barrier(600, -420, 700, -390); barrier(1000, -690, 1100, -660);
  // parked truck: box trailer + cab
  M.box(1190, 0, -620, 1290, 24, -380, 'steel'); M.box(1180, 24, -630, 1300, 140, -370, { sides: 'container_blue', top: 'roof', bottom: 'steel' });
  M.box(1195, 10, -370, 1285, 110, -310, { sides: 'panel', top: 'steel', bottom: 'steel' }); win(1196, 70, -310, 1284, 100, -308, 's');
  plate(840, 150, -762, 920, 196, -760, 'n', 'sign_weigh');

  // ---------------- Weighbridge office (two floors) ----------------
  const OW = { sides: 'plaster_warm', top: 'concrete_plain', bottom: null }, OI = 'plaster';
  floor(-200, -760, 500, -300, 'tiles');
  // outer walls (16 thick, 320 high). Doors: south x 100..200 (plaza), east z -560..-480 (Scales Yard).
  // Upper-floor shooting gaps 50 high (too low to climb through): east z -700..-620, south x -100..0 and 260..360.
  M.box(-200, 0, -780, 500, 320, -760, OW);
  M.box(-200, 0, -760, -184, 320, -300, OW);
  const eastPiece = (z0, z1, gaps) => { let y = 0; for (const [g0, g1] of gaps) { M.box(484, y, z0, 500, g0, z1, OW); y = g1; } M.box(484, y, z0, 500, 320, z1, OW); };
  eastPiece(-760, -700, []); eastPiece(-700, -620, [[200, 250]]); eastPiece(-620, -560, []); eastPiece(-560, -480, [[0, 112]]); eastPiece(-480, -300, []);
  const southPiece = (x0, x1, gaps) => { let y = 0; for (const [g0, g1] of gaps) { if (g0 > y) M.box(x0, y, -316, x1, g0, -300, OW); y = g1; } M.box(x0, y, -316, x1, 320, -300, OW); };
  southPiece(-184, -100, []); southPiece(-100, 0, [[200, 250]]); southPiece(0, 100, []); southPiece(100, 200, [[0, 112]]);
  southPiece(200, 260, []); southPiece(260, 360, [[200, 250]]); southPiece(360, 484, []);
  // first floor slab (top at 160) with the stairwell open over the stairs
  const SLAB = { top: 'wood_floor', bottom: 'plaster', sides: 'plaster' };
  M.box(-184, 144, -684, 484, 160, -316, SLAB); M.box(90, 144, -760, 484, 160, -684, SLAB); M.box(-184, 144, -760, -150, 160, -684, SLAB);
  // stairs along the north wall, rising east: 10 steps of 16
  for (let k = 0; k < 10; k++) M.box(-150 + 24 * k, 0, -760, -126 + 24 * k, 16 * (k + 1), -700, { top: 'concrete_plain', sides: 'concrete_plain', bottom: null });
  M.box(-184, 304, -760, 484, 320, -316, { bottom: 'plaster', top: null, sides: null });       // ceiling
  // furniture
  M.box(260, 0, -440, 420, 44, -400, { sides: 'plywood', top: 'wood_floor', bottom: null });   // counter
  M.box(-170, 0, -380, -130, 72, -320, 'panel'); M.box(-170, 0, -440, -130, 72, -390, 'panel');  // cabinets
  M.box(150, 160, -620, 260, 200, -560, { sides: 'plywood', top: 'wood_floor', bottom: null });  // desk upstairs
  M.box(-100, 160, -460, 20, 200, -410, { sides: 'plywood', top: 'wood_floor', bottom: null });
  M.box(400, 160, -440, 470, 232, -400, 'panel');
  lamp(60, 128, -560, [1.0, 0.86, 0.66], 1.2, 420, 4); lamp(320, 128, -400, [1.0, 0.86, 0.66], 1.1, 380, 4);
  lamp(60, 288, -500, [1.0, 0.88, 0.7], 1.1, 420, 4); lamp(330, 288, -620, [1.0, 0.88, 0.7], 1.0, 380, 4);
  plate(500, 150, -470, 504, 196, -380, 'e', 'sign_weigh');
  for (const z of [-720, -420]) win(498, 40, z, 502, 96, z + 60, 'e');

  // ---------------- Street, row houses, plaza ----------------
  floor(-1350, -140, -200, 140, 'asphalt');
  M.box(-1350, 0, -140, -200, 8, -96, { top: 'concrete_plain', sides: 'concrete_plain', bottom: null });
  M.box(-1350, 0, 96, -200, 8, 140, { top: 'concrete_plain', sides: 'concrete_plain', bottom: null });
  block(-1050, -780, -200, -140, 280, 'plaster');                                                 // row houses (north side)
  block(-1350, 140, -200, 560, 280, 'plaster_warm');                                              // south side
  for (const x of [-1000, -820, -640, -460, -300]) { win(x, 130, -142, x + 70, 190, -140, 's'); win(x, 130, 140, x + 70, 190, 142, 'n'); }
  for (const x of [-930, -560]) { plate(x, 8, -142, x + 56, 104, -140, 's', 'door_metal'); }
  plate(-760, 8, 140, -700, 104, 142, 'n', 'door');
  pole(-1000, 118); pole(-560, -118);
  // a broken-down van in the street, pallets
  M.box(-820, 12, -70, -660, 110, 20, { sides: 'panel', top: 'steel', bottom: 'steel' }); M.box(-830, 0, -60, -650, 12, 10, 'steel');
  M.box(-420, 0, 60, -360, 24, 120, 'timber'); M.box(-420, 24, 64, -364, 40, 116, 'timber');
  crate(-1040, 100, 64, 'crate_mil', 0, 0.1); crate(-1040, 100, 48, 'crate', 64, -0.2);
  M.box(-1180, 0, -138, -1100, 52, -88, { sides: 'container_blue', top: 'steel', bottom: null });
  // the plaza
  floor(-200, -300, 500, 300, 'concrete_floor');
  M.box(100, 0, 0, 190, 96, 90, { sides: 'panel', top: 'steel', bottom: null });                 // kiosk
  M.box(90, 96, -10, 200, 104, 100, 'steel');
  barrel(-60, 200, 'barrel_red'); barrel(-30, 225); crate(380, 200, 56, 'crate', 0, 0.25); crate(-120, -200, 48, 'crate_b', 0, -0.2);
  barrier(240, -160, 340, -130);
  pole(-120, 240, 200);

  // ---------------- Warehouse 3 (solid) and the corridor niche ----------------
  floor(500, -300, 620, -180, 'asphalt');
  block(500, -180, 1350, 700, 320, 'shed'); block(620, -300, 1350, -180, 320, 'shed');
  for (const x of [700, 900, 1100]) win(x, 150, -302, x + 90, 210, -300, 's');
  plate(1352, 20, -100, 1356, 140, 20, 'e', 'door_metal');

  // ---------------- Back alley (plaza to Shed 4) ----------------
  floor(200, 300, 500, 1000, 'concrete');
  block(-200, 300, 200, 1150, 300, 'brick'); block(-900, 560, 200, 1150, 300, 'concrete');        // brine tank hall
  block(200, 1000, 500, 1150, 300, 'brick');
  M.box(220, 0, 600, 300, 48, 664, { sides: 'container_blue', top: 'steel', bottom: null });       // skip bin
  crate(450, 420, 48, 'crate_mil', 0, 0.3); barrel(240, 860); barrel(262, 885, 'barrel_red');
  lamp(350, 230, 980, [1.0, 0.84, 0.6], 0.9, 400, 0);

  // ---------------- B: Shed 4 ----------------
  floor(500, 700, 1300, 1450, 'concrete_floor');
  const SW = { sides: 'shed', top: 'concrete_plain', bottom: null };
  // west wall: door from the alley (z 860..960) and the culvert door (z 1190..1290)
  M.box(500, 0, 700, 516, 320, 860, SW); M.box(500, 0, 960, 516, 320, 1190, SW); M.box(500, 0, 1290, 516, 320, 1450, SW);
  M.box(500, 112, 860, 516, 320, 960, SW); M.box(500, 112, 1190, 516, 320, 1290, SW);
  // east wall with the loading bay (z 850..1050, 192 high)
  M.box(1284, 0, 700, 1300, 320, 850, SW); M.box(1284, 0, 1050, 1300, 320, 1450, SW); M.box(1284, 192, 850, 1300, 320, 1050, SW);
  // roof with two skylights
  const RF = { bottom: 'shed_roof', top: null, sides: 'steel' };
  M.box(500, 320, 700, 1300, 336, 950, RF); M.box(500, 320, 1070, 1300, 336, 1150, RF); M.box(500, 320, 1270, 1300, 336, 1450, RF);
  M.box(500, 320, 950, 700, 336, 1070, RF); M.box(820, 320, 950, 1300, 336, 1070, RF);
  M.box(500, 320, 1150, 980, 336, 1270, RF); M.box(1100, 320, 1150, 1300, 336, 1270, RF);
  for (const x of [640, 900, 1160]) M.box(x - 6, 296, 700, x + 6, 320, 1450, 'steel', ND);        // roof trusses
  // containers and crates
  M.box(680, 0, 1000, 1000, 104, 1096, { sides: 'container', top: 'steel', bottom: null });
  M.box(1040, 0, 1180, 1136, 104, 1400, { sides: 'container_blue', top: 'steel', bottom: null });
  crate(600, 780, 64, 'crate'); crate(604, 780, 48, 'crate_b', 64, 0.2);
  crate(760, 1350, 64, 'crate_mil', 0, 0.35); crate(1220, 1200, 48, 'crate_b'); crate(1222, 1200, 48, 'crate', 48, -0.3);
  crate(900, 820, 56, 'crate', 0, 0.6); barrel(1240, 1400); barrel(1210, 1415, 'barrel_red');
  for (const [x, z] of [[640, 1180], [900, 1250]]) M.prism(x, z, 0, 296, 9, 8, 'steel');
  // foreman's office in the north-east corner (window west, door south)
  const FO = { sides: 'panel', top: 'steel', bottom: null };
  M.box(1120, 0, 716, 1128, 112, 760, FO); M.box(1120, 0, 820, 1128, 112, 852, FO); M.box(1120, 0, 760, 1128, 56, 820, FO); M.box(1120, 96, 760, 1128, 112, 820, FO);
  M.box(1120, 0, 852, 1172, 112, 860, FO); M.box(1236, 0, 852, 1284, 112, 860, FO); M.box(1172, 96, 852, 1236, 112, 860, FO);
  M.box(1112, 112, 708, 1284, 120, 868, { bottom: 'steel', top: 'roof', sides: 'steel' });
  M.box(1200, 0, 740, 1270, 40, 790, { sides: 'plywood', top: 'wood_floor', bottom: null });
  // lights
  for (const [x, z] of [[700, 870], [1000, 870], [820, 1240], [1180, 1320]]) lamp(x, 282, z, [1.0, 0.86, 0.64], 1.5, 640, 6);
  lamp(1200, 104, 790, [1.0, 0.86, 0.66], 0.8, 220);
  // signs
  plate(516, 120, 1060, 520, 200, 1140, 'e', 'site_b'); plate(940, 150, 700, 1020, 230, 704, 's', 'site_b');
  plate(1300, 210, 900, 1304, 260, 1000, 'e', 'sign_shed4'); plate(496, 130, 860, 500, 180, 960, 'w', 'sign_shed4');

  // ---------------- Culvert (Sluice Yard to Shed 4) ----------------
  floor(-900, 1170, 420, 1310, 'concrete_floor', -48);
  M.ramp(-1100, 1170, -900, 1310, -48, 0, 'w', { top: 'concrete_floor', sides: 'concrete' });
  M.box(420, -48, 1170, 446, -32, 1310, 'concrete_plain'); M.box(446, -48, 1170, 473, -16, 1310, 'concrete_plain'); M.box(473, -48, 1170, 500, 0, 1310, 'concrete_plain');
  M.box(-900, -48, 1150, 500, 120, 1170, { sides: 'concrete', top: null, bottom: null });
  M.box(-900, -48, 1310, 500, 120, 1330, { sides: 'concrete', top: null, bottom: null });
  M.box(-900, 104, 1170, 500, 120, 1310, { bottom: 'concrete', top: null, sides: 'concrete' });
  M.box(-1100, -48, 1150, -900, 0, 1170, { sides: 'concrete', top: 'concrete_plain', bottom: null });       // culvert ramp trench
  M.box(-1100, -48, 1310, -900, 0, 1330, { sides: 'concrete', top: 'concrete_plain', bottom: null });
  block(-900, 1150, 500, 1450, 300, 'concrete', 120);                                              // embankment above
  M.box(-900, -48, 1330, 500, 120, 1450, { sides: 'concrete', top: null, bottom: null });
  M.box(-880, 52, 1172, 400, 64, 1182, 'steel', { lm: 16 }); M.box(-880, 18, 1298, 400, 28, 1308, 'steel', { lm: 16 });
  for (const x of [-650, -250, 150]) lamp(x, 86, 1240, [0.78, 0.9, 1.0], 1.1, 400);
  lamp(470, 86, 1240, [0.78, 0.9, 1.0], 0.8, 260);
  plate(-904, 128, 1180, -900, 184, 1300, 'w', 'sign_culvert');

  // ---------------- Service road + Warden spawn ----------------
  floor(1350, -1450, 1650, 1450, 'asphalt'); floor(1300, 700, 1350, 1450, 'asphalt');
  for (let z = -1400; z < 1400; z += 140) M.box(1496, 0, z, 1504, 0.5, z + 70, 'concrete_plain', { nocollide: true, lm: 16 });
  block(1650, -1450, 1950, -500, 320, 'brick'); block(1650, 500, 1950, 1450, 320, 'shed');
  for (const z of [-1300, -1000, -700]) win(1648, 140, z, 1650, 200, z + 90, 'w');
  floor(1650, -500, 1950, 500, 'concrete_floor');
  block(1820, -130, 1950, 130, 170, 'plaster_warm'); plate(1816, 100, -60, 1820, 150, 60, 'w', 'sign_depot');
  barrier(1560, -620, 1600, -520); barrier(1400, 620, 1440, 720);
  M.box(1420, 0, -100, 1480, 40, 40, { sides: 'diamond', top: 'diamond', bottom: null });             // pallet stack
  crate(1590, 300, 48, 'crate_mil', 0, 0.2); crate(1900, -440, 56, 'crate', 0, -0.3); barrel(1900, 420); barrel(1880, 450, 'barrel_red');
  pole(1520, -800); pole(1520, 300);

  // ---------------- spawns ----------------
  // Raider spawns sit north and south of the street's line of sight
  for (const [x, z] of [[-1800, -420], [-1800, -300], [-1660, -420], [-1660, -300], [-1800, 300], [-1800, 420], [-1660, 300], [-1660, 420]]) M.teamSpawn(0, x, 0, z, -Math.PI / 2);
  for (const [x, z] of [[1720, -360], [1720, -220], [1720, 220], [1720, 360], [1780, -280], [1780, 280], [1700, -60], [1700, 120]]) M.teamSpawn(1, x, 0, z, Math.PI / 2);
  M.spawn(-1700, 0, -360, -Math.PI / 2);

  // ---------------- plant sites, places, names ----------------
  M.site('A', 500, -1450, 1350, -780, -64, 140);
  M.site('B', 516, 716, 1284, 1434, -16, 160);
  for (const [x, y, z, n] of [[900, 0, -1000, 'Platform 2'], [960, -48, -1350, 'track'], [1255, 0, -1150, 'signal hut'], [900, 0, -520, 'Scales Yard'],
    [150, 0, -550, 'weighbridge office'], [300, 160, -500, 'office upstairs'], [150, 0, 120, 'plaza'], [-700, 0, 0, 'street'], [350, 0, 700, 'back alley'],
    [900, 0, 1250, 'Shed 4'], [1200, 0, 780, 'foreman’s office'], [-300, -48, 1240, 'culvert'], [-1400, 0, 1000, 'Sluice Yard'], [-1500, 0, -800, 'North Yard'],
    [-300, -48, -1350, 'rail cut'], [1500, 0, -1100, 'service road north'], [1500, 0, 950, 'service road south'], [1750, 0, 0, 'Warden yard'], [-1650, 0, 0, 'West Yard']]) M.hotspot(x, y, z, n);
  for (const [n, x0, z0, x1, z1] of [['West Yard', -1950, -500, -1350, 500], ['North Yard', -1950, -1450, -1050, -500], ['Rail Cut', -1250, -1450, 500, -1250],
    ['Platform 2', 500, -1450, 1350, -780], ['Scales Yard', 500, -760, 1350, -180], ['Weighbridge', -200, -760, 500, -300], ['Street', -1350, -140, -200, 140],
    ['Plaza', -200, -300, 500, 300], ['Back Alley', 200, 300, 500, 1000], ['Shed 4', 500, 700, 1300, 1450], ['Culvert', -1100, 1150, 500, 1330],
    ['Sluice Yard', -1950, 500, -900, 1450], ['Service Road', 1300, -1450, 1650, 1450], ['Warden Yard', 1650, -500, 1950, 500]]) M.area(n, x0, z0, x1, z1);

  // ---------------- bot tactics ----------------
  M.tactics = {
    routes: {
      cut: { stack: [-1330, 0, -1100], yaw: -Math.PI / 2, via: [-600, -48, -1350] },
      office: { stack: [-1420, 0, -250], yaw: -Math.PI / 2, via: [560, 0, -240] },
      alley: { stack: [-1420, 0, 250], yaw: -Math.PI / 2, via: [350, 0, 650] },
      culvert: { stack: [-1150, 0, 880], yaw: Math.PI, via: [200, -48, 1240] },
    },
    siteRoutes: { A: ['cut', 'office'], B: ['culvert', 'alley'] },
    sites: {
      A: { hold: [[700, 0, -1060, 100], [1250, 0, -1160, 90], [960, 0, -860, 160], [1310, -48, -1270, 90], [1100, 0, -1210, 95]],
        plant: [[820, 0, -1000], [1080, 0, -940], [960, -48, -1350]], smoke: [[780, 0, -790], [540, -48, -1350]] },
      B: { hold: [[1200, 0, 960, 90], [640, 0, 820, 135], [1210, 0, 780, 70], [700, 0, 1380, 45], [1000, 0, 1300, 80]],
        plant: [[820, 0, 1180], [1000, 0, 900], [700, 0, 1300]], smoke: [[570, 0, 910], [560, 0, 1240]] },
    },
  };
  return M;
}
