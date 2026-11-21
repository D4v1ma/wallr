# Short Fuse — Stage 4: Rounds, Money & the Charge

An original round-based tactical shooter prototype, built in stages. Stage 1 laid the
foundation (movement, the lightmapped test range, doors, plates). Stage 2 added the weapon
set, spray patterns, viewmodels and effects. Stage 3 added two factions with skinned models,
hitboxes and bots. Stage 4 turns it into a game: **defuse rounds** with an economy, a buy
menu, three new guns, weapon drops, and the charge that Raiders plant at site A or B while
Wardens defend and defuse. Bots buy, push sites together, plant, retake and defuse.
Everything is original: procedural canvas textures, synthesized WebAudio sound, brush
geometry, models and code. three.js r128 is the only dependency, loaded from cdnjs.

## Run it

Open `index.html` in a desktop browser. It needs internet access for three.js (cdnjs) and
the two UI fonts (Google Fonts, optional). Click **Play** to capture the mouse, **Esc** for
the menu (a defuse match pauses while the menu is open). The first load spends about 2 s
generating textures, baking lighting and mapping bot routes.

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

Touch devices get an on-screen stick, look pad and buttons (including SWAP and BUY).

## A round

1. **Buy time (10 s):** everyone stands at spawn. Press **B** and buy with **1–9**. You can
   keep buying for 20 s into the round if you stay within 520 units of your spawn.
2. **The round (1:55):** Raiders carry the charge to **site A** (the range by the backstop) or
   **site B** (the container yard; the container roof counts). Orange "A"/"B" plates and
   painted corners mark them. Hold Mouse 1 with the charge (slot 5) for 3.2 s to plant.
3. **Planted:** the clock turns into a pulsing CHARGE. The fuse burns 40 s and beeps faster
   as it runs down. Wardens hold **E** on it to defuse: 10 s, or 5 s with a defuse kit.
   Letting go resets the progress.
4. **Round over:** a team wins by eliminating the other side, by the charge exploding
   (Raiders), by defusing it (Wardens), or when time runs out without a plant (Wardens).
   Five seconds later the next round starts: survivors keep their gear, the dead come back
   with a pistol and knife.

A match is **first to 16** (30 rounds, sides swap after 15) or **first to 9** in the short
format (16 rounds, swap after 8). Your squad keeps its score across the swap; money resets to
$800. If it ends 15–15 it's a draw. A new match starts 25 s after the last one ends.

When you die you can't respawn until the next round: the camera follows a living teammate
(Mouse 1 switches). The Match tab in the menu sets the mode (Defuse or Skirmish), match
length, difficulty, your team, friendly fire and the bot roster. Changing any of these
restarts the match.

## Money

| | |
| --- | --- |
| Start / cap | $800 / $16,000 |
| Round win | elimination $3,250 · the charge explodes $3,500 · defused $3,500 · time $3,250 |
| Round loss | $1,400, +$500 for each loss in a row up to $3,400 |
| Raiders who planted | +$800 on top of the loss money; Raiders still alive when time runs out get no loss money |
| Planting / defusing | +$300 to the player who did it |
| Kill rewards | knife $1,500 · Bison 12 $900 · Swift SMG $600 · Kestrel AR / Wasp 9 $300 · Osprey LR $100 · teammate −$300 |

| Buy menu | Price | |
| --- | --- | --- |
| 1 Wasp 9 | $200 | everyone starts with one |
| 2 Swift SMG | $1,250 | 800 RPM, 30 rounds, light recoil, accurate on the move |
| 3 Bison 12 | $1,100 | pump shotgun, 9 pellets, shell-by-shell reload |
| 4 Kestrel AR | $2,700 | the rifle |
| 5 Osprey LR | $4,750 | bolt-action, two zoom levels, one chest shot kills |
| 6 Vest | $650 | 100 armor |
| 7 Vest + helmet | $1,000 | $350 for just the helmet if your vest is full |
| 8 Veil smoke | $300 | one at a time |
| 9 Defuse kit | $400 | Wardens only; halves the defuse time |

Buying a primary while you hold one drops the old one at your feet. The dead drop their best
gun (and the charge). Walk over a weapon to take it into an empty slot, or look at it and press
**E** to swap. Only Raiders can pick up the charge.

## The weapons

| | Kestrel AR | Swift SMG | Bison 12 | Osprey LR | Wasp 9 | Field knife |
| --- | --- | --- | --- | --- | --- | --- |
| Fire | auto 600 RPM | auto 800 RPM | pump, 68 RPM | bolt, 41 RPM | semi, 400 RPM | slash / stab |
| Magazine | 30 + 90 | 30 + 120 | 8 + 32 shells | 10 + 30 | 15 + 45 | — |
| Damage | 33 | 26 | 9 × 26 | 115 | 35 | 25 / 65 |
| Armor penetration | 77.5% | 60% | 50% | 97.5% | 55% | 85% |
| Range falloff (per 500u) | x0.98 | x0.84 | x0.70 | x0.99 | x0.85 | — |
| Move speed | 225 | 240 | 220 | 200 (100 scoped) | 240 | 250 |

**Osprey LR:** unscoped it is wildly inaccurate (85 mrad); scoped and standing it is precise
(1.2 mrad). Moving ruins it either way. The scope drops while the bolt cycles and comes back.
**Bison 12:** firing during a reload stops it after the current shell; reloading from empty
ends with a pump.

## The bots

- **Buying:** pistol rounds buy armor or a smoke; then a rifle once they have $3,350, now and
  then the sniper at $6,200 (one per team), a force buy (SMG or shotgun) after losses,
  helmets, kits for Wardens, smokes.
- **Raiders** pick a site each round. They gather beside the hall exits (out of sight),
  then push together: one in three flanks through the other door, smokes are thrown to cover
  the approach, the carrier plants and the rest guard the charge facing outward. If the
  carrier dies, the nearest Raider fetches the charge.
- **Wardens** split between A and B on posts facing the approach. After a plant they
  converge on it; the closest defuses while the rest cover. A defuser short on time keeps
  defusing even under fire.
- Everything from Stage 3 still applies: vision cones, walls and smoke block sight, hearing,
  reaction times, recoil control, three difficulties.

## What to try

- **Play a few rounds as a Warden** (the default): hold a site, listen for the push, retake
  and defuse after a plant. Buy a kit when you can afford it.
- **Switch to the Raiders** (Match tab): carry the charge (orange CHARGE tag by your money),
  plant at A or B, then guard it until it blows.
- **Economy:** lose a couple of rounds and watch the loss bonus climb; save a round, then
  full-buy. Pick up a rifle a dead enemy dropped.
- **New guns:** shotgun close up (one pump to the chest kills an unarmored player), the
  sniper's two zoom levels and the bolt cycle, the SMG on the move.
- **Short match:** Match tab → Short (first to 9) to see halftime and the match result
  sooner.
- **Skirmish** (Match tab → Mode) brings back Stage 3's respawning practice with the range
  stats.

## Project layout

```
index.html            single-file build (open this)
dist/artifact.html    same page without the <html> wrapper (for hosted embeds)
build.mjs             zero-dependency build: concatenates src/NN-*.js into one inline script
src/head.html, body.html   page shell, HUD and menu markup, CSS tokens
src/01-util.js        math, seeded noise, settings persistence
src/02-pix.js         float RGB pixel buffer + canvas stamping helpers
src/03-tex-world.js   tiling 256px world textures
src/04-tex-props.js   props, signs, site plates, atlases, weapon skins, team hands, registry
src/05-collision.js   convex brushes with bevel planes, BVH, box sweeps, rays
src/06-level.js       map DSL + compiler (faces, UVs, lightmap atlas, spawns, hotspots, sites)
src/07-map.js         the Hall B range: team spawns, plant sites A and B, the mid container
src/08-bake.js        lightmap + light-probe baker
src/09-render.js      world shader, skybox cubemap, viewmodel pass, FOV/aspect modes, scope zoom
src/10-fx.js          decals, particles, dynamic lights, tracers, casings, smoke, blood, the blast
src/11-audio.js       WebAudio synthesis (every gun, pumps and bolts, the charge, round cues)
src/12-input.js       keyboard / pointer lock / free cursor / wheel / touch
src/13-player.js      movement physics (shared by you and bots)
src/14-weapons.js     weapon definitions, spray patterns, guns/knife/grenade/charge, loadout
src/15-ballistics.js  bullets and pellets with penetration, knife traces, range plates
src/16-grenades.js    grenade physics, smoke clouds, smoke line-of-sight test
src/17-vm-models.js   viewmodel geometry: six guns, knife, smoke grenade, the charge, hands
src/18-viewmodel.js   keyframed clips (pumps, bolts, shell loading, planting) + procedural motion
src/19-entities.js    hinged doors (dynamic collision against every player) and plates
src/20-models.js      faction textures, skinned player models, procedural animation, hitboxes
src/21-nav.js         waypoint graph builder, walkability tests, A*
src/22-actors.js      players and bots: spawn, damage, death, money, sides, hit resolution
src/23-bots.js        bot perception, aiming, combat, navigation, orders, planting, defusing
src/24-items.js       weapons on the ground: drops, physics, pickups and swaps
src/25-bomb.js        the charge: sites, carrier, planting, fuse, defusing, the blast
src/26-match.js       defuse rounds, economy, buying, halftime, match end
src/27-tactics.js     bot team play: buying, site plans, stacking, smokes, retakes
src/28-hud.js         HUD (money, clock, banners, progress, scoreboard), buy menu, pause menu
src/29-main.js        boot, 64 Hz fixed tick with interpolated rendering, spectator camera
tools/                headless checks and screenshot harnesses (see below)
```

## Build and test

```bash
node build.mjs
```

Headless logic checks (Node only; the last three need the three.js UMD build for bone math):

```bash
node tools/node-move-check.mjs
```

```bash
node tools/node-weapon-check.mjs
```

```bash
node tools/node-nav-check.mjs path/to/three.js
```

```bash
node tools/node-bot-check.mjs path/to/three.js
```

```bash
node tools/node-match-check.mjs path/to/three.js 8
```

Browser checks need Playwright and a local copy of three.js r128 (the same file cdnjs
serves, e.g. from `npm pack three@0.128.0`, `package/build/three.min.js`):

```bash
node tools/gameplay4-check.mjs path/to/three.min.js shots
```

```bash
node tools/gameplay3-check.mjs path/to/three.min.js shots
```

```bash
node tools/gameplay2-check.mjs path/to/three.min.js shots
```

```bash
node tools/gameplay-check.mjs path/to/three.min.js shots
```

- `node-weapon-check`: fire rates, spray patterns, pellets, pumps, shell-by-shell reloads and
  interrupts, scope levels and the bolt cycle, buying/replacing/dropping in the loadout, grenades.
- `node-match-check`: start money, buy rules and prices, buy zone and buy time, freeze time,
  kill rewards, round money and loss streaks, planting (only in a site, only while live),
  defusing with and without a kit, the blast, running out the clock, halftime swap, match end,
  bots planting on their own, and a full bots-only 5v5 (the number is how many rounds).
- `gameplay4-check`: in the browser: dropping and picking up guns, the buy menu, freeze time,
  the round clock, planting and the planted HUD, the explosion, defusing, spectating,
  the scoreboard, Skirmish mode, frame cost with 10 players.
- `node-move-check`, `node-nav-check`, `node-bot-check`, `gameplay3/2-check`, `gameplay-check`:
  the Stage 1–3 suites (the browser ones run in Skirmish mode).
- `stage4-shots`, `stage4-vm-shots`, `stage3-shots`, `stage2-shots`, `browser-check`: screenshots.

## Tuning knobs

- Rounds and money: `MATCH`, `MATCH_LEN` and `SHOP` in `src/26-match.js`.
- The charge: `BOMB` in `src/25-bomb.js`; sites at the end of `src/07-map.js`.
- Bot team play: `SITE_SPOTS`, `ROUTES`, `STACKS`, `PUSH_BY` in `src/27-tactics.js`; skill in `src/23-bots.js`.
- Weapons: `WEAPONS` and the pattern tables in `src/14-weapons.js`; `MAT_PEN` in `src/15-ballistics.js`.
- Damage: `GROUP_MUL` in `src/22-actors.js`. Movement: `PM` in `src/13-player.js`.

## Against the CS 1.6 graphics bar

| Requirement | Status |
| --- | --- |
| Textures, baked lighting, skybox | Stage 1; new orange site plates and painted corner marks |
| Viewmodels with idle/fire/reload | Six guns, knife, smoke, the charge. New: SMG mag swap with charging handle; shotgun pump after each shot and shell-by-shell loading with a shell in hand; bolt cycle with the hand on the bolt; keypad tapping while planting |
| Scoped view | Two zoom levels, black lens mask with a reticle, viewmodel hidden, sensitivity scaled to the zoom |
| Effects | Red shotgun hulls ejected on the pump, brass on the bolt; the blast: white-hot core, textured fire puffs, sparks, a lingering smoke column, screen shake, a big light |
| Player models | Raider 768 / Warden 848 triangles; new held weapons and the charge worn on the back |
| HUD | Money with gain/spend deltas, buy-zone tag, round clock (amber in buy time, red under 10 s, pulsing CHARGE once planted), alive pips per team, round banners, progress bars, buy menu, scoreboard with money and round history |
| 60+ FPS | 10 players in a live round: ~85 draw calls, ~14k triangles; one 64 Hz simulation tick costs ~0.16 ms and per-frame prep ~0.5 ms, so about 0.7 ms of game JavaScript per 60 FPS frame. GPU frame rate isn't measured here (this container renders in software) |

## Known limitations

- The Hall B range is still a test map (the real two-site map and the radar are Stage 5).
  Bot-only results swing a lot between matches on this map: 8–2 for the defenders in one
  10-round sample, 6–2 for the attackers in an 8-round one.
- Bots don't use cover deliberately or call out positions; they throw smokes only on a push.
- The blast ignores walls (as in the classic games, being behind cover near it is not enough).
- Ragdolls are a scripted fall, not physics. Lighting is baked once at load.
