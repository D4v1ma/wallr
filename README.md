# Short Fuse — Stage 5: Saltpan Depot

An original round-based tactical shooter for the browser, built in five stages: movement and
shooting (1), weapons, viewmodels and effects (2), player models and bots (3), rounds, money and
the charge (4), and now (5) **Saltpan Depot**, an original two-site defuse map, with a
rotating **radar**, location names, weapon icons and HUD polish.
Everything is original: procedural canvas textures, synthesized WebAudio sound, brush
geometry, models and code. three.js r128 is the only dependency, loaded from cdnjs.

## Run it

Open `index.html` in a desktop browser. It needs internet access for three.js (cdnjs) and the
two UI fonts (Google Fonts, optional). Click **Play** to capture the mouse, **Esc** for the
menu (a defuse match pauses while the menu is open). Loading takes a few seconds: textures are
generated, the lighting is baked and bot routes are mapped. `index.html?map=range` opens the
Hall B practice range instead; the Match tab in the menu switches maps too.

| Action | Keys |
| --- | --- |
| Move / jump / crouch / walk | W A S D / Space / C (Ctrl in fullscreen) / Shift |
| Fire, slash, throw overhand, plant (hold, in a site) | Mouse 1 |
| Scope zoom (Osprey LR), stab, lob underhand | Mouse 2 |
| Reload / inspect | R / F |
| Primary, pistol, knife, smoke, the charge | 1, 2, 3, 4, 5 |
| Last weapon / cycle | Q / mouse wheel |
| Buy menu (buy time, near your spawn), then buy | B, then 1–9 |
| Drop the weapon in hand | G |
| Door, pick up or swap a weapon / defuse (hold) | E |
| Scoreboard (hold) | Tab |
| Noclip fly / debug readout / hints | V / F1 or ` / H |

Touch devices get an on-screen stick, look pad and buttons (JUMP, DUCK, RELOAD, USE, SWAP, BUY,
FIRE). The keyboard hints fade after 30 s of play (H brings them back).

## Saltpan Depot

A salt works' rail depot. Raiders spawn in the **West Yard**, Wardens in the **Warden Yard**
east of the service road, between the two sites.

- **A — Platform 2.** A station platform with two freight wagons on the track, a canopy and a
  signal hut you can go into. Entrances: the sunken **Rail Cut** from the North Yard (you arrive
  at track level and climb the steps or hop up), the **Scales gate** from the Scales Yard, and
  the service road (Wardens).
- **B — Shed 4.** A warehouse with two containers, crates, steel pillars, skylights and a
  foreman's office. Entrances: the dark **Culvert** from the Sluice Yard (steps up into the
  shed), the west door from the **Back Alley**, and the loading bay (Wardens).
- **Mid.** The **Street** leads to the **Plaza**. On its north side the two-floor
  **Weighbridge** office has an upper window over the Scales Yard and the A gate. A
  side passage leads to the Scales Yard, and the Back Alley leads to Shed 4.

Measured with the navigation graph at 250 u/s: every Raider route reaches its site in 13–15 s
(rail cut 12.7 s, office 13.7 s, alley 13.8 s, culvert 14.9 s). Wardens reach A in 4.6 s and
B in 7.8 s, and rotate between the sites in about 10 s. Neither spawn can see the other, and
nobody in mid can see the Raider spawn.

## The radar and HUD

- **Radar** (top left): an overview of the map drawn from the level itself, rotating so you
  always face up. It shows teammates with their facing, enemies only while you or a teammate can
  see them, the A/B letters, the charge's carrier (orange ring), the dropped charge (Raiders)
  and the planted charge (everyone, blinking). Dead, it follows whoever you spectate.
- **Location** under the radar: Platform 2, Rail Cut, Weighbridge, Plaza, Shed 4, Culvert…
- **Weapon icons**: silhouettes of the actual weapon models in the kill feed, the weapon list
  and the buy menu.
- Low health (25 or less) pulses red. Everything from Stage 4 is still there: money with
  +/−, round clock (amber in buy time, red under 10 s, pulsing CHARGE once planted),
  players-alive markers per team, banners, plant/defuse bars, buy menu, scoreboard with money
  and round history.

## A round

1. **Buy time (10 s):** everyone stands at spawn. Press **B** and buy with **1–9**. You can
   keep buying for 20 s into the round if you stay within 520 units of your spawn.
2. **The round (1:55):** Raiders carry the charge to A or B and plant it by holding Mouse 1
   with the charge (slot 5) for 3.2 s.
3. **Planted:** the fuse burns 40 s and beeps faster as it runs down. Wardens hold **E** on it
   to defuse: 10 s, or 5 s with a defuse kit. Letting go resets the progress.
4. **Round over:** elimination, the charge exploding (Raiders), defusing it (Wardens), or time
   running out without a plant (Wardens). Survivors keep their gear; the dead come back with a
   pistol and knife.

A match is **first to 16** (sides swap after 15) or **first to 9** (short). Your squad keeps
its score across the swap; money resets to $800. A new match starts 25 s after the last one.

## Money and buying

| | |
| --- | --- |
| Start / cap | $800 / $16,000 |
| Round win | elimination $3,250 · the charge explodes $3,500 · defused $3,500 · time $3,250 |
| Round loss | $1,400, +$500 for each loss in a row up to $3,400 |
| Raiders who planted | +$800 on top of the loss money; Raiders still alive when time runs out get no loss money |
| Planting / defusing | +$300 to the player who did it |
| Kill rewards | knife $1,500 · Bison 12 $900 · Swift SMG $600 · Kestrel AR / Wasp 9 $300 · Osprey LR $100 · teammate −$300 |

Buy menu: 1 Wasp 9 $200 · 2 Swift SMG $1,250 · 3 Bison 12 $1,100 · 4 Kestrel AR $2,700 ·
5 Osprey LR $4,750 · 6 Vest $650 · 7 Vest + helmet $1,000 ($350 for just the helmet) ·
8 Veil smoke $300 · 9 Defuse kit $400 (Wardens). The dead drop their best gun and the charge;
walk over a weapon to take it into an empty slot, or look at it and press E to swap.

## The weapons

| | Kestrel AR | Swift SMG | Bison 12 | Osprey LR | Wasp 9 | Field knife |
| --- | --- | --- | --- | --- | --- | --- |
| Fire | auto 600 RPM | auto 800 RPM | pump, 68 RPM | bolt, 41 RPM | semi, 400 RPM | slash / stab |
| Magazine | 30 + 90 | 30 + 120 | 8 + 32 shells | 10 + 30 | 15 + 45 | — |
| Damage | 33 | 26 | 9 × 26 | 115 | 35 | 25 / 65 |
| Armor penetration | 77.5% | 60% | 50% | 97.5% | 55% | 85% |
| Move speed | 225 | 240 | 220 | 200 (100 scoped) | 240 | 250 |

Spray patterns, center-weighted spread, movement inaccuracy, wall penetration by material,
hitboxes with head ×4 / stomach ×1.25 / legs ×0.75, armor and helmets: see Stages 2–4.

## The bots

They buy by economy (armor or smoke on pistol rounds, rifles from $3,350, the sniper now and
then, force buys after losses, kits for Wardens). Each round the Raiders pick a site and its
two routes from the map's tactical data. They gather out of sight beside the spawn exits,
push together (one in three flanks by the other route) with smokes, plant, then guard the
charge. Wardens split between A and B on posts facing the approaches, converge after a plant
and defuse. Vision cones, walls and smoke block sight, they hear gunfire and running, and
there are three difficulty levels.

## Project layout

```
index.html            single-file build (open this)
dist/artifact.html    same page without the <html> wrapper (for hosted embeds)
build.mjs             zero-dependency build: concatenates src/NN-*.js into one inline script
src/head.html, body.html   page shell, HUD and menu markup, CSS tokens
src/01-util.js        math, seeded noise, settings persistence
src/02-pix.js         float RGB pixel buffer + canvas stamping helpers
src/03-tex-world.js   tiling 256px world textures (now with asphalt and rail ballast)
src/04-tex-props.js   props, signs, site plates, wagons, windows, weapon skins, registry
src/05-collision.js   convex brushes with bevel planes, BVH, box sweeps, rays
src/06-level.js       map DSL + compiler (faces, UVs, lightmap atlas, spawns, sites, areas)
src/07-map-depot.js   Saltpan Depot: geometry, lights, spawns, sites, places, bot tactics
src/07-map.js         the Hall B practice range, and the map registry
src/08-bake.js        lightmap + light-probe baker (per-map texel size, probe step, ray count)
src/09-render.js      world shader, skybox cubemap, viewmodel pass, FOV/aspect modes, scope zoom
src/10-fx.js          decals, particles, dynamic lights, tracers, casings, smoke, blood, the blast
src/11-audio.js       WebAudio synthesis (every gun, pumps and bolts, the charge, round cues)
src/12-input.js       keyboard / pointer lock / free cursor / wheel / touch
src/13-player.js      movement physics (shared by you and bots)
src/14-weapons.js     weapon definitions, spray patterns, guns/knife/grenade/charge, loadout
src/15-ballistics.js  bullets and pellets with penetration, knife traces, range plates
src/16-grenades.js    grenade physics, smoke clouds, smoke line-of-sight test
src/17-vm-models.js   viewmodel geometry: six guns, knife, smoke grenade, the charge, hands
src/18-viewmodel.js   keyframed clips + procedural motion
src/19-entities.js    hinged doors and knock-down plates
src/20-models.js      faction textures, skinned player models, procedural animation, hitboxes
src/21-nav.js         waypoint graph builder, walkability tests, A*
src/22-actors.js      players and bots: spawn, damage, death, money, sides, hit resolution
src/23-bots.js        bot perception, aiming, combat, navigation, orders, planting, defusing
src/24-items.js       weapons on the ground: drops, physics, pickups and swaps
src/25-bomb.js        the charge: sites, carrier, planting, fuse, defusing, the blast
src/26-match.js       defuse rounds, economy, buying, halftime, match end
src/27-tactics.js     bot team play from the map's tactical data
src/28-radar.js       radar overview + rotating radar, spotting, weapon silhouette icons
src/29-hud.js         HUD, buy menu, pause menu
src/30-main.js        boot, 64 Hz fixed tick with interpolated rendering, spectator camera
docs/ENGINE_AND_NETCODE.md   the path to Godot/Unity and to multiplayer
tools/                headless checks and screenshot harnesses (see below)
```

## Build and test

```bash
node build.mjs
```

Headless checks (Node only; those taking a path need the three.js UMD build for bone math):

```bash
node tools/node-move-check.mjs
```

```bash
node tools/node-weapon-check.mjs
```

```bash
node tools/node-bake-check.mjs depot
```

```bash
node tools/node-nav-check.mjs path/to/three.js
```

```bash
node tools/node-bot-check.mjs path/to/three.js
```

```bash
node tools/node-match-check.mjs path/to/three.js 6
```

```bash
node tools/node-depot-check.mjs path/to/three.js 8
```

Browser checks need Playwright and a local copy of three.js r128 (the file cdnjs serves, e.g.
from `npm pack three@0.128.0`, `package/build/three.min.js`):

```bash
node tools/gameplay5-check.mjs path/to/three.min.js shots
```

```bash
node tools/gameplay4-check.mjs path/to/three.min.js shots
```

```bash
node tools/stage5-shots.mjs path/to/three.min.js shots
```

- `node-depot-check`: the navigation graph covers every place and tactical spot from both
  spawns; route timings; no spawn-to-spawn or mid-to-Raider-spawn sightlines; a bot walks every
  route and the Warden rotation with the real movement code; bots play full rounds (plants
  happen).
- `gameplay5-check`: the depot loads by default, the radar draws, the location name follows
  you, enemies appear on the radar only when seen, kill feed icons, planting on Platform 2,
  switching maps reloads into Hall B, frame cost with 10 players.
- `node-match-check`, `gameplay4-check`: Stage 4 rules (run on Hall B, as do the Stage 1–3
  suites `gameplay3/2-check`, `gameplay-check`, `node-nav-check`, `node-bot-check`).
- `stage5-shots`: a camera tour of every area of the depot; `stage4/3/2-shots`, `browser-check`:
  earlier screenshot harnesses.

## Against the CS 1.6 graphics bar

| Requirement | Status |
| --- | --- |
| Textured world, tiling procedural textures | Brick, plaster, concrete, corrugated sheds, asphalt with aggregate and cracks, rail ballast, timber sleepers, tiles, wood floors, freight wagon sides with stencilled marks, windows, signs (Saltpan Depot, Weighbridge, Platform 2, Shed 4, Culvert, Salt Store) |
| Baked lighting + skybox | Low afternoon sun with long shadows, sky and one bounce; lamps in the office, shed, hut, culvert and on street poles; sunlight through Shed 4's skylights. 160k lightmap texels baked in ~3.5 s at load |
| One original map with two sites | Saltpan Depot, above; Hall B kept as a practice range |
| Player models, viewmodels, effects | Stages 2–4 (unchanged) |
| HUD: health, armor, ammo, money, timer, killfeed, radar | All present; radar and location names new in Stage 5, weapon icons in the kill feed |
| 60+ FPS | 10 players on the depot: ~65 draw calls, ~15k triangles; about 1.3 ms of game JavaScript per 60 FPS frame (one 64 Hz tick ≈ 0.45 ms, frame prep ≈ 0.8 ms). GPU frame rate isn't measured here (this container renders in software) |

## Known limitations

- In bot-only rounds on the depot the charge gets planted every round, but Wardens then win
  most retakes (5 and 6 of 8 in two samples): attackers guard the planted charge loosely.
- Bots don't use cover deliberately; no fall damage; ragdolls are scripted falls.
- Lighting is baked at load; a map change reloads the page.

## Next

See [docs/ENGINE_AND_NETCODE.md](docs/ENGINE_AND_NETCODE.md) for the path to Godot or Unity and
to multiplayer with server authority, client prediction and lag compensation.
