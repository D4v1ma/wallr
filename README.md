# wallr — Stage 7: wallbangs

An original round-based tactical shooter for the browser where **wallbanging** is the point:
load a wallbang round and your next shot goes through every wall in its way. Built in stages:
movement and shooting (1), weapons, viewmodels and effects (2), player models and bots (3),
rounds, money and the charge (4), the first map and the radar (5), menus, progression, the shop,
ranks, two more maps and accounts (6), and now (7) the rename to **wallr**, **wallbang rounds**,
**scoping in**, an **admin passcode**, and **bots that only know what they see and hear**.
Everything is original: procedural canvas textures, synthesized WebAudio sound, brush
geometry, models and code. three.js r128 is the only dependency, loaded from cdnjs.

## Wallbang rounds

- Press **X** to load a wallbang round (the touch layout has a WALL button). Your **next gun
  shot** goes straight through every wall, door and crate in its way, at full damage (only the
  normal range falloff), and hits the first enemy on the line. Every wall it crosses gets entry
  and exit marks, and the shot leaves a bright streak along its whole path. With the Bison 12
  every pellet pierces. Press X again to take the round out unused.
- **3 per round** each. They **unlock 10 seconds after the round goes live** (after the buy
  time), or 10 s after spawning in skirmish. The panel above your weapon name shows the
  rounds left as diamonds and the state: *unlocks in 7 s*, *X to load*, *ARMED*, *none left
  this round*. The crosshair turns orange with a ring while a round is loaded.
- Kills with a wallbang round get a **WB** mark in the kill feed.
- Bots use them too, fairly: right after losing sight of someone, a bot sometimes fires one
  through the cover where it **last saw** them (never through walls at someone it hasn't seen).
  Normal bots do it about 30% of the time, Hard 50%, Expert 70%, Easy never.
- The numbers live in `WALLBANG` in `src/22-wallbang.js` (`perRound`, `unlock`).

## Scoping in

Hold **Mouse 2** with any gun except the Osprey LR (which keeps its own scope): the view zooms a
little (about 18%), the gun comes up to the sights, the crosshair fades, and you are **a little
more accurate** (22% less inaccuracy, 15% less base spread) but move 20% slower. Reloading drops
you out of it. Red dot and holo sights line up with the screen centre.

## Admin

Settings → **Admin**: enter the admin passcode to make the signed-in account an admin (a guest
stays admin until reload). An admin has:

- **noclip**: V flies through walls (noclip is no longer available to everyone);
- **unlimited wallbang rounds** with no 10 s wait;
- **unlimited money** (buying costs nothing; the HUD shows ∞);
- **enemies visible through walls**: orange or blue silhouettes wherever a wall hides them, and
  every enemy on the radar.

Admin powers can be switched off or removed in the same place, and the HUD tag says ADMIN while
they are on. **Matches played with admin powers on don't change XP, points, rank or match
history.** Only hashes of the passcode are in the code; to change it, run
`node tools/admin-hash.mjs "new passcode"` and paste the two hashes into `ADMIN_HASHES` in
`src/26-admin.js`. It's a game setting rather than security: everything runs in the browser.

## Run it

Open `index.html` in a desktop browser. It needs internet access for three.js (cdnjs) and the
two UI fonts (Google Fonts, optional). Loading takes a few seconds: textures are generated, the
lighting is baked and bot routes are mapped. The first time, you create an **account** (a
callsign and an optional PIN) or play as a guest; after that the game opens on your account, or
asks who's playing if there are several. Then the **main menu**, over a slow fly-through of the
last map you played: **Play** → Create Game → loadout → **Start match**.
**Esc** pauses a match. `index.html?map=kiln` (or `frost`, `depot`, `range`) picks the map shown
first.

| Action | Keys |
| --- | --- |
| Move / jump / crouch / walk | W A S D / Space / C (Ctrl in fullscreen) / Shift |
| Fire, slash, throw overhand, plant (hold, in a site) | Mouse 1 |
| Scope in (hold), Osprey LR scope zoom, stab, lob underhand | Mouse 2 |
| Load or unload a wallbang round | X |
| Reload / inspect | R / F |
| Primary, pistol, knife, smoke, the charge | 1, 2, 3, 4, 5 |
| Last weapon / cycle | Q / mouse wheel |
| Buy menu (buy time, near your spawn), then buy | B, then 1–9 |
| Drop the weapon in hand | G |
| Door, pick up or swap a weapon / defuse (hold) | E |
| Scoreboard (hold) | Tab |
| Pause menu | Esc |
| Noclip fly (admins) / debug readout / hints | V / F1 or ` / H |

Touch devices get an on-screen stick, look pad and buttons (JUMP, DUCK, RELOAD, USE, SWAP, BUY,
WALL, FIRE); the menus fit a phone held sideways.

## The front end

- **Main menu:** Play, Loadout, Shop, Career, Settings, Controls, Fullscreen. A profile card
  shows your rank emblem, Elo, level, XP bar and points.
- **Create Game:** pick the map (cards with overviews), **Defuse** or **Skirmish**,
  **Casual** or **Ranked**, the **bot difficulty** (Easy 750, Normal 1050, Hard 1350, Expert
  1650 rating), match length (first to 9 or 16), your side (Wardens, Raiders or random), bot
  teammates (0–4) and opponents (1–5), friendly fire. Ranked fixes 5v5 with friendly fire off.
  The summary shows roughly what a win and a loss would do to your Elo.
- **Loadout for this match:** the next step. For each gun in the buy menu (Wasp 9, Swift SMG,
  Bison 12, Kestrel AR, Osprey LR) choose a muzzle, optic, magazine, grip/stock and camo from
  what you own, with a turning 3D preview and stat bars showing the change. **Start match**
  builds the map in place if it differs (no page reload) and shows **Deploy**.
- **In the match:** guns you buy come with your attachments and camo (bots carry stock guns).
  **Esc** opens the pause menu: Resume, Settings, Controls, Leave match.
- **Results:** victory, defeat or draw, your stats, the XP breakdown with the level bar and any
  level-ups, and the Elo change line by line. Then Play again, Shop or Main menu.
- **Career:** rank and Elo (and peak), level, lifetime stats (win rate, K/D, damage per round,
  headshot %, plants, defuses), the last 15 matches and the rank ladder.

## Levels, points and the shop

XP comes from every match: 100 per elimination, 30 per headshot, 0.5 per point of damage, 60 per
round won, 80 per plant, 120 per defuse, 600 for a win (300 for a draw) and 400 for finishing.
Bot difficulty multiplies it (Easy ×0.8 … Expert ×1.5) and ranked adds ×1.25. Skirmish pays
practice XP (40 per elimination, 0.2 per damage). Level 2 needs 800 XP and each level 150 more.
**Every level-up pays shop points** (160 at level 2, +10 per level, +500 every tenth level); a
new profile starts with 600.

The **shop** sells attachments per gun and camos for every gun:

| Slot | Attachments (what they do) |
| --- | --- |
| Muzzle | **Hush Can** suppressor: enemies hear you a third as far, almost no flash, −6% damage · **Ridge Brake**: −18% climb, −15% kick, louder and brighter · **Full Choke** (Bison): −28% pellet spread |
| Optic | **Pip Reflex**: −15% standing inaccuracy · **Halo Holo**: −10% standing and moving inaccuracy · **Fieldglass 4×** (Osprey): wider scope, faster scoped movement, less magnification |
| Magazine | **Long Mag** / Long Tube: +33% rounds (+2 shells), slower reload · **Quick Mag** / Side Saddle: −22% reload time, fewer rounds · **Hollow Points**: +10% damage, less armor and wall penetration |
| Grip / stock | **Vertical Grip**: −30% sideways recoil · **Laser Module**: −20% inaccuracy on the move · **Skeleton Stock**: +10 speed, faster draw, more recoil · **Stippled Grip** (Wasp 9): −12% recoil |

Prices run 180–500 points (base 250–450; pistol ×0.7, SMG and shotgun ×0.9, sniper ×1.1). Attachments show
on the viewmodel (suppressor, brake, choke, sights with lit reticles, longer magazines, pull
loops, side saddle, grip, laser) and reload and draw animations speed up or slow down with
them. Twelve procedural camos (Fieldworks, Dune Drift, Gridlock, Nightfall, Hoarfrost, Ember
Stripe, Crimson Web, Hexcore, Carbon Weave, Cobalt Anodize, Signal Flare, Gilded Scroll; 150–1,500
points) are box-projected over the whole gun.

## Rank and Elo

Every defuse match moves your rating:

- **Result:** Elo-style against the bots' rating (difficulty, plus 40 per extra opponent).
  Ranked uses K = 32, casual K = 8, so a ranked win is worth about four times a casual one.
- **Performance:** +0.9 per elimination, +0.15 per headshot, ±0.12 per point of damage per round
  above or below 75, −0.6 per death, +0.5 per plant and +1 per defuse. Favourites gain less and
  lose more (scaled by the expected score). Ranked counts it fully (capped at ±24), casual a
  quarter (±6).
- **Placements:** the first 3 ranked matches count double; your rank shows after them.
- **Leaving** a ranked match that has started counts as a loss. Short matches count 70%.
  Skirmish never changes Elo.

Ranks: Spark I–III (from 0, 700, 800), Flint I–III (900–1100), Fuse I–III (1200–1400),
Charge I–III (1500–1700), Blast I–III (1800–2000), Shockwave (2200) and Wallbreaker (2400). A new
profile starts at 1000.

## Accounts and saving

Accounts live on the device, in this browser's storage; there is no server and nothing leaves
the device.

- **Create an account:** a callsign (2–16 characters, unique on this device) and an optional
  PIN of 4–8 digits. You play under your callsign in the scoreboard and kill feed.
- **Who's playing?** With several accounts the game opens on a picker (level, rank, points,
  last played). An account without a PIN signs straight back in next time; one with a PIN asks
  for it. **Switch** on the home card returns to the picker.
- **Account settings:** rename, add, change or remove the PIN (the current PIN is needed),
  sign out, or delete the account and its progress (type the callsign, and the PIN if set).
- **Guests** can play everything but nothing is saved; the home card and the results screen
  offer to turn the session into an account, keeping what it earned.
- **When progress saves:** when a match **finishes** (before the results screen) and when you
  **exit** it: Leave match in the pause menu, or closing or reloading the page mid-match (saved
  as you leave, with what you had earned; a ranked match that had started counts as a loss, as
  with Leave match). Each round also leaves a small checkpoint on the device, so if the page is
  killed before it can save (a phone closing the tab), the match is recorded the next time that
  account signs in, and a note on the home screen says so. A match is never counted twice.
  Purchases and loadout changes save immediately. The home card, career and results screens
  show when the account was last saved.
- **What's stored** (the keys keep their pre-rename `shortfuse.` prefix so existing saves carry
  over): `shortfuse.accounts.v1` (the accounts and who played last; PINs only as
  salted SHA-256 hashes), and per account `shortfuse.profile.v1.<id>` (XP, points, purchases,
  loadout, Elo, stats, recent matches) and, during a match, `shortfuse.pending.v1.<id>`.
  Progress from before accounts existed moves into the first account created on the device.
- **Limits:** the PIN stops other people using this browser from playing as you; it is not
  encryption (anyone with the browser's developer tools can read the data). Clearing the site's
  data deletes the accounts, and a private window or blocked site storage means everything is
  played as a guest (the home screen says so).

## The maps

All three defuse maps have two plant sites, four Raider routes and tactical data for the bots;
Hall B stays as a practice range.

**Saltpan Depot** (Stage 5): a salt works' rail depot. A is Platform 2 (freight wagons, canopy,
signal hut), B is Shed 4 (containers, foreman's office); mid is the street, plaza and the
two-floor weighbridge office.

**Kilnworks** (new): a brick-and-tile works on a clay quarry, low warm sun. Raiders come up from
the quarry gate (south), Wardens hold the office court (north).
- **A — Kiln Yard:** a big kiln with a firing arch and a tall chimney, a round updraught kiln,
  brick stacks. In through the gate from the **Clay Pits** (west lane) or **Kiln Alley** off mid.
- **B — Press Hall:** two hydraulic presses you can see under, a conveyor, a raised control
  booth reached by a ramp, skylights. In through the roller door from the **Rail Siding** (east
  lane, a parked wagon) or the **Conveyor Room** off mid.
- **Mid — Clay Court:** split by the pug-mill house, drying racks, closed to the north by the
  works office. A weighbridge office screens the Raider spawn from the court.

**Frostline** (new): a mountain radar station in snow under a grey sky. Raiders come in from
the drop zone (west), Wardens from Barracks Row (east).
- **A — Hangar 2:** indoor, a parked survey plane (fuselage, wings, tail), tool chests; in
  through the big hangar door from the **Fuel Depot** (north lane: tanks, a pipe rack, a
  bowser) or the south door from the **Radio Path**.
- **B — Dish Array:** an outdoor platform raised 96 units with two dishes on pedestals (walk
  under the bowls) and a control hut; up the long ramp from the **Ice Cut** (south lane) or the
  stairs from the **Generator Path**; Wardens use the east stairs.
- **Mid — the Pass:** between two rock ridges into the **comms block**, whose loop corridor
  feeds the Radio and Generator paths. A wall of supply containers keeps the Pass from seeing
  the Raider spawn.

Measured with the navigation graph at 250 u/s:

| | Raider routes to the site | Wardens to A / B | A↔B rotation |
| --- | --- | --- | --- |
| Saltpan Depot | 11.3–13.2 s | 4.6 / 5.0 s | 10.4 s |
| Kilnworks | 11.3–12.3 s | 4.9 / 4.6 s | 10.8 s |
| Frostline | 11.1–15.0 s | 5.0 / 4.8 s | 12.1 s |

On every map neither spawn can see the other and nobody in mid can see a spawn point. In 16
bot-only rounds the charge was planted 16 times on Kilnworks (8 A, 8 B) and 15 times on
Frostline (8 A, 7 B).

## The radar and HUD

- **Radar** (top left): an overview of the map drawn from the level itself, rotating so you
  always face up. It shows teammates with their facing, enemies only while you or a teammate can
  see them, the A/B letters, the charge's carrier (orange ring), the dropped charge (Raiders)
  and the planted charge (everyone, blinking). Dead, it follows whoever you spectate.
- **Location** under the radar: Platform 2, Kiln Yard, Press Hall, Hangar 2, Dish Array, the Pass…
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
two routes from the map's tactical data, gather out of sight, push together (one in three flanks)
with smokes, plant, then guard the charge. Wardens split between A and B on posts facing the
approaches, converge after a plant and defuse.

**What a bot knows** (Stage 7 rework: before, bots heard every footstep and shot at its exact
spot, knew exactly who had shot them, and kept seeing their current target in every
direction):

- **Sight:** only inside its view cone (100–126° depending on difficulty) with a clear line
  (walls, doors and smoke block it). Someone straight ahead and close is noticed almost at once;
  someone at the edge of view, far away, crouched and still takes a second or more; muzzle flash
  and running make you easier to spot. The reaction delay then runs before the first shot.
- **Hearing:** gunfire (suppressed shots carry a third as far) and running footsteps (walking is
  silent) give a **rough** position, off by more the farther away it is, and sounds through
  walls carry half as far and are vaguer still. A bot turns toward close sounds and goes to check.
- **Getting shot:** only the rough direction it came from, not where you are.
- **Teammates:** a bot that spots you calls it out; teammates hear about where you were about a
  second later.
- **Memory:** after losing sight it heads to where it last saw you, and gives up after a while.

Four difficulty levels (Easy, Normal, Hard, Expert) set reaction time, aim error, turn speed,
recoil control, headshot chance, view cone, how fast they notice you, and how often they use
wallbang rounds.

## Project layout

```
index.html            single-file build (open this)
dist/artifact.html    same page without the <html> wrapper (for hosted embeds)
build.mjs             zero-dependency build: concatenates src/NN-*.js into one inline script
src/head.html, body.html   page shell, HUD and menu screens, CSS tokens
src/01-util.js        math, seeded noise, settings persistence
src/02-pix.js         float RGB pixel buffer + canvas stamping helpers
src/03-tex-world.js   tiling 256px world textures
src/04-tex-maps.js    Kilnworks/Frostline textures: sooty firebrick, yellow brick, clay, snow, granite
src/04-tex-props.js   props, signs, site plates, wagons, windows, weapon skins, the texture registry
src/05-collision.js   convex brushes with bevel planes, BVH, box sweeps, rays
src/06-level.js       map DSL + compiler (faces, UVs, lightmap atlas, spawns, sites, areas, menu shots)
src/07-map-depot.js   Saltpan Depot
src/07-map-frost.js   Frostline
src/07-map-kiln.js    Kilnworks
src/07-map.js         the Hall B practice range, and the map registry
src/08-bake.js        lightmap + light-probe baker (per-map texel size, probe step, ray count)
src/09-render.js      world shader, per-map sky, viewmodel pass, FOV/aspect modes, scope zoom, map swap
src/10-fx.js          decals, particles, dynamic lights, tracers, casings, smoke, blood, the blast
src/11-audio.js       WebAudio synthesis (every gun, suppressed shots, the charge, round cues)
src/12-input.js       keyboard / pointer lock / free cursor / wheel / touch
src/13-player.js      movement physics (shared by you and bots)
src/14-weapons.js     weapon definitions, spray patterns, guns/knife/grenade/charge, loadout
src/15-arsenal.js     attachments (stat changes), camo painters, the player's modified weapon defs
src/15-ballistics.js  bullets and pellets with penetration, wallbang rays through every wall, knife traces
src/16-grenades.js    grenade physics, smoke clouds, smoke line-of-sight test
src/17-vm-models.js   viewmodel geometry: guns, knife, smoke, the charge, hands, attachment meshes
src/18-viewmodel.js   keyframed clips + procedural motion, per-gun materials, camo UVs, kits
src/19-entities.js    hinged doors and knock-down plates
src/20-models.js      faction textures, skinned player models, procedural animation, hitboxes
src/21-nav.js         waypoint graph builder, walkability tests, A*
src/22-actors.js      players and bots: spawn, damage (and damage dealt), death, money, sides
src/22-wallbang.js    wallbang rounds: the count per round, the 10 s unlock, loading and using one
src/23-bots.js        bot sight, hearing, callouts and memory; aiming, combat, wallbangs, navigation
src/24-items.js       weapons on the ground: drops, physics, pickups and swaps
src/25-bomb.js        the charge: sites, carrier, planting, fuse, defusing, the blast
src/26-accounts.js    accounts on this device: callsigns, PINs, per-account saves, exit checkpoints
src/26-admin.js       the admin passcode and powers
src/26-match.js       defuse rounds, economy, buying, halftime, match end
src/26-profile.js     career profile: XP, levels, points, shop, kit, Elo and ranks
src/27-tactics.js     bot team play from the map's tactical data
src/28-radar.js       radar overview + rotating radar, map thumbnails, weapon silhouette icons
src/29-hud.js         HUD and the buy menu
src/29-menus.js       accounts, main menu, Create Game, loadout/shop with 3D preview, career, pause, results
src/30-main.js        boot, in-place map loading, match sessions, menu camera, 64 Hz tick
docs/ENGINE_AND_NETCODE.md   the path to Godot/Unity and to multiplayer
tools/                headless checks and screenshot harnesses (see below)
```

## Build and test

```bash
node build.mjs
```

Headless checks (Node only; those taking a path need the three.js UMD build for bone math):

```bash
node tools/node-profile-check.mjs path/to/three.js
```

```bash
node tools/node-account-check.mjs path/to/three.js
```

```bash
node tools/node-map-check.mjs path/to/three.js kiln 16
```

```bash
node tools/node-map-check.mjs path/to/three.js frost 16
```

```bash
node tools/node-map-check.mjs path/to/three.js depot 8
```

```bash
node tools/node-bake-check.mjs kiln
```

```bash
node tools/node-match-check.mjs path/to/three.js 6
```

The Stage 1–4 suites still apply: `node-move-check`, `node-weapon-check`, `node-nav-check`,
`node-bot-check` (the last two take the three.js path).

Browser checks need Playwright and a local copy of three.js r128 (the file cdnjs serves, e.g.
from `npm pack three@0.128.0`, `package/build/three.min.js`):

```bash
node tools/gameplay7-check.mjs path/to/three.min.js shots
```

```bash
node tools/gameplay6-check.mjs path/to/three.min.js shots
```

```bash
node tools/gameplay5-check.mjs path/to/three.min.js shots
```

- `node-account-check`: creating accounts and signing in, callsign and PIN rules, PINs
  stored as salted hashes, each account's progress kept apart, saving when a match is recorded
  and when something is bought, reopening the game, recovering a match whose page closed
  mid-game (and never counting it twice), guests and turning a guest into an account, renaming,
  changing and removing PINs, deleting, moving older progress into the first account, damaged
  saves and blocked storage.
- `node-profile-check`: levels and points, shop rules (per-gun attachments, camos for every
  gun), attachments changing weapon stats (and bots staying stock), XP lines and multipliers,
  Elo (ranked vs casual, difficulty, performance, placements, leaving early), a whole ranked
  match folded into the profile, sanitising saved data.
- `node-map-check <map>`: spawns stand clear; every place and tactical spot reachable from both
  spawns; plant spots inside their sites; route timings; no spawn-to-spawn or mid-to-spawn
  sightlines; a bot walks every route, every Warden post and the rotation; bots play full rounds
  with plants.
- `gameplay7-check`: the name; wallbang rounds locked for the first 10 s (the HUD counts down),
  then X loads one (ARMED, 3 left, the crosshair changes) and unloads it; a normal shot stops in
  a wall while a wallbang round goes through and kills, with the WB kill-feed mark; none left
  means no more; scoping in zooms, tightens accuracy, slows you and hides the crosshair, and
  scoping out restores it; noclip refused without admin; a wrong passcode refused, the right one
  (any letter case) accepted; admin flies, has unlimited rounds with no wait, sees an enemy
  behind a wall (x-ray and radar), has unlimited money; an admin match records nothing.
- `node-bot-check` (bots): a bot facing you reacts after a human-like delay; no sight through
  walls or smoke; a bot doesn't see you standing behind it; a shot heard through a wall gives
  only a rough position; getting shot gives only the rough direction; a callout reaches
  teammates a moment later; bots duel in the open.
- `gameplay6-check`: first launch creates an account (bad callsigns refused, typing doesn't
  reach the game), the results are saved to it, reloading the page mid-match saves that match,
  the PIN prompt on reopening (wrong PIN refused), switching accounts and guests; then the main
  menu and profile card, Create Game (ranked locks 5v5), buying and
  equipping in the pre-match loadout, the 3D preview, Kilnworks built in place without a reload,
  the bought rifle carrying its suppressor, the pause menu, results with XP, points and Elo,
  career history, and the phone layout.
- `gameplay`–`gameplay5-check`, `node-match-check`: the Stage 1–5 rules, still passing.

## Against the CS 1.6 graphics bar

| Requirement | Status |
| --- | --- |
| Textured world, tiling procedural textures | Stage 6 adds sooty firebrick, yellow stock brick, sun-cracked clay, packed snow with blue hollows, faceted granite with frost and lichen, painted station panels, hangar sheeting and new signs, on top of Stage 5's brick, plaster, concrete, asphalt, ballast, corrugated steel, timber and wagons |
| Baked lighting + skybox | Per-map light: warm low sun on Kilnworks, cold overcast on Frostline (snowy mountains in the sky); interior lamps in the Press Hall, Conveyor Room, comms block and hangar. 131k (Kilnworks) and 156k (Frostline) lightmap texels baked in 2–3 s |
| Maps with two sites | Saltpan Depot, Kilnworks, Frostline |
| Player models, viewmodels, effects | Stages 2–4, plus attachments and camos on the viewmodels |
| HUD and menus | Stage 5 HUD; Stage 6 main menu over a map fly-through, Create Game, loadout/shop with a 3D gun preview, career, results and pause screens |
| 60+ FPS | Unchanged from Stage 5 (about 1.3 ms of game JavaScript per frame with 10 players); the menus add a second small renderer only while the loadout/shop preview is open |

## Known limitations

- Bot balance varies by map and sample: in 16-round bot-only samples Raiders won 10 on
  Kilnworks and 11 on Frostline; on Saltpan Depot Wardens win most retakes.
- Your attachments and camo show in first person only; the third-person and dropped models stay
  stock. Bots never use attachments.
- Rating against bots is a single-player measure: there is no matchmaking against people yet.
- Bots don't use cover deliberately; no fall damage; ragdolls are scripted falls.

## Next

See [docs/ENGINE_AND_NETCODE.md](docs/ENGINE_AND_NETCODE.md) for the path to Godot or Unity and
to multiplayer with server authority, client prediction and lag compensation; the profile and
Elo would then move to the server.
