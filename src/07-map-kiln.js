// "Kilnworks": an original brick-and-tile works at the edge of a clay quarry, late afternoon.
// Axes: +X east, +Y up, +Z south. Raiders come up from the quarry (south), Wardens hold the office
// court (north).
//   A: Kiln Yard (two kilns, brick stacks)      - via the Clay Pits (west lane) or Kiln Alley off mid
//   B: Press Hall (indoor: presses, conveyor, a raised control booth) - via the Rail Siding (east lane)
//      or the Conveyor Room off mid
//   Mid: the Clay Court, split by the pug-mill house; the office block closes its north end.

function buildKilnworks() {
  const M = new MapBuilder();
  const sd = [-0.55, 0.42, 0.55], sl = Math.hypot(...sd);
  M.env = {
    sunDir: sd.map((v) => v / sl), sunColor: [1.0, 0.8, 0.6], sunIntensity: 1.1,
    skyZenith: [0.34, 0.46, 0.68], skyHorizon: [0.95, 0.77, 0.58], skyIntensity: 0.8,
    fogColor: [0.84, 0.72, 0.6], fogDensity: 0.00009, ambient: 0.12,
    skySun: [1.0, 0.76, 0.48], skyGround: [0.6, 0.45, 0.35], skyMountains: [0.52, 0.42, 0.36],
    lmBig: 256, lmSmall: 12, probeStep: 96, bakeRays: 9,
  };
  const ND = { nocollide: true, noshadow: true };
  const H = 384;
  const floor = (x0, z0, x1, z1, tex, y = 0, t = 16) => M.box(x0, y - t, z0, x1, y, z1, { top: tex });
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
  const pole = (x, z, h = 220) => { M.prism(x, z, 0, h, 3, 8, 'steel'); M.box(x - 3, h - 4, z - 16, x + 3, h, z + 16, 'steel', ND); lamp(x, h - 10, z + 14, [1.0, 0.84, 0.6], 1.0, 460); };
  // brick stacks on pallets: the works' everyday cover
  const bricks = (x, z, w, d, h, yaw = 0) => { M.box(x - w / 2, 0, z - d / 2, x + w / 2, 8, z + d / 2, 'timber', { yaw }); M.box(x - w / 2 + 2, 8, z - d / 2 + 2, x + w / 2 - 2, 8 + h, z + d / 2 - 2, { sides: 'brick', top: 'brick', bottom: null }, { yaw }); };
  const heap = (x, z, r, h, tex = 'clay') => { M.prism(x, z, 0, h * 0.6, r, 12, { side: tex, top: tex }); M.prism(x, z, h * 0.6, h, r * 0.6, 12, { side: tex, top: tex }); };

  // ---------------- outer walls: quarry rock to the south and west, works brick north and east ----------------
  M.box(-1750, -64, -1550, 1750, H, -1500, { s: 'brick_yellow' }, { lm: 32 });
  M.box(-1750, -64, 1500, 1750, H, 1550, { n: 'rock' }, { lm: 32 });
  M.box(-1750, -64, -1500, -1700, H, 1500, { e: 'rock' }, { lm: 32 });
  M.box(1700, -64, -1500, 1750, H, 1500, { w: 'brick_yellow' }, { lm: 32 });
  const PIL = { sides: 'brick', top: 'concrete_plain', bottom: null };
  for (let x = -1380; x <= 1700; x += 320) M.box(x - 14, 0, -1500, x + 14, H - 24, -1486, PIL, { lm: 16 });
  for (let z = -1200; z <= -600; z += 300) M.box(1686, 0, z - 14, 1700, H - 24, z + 14, PIL, { lm: 16 });

  // ---------------- floors ----------------
  floor(-1700, 1000, 1700, 1500, 'clay');                 // Quarry Gate (Raider spawn)
  floor(-1700, -500, -1150, 1000, 'clay');                // Clay Pits (west lane)
  floor(-450, -800, 450, 1000, 'concrete_floor');         // Clay Court (mid)
  floor(1150, -550, 1700, 1000, 'asphalt');               // Rail Siding (east lane)
  floor(-1700, -1500, -750, -500, 'concrete_floor');      // A: Kiln Yard
  floor(-750, -1150, -450, -500, 'concrete');             // Kiln Alley
  floor(-750, -1500, 750, -1150, 'asphalt');              // Office Court (Warden spawn)
  floor(450, -1150, 750, -550, 'concrete_floor');         // Conveyor Room
  floor(750, -1500, 1700, -550, 'concrete_floor');        // B: Press Hall

  // ---------------- solid buildings between the lanes ----------------
  block(-1150, -500, -450, 1000, 300, 'brick');           // drying sheds
  block(450, -550, 1150, 1000, 300, 'brick_yellow');      // pallet store
  block(-450, -1150, 450, -800, 320, 'brick_yellow');     // works office
  for (const z of [-300, 0, 300, 600]) { win(-450, 130, z, -446, 190, z + 80, 'e'); win(-1154, 130, z, -1150, 190, z + 80, 'w'); }
  for (const z of [-250, 100, 450, 750]) { win(446, 130, z, 450, 190, z + 80, 'w'); win(1150, 130, z, 1154, 190, z + 80, 'e'); }
  for (const x of [-360, -160, 80, 280]) { win(x, 150, -800, x + 80, 220, -796, 's'); win(x, 150, -1154, x + 80, 220, -1150, 'n'); }
  plate(-120, 230, -1154, 120, 290, -1150, 'n', 'sign_kilnworks');
  plate(-100, 250, -800, 100, 300, -796, 's', 'sign_kilnworks');
  // drying-shed louvres and a chimney on the office
  for (let z = -460; z < 980; z += 120) M.box(-1156, 220, z, -1150, 228, z + 90, 'timber', ND);
  M.prism(300, -980, 320, 470, 30, 10, { side: 'brick', top: 'steel' });

  // ---------------- A: Kiln Yard ----------------
  // south wall with the gate from the Clay Pits (x -1450..-1250)
  wall(-1700, -520, -1450, -500, 260, 'brick'); wall(-1250, -520, -750, -500, 260, 'brick');
  // east wall: door to the Office Court (z -1320..-1200) and to Kiln Alley (z -800..-680)
  wall(-770, -1500, -750, -1320, 260, 'brick'); wall(-770, -1200, -750, -800, 260, 'brick'); wall(-770, -680, -750, -520, 260, 'brick');
  M.box(-770, 112, -1320, -750, 260, -1200, { sides: 'brick', top: 'concrete_plain', bottom: 'concrete_plain' });
  M.box(-770, 112, -800, -750, 260, -680, { sides: 'brick', top: 'concrete_plain', bottom: 'concrete_plain' });
  // kiln 1: a big rectangular kiln with a firing arch and a tall chimney
  block(-1520, -1360, -1220, -1110, 230, 'firebrick');
  M.box(-1520, 230, -1360, -1220, 246, -1110, { sides: 'concrete_plain', top: 'concrete_plain', bottom: null });
  plate(-1430, 0, -1112, -1310, 110, -1108, 's', 'door_metal');
  M.prism(-1300, -1300, 246, 520, 34, 12, { side: 'firebrick', top: 'steel' });
  // kiln 2: a round updraught kiln
  M.prism(-1050, -880, 0, 170, 105, 16, { side: 'firebrick', top: 'concrete_plain' });
  M.prism(-1050, -880, 170, 200, 70, 16, { side: 'firebrick', top: 'concrete_plain' });
  M.prism(-1050, -880, 200, 360, 22, 10, { side: 'firebrick', top: 'steel' });
  plate(-1090, 0, -778, -1010, 96, -774, 's', 'door_metal');
  // brick stacks, a clay cart, coal bin
  bricks(-1560, -820, 88, 72, 56, 0.1); bricks(-1380, -700, 72, 72, 72, -0.2); bricks(-900, -1250, 96, 64, 56, 0.05);
  bricks(-1180, -1420, 80, 64, 64, 0.3); bricks(-860, -620, 64, 64, 48, 0);
  M.box(-1640, 0, -1180, -1560, 40, -1060, { sides: 'steel', top: 'diamond', bottom: null });
  M.box(-1300, 0, -980, -1220, 30, -920, { sides: 'plywood', top: 'plywood', bottom: null }, { yaw: 0.4 });
  barrel(-1650, -1440); barrel(-1620, -1460, 'barrel_red');
  lamp(-1360, 200, -1080, [1.0, 0.8, 0.56], 1.0, 420);
  plate(-1454, 120, -522, -1440, 180, -520, 'n', 'site_a'); plate(-1260, 120, -522, -1246, 180, -520, 'n', 'site_a');
  plate(-1100, 150, -522, -980, 210, -520, 'n', 'sign_kiln');
  plate(-772, 120, -1100, -770, 190, -1020, 'w', 'site_a');

  // ---------------- Kiln Alley (Wardens' way to A and mid) ----------------
  wall(-610, -1160, -450, -1140, 260, 'brick_yellow');                       // court side: opening x -750..-610
  wall(-470, -800, -450, -760, 260, 'brick_yellow'); wall(-470, -600, -450, -500, 260, 'brick_yellow');   // mid side: opening z -760..-600
  bricks(-560, -1000, 64, 72, 56, 0.2); crate(-680, -560, 56, 'crate', 0, 0.3);
  pole(-560, -900, 210);

  // ---------------- Office Court (Warden spawn) ----------------
  crate(-680, -1450, 64, 'crate_b'); crate(-684, -1450, 48, 'crate', 64, 0.2); crate(660, -1440, 56, 'crate_mil', 0, 0.3);
  barrel(-560, -1470); barrel(-530, -1460, 'barrel_red'); barrel(560, -1475);
  M.box(-120, 0, -1490, 120, 40, -1440, { sides: 'concrete_plain', top: 'concrete_plain', bottom: null });   // planter
  pole(-400, -1300); pole(400, -1300);

  // ---------------- Conveyor Room (Wardens' way to B and mid) ----------------
  wall(450, -1160, 610, -1140, 216, 'brick_yellow');                          // court side: opening x 610..750
  wall(450, -800, 470, -760, 216, 'brick_yellow'); wall(450, -600, 470, -550, 216, 'brick_yellow');       // mid side: opening z -760..-600
  M.box(450, 200, -1140, 750, 216, -550, { bottom: 'shed_roof', top: 'roof', sides: 'steel' });
  M.box(470, 0, -1120, 530, 44, -830, { sides: 'steel', top: 'diamond', bottom: null });                 // conveyor
  for (let z = -1100; z < -840; z += 64) M.box(476, 44, z, 524, 50, z + 40, 'timber', ND);
  lamp(600, 186, -1000, [1.0, 0.86, 0.64], 1.0, 380, 0); lamp(600, 186, -700, [1.0, 0.86, 0.64], 1.0, 380, 0);

  // ---------------- B: Press Hall ----------------
  const HW = { sides: 'brick_yellow', top: 'concrete_plain', bottom: null };
  // west wall: doors from the Office Court (z -1320..-1200) and the Conveyor Room (z -760..-640)
  M.box(750, 0, -1500, 770, 320, -1320, HW); M.box(750, 0, -1200, 770, 320, -760, HW); M.box(750, 0, -640, 770, 320, -550, HW);
  M.box(750, 112, -1320, 770, 320, -1200, HW); M.box(750, 112, -760, 770, 320, -640, HW);
  // south wall with the roller door to the siding (x 1300..1500, 192 high)
  M.box(770, 0, -570, 1300, 320, -550, HW); M.box(1500, 0, -570, 1700, 320, -550, HW); M.box(1300, 192, -570, 1500, 320, -550, HW);
  // roof with skylights
  const RF = { bottom: 'shed_roof', top: null, sides: 'steel' };
  M.box(770, 320, -1500, 1700, 336, -1250, RF); M.box(770, 320, -1130, 1700, 336, -900, RF); M.box(770, 320, -780, 1700, 336, -570, RF);
  M.box(770, 320, -1250, 1000, 336, -1130, RF); M.box(1150, 320, -1250, 1700, 336, -1130, RF);
  M.box(770, 320, -900, 1250, 336, -780, RF); M.box(1400, 320, -900, 1700, 336, -780, RF);
  for (const x of [900, 1200, 1500]) M.box(x - 6, 296, -1500, x + 6, 320, -570, 'steel', ND);
  // two presses: a base, four columns, a head (you can see between base and head)
  const press = (x0, z0, x1, z1) => {
    M.box(x0, 0, z0, x1, 90, z1, { sides: 'panel', top: 'diamond', bottom: null });
    for (const [x, z] of [[x0 + 14, z0 + 14], [x1 - 14, z0 + 14], [x0 + 14, z1 - 14], [x1 - 14, z1 - 14]]) M.prism(x, z, 90, 240, 10, 10, 'steel');
    M.box(x0 - 6, 240, z0 - 6, x1 + 6, 296, z1 + 6, { sides: 'paint_orange', top: 'steel', bottom: 'steel' });
    M.box(x0 + 40, 150, z0 + 40, x1 - 40, 240, z1 - 40, 'steel');
  };
  press(950, -1250, 1150, -1060); press(1350, -960, 1550, -770);
  // conveyor along the north wall, pallets, a control booth in the north-east corner
  M.box(800, 0, -1430, 1320, 44, -1370, { sides: 'steel', top: 'diamond', bottom: null });
  for (let x = 820; x < 1300; x += 72) M.box(x, 44, -1424, x + 48, 50, -1376, 'timber', ND);
  bricks(880, -900, 80, 64, 56, 0.15); bricks(1230, -680, 72, 64, 64, -0.1); bricks(1600, -1150, 64, 80, 48, 0); bricks(1100, -800, 64, 64, 40, 0.5);
  crate(830, -1180, 56, 'crate_b', 0, 0.2); crate(1640, -640, 64, 'crate'); crate(1640, -640, 48, 'crate_mil', 64, 0.3);
  M.box(1480, 0, -1500, 1700, 80, -1300, { sides: 'panel', top: 'diamond', bottom: null });                // booth platform
  M.ramp(1520, -1300, 1640, -1160, 0, 80, 'n', { top: 'diamond', sides: 'steel' });
  M.box(1480, 80, -1306, 1520, 116, -1300, 'steel'); M.box(1640, 80, -1306, 1700, 116, -1300, 'steel');    // railings
  M.box(1480, 80, -1500, 1486, 116, -1306, 'steel');
  M.box(1560, 80, -1490, 1690, 120, -1450, { sides: 'paint_white', top: 'steel', bottom: null });         // control desk
  for (const [x, z] of [[950, -900], [1300, -1200], [1300, -700], [1550, -1380]]) lamp(x, 282, z, [1.0, 0.86, 0.64], 1.4, 600, 6);
  plate(770, 130, -1060, 774, 200, -980, 'e', 'site_b'); plate(1060, 150, -574, 1180, 210, -570, 'n', 'sign_press');
  plate(1310, 200, -574, 1490, 250, -570, 'n', 'sign_press'); plate(1560, 120, -546, 1640, 190, -544, 's', 'site_b');

  // ---------------- Clay Court (mid) ----------------
  block(-150, 350, 150, 650, 220, 'brick');                                     // pug-mill house
  M.box(-160, 220, 340, 160, 232, 660, { sides: 'steel', top: 'roof', bottom: 'steel' });
  M.prism(80, 560, 232, 380, 22, 10, { side: 'brick', top: 'steel' });
  win(-154, 100, 420, -150, 150, 500, 'w'); win(150, 100, 480, 154, 150, 560, 'e');
  M.box(-350, 0, -150, -170, 96, -118, { sides: 'timber', top: 'timber', bottom: null });                   // drying racks
  M.box(170, 0, -60, 350, 96, -28, { sides: 'timber', top: 'timber', bottom: null });
  bricks(-260, -620, 72, 64, 64, 0.2); bricks(300, -470, 64, 64, 48, -0.25); bricks(-330, 200, 64, 72, 56, 0); bricks(330, 820, 64, 64, 64, 0.4);
  crate(250, 230, 56, 'crate', 0, 0.3); barrel(-380, 860); barrel(-355, 880, 'barrel_red');
  M.box(-60, 0, -380, 60, 40, -350, { sides: 'concrete_plain', top: 'concrete_plain', bottom: null });
  pole(-420, -300, 210); pole(420, 300, 210);

  // ---------------- Clay Pits (west lane) ----------------
  heap(-1540, 660, 110, 84); heap(-1290, 300, 80, 60); heap(-1580, 0, 90, 70); heap(-1300, -260, 70, 52);
  for (const [x, z] of [[-1690, 220], [-1170, 220]]) M.prism(x, z, 0, 236, 6, 8, 'steel');
  M.box(-1700, 220, 200, -1150, 236, 240, { sides: 'steel', top: 'steel', bottom: 'steel' }, ND);           // conveyor gantry overhead
  M.box(-1700, 0, -380, -1600, 120, -220, { sides: 'shed', top: 'shed_roof', bottom: null });                // pit hut
  M.box(-1400, 0, 760, -1330, 36, 840, { sides: 'plywood', top: 'plywood', bottom: null }, { yaw: -0.5 }); // tipped barrow
  plate(-1154, 120, 840, -1150, 180, 960, 'w', 'sign_pits');

  // ---------------- Rail Siding (east lane) ----------------
  for (let z = -520; z < 990; z += 64) M.box(1394, 0, z, 1506, 4, z + 12, 'timber', { lm: 16 });
  M.box(1420, 4, -540, 1426, 10, 1000, 'steel', { lm: 16 }); M.box(1474, 4, -540, 1480, 10, 1000, 'steel', { lm: 16 });
  M.box(1395, 22, 100, 1505, 146, 420, { e: 'wagon', w: 'wagon', n: 'panel', s: 'panel', top: 'roof', bottom: 'steel' });
  for (const z of [130, 340]) M.box(1415, 4, z, 1485, 22, z + 50, 'steel');
  M.box(1150, 0, 0, 1230, 40, 600, { sides: 'concrete', top: 'concrete_plain', bottom: null });            // loading dock
  crate(1600, -250, 64, 'crate_mil', 0, 0.2); crate(1250, -330, 56, 'crate', 0, -0.3); crate(1620, 700, 64, 'crate_b');
  barrel(1640, 120); barrel(1615, 140, 'barrel_red');
  pole(1660, -100); pole(1660, 600);

  // ---------------- Quarry Gate (Raider spawn) ----------------
  // the weighbridge office screens the spawn from the Clay Court
  M.box(-350, 0, 1090, 350, 170, 1210, { sides: 'plaster_warm', top: null, bottom: null });
  M.box(-362, 170, 1078, 362, 182, 1222, { sides: 'steel', top: 'roof', bottom: 'steel' });
  for (const x of [-250, -50, 150]) win(x, 80, 1086, x + 90, 130, 1090, 'n');
  plate(-60, 100, 1210, 60, 150, 1214, 's', 'sign_kilnworks');
  M.box(900, 0, 1300, 1080, 130, 1420, { sides: 'paint_orange', top: 'steel', bottom: null });              // digger body
  M.box(910, 130, 1330, 1000, 200, 1410, { sides: 'paint_orange', top: 'steel', bottom: null });            // cab
  M.box(1080, 60, 1340, 1240, 80, 1380, 'paint_orange'); M.box(1230, 0, 1320, 1290, 70, 1400, 'steel');     // arm and bucket
  heap(-1000, 1400, 110, 90, 'clay'); heap(1520, 1130, 100, 70, 'clay');
  M.box(-1500, 0, 1380, -1300, 150, 1500, { sides: 'plaster_warm', top: 'roof', bottom: null });           // gatehouse
  win(-1450, 70, 1376, -1380, 120, 1380, 'n');
  bricks(-600, 1150, 80, 64, 56, 0.2); bricks(600, 1120, 64, 72, 64, -0.2); crate(-1550, 1100, 64, 'crate_mil', 0, 0.3);
  pole(-1000, 1050); pole(1000, 1050);

  // ---------------- spawns ----------------
  // Raiders spawn behind the weighbridge office, out of the court's long sightline
  for (const [x, z] of [[-260, 1300], [-130, 1300], [0, 1300], [130, 1300], [260, 1300], [-195, 1420], [-65, 1420], [65, 1420], [195, 1420]]) M.teamSpawn(0, x, 0, z, 0);
  for (const [x, z] of [[-300, -1300], [-150, -1300], [0, -1300], [150, -1300], [300, -1300], [-225, -1400], [-75, -1400], [75, -1400]]) M.teamSpawn(1, x, 0, z, Math.PI);
  M.spawn(0, 0, 1300, 0);

  // ---------------- plant sites, places, names ----------------
  M.site('A', -1690, -1490, -790, -540, -16, 240);
  M.site('B', 790, -1490, 1690, -590, -16, 200);
  for (const [x, y, z, n] of [[-1300, 0, -950, 'Kiln Yard'], [-1050, 0, -720, 'kiln 2'], [-1360, 0, -1050, 'kiln 1 front'], [-600, 0, -900, 'Kiln Alley'],
    [0, 0, -1300, 'Office Court'], [600, 0, -900, 'Conveyor Room'], [1200, 0, -900, 'Press Hall'], [1590, 80, -1400, 'control booth'],
    [0, 0, -500, 'north court'], [0, 0, 0, 'Clay Court'], [-300, 0, 500, 'pug mill west'], [300, 0, 500, 'pug mill east'],
    [-1430, 0, 200, 'Clay Pits'], [-1400, 0, -380, 'pits gate'], [1300, 0, 300, 'Rail Siding'], [1400, 0, -450, 'roller door'],
    [0, 0, 1250, 'Quarry Gate'], [-1300, 0, 1200, 'quarry west'], [1300, 0, 1200, 'quarry east']]) M.hotspot(x, y, z, n);
  for (const [n, x0, z0, x1, z1] of [['Kiln Yard', -1700, -1500, -750, -500], ['Kiln Alley', -750, -1150, -450, -500], ['Office Court', -750, -1500, 750, -1150],
    ['Conveyor Room', 450, -1150, 750, -550], ['Press Hall', 750, -1500, 1700, -550], ['Clay Court', -450, -800, 450, 1000], ['Clay Pits', -1700, -500, -1150, 1000],
    ['Rail Siding', 1150, -550, 1700, 1000], ['Quarry Gate', -1700, 1000, 1700, 1500]]) M.area(n, x0, z0, x1, z1);

  // main-menu fly-through
  M.menuShots = [
    { from: [-820, 330, -560], to: [-800, 320, -1080], look: [-1340, 90, -1000], lookTo: [-1250, 90, -1150] },
    { from: [-360, 150, 930], to: [330, 160, 900], look: [0, 90, -600] },
    { from: [820, 250, -620], to: [1100, 240, -640], look: [1260, 60, -1200], lookTo: [1420, 60, -1150] },
  ];

  // ---------------- bot tactics ----------------
  M.tactics = {
    routes: {
      pits: { stack: [-1000, 0, 1130], yaw: 0.5, via: [-1350, 0, -460] },
      alley: { stack: [-600, 0, 1130], yaw: -0.4, via: [-600, 0, -720] },
      siding: { stack: [1000, 0, 1130], yaw: -0.5, via: [1400, 0, -500] },
      conveyor: { stack: [600, 0, 1130], yaw: 0.4, via: [600, 0, -720] },
    },
    siteRoutes: { A: ['pits', 'alley'], B: ['siding', 'conveyor'] },
    mid: [-450, -800, 450, 300],
    sites: {
      A: { hold: [[-1150, 0, -1000, 150], [-1600, 0, -1000, 175], [-1000, 0, -620, -65], [-1250, 0, -1420, 165], [-880, 0, -1100, -150]],
        plant: [[-1350, 0, -920], [-1100, 0, -1180], [-1500, 0, -680]], smoke: [[-1350, 0, -640], [-860, 0, -740]] },
      B: { hold: [[1250, 0, -1000, 170], [1600, 80, -1350, 165], [900, 0, -1000, -70], [1450, 0, -700, -170], [1050, 0, -700, 150]],
        plant: [[1250, 0, -880], [1050, 0, -1300], [1450, 0, -1150]], smoke: [[1400, 0, -660], [860, 0, -700]] },
    },
  };
  return M;
}
