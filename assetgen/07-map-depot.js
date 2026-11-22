// "Saltpan Depot" for the Godot version (assetgen): the salt works' rail depot at ten times the area
// of the original, 12,800 x 9,600 units. Axes: +X east, +Y up, +Z south.
// Raiders start in the West Yard, Wardens in the Warden Yard off the Service Road (east).
//   A: Platform 2 - rail platform with wagons and a canopy (north-east)
//      north lane: North Yard, Salt Pans, Brine House, Rail Cut;  mid: Street, Plaza, Weighbridge
//      Office, Scales Yard
//   B: Shed 4 - warehouse with containers, a catwalk and the foreman's office (south-east)
//      south lane: Sluice Yard, Pump House, Evaporator Sheds, Culvert;  mid: Back Alley, Lorry Park,
//      Loading Bay
//   Wardens: Service Road north and south, the Car Park and Depot Office between the sites.

function buildDepot() {
  const M = new MapBuilder(), K = mapKit(M);
  const sd = [-0.52, 0.66, 0.38], sl = Math.hypot(...sd);
  M.env = {
    sunDir: sd.map((v) => v / sl), sunColor: [1.0, 0.9, 0.74], sunIntensity: 1.12,
    skyZenith: [0.33, 0.5, 0.78], skyHorizon: [0.86, 0.8, 0.7], skyIntensity: 0.78,
    fogColor: [0.78, 0.74, 0.66], fogDensity: 0.00005, ambient: 0.12,
    lmBig: 320, lmBigS: 32, lmSmall: 16, probeStep: 128, bakeRays: 9, navStep: 48, chunk: 2048,
    roundTime: 175, fuse: 45, buyRadius: 900, radarZoom: 0.42,
  };
  const G = [];                                   // ground rectangles (later ones win)
  const X0 = -6400, X1 = 6400, Z0 = -4800, Z1 = 4800, HP = 460, BIG = { lm: 48 };
  const bld = (x0, z0, x1, z1, o) => { G.push([x0, z0, x1, z1, o.floor ?? 'concrete_floor', o.y ?? 0]); return K.building(x0, z0, x1, z1, Object.assign({}, o, { floor: null })); };
  const plate = (x0, y0, z0, x1, y1, z1, face, tex) => K.sign(x0, y0, z0, x1, y1, z1, face, tex);
  const lampW = [1.0, 0.86, 0.64], lampC = [0.82, 0.92, 1.0];

  // =========================================================== perimeter
  K.wall(X0 - 64, Z0 - 64, X1 + 64, Z0, HP + 192, 'concrete', -192, 'concrete_plain', BIG);
  K.wall(X0 - 64, Z1, X1 + 64, Z1 + 64, HP + 192, 'concrete', -192, 'concrete_plain', BIG);
  K.wall(X0 - 64, Z0, X0, Z1, HP + 192, 'concrete', -192, 'concrete_plain', BIG);
  K.wall(X1, Z0, X1 + 64, Z1, HP + 192, 'concrete', -192, 'concrete_plain', BIG);
  for (let x = X0 + 400; x < X1; x += 800) { K.wall(x - 16, Z0, x + 16, Z0 + 16, HP - 20, 'concrete_plain'); K.wall(x - 16, Z1 - 16, x + 16, Z1, HP - 20, 'concrete_plain'); }
  G.push([X0, Z0, X1, Z1, 'sand']);

  // =========================================================== West Yard (Raider spawn)
  G.push([-6400, -1000, -5000, 1000, 'sand'], [-6000, -1000, -5560, 1000, 'asphalt']);
  K.wall(-6400, -1032, -5960, -1000, 300, 'brick'); K.wall(-5500, -1032, -5000, -1000, 300, 'brick');
  K.wall(-6400, 1000, -5960, 1032, 300, 'brick'); K.wall(-5500, 1000, -5000, 1032, 300, 'brick');
  K.wall(-5032, -1000, -5000, -400, 300, 'brick'); K.wall(-5032, 400, -5000, 1000, 300, 'brick');
  K.block(-6380, -920, -6120, -600, 160, 'panel'); K.win(-6120, 70, -830, -6118, 120, -720, 'e');
  K.truck(-5240, -640, -0.4); K.truck(-5250, 700, 0.5, 'container');
  K.crates(-6260, 320, 4, 11); K.barrels(-6300, 740, 4, 12); K.pallet(-5640, -860); K.pallet(-5600, 880, 0, 0.4);
  K.pole(-5780, -760); K.pole(-5780, 760);
  // a screen of stacked containers: nobody in the Street or the Plaza sees into the yard
  K.container(-5480, -600, 'z', 'container', 0, 600); K.container(-5480, 0, 'z', 'container_blue', 0, 600);
  K.container(-5480, -560, 'z', 'container_blue', 104, 520); K.container(-5480, 40, 'z', 'container', 104, 520);
  plate(-5036, 160, -120, -5032, 210, 40, 'w', 'sign_depot');

  // =========================================================== North Yard
  G.push([-6400, -4800, -4000, -1032, 'sand'], [-6000, -4500, -5560, -1032, 'asphalt']);
  for (const [x, z] of [[-6080, -4260], [-6080, -3720], [-5520, -4260]]) K.tank(x, z, 170, 430, 'paint_white');
  K.container(-5300, -3460, 'x', 'container', 0, 320); K.container(-5300, -3460, 'x', 'container_blue', 104, 320);
  K.container(-4880, -2700, 'z', 'container_blue', 0, 320); K.container(-5700, -2260, 'x', 'container', 0, 240);
  K.container(-4760, -1820, 'x', 'container', 0, 240); K.container(-6300, -3000, 'z', 'container', 0, 240);
  K.crates(-6180, -2400, 4, 21); K.crates(-4420, -3960, 3, 22); K.barrels(-6260, -1500, 5, 23); K.crates(-5100, -1300, 3, 24);
  K.heap(-4480, -2950, 240, 170, 'salt');
  K.pole(-5300, -1500); K.pole(-5300, -3060);
  // low berm between the yard and the pans, three gaps
  for (const [a, b] of [[-4800, -4240], [-3820, -2960], [-2520, -1600]]) K.wall(-4040, a, -4000, b, 72, 'concrete_plain');

  // =========================================================== Salt Pans
  G.push([-4000, -4800, -800, -1600, 'salt']);
  // three shallow pans (16 below the berms), walkways between them
  for (const [x0, z0, x1, z1] of [[-3880, -4680, -2560, -3420], [-2400, -4680, -960, -3420], [-3880, -3260, -1700, -1760]]) G.push([x0, z0, x1, z1, 'salt', -16]);
  for (const [x, z, r, h] of [[-3300, -4000, 200, 150], [-1700, -4150, 260, 190], [-1300, -3900, 140, 100], [-2600, -2500, 230, 170], [-3400, -2200, 180, 130]]) K.heap(x, z, r, h, 'salt', r * 0.28, -16);
  // pump stations on the walkways, stacked sacks, a pipe bridge across the pans
  K.block(-2560, -3420, -2400, -3260, 120, 'panel', 'steel'); K.block(-1700, -1760, -1540, -1600, 120, 'panel', 'steel');
  for (const [x, z] of [[-3040, -3340], [-1180, -3340], [-2000, -1680]]) K.sandbags(x - 90, z - 40, x + 90, z + 40, 44);
  K.catwalk(-3900, -3380, -980, -3300, 176, { rails: ['n', 's'], posts: true });
  for (const [x, z] of [[-3600, -3340], [-2200, -3340]]) K.stairs(x, -3300, x + 64, -3020, 0, 176, 'n', 'diamond', 'steel');
  for (let x = -3800; x <= -1100; x += 900) K.pole(x, -1690, 220);
  plate(-3996, 120, -3600, -4000, 170, -3480, 'w', 'sign_salt');

  // =========================================================== Brine House (north mid) and Brine Lane
  {
    const B = bld(-800, -4800, 1200, -2800, {
      h: 200, floors: 2, wall: 'brick', inner: 'concrete', roof: 'shed_roof', floor: 'concrete_floor', upperFloor: 'diamond', parapet: 24,
      doors: [{ side: 'w', at: -4200, w: 128, h: 144 }, { side: 'w', at: -3300, w: 96 }, { side: 's', at: 0, w: 160, h: 160 }, { side: 'e', at: -4200, w: 128, h: 144 }, { side: 'e', at: -3600, w: 96 }],
      windows: [{ side: 's', at: -500, w: 96 }, { side: 's', at: 500, w: 96 }, { side: 's', at: 800, w: 96, level: 1 }, { side: 'n', at: 200, w: 160, level: 1 },
        { side: 'w', at: -3800, w: 96, level: 1 }, { side: 'e', at: -3800, w: 96, level: 1 }],
      stairs: { x0: -760, z0: -3240, x1: -600, z1: -2860, up: 'n' },
      lamps: [[-300, -4300], [700, -4300], [-300, -3300], [700, -3300], [200, -3800, 1]], lampCol: lampW,
    });
    // brine tanks and pipework inside
    for (const [x, z] of [[-300, -4400], [300, -4400], [-300, -3900]]) K.tank(x, z, 120, 180, 'steel');
    K.block(500, -4000, 900, -3700, 96, 'steel', 'steel'); K.crates(800, -3200, 3, 31);
  }
  G.push([-800, -2800, 1200, -1400, 'concrete_floor'], [-300, -2800, 300, -1400, 'asphalt']);
  K.block(-800, -2600, -360, -1600, 260, 'plaster_warm', 'roof'); K.block(360, -2700, 1200, -1900, 300, 'brick', 'roof');
  for (const z of [-2400, -2000]) K.win(-360, 120, z - 60, -358, 180, z + 60, 'e');
  K.truck(-60, -2200, Math.PI * 0.5 + 0.05);
  K.pole(-240, -2500); K.pole(240, -1650);

  // =========================================================== Rail Cut (sunken track to Platform 2)
  G.push([1200, -4800, 2800, -3400, 'ballast', -64]);
  K.rails(1200, 2800, -4300, -64); K.rails(1200, 2800, -3800, -64);
  K.stairs(1200, -4264, 1400, -4136, -64, 0, 'w'); K.stairs(1200, -3648, 1400, -3552, -64, 0, 'w');      // up into the Brine House
  M.box(2780, -64, -3880, 2800, -24, -3720, 'paint_orange');                                             // buffer stop
  K.wagon(1500, -3800, 520, 'wagon_blue', -64);
  K.block(1200, -3400, 2000, -2800, 280, 'shed', 'shed_roof');                 // rail sheds on the bank
  K.stairs(2080, -3680, 2240, -3400, -64, 0, 's');                             // steps up from the cut
  K.lamp(1600, 120, -4100, lampW, 0.9, 420, 0); K.lamp(2400, 120, -3600, lampW, 0.9, 420, 0);
  plate(1196, 100, -4200, 1200, 150, -4060, 'e', 'sign_culvert');

  // =========================================================== Platform 2 (A)
  G.push([2800, -4800, 4800, -2200, 'concrete_floor'], [2800, -4500, 4800, -4100, 'ballast'], [2800, -3000, 4800, -2600, 'ballast']);
  G.push([2800, -4800, 3600, -4000, 'ballast', -64]);                          // the cut rises here
  M.ramp(3200, -4800, 3600, -4000, -64, 0, 'e', { top: 'ballast', sides: 'concrete' });
  K.rails(3600, 4800, -4300, 0); K.rails(2800, 4800, -2800, 0); K.rails(2800, 3200, -4300, -64);
  // the platform: raised 40 between the tracks, steps and a ramp at its ends, a canopy on posts
  M.box(3000, 0, -3900, 4600, 40, -3300, { top: 'concrete_floor', sides: 'concrete', bottom: null });
  K.stairs(2860, -3800, 3000, -3400, 0, 40, 'e'); M.ramp(4600, -3900, 4800, -3300, 0, 40, 'w', { top: 'concrete_floor', sides: 'concrete' });
  M.box(3000, 40, -3910, 4600, 44, -3890, 'hazard', K.ND); M.box(3000, 40, -3310, 4600, 44, -3290, 'hazard', K.ND);
  for (let x = 3100; x <= 4500; x += 350) { M.prism(x, -3600, 40, 236, 7, 8, 'steel'); }
  M.box(2980, 236, -3800, 4620, 248, -3400, { top: 'roof', bottom: 'steel', sides: 'steel' });
  for (const x of [3300, 4300]) K.lamp(x, 228, -3600, lampW, 1.0, 460, 0);
  K.wagon(3640, -4300, 520, 'wagon'); K.wagon(4220, -4300, 520, 'wagon_blue'); K.wagon(3500, -2800, 520, 'wagon');
  // the track up the ramp out of the cut: sleepers on the slope, the rails tilted with it
  for (let x = 3220; x < 3600; x += 40) { const y = -64 + (x - 3200) * 0.16; M.box(x - 8, y - 1, -4346, x + 8, y + 3, -4254, { top: 'timber', sides: 'timber' }, Object.assign({ lm: 32 }, K.ND)); }
  for (const s of [-1, 1]) K.tiltBox(3400, -25, -4300 + s * 30, 202, 3, 2, 0, 0, Math.atan2(64, 400), 'steel', Object.assign({ lm: 32 }, K.ND));
  K.building(4160, -3200, 4460, -2900, { y: 4, h: 140, wall: 'panel', inner: 'plywood', roof: 'roof', floor: 'wood_floor', doors: [{ side: 'w', at: -3050 }], windows: [{ side: 'n', at: 4310, w: 96 }], lamps: [[4310, -3050]], lampK: 0.7, lampR: 220 });
  K.crates(4500, -2450, 3, 41); K.barrels(3080, -2400, 3, 42); K.sandbags(3700, -3280, 3900, -3220, 44);
  plate(3600, 180, -3796, 3800, 220, -3792, 's', 'sign_platform'); plate(3600, 120, -2204, 3700, 220, -2200, 's', 'site_a');
  K.pole(3000, -2300); K.pole(4700, -2300);
  // fence along the service road, gate at the platform end
  K.fence('z', -4800, -3900, 4800, 140); K.fence('z', -3300, -2200, 4800, 140);

  // =========================================================== Street (mid) and the blocks either side
  G.push([-5000, -400, -1200, 400, 'asphalt'], [-5000, -400, -1200, -320, 'concrete_floor'], [-5000, 320, -1200, 400, 'concrete_floor']);
  // north side: warehouses, with the Salt Co. office walk-through to the pans
  K.block(-5000, -1600, -4200, -400, 340, 'brick', 'roof'); K.block(-4200, -1600, -3400, -400, 300, 'plaster_warm', 'roof');
  K.block(-2600, -1600, -1900, -400, 320, 'brick', 'roof'); K.block(-1900, -1600, -1200, -400, 280, 'plaster', 'roof');
  bld(-3400, -1600, -2600, -400, { h: 176, floors: 2, wall: 'plaster_warm', inner: 'plaster', roof: 'roof', floor: 'tiles', upperFloor: 'wood_floor',
    doors: [{ side: 's', at: -3000, door: 'door' }, { side: 'n', at: -2800 }],
    windows: [{ side: 's', at: -3250 }, { side: 's', at: -2750 }, { side: 's', at: -3250, level: 1 }, { side: 's', at: -2750, level: 1 }, { side: 'n', at: -3200, level: 1 }],
    stairs: { x0: -3380, z0: -1580, x1: -3220, z1: -1240, up: 'n' }, lamps: [[-3000, -1000], [-3000, -1000, 1]], lampCol: lampW });
  for (const x of [-4600, -3800, -2250, -1550]) K.win(x - 60, 150, -400, x + 60, 220, -398, 's');
  // south side: the canteen walk-through toward the sheds
  K.block(-5000, 400, -3800, 1600, 300, 'plaster', 'roof'); K.block(-3000, 400, -2200, 1600, 340, 'brick', 'roof'); K.block(-2200, 400, -1200, 1400, 280, 'plaster_warm', 'roof');
  bld(-3800, 400, -3000, 1400, { h: 192, wall: 'brick', inner: 'tiles', roof: 'roof', floor: 'tiles',
    doors: [{ side: 'n', at: -3400, w: 96, door: 'door' }, { side: 's', at: -3200 }], windows: [{ side: 'n', at: -3650 }, { side: 'n', at: -3150 }, { side: 's', at: -3600 }],
    lamps: [[-3400, 700], [-3400, 1100]], lampCol: lampW });
  K.block(-3600, 600, -3500, 1000, 40, 'plywood', 'plywood'); K.block(-3300, 600, -3200, 1000, 40, 'plywood', 'plywood');
  for (const x of [-4500, -2600, -1700]) K.win(x - 60, 150, 398, x + 60, 220, 400, 'n');
  // street furniture: lorries, a kiosk, barriers
  K.truck(-4300, -160, Math.PI / 2 - 0.1); K.truck(-2300, 180, -Math.PI / 2 + 0.15, 'container');
  K.block(-1600, -260, -1440, -100, 120, 'panel', 'roof'); K.barrier(-3700, 120, -3500, 160); K.barrier(-1900, -200, -1860, 20);
  for (let x = -4800; x <= -1400; x += 850) { K.pole(x, -360, 230); K.pole(x + 420, 360, 230); }

  // =========================================================== Plaza
  G.push([-1200, -1400, 1200, 1400, 'cobble'], [-300, -1400, 300, -1200, 'asphalt']);
  K.block(-180, -180, 180, 180, 260, 'plaster', 'concrete_plain');                       // salt monument
  M.box(-240, 0, -240, 240, 24, 240, { top: 'concrete_plain', sides: 'concrete_plain', bottom: null });
  for (const [x, z] of [[-800, -900], [800, -900], [-800, 900], [800, 900]]) { M.box(x - 120, 0, z - 40, x + 120, 64, z + 40, { top: 'sand', sides: 'brick', bottom: null }); K.pole(x, z + 80, 240); }
  for (const [x, z, w] of [[-500, 500, 'x'], [500, -500, 'x'], [600, 400, 'z']]) M.box(x - (w === 'x' ? 80 : 20), 0, z - (w === 'x' ? 20 : 80), x + (w === 'x' ? 80 : 20), 20, z + (w === 'x' ? 20 : 80), 'timber');
  K.sandbags(-1000, -300, -900, 300, 44); K.crates(900, -200, 3, 51); K.truck(400, 1100, 0.2, 'container');
  plate(-184, 120, -60, -180, 200, 60, 'w', 'sign_salt');

  // =========================================================== Weighbridge Office and the Stores block
  bld(1200, -1800, 2000, -1000, { h: 176, floors: 2, wall: 'panel', inner: 'plywood', roof: 'roof', floor: 'wood_floor', upperFloor: 'wood_floor',
    doors: [{ side: 'w', at: -1400, door: 'door' }, { side: 'e', at: -1600 }, { side: 'n', at: 1450, level: 0 }],
    windows: [{ side: 'e', at: -1250, w: 96 }, { side: 'e', at: -1250, w: 128, level: 1 }, { side: 'e', at: -1600, w: 96, level: 1 }, { side: 'n', at: 1700, w: 128, level: 1 },
      { side: 's', at: 1600, w: 96 }, { side: 'w', at: -1650, level: 1 }],
    stairs: { x0: 1220, z0: -1220, x1: 1380, z1: -1020, up: 'n' }, lamps: [[1600, -1400], [1600, -1400, 1]], lampCol: lampW });
  K.block(1440, -1200, 1720, -1120, 40, 'plywood', 'plywood');
  K.block(1200, -1000, 2000, 700, 320, 'brick', 'roof');
  plate(1196, 220, -400, 1200, 280, -200, 'w', 'sign_weigh');

  // =========================================================== Scales Yard and the gate north to A
  G.push([2000, -2800, 3400, -600, 'asphalt'], [2300, -1700, 2900, -1500, 'diamond']);
  M.box(2300, 0, -1700, 2900, 4, -1500, { top: 'diamond', sides: 'steel', bottom: null });
  K.truck(2600, -1050, Math.PI / 2, 'container_blue'); K.truck(3100, -2000, 0.1);
  K.building(2100, -2500, 2400, -2200, { y: 4, h: 140, wall: 'panel', inner: 'plywood', roof: 'roof', floor: 'wood_floor', doors: [{ side: 's', at: 2250 }], windows: [{ side: 'e', at: -2350 }], lamps: [[2250, -2350]], lampK: 0.6, lampR: 200 });
  K.crates(3200, -800, 4, 61); K.barrels(2150, -800, 4, 62); K.sandbags(2700, -2700, 2900, -2640, 44);
  K.fence('z', -2200, -1500, 3400, 140); K.fence('z', -1000, -600, 3400, 140);
  K.pole(2400, -2100); K.pole(3000, -800);

  // =========================================================== Car Park and the Depot Office
  G.push([3400, -2200, 5000, 1600, 'asphalt']);
  for (let x = 3500; x < 4900; x += 160) { M.box(x, 0, -1500, x + 6, 0.4, -1260, 'concrete_plain', K.ND); M.box(x, 0, 1260, x + 6, 0.4, 1500, 'concrete_plain', K.ND); }
  bld(3700, -500, 4500, 500, { h: 176, floors: 2, wall: 'brick', inner: 'plaster', roof: 'roof', floor: 'tiles', upperFloor: 'wood_floor', parapet: 24,
    doors: [{ side: 'w', at: 0, door: 'door' }, { side: 'e', at: 0 }, { side: 'n', at: 4300 }],
    windows: [{ side: 'w', at: -300 }, { side: 'w', at: 300 }, { side: 'w', at: -300, level: 1 }, { side: 'w', at: 300, level: 1 }, { side: 'n', at: 3950, level: 1 }, { side: 's', at: 4100, level: 1 }, { side: 's', at: 3900 }],
    stairs: { x0: 3720, z0: 300, x1: 3880, z1: 480, up: 's' }, lamps: [[4100, -200], [4100, 200, 1]], lampCol: lampW });
  for (const [x, z, a] of [[3600, -1100, 0], [4400, -1150, 0.1], [3650, 1150, Math.PI], [4600, 1000, -0.2], [4800, -300, Math.PI / 2]]) K.truck(x, z, a, ['container', 'container_blue'][(x / 200) & 1]);
  K.crates(3500, 800, 3, 71); K.barrels(4800, 600, 4, 72);
  K.pole(3600, -1700); K.pole(4800, -1700); K.pole(3600, 1500); K.pole(4800, 1500);
  plate(3696, 120, -100, 3700, 170, 100, 'w', 'sign_depot');

  // =========================================================== Back Alley, Lorry Park, Loading Bay
  G.push([1200, 700, 2000, 1300, 'asphalt'], [1600, 1300, 2000, 1800, 'asphalt'], [2000, 700, 3400, 1800, 'asphalt'], [1800, 1800, 2600, 3000, 'concrete_floor']);
  K.block(1200, 1300, 1600, 2400, 300, 'plaster', 'roof'); K.block(1200, 2400, 1800, 3600, 280, 'brick', 'roof');
  for (const z of [1500, 2000]) K.win(1600, 130, z - 60, 1602, 190, z + 60, 'e');
  K.truck(2600, 1100, Math.PI / 2 + 0.1); K.truck(3000, 1500, -Math.PI / 2, 'container_blue'); K.container(2200, 900, 'x', 'container', 0, 240);
  K.crates(1400, 1000, 3, 81); K.barrels(1700, 1650, 3, 82);
  // loading dock along Shed 4's west wall
  M.box(2400, 0, 1900, 2600, 48, 3000, { top: 'concrete_floor', sides: 'concrete', bottom: null });
  K.stairs(2240, 2100, 2400, 2260, 0, 48, 'e'); M.ramp(2400, 3000, 2600, 3300, 0, 48, 'n', { top: 'concrete_floor', sides: 'concrete' });
  M.box(2400, 48, 1900, 2410, 52, 3000, 'hazard', K.ND);
  K.truck(2100, 2600, Math.PI / 2, 'container'); K.crates(2000, 2000, 4, 83);
  K.pole(1800, 1000); K.pole(2200, 2900);

  // =========================================================== Shed 4 (B)
  {
    const S = bld(2600, 1800, 4600, 4600, { h: 360, wall: 'shed', inner: 'concrete', roof: 'shed_roof', floor: 'concrete_floor', ceiling: 'steel',
      doors: [{ side: 'w', at: 2350, w: 192, h: 176, level: 0 }, { side: 'w', at: 4300, w: 128, h: 144 }, { side: 'n', at: 3000, w: 128, h: 144 }, { side: 'n', at: 4200, w: 96 },
        { side: 'e', at: 2600, w: 160, h: 176 }, { side: 'e', at: 3900, w: 160, h: 176 }],
      windows: [{ side: 's', at: 3200, w: 192, y0: 220, y1: 300 }, { side: 's', at: 4000, w: 192, y0: 220, y1: 300 }],
      lamps: [[3100, 2500], [4100, 2500], [3100, 3700], [4100, 3700]], lampCol: lampC, lampK: 1.4, lampR: 640 });
    // the dock door sits 48 up (at the dock)
    K.container(2900, 2300, 'x', 'container', 0, 320); K.container(2900, 2300, 'x', 'container_blue', 104, 320);
    K.container(3700, 2900, 'z', 'container_blue', 0, 320); K.container(3200, 3600, 'x', 'container', 0, 240);
    K.container(4100, 3300, 'z', 'container', 0, 240); K.container(4100, 3300, 'z', 'container', 104, 240);
    K.crates(3200, 2900, 4, 91); K.crates(4300, 4200, 3, 92); K.barrels(2800, 4300, 5, 93); K.pallet(3500, 2200); K.pallet(3600, 4300, 0, 0.3);
    // foreman's office in the north-east corner with a catwalk over it and stairs
    K.building(4140, 1816, 4584, 2200, { y: 4, h: 128, wall: 'panel', inner: 'plywood', roof: 'steel', floor: 'wood_floor', doors: [{ side: 's', at: 4300 }], windows: [{ side: 'w', at: 2000, w: 96 }, { side: 's', at: 4480 }], lamps: [[4360, 2000]], lampK: 0.7, lampR: 220 });
    K.catwalk(2616, 1816, 4100, 1960, 176, {}); K.railing('x', 2616, 3900, 1958, 176);    // open where the stairs come up
    K.stairs(3900, 1960, 4100, 2280, 0, 176, 'n', 'diamond', 'steel');
    plate(2604, 200, 3200, 2600, 280, 3360, 'w', 'sign_shed4'); plate(3400, 160, 4588, 3560, 260, 4584, 'n', 'site_b');
  }

  // =========================================================== Sluice Yard (south-west)
  G.push([-6400, 1032, -4000, 4800, 'concrete_floor'], [-5000, 1032, -4000, 1600, 'sand']);
  for (const [z0, z1] of [[2160, 2400], [3560, 3800]]) G.push([-6400, z0, -4400, z1, 'concrete', -64]);
  for (const [x, z0] of [[-5600, 2160], [-4600, 3560]]) M.box(x - 80, -8, z0 - 8, x + 80, 0, z0 + 248, { top: 'diamond', sides: 'steel', bottom: 'steel' });   // footbridges
  for (const [x, z0] of [[-5600, 2160], [-4600, 3560]]) { K.railing('z', z0, z0 + 240, x - 76, 0); K.railing('z', z0, z0 + 240, x + 76, 0); }
  for (const z0 of [2160, 3560]) K.stairs(-4600, z0, -4400, z0 + 240, -64, 0, 'e');
  for (const [x, z] of [[-6100, 2280], [-5100, 3680], [-4800, 2280]]) K.block(x - 60, z - 140, x + 60, z + 140, 120, 'steel', 'steel', -64);   // sluice gates
  K.tank(-6000, 4200, 200, 260, 'steel'); K.tank(-5400, 4300, 150, 200, 'paint_white');
  K.crates(-5200, 1500, 3, 101); K.barrels(-6200, 3000, 5, 102); K.container(-5800, 2800, 'x', 'container_blue', 0, 240); K.sandbags(-4800, 2700, -4600, 2780, 44);
  K.pole(-5400, 1600); K.pole(-5400, 3200); K.pole(-4500, 4400);

  // =========================================================== Pump House
  bld(-4000, 2400, -2800, 3800, { h: 220, wall: 'brick', inner: 'concrete', roof: 'roof', floor: 'concrete_floor', parapet: 24,
    doors: [{ side: 'w', at: 3000, w: 128, h: 144 }, { side: 'e', at: 2900, w: 96 }, { side: 'e', at: 3500, w: 96 }, { side: 'n', at: -3400 }],
    windows: [{ side: 'n', at: -3700, y0: 120, y1: 190 }, { side: 'n', at: -3100, y0: 120, y1: 190 }, { side: 's', at: -3400, w: 128, y0: 120, y1: 190 }],
    lamps: [[-3400, 2800], [-3400, 3400]], lampCol: lampW });
  for (const [x, z] of [[-3600, 2900], [-3200, 3300]]) { M.prism(x, z, 0, 140, 90, 12, { side: 'steel', top: 'steel' }); M.box(x - 140, 0, z - 30, x - 90, 60, z + 30, 'steel'); }
  K.catwalk(-3984, 3500, -3600, 3784, 112, { rails: ['n'] }); K.stairs(-3600, 3560, -3480, 3780, 0, 112, 'w', 'diamond', 'steel');

  // =========================================================== Evaporator Sheds
  G.push([-2800, 1600, -400, 4800, 'dirt']);
  for (const [z0, z1] of [[1700, 2200], [2600, 3100], [3500, 4000]]) {
    bld(-2600, z0, -700, z1, { h: 200, wall: 'shed', inner: 'shed', roof: 'shed_roof', floor: 'concrete_floor',
      doors: [{ side: 'w', at: (z0 + z1) / 2, w: 160, h: 160 }, { side: 'e', at: (z0 + z1) / 2, w: 160, h: 160 }, { side: z0 === 2600 ? 'n' : 's', at: -1650, w: 128 }],
      windows: [{ side: 'n', at: -2200, w: 160, y0: 130, y1: 180 }, { side: 's', at: -1100, w: 160, y0: 130, y1: 180 }], lamps: [[-2100, (z0 + z1) / 2], [-1200, (z0 + z1) / 2]], lampCol: lampC, lampK: 1.0 });
    for (const x of [-2300, -1800, -1300, -900]) M.box(x - 40, 0, z0 + 100, x + 40, 48, z1 - 100, { top: 'salt', sides: 'steel', bottom: null });   // evaporator trays
  }
  K.crates(-2700, 2400, 3, 111); K.barrels(-600, 2400, 4, 112); K.crates(-650, 3300, 3, 113); K.truck(-1700, 4400, Math.PI / 2 - 0.1, 'container');
  for (const x of [-2400, -1300]) { K.pole(x, 2400, 220); K.pole(x + 400, 3300, 220); }

  // =========================================================== Culvert (to Shed 4), covered
  G.push([-1000, 4100, -400, 4500, 'concrete', -112]);
  G.push([-400, 4100, 2600, 4500, 'concrete_floor', -112]);
  M.ramp(-1000, 4100, -400, 4500, -112, 0, 'w', { top: 'concrete_floor', sides: 'concrete' });
  M.ramp(2200, 4100, 2600, 4500, -112, 0, 'e', { top: 'concrete_floor', sides: 'concrete' });
  M.box(-400, 0, 4060, 2200, 16, 4540, { top: 'concrete', bottom: 'concrete', sides: 'concrete' });
  for (let x = -100; x <= 1900; x += 500) K.lamp(x, -16, 4300, lampC, 1.0, 380, 0);
  M.box(-380, -60, 4104, 2180, -52, 4112, 'steel', { lm: 32 });
  plate(-404, -60, 4200, -400, 0, 4400, 'w', 'sign_culvert');
  // the outfall lane above it
  G.push([-2800, 4000, -1000, 4800, 'dirt'], [-1000, 4540, 2600, 4800, 'dirt'], [1800, 3000, 2600, 4100, 'concrete_floor']);
  K.crates(1000, 4650, 3, 121); K.barrels(2000, 3400, 4, 122); K.container(1900, 3600, 'z', 'container', 0, 240);

  // =========================================================== Service Road, Warden Yard, garages
  G.push([5000, -4800, 5400, 4800, 'asphalt'], [5400, -1200, 6400, 1200, 'asphalt']);
  for (let z = -4700; z < 4700; z += 160) M.box(5196, 0, z, 5204, 0.4, z + 80, 'concrete_plain', Object.assign({ lm: 32 }, K.ND));
  K.block(5400, -4800, 6400, -1200, 380, 'brick', 'roof'); K.block(5400, 1200, 6400, 4800, 360, 'shed', 'shed_roof');
  for (const z of [-4200, -3200, -2200]) K.win(5398, 160, z - 100, 5400, 240, z + 100, 'w');
  for (const z of [2000, 3000, 4000]) K.win(5398, 160, z - 100, 5400, 240, z + 100, 'w');
  K.wall(5000, -1260, 5032, -1200, 200, 'brick'); K.wall(5000, 1200, 5032, 1260, 200, 'brick');
  K.fence('z', -2200, -1600, 5000, 140); K.fence('z', 1600, 2200, 5000, 140);
  K.truck(6100, -700, Math.PI); K.truck(6100, 750, Math.PI, 'container_blue'); K.crates(5600, -900, 3, 131); K.barrels(5600, 860, 4, 132);
  for (const z of [-3600, -1800, 0, 1800, 3600]) K.pole(5380, z, 240);
  // a screen of stacked containers in the Warden Yard: mid can't see the spawn down the Lorry Park
  K.container(5500, -700, 'z', 'container_blue', 0, 700); K.container(5500, 0, 'z', 'container', 0, 700);
  K.container(5500, -660, 'z', 'container', 104, 620); K.container(5500, 40, 'z', 'container_blue', 104, 620);
  plate(5404, 160, -100, 5408, 210, 60, 'e', 'sign_depot');

  K.ground(G, 'concrete', 0);

  // =========================================================== spawns, sites, places
  for (let i = 0; i < 8; i++) M.teamSpawn(0, -5900 + (i % 2) * 220, 0, -540 + Math.floor(i / 2) * 360, -Math.PI / 2);
  for (let i = 0; i < 8; i++) M.teamSpawn(1, 6000 - (i % 2) * 220, 0, -540 + Math.floor(i / 2) * 360, Math.PI / 2);
  M.spawn(-5800, 0, -400, -Math.PI / 2);
  M.site('A', 2900, -4600, 4700, -2500, -80, 260);
  M.site('B', 2700, 1900, 4500, 4500, -16, 300);
  for (const [x, y, z, n] of [[3800, 40, -3600, 'Platform 2'], [3500, 0, -2800, 'south track'], [4300, 0, -4300, 'north track'], [4310, 0, -3050, 'signal hut'],
    [2000, -64, -4000, 'rail cut'], [200, 0, -3800, 'Brine House'], [200, 200, -3800, 'Brine House upstairs'], [-2400, -16, -3800, 'Salt Pans'], [0, 0, -2100, 'Brine Lane'],
    [-5200, 0, -3000, 'North Yard'], [-3000, 0, 0, 'Street'], [-3000, 0, -1000, 'Salt Co. office'], [-3400, 0, 900, 'canteen'], [0, 0, 0, 'Plaza'],
    [1600, 0, -1400, 'Weighbridge Office'], [1600, 176, -1400, 'office upstairs'], [2700, 0, -1500, 'Scales Yard'], [4100, 0, 0, 'Depot Office'], [4200, 0, -1000, 'Car Park'],
    [1600, 0, 1000, 'Back Alley'], [2700, 0, 1200, 'Lorry Park'], [2200, 48, 2400, 'Loading Bay'], [3600, 0, 3200, 'Shed 4'], [4360, 0, 2000, 'foreman’s office'],
    [3300, 176, 1890, 'Shed 4 catwalk'], [800, -112, 4300, 'culvert'], [-1600, 0, 2900, 'Evaporator Sheds'], [-3400, 0, 3100, 'Pump House'], [-5200, 0, 3000, 'Sluice Yard'],
    [5200, 0, -3000, 'service road north'], [5200, 0, 3000, 'service road south'], [5900, 0, 0, 'Warden Yard'], [-5700, 0, 0, 'West Yard']]) M.hotspot(x, y, z, n);
  for (const [n, x0, z0, x1, z1] of [['West Yard', -6400, -1000, -5000, 1000], ['North Yard', -6400, -4800, -4000, -1000], ['Salt Pans', -4000, -4800, -800, -1600],
    ['Brine House', -800, -4800, 1200, -2800], ['Brine Lane', -800, -2800, 1200, -1400], ['Rail Cut', 1200, -4800, 2800, -3400], ['Platform 2', 2800, -4800, 4800, -2200],
    ['Rail Sheds', 1200, -3400, 2000, -2800], ['Scales Yard', 2000, -2800, 3400, -600], ['Weighbridge Office', 1200, -1800, 2000, -1000], ['Street', -5000, -1600, -1200, 1600],
    ['Plaza', -1200, -1400, 1200, 1400], ['Car Park', 3400, -2200, 5000, 1600], ['Back Alley', 1200, 700, 2000, 1800], ['Lorry Park', 2000, 700, 3400, 1800],
    ['Loading Bay', 1800, 1800, 2600, 3000], ['Shed 4', 2600, 1800, 4600, 4600], ['Culvert', -1000, 4060, 2600, 4540], ['Evaporator Sheds', -2800, 1600, -400, 4800],
    ['Pump House', -4000, 1600, -2800, 4800], ['Sluice Yard', -6400, 1000, -4000, 4800], ['Outfall', -400, 3000, 2600, 4800], ['Service Road', 5000, -4800, 5400, 4800],
    ['Warden Yard', 5400, -1200, 6400, 1200]]) M.area(n, x0, z0, x1, z1);

  // main-menu fly-through: over Platform 2, down the street to the plaza, inside Shed 4
  M.menuShots = [
    { from: [2700, 420, -2300], to: [3400, 400, -2200], look: [3900, 60, -3700], lookTo: [4200, 60, -3600] },
    { from: [-3600, 180, -60], to: [-2400, 200, -40], look: [0, 120, 0] },
    { from: [2800, 300, 2300], to: [3300, 280, 2200], look: [3900, 40, 3600], lookTo: [4200, 40, 3500] },
  ];

  // =========================================================== bot tactics
  M.tactics = {
    routes: {
      pans: { stack: [-5700, 0, -1500], yaw: Math.PI, via: [-2000, 0, -3340] },
      scales: { stack: [-4600, 0, 0], yaw: -Math.PI / 2, via: [2700, 0, -1800] },
      alley: { stack: [-4600, 0, 0], yaw: -Math.PI / 2, via: [1800, 0, 1000] },
      culvert: { stack: [-5700, 0, 1500], yaw: 0, via: [800, -112, 4300] },
    },
    siteRoutes: { A: ['scales', 'pans'], B: ['alley', 'culvert'] },
    mid: [-1200, -1400, 1200, 1400],
    sites: {
      A: { hold: [[4350, 0, -2820, 135], [3200, 40, -3500, 120], [4500, 40, -3600, 90], [3100, 0, -2400, 160], [4100, 0, -4600, 70], [3800, 0, -2700, 100], [4650, 0, -2400, 120], [3100, -64, -4100, 60]],
        plant: [[3600, 40, -3600], [4000, 0, -2700], [3400, -32, -4500]], smoke: [[3000, 0, -2500], [3300, -64, -4100]] },
      B: { hold: [[4300, 0, 2400, 80], [3000, 0, 2700, 100], [4400, 0, 3800, 60], [3400, 176, 1890, 150], [2900, 0, 4420, 30], [3900, 0, 4400, 40], [4450, 0, 2950, 90], [3500, 0, 2100, 120]],
        plant: [[3400, 0, 3200], [4300, 0, 3900], [3000, 0, 2600]], smoke: [[2700, 0, 2350], [2700, 0, 4300]] },
    },
  };
  return M;
}
