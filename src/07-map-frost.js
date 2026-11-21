// "Frostline": an original mountain radar station under a grey winter sky.
// Axes: +X east, +Y up, +Z south. Raiders come in from the supply drop (west), Wardens hold the
// barracks row (east).
//   A: Hangar 2 (indoor: a parked survey plane, tool crates) - via the Fuel Depot (north lane) or
//      the Radio Path behind the comms block
//   B: Dish Array (outdoor platform raised 96 units: two dishes, a control hut) - up the ramp from
//      the Ice Cut (south lane) or the stairs from the Generator Path
//   Mid: the Pass between two rock ridges into the comms block, whose north and south doors feed
//   the Radio and Generator paths.

function buildFrostline() {
  const M = new MapBuilder();
  const sd = [0.32, 0.58, -0.55], sl = Math.hypot(...sd);
  M.env = {
    sunDir: sd.map((v) => v / sl), sunColor: [0.92, 0.95, 1.0], sunIntensity: 0.88,
    skyZenith: [0.46, 0.56, 0.7], skyHorizon: [0.84, 0.88, 0.93], skyIntensity: 0.92,
    fogColor: [0.82, 0.86, 0.91], fogDensity: 0.00015, ambient: 0.17,
    skySun: [0.95, 0.95, 0.92], skyGround: [0.86, 0.89, 0.93], skyMountains: [0.84, 0.88, 0.93],
    lmBig: 256, lmSmall: 12, probeStep: 96, bakeRays: 9,
  };
  const ND = { nocollide: true, noshadow: true };
  const H = 420;
  const floor = (x0, z0, x1, z1, tex, y = 0, t = 16) => M.box(x0, y - t, z0, x1, y, z1, { top: tex });
  const block = (x0, z0, x1, z1, h, side, y0 = 0, top = null) => M.box(x0, y0, z0, x1, h, z1, { sides: side, top, bottom: null });
  const plate = (x0, y0, z0, x1, y1, z1, face, tex) => M.box(x0, y0, z0, x1, y1, z1, { [face]: tex, sides: 'steel', top: 'steel', bottom: 'steel' });
  const win = (x0, y0, z0, x1, y1, z1, face) => M.box(x0, y0, z0, x1, y1, z1, { [face]: 'window', sides: 'steel', top: 'steel', bottom: 'steel' }, ND);
  const crate = (x, z, s, tex, y = 0, yaw = 0) => M.box(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, tex, { yaw });
  const barrel = (x, z, tex = 'barrel', y = 0) => M.prism(x, z, y, y + 44, 13, 12, { side: tex, top: 'barrel_top' }, { rot: x * 0.01 });
  const lamp = (x, y, z, col = [0.92, 0.95, 1.0], k = 1.5, r = 560, hang = 0) => {
    if (hang > 0) M.box(x - 0.6, y + 8, z - 0.6, x + 0.6, y + 8 + hang, z + 0.6, 'steel', ND);
    M.prism(x, z, y + 4, y + 10, 9, 8, 'steel', { nocollide: true });
    M.box(x - 4, y, z - 4, x + 4, y + 4, z + 4, 'lamp', ND);
    M.light(x, y - 8, z, col, k, r);
  };
  const pole = (x, z, h = 220) => { M.prism(x, z, 0, h, 3, 8, 'steel'); M.box(x - 3, h - 4, z - 16, x + 3, h, z + 16, 'steel', ND); lamp(x, h - 10, z + 14, [1.0, 0.9, 0.72], 1.0, 460); };
  const drift = (x, z, r, h, y = 0) => { M.prism(x, z, y, y + h * 0.55, r, 12, { side: 'snow', top: 'snow' }); M.prism(x, z, y + h * 0.55, y + h, r * 0.55, 12, { side: 'snow', top: 'snow' }); };
  const boulder = (x, z, r, h, rot = 0) => M.prism(x, z, 0, h, r, 7, { side: 'rock', top: 'snow' }, { rot });
  const ridge = (x0, z0, x1, z1, h) => M.box(x0, 0, z0, x1, h, z1, { sides: 'rock', top: 'snow', bottom: null }, { lm: 24 });

  // ---------------- cliffs all round ----------------
  M.box(-1850, -64, -1450, 1850, H, -1400, { s: 'rock' }, { lm: 32 });
  M.box(-1850, -64, 1400, 1850, H, 1450, { n: 'rock' }, { lm: 32 });
  M.box(-1850, -64, -1400, -1800, H, 1400, { e: 'rock' }, { lm: 32 });
  M.box(1800, -64, -1400, 1850, H, 1400, { w: 'rock' }, { lm: 32 });
  for (const [x, z, r, h] of [[-1500, -1400, 120, 520], [-400, -1400, 160, 560], [700, 1400, 150, 540], [1600, 1400, 140, 500], [-1800, 1000, 130, 520], [1800, -800, 120, 520]]) M.prism(x, z, 0, h, r, 7, { side: 'rock', top: 'snow' }, { rot: x * 0.003 });

  // ---------------- floors ----------------
  floor(-1800, -1400, -1300, 1400, 'snow');               // Drop Zone (Raider spawn)
  floor(-1300, -1400, 100, -650, 'snow');                 // Fuel Depot (north lane)
  floor(-1300, -250, -300, 250, 'snow');                  // the Pass (mid)
  floor(-1300, 650, 100, 1400, 'snow');                   // Ice Cut (south lane)
  floor(-300, -650, 300, -350, 'snow');                   // Radio Path
  floor(-300, 350, 300, 650, 'snow');                     // Generator Path
  floor(-300, -350, 300, 350, 'tiles');                   // comms block
  floor(100, -1400, 1300, -650, 'concrete_floor');        // A: Hangar 2
  floor(1300, -1400, 1800, 1400, 'snow');                 // Barracks Row (Warden spawn)

  // ---------------- ridges and the station building ----------------
  ridge(-1300, -650, -300, -250, 300); ridge(-1300, 250, -300, 650, 300);
  for (const [x, z] of [[-1250, -620], [-700, -640], [-1100, 620], [-500, 640]]) boulder(x, z, 70, 120, x * 0.01);
  block(300, -650, 1300, 650, 320, 'paint_white');
  for (const z of [-450, -150, 150, 450]) win(1300, 150, z - 40, 1304, 210, z + 40, 'e');
  M.box(290, 320, -660, 1310, 336, 660, { sides: 'steel', top: 'roof', bottom: 'steel' });
  M.prism(800, 0, 336, 420, 150, 16, { side: 'paint_white', top: 'paint_white' }); M.prism(800, 0, 420, 470, 100, 16, { side: 'paint_white', top: 'paint_white' });
  M.prism(800, 0, 470, 495, 50, 12, { side: 'paint_white', top: 'paint_white' });
  plate(1304, 230, -100, 1308, 290, 100, 'e', 'sign_frost');

  // ---------------- comms block (mid): a loop round the equipment room ----------------
  const CW = { sides: 'paint_orange', top: 'steel', bottom: null }, CI = { sides: 'plaster', top: 'steel', bottom: null };
  // west wall with the door from the Pass (z -60..60)
  M.box(-300, 0, -350, -284, 240, -60, CW); M.box(-300, 0, 60, -284, 240, 350, CW); M.box(-300, 112, -60, -284, 240, 60, CW);
  // north wall with the door to the Radio Path (x 100..220); south wall with the door to the Generator Path
  M.box(-284, 0, -350, 100, 240, -334, CW); M.box(220, 0, -350, 300, 240, -334, CW); M.box(100, 112, -350, 220, 240, -334, CW);
  M.box(-284, 0, 334, 100, 240, 350, CW); M.box(220, 0, 334, 300, 240, 350, CW); M.box(100, 112, 334, 220, 240, 350, CW);
  M.box(-300, 240, -350, 300, 256, 350, { bottom: 'plaster', top: 'roof', sides: 'steel' });
  // equipment room in the middle (solid racks), consoles along the outer walls
  M.box(-130, 0, -170, 130, 200, 170, { sides: 'panel', top: 'steel', bottom: null });
  for (let z = -150; z < 160; z += 60) M.box(130, 30, z, 134, 170, z + 40, 'screen_glow', ND);
  M.box(-280, 0, -320, -220, 72, -200, { sides: 'paint_white', top: 'steel', bottom: null });
  M.box(-280, 0, 200, -220, 72, 320, { sides: 'paint_white', top: 'steel', bottom: null });
  for (const [x, z] of [[0, -260], [0, 260], [-210, 0]]) lamp(x, 222, z, [0.9, 0.95, 1.0], 1.2, 420, 4);
  for (const z of [-200, 140]) win(-304, 130, z, -300, 180, z + 60, 'w');

  // ---------------- A: Hangar 2 ----------------
  const HG = { sides: 'hangar', top: 'steel', bottom: null };
  // west wall: the big hangar door from the Fuel Depot (z -1150..-850, 260 high)
  M.box(100, 0, -1400, 120, 380, -1150, HG); M.box(100, 0, -850, 120, 380, -650, HG); M.box(100, 260, -1150, 120, 380, -850, HG);
  M.box(60, 260, -1180, 100, 300, -820, { sides: 'paint_orange', top: 'steel', bottom: 'steel' });              // door beam
  // south wall: door to the Radio Path (x 150..270); east wall: door to Barracks Row (z -1100..-980)
  M.box(120, 0, -670, 150, 380, -650, HG); M.box(270, 0, -670, 1300, 380, -650, HG); M.box(150, 112, -670, 270, 380, -650, HG);
  M.box(1280, 0, -1400, 1300, 380, -1100, HG); M.box(1280, 0, -980, 1300, 380, -670, HG); M.box(1280, 112, -1100, 1300, 380, -980, HG);
  const RF = { bottom: 'shed_roof', top: null, sides: 'steel' };
  M.box(100, 380, -1400, 1300, 396, -1100, RF); M.box(100, 380, -950, 1300, 396, -650, RF);
  M.box(100, 380, -1100, 550, 396, -950, RF); M.box(750, 380, -1100, 1300, 396, -950, RF);
  for (const x of [300, 600, 900, 1150]) M.box(x - 8, 350, -1400, x + 8, 380, -650, 'steel', ND);
  // the survey plane: fuselage on legs, wings overhead, a tail fin
  M.box(420, 40, -1060, 980, 150, -940, { sides: 'paint_white', top: 'paint_white', bottom: 'steel' });
  M.box(330, 60, -1040, 420, 130, -960, { sides: 'paint_orange', top: 'paint_orange', bottom: 'steel' });
  M.box(640, 126, -1380, 780, 140, -620 + -50, { sides: 'paint_white', top: 'paint_white', bottom: 'paint_white' }, ND);
  M.box(900, 150, -1004, 960, 260, -996, { sides: 'paint_orange', top: 'steel', bottom: null }, ND);
  M.box(880, 140, -1110, 980, 148, -890, { sides: 'paint_white', top: 'paint_white', bottom: 'paint_white' }, ND);
  for (const [x, z] of [[500, -1050], [500, -950], [900, -1050], [900, -950]]) M.prism(x, z, 0, 40, 8, 8, 'steel');
  // crates and tool chests
  crate(350, -1300, 64, 'crate_mil'); crate(354, -1300, 48, 'crate', 64, 0.25); crate(1150, -1250, 64, 'crate_b', 0, 0.2);
  crate(1180, -760, 56, 'crate_mil', 0, -0.3); crate(780, -760, 64, 'crate'); crate(250, -780, 48, 'crate_b', 0, 0.4);
  M.box(1200, 0, -1390, 1270, 90, -1300, { sides: 'paint_orange', top: 'steel', bottom: null });
  M.box(560, 0, -1380, 720, 48, -1340, { sides: 'paint_white', top: 'diamond', bottom: null });
  barrel(1240, -1050); barrel(1220, -1070, 'barrel_red'); barrel(160, -1380);
  for (const [x, z] of [[350, -1000], [700, -1250], [700, -800], [1050, -1000]]) lamp(x, 340, z, [1.0, 0.92, 0.78], 1.5, 640, 10);
  plate(124, 150, -840, 128, 220, -760, 'e', 'site_a'); plate(500, 260, -646, 680, 320, -642, 's', 'sign_hangar');
  plate(96, 280, -1060, 100, 330, -940, 'w', 'sign_hangar'); plate(1276, 130, -960, 1280, 200, -880, 'w', 'site_a');

  // ---------------- Fuel Depot (north lane) ----------------
  for (const [x, z] of [[-900, -1180], [-560, -1230], [-240, -1120]]) {
    M.prism(x, z, 0, 220, 88, 16, { side: 'paint_white', top: 'steel' });
    M.box(x - 92, 120, z - 6, x + 92, 132, z + 6, 'steel', ND);
  }
  for (const x of [-1100, -700, -300, 50]) M.prism(x, -700, 0, 170, 5, 8, 'steel');
  M.box(-1150, 160, -712, 80, 176, -688, { sides: 'steel', top: 'steel', bottom: 'steel' }, ND);             // pipe rack
  M.box(-1080, 0, -950, -880, 110, -860, { sides: 'paint_orange', top: 'steel', bottom: null });              // fuel bowser
  M.box(-880, 0, -945, -820, 80, -865, { sides: 'paint_orange', top: 'steel', bottom: null });
  drift(-1200, -1300, 90, 60); drift(-450, -900, 70, 46); drift(-50, -1300, 80, 50);
  crate(-650, -780, 64, 'crate_mil', 0, 0.2); barrel(-1250, -780); barrel(-1225, -760, 'barrel_red'); crate(-100, -900, 56, 'crate', 0, -0.3);
  pole(-800, -680, 210); pole(-50, -1380, 210);

  // ---------------- the Pass (mid) ----------------
  boulder(-1000, -120, 60, 70, 0.4); boulder(-700, 160, 70, 90, 1.1); drift(-450, -170, 60, 40);
  M.box(-900, 0, 60, -780, 50, 140, { sides: 'paint_orange', top: 'steel', bottom: null }, { yaw: 0.2 });   // broken snowcat
  M.box(-890, 50, 70, -820, 100, 130, { sides: 'paint_orange', top: 'steel', bottom: null }, { yaw: 0.2 });
  pole(-600, -235, 200);

  // ---------------- Radio Path and Generator Path ----------------
  M.box(-260, 0, -620, -140, 130, -500, { sides: 'paint_white', top: 'roof', bottom: null });              // radio hut
  M.prism(-200, -560, 130, 330, 5, 6, 'steel'); M.box(-212, 300, -572, -188, 340, -548, 'steel', ND);       // mast
  crate(240, -420, 48, 'crate_b', 0, 0.2);
  M.box(-260, 0, 500, -120, 100, 620, { sides: 'paint_orange', top: 'steel', bottom: null });             // generator
  for (const z of [520, 560, 600]) M.box(-122, 20, z, -118, 80, z + 20, 'steel', ND);
  barrel(-60, 620); barrel(-35, 600, 'barrel_red');

  // ---------------- B: Dish Array (raised platform) ----------------
  M.box(100, 0, 650, 1300, 96, 1400, { top: 'concrete', sides: 'concrete', bottom: null }, { radar: 'floor' });
  M.box(100, 96, 650, 1300, 97, 670, 'hazard', { nocollide: true, noshadow: true });
  // west ramp from the Ice Cut (z 900..1100), north stairs from the Generator Path, east stairs from Barracks Row
  M.ramp(-180, 900, 100, 1100, 0, 96, 'e', { top: 'concrete', sides: 'concrete' });
  for (let k = 0; k < 6; k++) M.box(150, 0, 500 + 25 * k, 280, 16 * (k + 1), 525 + 25 * k, { top: 'concrete', sides: 'concrete', bottom: null });
  for (let k = 0; k < 6; k++) M.box(1450 - 25 * (k + 1), 0, 900, 1450 - 25 * k, 16 * (k + 1), 1040, { top: 'concrete', sides: 'concrete', bottom: null });
  // railings along the open edges (waist high, see-through gaps between posts)
  for (let x = 120; x < 1300; x += 120) if (!(x > 140 && x < 300)) M.box(x, 96, 650, x + 6, 136, 656, 'steel');
  M.box(100, 130, 650, 1300, 136, 656, 'steel', ND);
  // dishes on pedestals (you can walk under the bowls), a control hut
  const dish = (x, z, r) => {
    M.prism(x, z, 96, 250, 26, 10, { side: 'paint_white', top: 'steel' });
    M.prism(x, z, 250, 262, r, 18, { side: 'paint_white', top: 'paint_white', bottom: 'paint_white' }, ND);
    M.prism(x, z, 262, 272, r * 0.75, 18, { side: 'paint_white', top: 'paint_white' }, ND);
    M.prism(x, z, 272, 340, 3, 6, 'steel', ND); M.box(x - 8, 340, z - 8, x + 8, 356, z + 8, 'paint_orange', ND);
  };
  dish(550, 1050, 150); dish(1000, 1200, 130);
  M.box(1050, 96, 700, 1260, 216, 850, { sides: 'paint_orange', top: 'roof', bottom: null });
  win(1046, 150, 740, 1050, 190, 810, 'w');
  crate(400, 800, 64, 'crate_mil', 96, 0.2); crate(404, 800, 48, 'crate_b', 160, 0.5); crate(800, 1330, 64, 'crate', 96, -0.2);
  crate(1200, 1050, 56, 'crate_mil', 96, 0.3); drift(250, 1300, 80, 50, 96); drift(780, 880, 60, 40, 96);
  M.box(650, 96, 760, 760, 136, 800, { sides: 'paint_white', top: 'steel', bottom: null });                 // cable drum
  for (const [x, z] of [[300, 900], [800, 1100], [1150, 1300]]) lamp(x, 200, z, [1.0, 0.9, 0.72], 1.1, 480, 0);
  plate(96, 20, 960, 100, 80, 1040, 'w', 'site_b'); plate(1300, 110, 1180, 1304, 180, 1260, 'e', 'site_b');
  plate(1046, 120, 860, 1050, 170, 850, 'w', 'sign_dish');

  // ---------------- Ice Cut (south lane) ----------------
  boulder(-1100, 900, 80, 110, 0.3); boulder(-750, 1250, 90, 130, 1.4); boulder(-400, 820, 60, 80, 2.2);
  drift(-950, 1150, 80, 50); drift(-250, 1300, 70, 46);
  M.box(-640, 0, 980, -520, 60, 1060, { sides: 'crate_mil', top: 'crate_mil', bottom: null }, { yaw: 0.3 });
  pole(-1000, 1380, 210);

  // ---------------- Drop Zone (Raider spawn) ----------------
  crate(-1700, -1000, 64, 'crate_mil', 0, 0.2); crate(-1700, -1000, 48, 'crate_mil', 64, 0.6); crate(-1400, 1000, 64, 'crate_mil', 0, -0.2);
  M.box(-1760, 0, -60, -1620, 24, 60, 'timber'); crate(-1690, -10, 56, 'crate_mil', 24, 0.1);                  // supply pallet
  drift(-1500, -1250, 100, 60); drift(-1550, 1250, 90, 56);
  // a wall of supply containers faces the Pass mouth: no view from mid into the spawn
  M.box(-1450, 0, -430, -1400, 120, -10, { sides: 'container', top: 'steel', bottom: null });
  M.box(-1450, 0, 10, -1400, 120, 430, { sides: 'container_blue', top: 'steel', bottom: null });
  M.box(-1452, 120, -200, -1398, 230, 120, { sides: 'container', top: 'steel', bottom: null });
  barrel(-1760, 300); barrel(-1740, 320, 'barrel_red');

  // ---------------- Barracks Row (Warden spawn) ----------------
  block(1500, -1400, 1800, -700, 260, 'paint_orange'); block(1500, 700, 1800, 1400, 260, 'paint_white');
  M.box(1490, 260, -1410, 1800, 272, -690, { sides: 'steel', top: 'roof', bottom: 'steel' });
  M.box(1490, 260, 690, 1800, 272, 1410, { sides: 'steel', top: 'roof', bottom: 'steel' });
  for (const z of [-1250, -1000, -850]) win(1496, 120, z, 1500, 180, z + 80, 'w');
  for (const z of [800, 1050, 1250]) win(1496, 120, z, 1500, 180, z + 80, 'w');
  crate(1360, -400, 56, 'crate_b', 0, 0.3); crate(1740, 640, 64, 'crate', 0, 0.1); drift(1420, 450, 70, 40);
  pole(1360, -650); pole(1360, 650);

  // ---------------- spawns ----------------
  // Raiders spawn north and south of the Pass mouth, behind the ridge ends
  for (const [x, z] of [[-1700, -520], [-1580, -520], [-1700, -400], [-1580, -400], [-1640, -640], [-1700, 520], [-1580, 520], [-1700, 400], [-1580, 400], [-1640, 640]]) M.teamSpawn(0, x, 0, z, -Math.PI / 2);
  for (const [x, z] of [[1600, -300], [1700, -300], [1600, -150], [1700, -150], [1600, 150], [1700, 150], [1600, 300], [1700, 300]]) M.teamSpawn(1, x, 0, z, Math.PI / 2);
  M.spawn(-1640, 0, -460, -Math.PI / 2);

  // ---------------- plant sites, places, names ----------------
  M.site('A', 130, -1390, 1270, -680, -16, 300);
  M.site('B', 110, 670, 1290, 1390, 80, 320);
  for (const [x, y, z, n] of [[700, 0, -800, 'Hangar 2'], [300, 0, -1200, 'hangar door'], [1200, 0, -1150, 'hangar back'], [-600, 0, -1000, 'Fuel Depot'],
    [-200, 0, -800, 'depot corner'], [0, 0, -500, 'Radio Path'], [215, 0, 0, 'comms block'], [-800, 0, 0, 'the Pass'], [0, 0, 500, 'Generator Path'],
    [-600, 0, 1000, 'Ice Cut'], [-50, 0, 1000, 'ramp'], [700, 96, 1000, 'Dish Array'], [1150, 96, 900, 'control hut'], [1550, 0, 0, 'Barracks Row'],
    [1400, 0, -1050, 'north barracks'], [1400, 0, 1150, 'south barracks'], [-1600, 0, 0, 'Drop Zone']]) M.hotspot(x, y, z, n);
  for (const [n, x0, z0, x1, z1] of [['Drop Zone', -1800, -1400, -1300, 1400], ['Fuel Depot', -1300, -1400, 100, -650], ['the Pass', -1300, -250, -300, 250],
    ['Ice Cut', -1300, 650, 100, 1400], ['Radio Path', -300, -650, 300, -350], ['Generator Path', -300, 350, 300, 650], ['Comms Block', -300, -350, 300, 350],
    ['Hangar 2', 100, -1400, 1300, -650], ['Dish Array', 100, 650, 1300, 1400], ['Barracks Row', 1300, -1400, 1800, 1400]]) M.area(n, x0, z0, x1, z1);

  // main-menu fly-through
  M.menuShots = [
    { from: [180, 300, -720], to: [600, 300, -720], look: [760, 70, -1150], lookTo: [900, 70, -1100] },
    { from: [-120, 300, 760], to: [300, 320, 700], look: [800, 140, 1150] },
    { from: [-1250, 220, -720], to: [-900, 230, -740], look: [-250, 90, -1150] },
  ];

  // ---------------- bot tactics ----------------
  M.tactics = {
    routes: {
      fuel: { stack: [-1620, 0, -760], yaw: -Math.PI / 2, via: [-150, 0, -1000] },
      radio: { stack: [-1350, 0, -420], yaw: Math.PI, via: [160, 0, -500] },
      ice: { stack: [-1620, 0, 760], yaw: -Math.PI / 2, via: [-260, 0, 1000] },
      gen: { stack: [-1350, 0, 420], yaw: 0, via: [215, 0, 460] },
    },
    siteRoutes: { A: ['fuel', 'radio'], B: ['ice', 'gen'] },
    mid: [-1250, -250, 300, 250],
    sites: {
      A: { hold: [[1000, 0, -900, 90], [500, 0, -1300, 156], [1150, 0, -780, 110], [700, 0, -760, 95], [1180, 0, -1250, 70]],
        plant: [[950, 0, -1250], [350, 0, -1200], [1050, 0, -850]], smoke: [[200, 0, -1000], [210, 0, -720]] },
      B: { hold: [[900, 96, 1000, 90], [450, 96, 1300, 60], [280, 96, 800, 15], [1150, 96, 1300, 110], [700, 96, 750, 30]],
        plant: [[1000, 96, 1260], [550, 96, 880], [850, 96, 1300]], smoke: [[150, 96, 1000], [215, 96, 700]] },
    },
  };
  return M;
}
