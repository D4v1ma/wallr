# wallr

An original round-based tactical shooter where **wallbanging** is the point: load a wallbang
round and your next shot goes through every wall in its way. You play up to 8v8 on three large
two-site defuse maps, against bots or with other people over your network or the internet (bots
fill the places nobody takes), with rounds, money, a buy menu, attachments and camos, levels,
ranks and accounts saved on your computer.

The game runs in **Godot 4.7** (the `godot/` folder) on the Forward+ renderer: physically based
materials, a real-time sun with soft shadows over baked indirect light, ambient occlusion,
volumetric fog, ACES tone mapping and four quality presets. It began as a browser game, built in
seven stages: movement and shooting, weapons and effects, player models and bots, rounds and
money, maps and the radar, menus and progression, and wallbangs. That version is still here
(`index.html`, `src/`), and its generators are where the Godot version's assets come from:
`tools/godot-export.mjs` runs them and writes the textures, sounds, maps and models into
`godot/assets/`, with the newer generators in `assetgen/` (materials, weapon and character
models, the large maps) taking the place of their originals. Everything is original: procedural
textures, synthesized sounds, brush geometry, models and code. There are no third-party assets,
plugins or add-ons.

## Play it

1. Install **Godot 4.7** from [godotengine.org](https://godotengine.org/download) (the
   standard build; the .NET build isn't needed).
2. In the Project Manager choose **Import**, pick `godot/project.godot`, then **Import & Edit**.
   The first time, Godot imports the textures and sounds (a few seconds).
3. Press **F5** (Run Project).

Or from a terminal in the repository folder (`godot` here is however you start Godot 4.7, for
example `Godot_v4.7.2-stable_linux.x86_64` on Linux or
`/Applications/Godot.app/Contents/MacOS/Godot` on macOS):

```bash
godot --path godot
```

The first time, you create an **account** (a callsign and an optional PIN) or play as a guest;
after that the game opens on your account, or asks who's playing if there are several. Then the
**main menu**, over a slow fly-through of the last map you played: **Play** → Create Game →
loadout → **Start match** → **Deploy**. Click in the window to take the mouse; **Esc** pauses
and gives it back. **F11** (or Alt+Enter) switches fullscreen.

To go straight into a match without the menus (as a guest, so nothing is saved):

```bash
godot --path godot -- --menu=0 --map=kiln --mode=defuse --bots=8 --allies=7 --diff=hard
```

`--map` is `depot`, `kiln`, `frost` or `range` (the Hall B practice range); `--mode` is
`defuse` or `skirmish`; `--bots` is the number of opponents and `--allies` the number of bot
teammates; `--team=1` plays Wardens and `--team=0` Raiders; `--diff` is `easy`, `normal`,
`hard` or `expert`.

### A standalone build

The project has export presets for **Windows**, **Linux**, **macOS** and **Web**. Install the
export templates once (**Editor → Manage Export Templates → Download and Install**), then use
**Project → Export**, or:

```bash
mkdir -p godot/build/linux
```

```bash
godot --headless --path godot --export-release "Linux" build/linux/wallr.x86_64
```

Builds go to `godot/build/`, which git ignores. The game's data packs into a 76 MB `.pck`
(textures about half of it, then the models and the three big maps).

## Multiplayer

Play with other people on your network or over the internet. One PC hosts the match and plays
in it too, and the others join; or a spare PC runs a **dedicated server** that only hosts. The
host runs the match: everyone's movement, shots, damage, money and rounds are decided there, and
bots take the places nobody fills.

- **Host:** Multiplayer → Host a game. Pick the map, mode, match length, bot difficulty, your
  side, players per side (1–8) and whether bots fill the empty places, then host. Your address
  is on that screen and in the pause menu.
- **Join:** Multiplayer → Join a game. Games on your network show up by themselves; or type the
  host's address (`192.168.1.20`, a computer name, or `address:port`).
- Joining puts you in a bot's place, and a bot comes back when you leave. In a defuse match you
  play at once during buy time, otherwise from the next round.
- **In a match:** **Y** chats with everyone and **U** with your team. Esc → **Switch to the
  other side** (during a live round that costs you the round). The scoreboard shows pings, and
  the match keeps running while you're in a menu. If the host leaves, the match ends for
  everyone.
- Network matches pay XP and points like casual matches; Elo stays a rating against bots, and
  admin powers are off.
- Everyone needs the same version of the game. A game uses **UDP port 27620**, and UDP 27621 to
  be found on the local network. To play over the internet, the host forwards UDP 27620 on
  their router to their PC and gives friends their public address. A full 8v8 needs about
  2.5 Mbit/s of upload from the host.

From the command line, host a 5v5 on Kilnworks (bots fill both sides; `--host=27630` picks
another port, `--fill=0` leaves the places empty, `--name="Friday game"` names it), or join:

```bash
godot --path godot -- --menu=0 --map=kiln --mode=defuse --host --size=5
```

```bash
godot --path godot -- --join=192.168.1.20
```

**A dedicated server** hosts without playing. Bots hold both sides until people join, the match
waits while nobody is connected, the first player in starts a fresh match, and when a match ends
the next one starts on the same map. The console logs connections, joins, leaves, side switches
and chat:

```bash
godot --headless --path godot -- --server --map=frost --mode=defuse --size=8 --diff=hard
```

Its options are `--map`, `--mode`, `--size` (players per side, 1–8), `--fill=0`, `--diff`,
`--len=short`, `--ff=1` (friendly fire), `--port` and `--name`; add `--log-file server.log`
before the `--` to keep the log in a file. An exported build takes the same options
(`./wallr.x86_64 --headless -- --server --map=depot`).

How it plays smoothly: the host simulates at 64 ticks a second. Your client sends your inputs
every tick and moves and shoots for you straight away with the same code (prediction),
correcting itself when the host disagrees; everyone else is drawn about 80 ms in the past,
smoothly between the host's 32 snapshots a second. The host checks your shots against where you
saw your targets (lag compensation, up to 250 ms back). Each player receives about 7 KB/s in a
2v2 and 19 KB/s in an 8v8. The details are in
[docs/ENGINE_AND_NETCODE.md](docs/ENGINE_AND_NETCODE.md).

## Controls

| Action | Keys |
| --- | --- |
| Move / jump / crouch / walk | W A S D or arrows / Space / Ctrl or C / Shift |
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
| Chat to everyone / your team (network games) | Y / U, then Enter to send or Esc |
| Pause menu / fullscreen | Esc / F11 or Alt+Enter |
| Noclip fly (admins) / debug readout / hints | V / F1 or ` / H |

## Wallbang rounds

- Press **X** to load a wallbang round. Your **next gun shot** goes straight through every
  wall, door and crate in its way, at full damage (only the normal range falloff), and hits
  the first enemy on the line. Every wall it crosses gets entry and exit marks, and the shot
  leaves a bright streak along its whole path. With the Bison 12 every pellet pierces. Press X
  again to take the round out unused.
- **3 per round** each. They **unlock 10 seconds after the round goes live** (after the buy
  time), or 10 s after spawning in skirmish. The panel above your weapon name shows the
  rounds left as diamonds and the state: *unlocks in 7 s*, *X to load*, *ARMED*, *none left
  this round*. The crosshair turns orange with a ring while a round is loaded.
- Kills with a wallbang round get a **WB** mark in the kill feed.
- Bots use them too, fairly: right after losing sight of someone, a bot sometimes fires one
  through the cover where it **last saw** them (never through walls at someone it hasn't seen).
  Normal bots do it about 30% of the time, Hard 50%, Expert 70%, Easy never.
- The numbers are `PER_ROUND` and `UNLOCK` in `godot/scripts/weapons/wallbang.gd`.

## Scoping in

Hold **Mouse 2** with any gun except the Osprey LR (which keeps its own scope): the view zooms a
little (about 18%), the gun comes up to the sights, the crosshair fades, and you are **a little
more accurate** (22% less inaccuracy, 15% less base spread) but move 20% slower. Reloading drops
you out of it. Red dot and holo sights line up with the screen centre.

## Admin

Settings → **Admin**: enter the admin passcode to make the signed-in account an admin (a guest
stays admin until the game closes). An admin has:

- **noclip**: V flies through walls (noclip isn't available to everyone);
- **unlimited wallbang rounds** with no 10 s wait;
- **unlimited money** (buying costs nothing; the HUD shows ∞);
- **enemies visible through walls**: orange or blue silhouettes wherever a wall hides them, and
  every enemy on the radar.

Admin powers can be switched off or removed in the same place, and the HUD tag says ADMIN while
they are on. **Matches played with admin powers on don't change XP, points, rank or match
history.** Only a salted hash of the passcode is in the code. To change it, run
`node tools/admin-hash.mjs "new passcode"` and put the first hash it prints (the one starting
`s256:`) into `HASHES` in `godot/scripts/meta/admin.gd` (the browser version takes both hashes,
in `src/26-admin.js`). It's a game setting rather than security: the game runs on the player's
own computer.

## The front end

- **Main menu:** Play, Loadout, Shop, Career, Settings, Quit. A profile card shows your rank
  emblem, Elo, level, XP bar and points.
- **Create Game:** pick the map (cards with overviews), **Defuse** or **Skirmish**,
  **Casual** or **Ranked**, the **bot difficulty** (Easy 750, Normal 1050, Hard 1350, Expert
  1650 rating), match length (first to 9 or 16), your side (Wardens, Raiders or random), bot
  teammates (0–7) and opponents (1–8), friendly fire. Ranked fixes 8v8 with friendly fire off.
  The summary shows roughly what a win and a loss would do to your Elo.
- **Loadout for this match:** the next step. For each gun in the buy menu (Wasp 9, Swift SMG,
  Bison 12, Kestrel AR, Osprey LR) choose a muzzle, optic, magazine, grip/stock and camo from
  what you own, with a turning 3D preview and stat bars showing the change. **Start match**
  builds the map and shows **Deploy**.
- **In the match:** guns you buy come with your attachments and camo (bots carry stock guns).
  **Esc** opens the pause menu: Resume, Settings, Leave match.
- **Results:** victory, defeat or draw, your stats, the XP breakdown with the level bar and any
  level-ups, and the Elo change line by line. Then Play again, Shop or Main menu.
- **Career:** rank and Elo (and peak), level, lifetime stats (win rate, K/D, damage per round,
  headshot %, plants, defuses), the last 15 matches and the rank ladder.
- **Settings:** mouse sensitivity and invert, field of view and weapon field of view,
  fullscreen, graphics quality (Low, Medium, High, Ultra) and brightness, volume, HUD readouts,
  the crosshair (style, colour, size, gap, thickness, dot, outline, follow recoil), the
  controls, and Admin.

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

Accounts live on your computer, in Godot's user data folder; there is no server and nothing
leaves the computer.

- **Create an account:** a callsign (2–16 characters, unique on this computer) and an optional
  PIN of 4–8 digits. You play under your callsign in the scoreboard and kill feed.
- **Who's playing?** With several accounts the game opens on a picker (level, rank, points,
  last played). An account without a PIN signs straight back in next time; one with a PIN asks
  for it. **Switch** on the home card returns to the picker.
- **Account settings:** rename, add, change or remove the PIN (the current PIN is needed),
  sign out, or delete the account and its progress (type the callsign, and the PIN if set).
- **Guests** can play everything but nothing is saved; the home card and the results screen
  offer to turn the session into an account, keeping what it earned.
- **When progress saves:** when a match **finishes** (before the results screen) and when you
  **exit** it: Leave match in the pause menu, or closing the window mid-match (saved as you
  leave, with what you had earned; a ranked match that had started counts as a loss, as with
  Leave match). Each round also leaves a small checkpoint, so if the game is killed before it
  can save, the match is recorded the next time that account signs in, and a note on the home
  screen says so. A match is never counted twice. Purchases and loadout changes save
  immediately. The home card, career and results screens show when the account was last saved.
- **Where:** `accounts/` and `settings.json` in the user data folder:
  `%APPDATA%\Godot\app_userdata\wallr\` on Windows,
  `~/Library/Application Support/Godot/app_userdata/wallr/` on macOS and
  `~/.local/share/godot/app_userdata/wallr/` on Linux (Project → Open User Data Folder in the
  editor). `accounts.json` holds the accounts and who played last (PINs only as salted SHA-256
  hashes); each account has `profile_<id>.json` (XP, points, purchases, loadout, Elo, stats,
  recent matches) and, during a match, `pending_<id>.json`. Deleting the folder deletes the
  accounts. Saves from the browser version stay in that browser.
- **Limits:** the PIN stops other people using this computer from playing as you; it is not
  encryption (the files are plain JSON).

## The maps

Three defuse maps, each about 12,000 × 9,800 units, ten times the area of the browser version's
maps. Each has two plant sites, four Raider routes, eight spawn points a side and tactical data
for the bots. The round length (2:55), fuse (45 s), buy zone and radar scale come from the level
file. Hall B stays as a small practice range.

**Saltpan Depot:** a salt works' rail depot under a warm afternoon sun. Raiders start in the
West Yard, Wardens in the Warden Yard off the Service Road (east).
- **A — Platform 2** (north-east): a raised platform under a canopy between two tracks, freight
  wagons and a signal hut; one track climbs out of the sunken **Rail Cut**. In from the **Salt
  Pans** and the **Brine House** (north lane) or through the **Scales Yard** gate off mid.
- **B — Shed 4** (south-east): a tall warehouse with stacked containers, a loading dock and a
  catwalk over the foreman's office. In from the covered **Culvert** (south lane, past the Sluice
  Yard, the Pump House and the Evaporator Sheds) or from the **Back Alley** and **Lorry Park**.
- **Mid:** the **Street** between warehouses and canteens, the **Plaza** with the salt monument,
  the Weighbridge Office and the Stores block.

**Kilnworks:** a brick-and-tile works on a clay quarry, low warm sun. Raiders climb out of the
**Quarry** (south), Wardens hold the **Office Court** (north).
- **A — Kiln Yard** (north-west): a firing kiln with an arch, a round updraught kiln and the big
  chimney. In from the terraced **Clay Pits** (west lane, a conveyor gantry) or **Kiln Alley**.
- **B — Press Hall** (north-east, indoor): two hydraulic presses you can see under, a conveyor
  line with walkways across it, a control booth up a ramp. In through the roller door from the
  **Rail Siding** (east lane: tracks, wagons, a gantry crane) or from the **Conveyor Room**.
- **Mid — Clay Court:** the pug-mill house, drying racks and the **Tile Store**, with the drying
  sheds to the west.

**Frostline:** a mountain radar station in snow under a grey sky, ringed by cliffs. Raiders come
in from the **Drop Zone** (west), Wardens from **Barracks Row** (east).
- **A — Hangar 2** (north-east, indoor): a parked survey plane, a tow tractor, tool chests and a
  mezzanine office under three skylights. In through the big hangar door from the **Fuel Depot** (north lane: tanks, a
  pipe-rack walkway, lorries) or the south doors from the **Radio Path**.
- **B — Dish Array** (south-east): a platform raised 96 units with two tilted dishes (walk under
  the bowls) and a control hut. Up the long ramp out of the **Ice Cut** (south lane, a trench with
  a footbridge), the stairs from the **Generator Path**, or the Wardens' stairs on the east side.
- **Mid — the Pass:** between two rock ridges into the **Comms Block** (a radome on the roof),
  whose halls feed the Radio Path, the Generator Path and the **Parade Ground** by the Mess Hall.

Measured on the bots' navigation graph at knife speed (250 units/s; a rifle is about 12%
slower), from spawn along each route to the site:

| | Raider routes | Wardens to A / B | A↔B rotation |
| --- | --- | --- | --- |
| Saltpan Depot | 45–52 s | 17 / 21 s | 29 s |
| Kilnworks | 37–40 s | 11 / 18 s | 29 s |
| Frostline | 44–50 s | 12 / 22 s | 27 s |

`--test=mapcheck` (see Tests) checks every map: neither spawn can see the other, nobody in mid can
see into a spawn (stacked containers, a tool shed and a garden wall screen them), and the bots can
walk to every spawn point, plant spot and hold spot. In 8v8 bot-only test matches the charge was
planted in most rounds on every map.

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
   keep buying for 20 s into the round if you stay within 900 units of your spawn.
2. **The round (2:55):** Raiders carry the charge to A or B and plant it by holding Mouse 1
   with the charge (slot 5) for 3.2 s.
3. **Planted:** the fuse burns 45 s and beeps faster as it runs down. Wardens hold **E** on it
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
approaches, converge after a plant and defuse. On the big maps a bot that is on its way somewhere
and spots someone far off (beyond 1,600 units) keeps walking its route between bursts instead of
stopping to trade shots it can hardly land.

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

## How the Godot version is built

```
godot/
  project.godot        Forward+ renderer (Vulkan, D3D12, Metal; falls back to OpenGL 3.3), the Web
                       export on Compatibility (WebGL 2), Jolt physics at 64 Hz, autoloads
  scenes/main.tscn     the one scene; scripts/main.gd boots the game, runs the tick and the camera
  assets/              written by tools/godot-export.mjs (committed, so playing needs only Godot)
    textures/          world and prop materials (albedo, normal and AO/roughness/metal PNGs), skin,
                       glove and camo textures + textures.json (tiling, surfaces)
    sounds/            every sound effect (WAV) + sounds.json
    maps/<map>/        level.json (spawns, sites, places, bot tactics) + level.bin (chunked faces,
                       UVs, light probes), brushes.json (collision), lightmap.png (indirect light,
                       lamps and sky visibility), nav.bin (the bots' graph), radar.png
    models/            viewmodels, attachments, characters with LODs, world weapons
                       (models.json + .bin)
    data/              weapon table, viewmodel animation clips, attachments and camos
    ui/                weapon silhouettes and map thumbnails
  shaders/             world (PBR with the baked indirect light and sky reflections), models (PBR lit
                       by the light probes), decals, particles, smoke, tracers, sky (two cloud
                       layers), scope, radar, x-ray
  scripts/core/        settings, game state, data tables, small helpers
  scripts/world/       level loading, brush collision and traces, doors and plates, textures
  scripts/player/      movement (shared by you and the bots), input commands
  scripts/weapons/     guns, knife, smoke, the charge, loadout, attachments, ballistics, wallbangs
  scripts/view/        the viewmodel, drawn in its own viewport with its own field of view and sun;
                       graphics presets and each map's look (gfx.gd)
  scripts/models/      mesh building, character skeletons, procedural animation, hitboxes
  scripts/actors/      players and bots: spawning, damage, deaths, money, sides
  scripts/bots/        sight, hearing, memory, aim, A* navigation, team tactics
  scripts/match/       defuse rounds, economy and buying, the charge, weapons on the ground
  scripts/fx/          decals, particles, tracers, casings, smoke, blood, dynamic lights
  scripts/audio/       positional sound, buses with a compressor and limiter
  scripts/meta/        accounts, profile (XP, points, Elo), admin, match sessions, menu camera
  scripts/net/         network play: the ENet host and client, the wire format, snapshots,
                       prediction, interpolation, lag compensation, LAN discovery
  scripts/ui/          HUD and buy menu, menus, the UI toolkit, rank emblems
  tests/               test runner and suites (left out of exports)
```

- **The same simulation:** a fixed 64 Hz tick in `_physics_process`, driven by input commands,
  with rendering interpolated between ticks. Movement, weapons, bots and rules are ports of the
  JavaScript, checked against the same numbers (see Tests).
- **Collision:** every brush is a convex Jolt body (built around its own centre, so detailed
  brushes far out on the big maps stay exact); traces sweep with `cast_motion` and then clip
  exactly against the brush planes, so stepping, sliding and jumping match the original.
- **Lighting:** the sun is a real-time directional light with soft shadows (cascades, and
  percentage-closer soft shadows on High and Ultra). The exporter bakes everything else: bounced
  light, lamps and how much sky each spot sees go into the lightmap, which the world shader adds
  as indirect light along with a reflection of the sky; light probes light the characters,
  weapons and viewmodels the same way. Muzzle flashes and the blast are dynamic lights. Each map
  has its own look (sun strength, clouds, fog, exposure) in `gfx.gd`.
- **Graphics presets** (Settings → Graphics): Low, Medium, High and Ultra set the shadow map size
  and distance, soft shadows, ambient occlusion (SSAO, and SSIL on Ultra), screen-space
  reflections (Ultra), volumetric fog (High and Ultra), anti-aliasing and texture filtering.
- **Materials:** 512-pixel albedo, normal and AO/roughness/metal maps generated per material,
  with a large-scale tone variation in the shader so big walls and floors don't repeat visibly.
- **Models:** the guns are built from rounded boxes, bevelled profiles and lathed parts with
  smoothed normals (13–30k triangles each in first person); characters are lofted meshes with up
  to four bone weights per vertex and automatic levels of detail.
- **World meshes** are split into chunks of 2,048 units so Godot can cull them, with one merged
  shadow-only mesh per chunk.
- **Bots** route over the exported waypoint graph with `AStar3D`, keeping the routes and
  timings their tactics were tuned for.
- **Sound:** the WebAudio synth is rendered offline to WAV; Godot plays it with distance
  attenuation through a compressor and a limiter.

### Regenerating the assets

Only needed after changing the generators in `src/` or `assetgen/` (a file in `assetgen/`
replaces the `src/` file of the same name for the export; the browser build is unaffected). It
needs Node 18+, Playwright with Chromium (`npm install playwright`, then
`npx playwright install chromium`) and three.js r128 (`three.min.js`, used for the bone maths;
for example from `npm pack three@0.128.0`, file `package/build/three.min.js`):

```bash
node tools/godot-export.mjs path/to/three.min.js
```

```bash
godot --headless --path godot --import
```

An optional second argument picks the parts (`textures,sounds,maps,models,data`) and a third
the maps, comma-separated (`depot,kiln,frost,range`). A big map takes 30–40 s, most of it the
lightmap bake.

## Tests

```bash
godot --headless --path godot res://tests/runner.tscn -- --test=move,bots,combat,menus,profile
```

- `move` (19 checks): run, walk and crouch speeds, jump height, step heights, jumping and
  crouch-jumping onto boxes, stairs and ramps, sliding along walls, doors.
- `bots` (16): damage, armor and helmets, hitboxes, reaction time, no sight or shots through
  walls or smoke, nothing seen behind them, hearing a shot through a wall gives only a rough
  position, getting shot gives only a rough direction, callouts, roaming, duels, cost per tick.
- `combat` (17): wallbang rounds (locked for 10 s, loading and unloading, a normal shot stopping
  in a wall while a wallbang round goes through and kills, none left), scoping in and out, the
  admin passcode and powers, admin matches recording nothing.
- `menus` (13): a fresh computer asks for an account; the main menu, Create Game, buying and
  equipping an attachment, launching, pausing, leaving and results, F11, signing out and back in
  with a PIN.
- `profile` (10): levels and points, ranks, XP and Elo rules, recording matches, shop prices.

Bots playing whole 8v8 defuse rounds on each map (rounds finish, the charge gets planted,
fights happen, bots buy, the simulation stays fast; `--bots` and `--allies` change the sides):

```bash
godot --headless --path godot res://tests/runner.tscn -- --test=match --maps=depot,kiln,frost --rounds=4
```

Map layout checks: neither spawn sees the other, mid can't see into a spawn, and every spawn,
plant and hold spot is reachable for the bots (`--dump=dir` writes the clear sight lines as JSON):

```bash
godot --headless --path godot res://tests/runner.tscn -- --test=mapcheck
```

Network play, each test with real Godot processes talking over ENet on this computer:

```bash
godot --headless --path godot res://tests/runner.tscn -- --test=mp,mp_dedicated,mp_lag
```

- `mp` (29 checks): hosts a 2v2 on Saltpan Depot and starts a second Godot process as a client.
  The client finds the game on the LAN, joins in a bot's place, buys through the host, walks
  (prediction corrections stay under 24 units), sees the others move, fires and chats; the host
  sees it move, fire and buy, gets a bot back when it leaves, and switches sides itself; a
  second client is told when the host ends the game.
- `mp_dedicated` (13): starts a dedicated server process and joins it: it's listed with nobody
  playing, the match starts afresh for the first player, chat through the Y box, switching
  sides, the server running on when everyone has left, and its console log.
- `mp_lag` (4): a client taps shots at the host strafing across its view; with lag compensation
  every one lands (without it, `--nolagcomp`, 18–44% do).

`--netsim=delay,loss,jitter` (milliseconds, percent, milliseconds) adds latency, packet loss and
jitter at both ends: `--netsim=50,2,15` gives 100 ms round trips. `mp_shots` (needs a display)
saves a client's view, scoreboard, chat and pause menu.

Screenshots for a visual check (needs a display; on a Linux server put `xvfb-run -a` in front;
`--vm=all` adds every viewmodel in the sun and indoors, and a line-up of characters):

```bash
godot --path godot res://tests/runner.tscn -- --test=shots,menus --out=/tmp/wallr-shots
```

The tests keep their saves in a folder of their own (`user://test-data/`), so they never touch
your accounts.

## Against the CS 1.6 graphics bar

| Requirement | Godot version |
| --- | --- |
| Textured world, tiling procedural textures | Physically based materials for every surface (brick, plaster, concrete, cobbles, asphalt, corrugated steel, timber, firebrick, clay, salt, snow, ice, rock, signs, wagons): 512-pixel albedo, normal and AO/roughness/metal maps, with large-scale tone variation so big surfaces don't repeat |
| Baked lighting + skybox | A real-time sun with soft shadows over baked bounce light, lamps and sky occlusion; light probes for characters and guns; a sky per map with two cloud layers; ambient occlusion, volumetric fog, ACES tone mapping and bloom; dynamic light from muzzle flashes and the blast |
| Maps with two sites | Saltpan Depot, Kilnworks and Frostline, each about 12,000 × 9,800 units, plus the Hall B practice range |
| Player models, viewmodels, effects | Characters with team gear, four-bone skinning, procedural animation and levels of detail (about 8k triangles); viewmodels of 13–30k triangles with bevelled parts, attachments and camos, in their own viewport with their own sun; decals, sparks, dust, smoke, tracers, casings, blood |
| HUD and menus | The full HUD and every menu screen, rebuilt with Godot UI, plus graphics presets |
| 60+ FPS | 160–540 draw calls and 20–330k triangles per frame on the big maps with 16 players; the simulation takes about 2 ms per 64 Hz tick with 16 players. Frame rate not yet timed on a real GPU (the test machine renders in software, about 10 FPS at 720p) |

## The browser version

`index.html` is the browser game as it was at Stage 7 (`node build.mjs` rebuilds it from
`src/`; it loads three.js r128 from cdnjs). It plays the same game with touch controls, on the
original small maps with the older models and renderer; the big maps, the new models and the
Forward+ graphics are in the Godot version only, where new work goes. Its headless checks and
screenshot tools are in `tools/` (`node-*-check.mjs`, `gameplay*-check.mjs`).

## Known limitations

- Bot balance on the big maps rests on short samples (a few 8v8 bot-only matches per map, in
  which the charge was planted in most rounds); it hasn't been tuned further.
- Raiders take about 44–52 s to reach a site on Saltpan Depot and Frostline and 37–40 s on
  Kilnworks with the knife out (12% longer holding a rifle); the plan was 35–45 s.
- Frame rate on a real GPU is untimed (see above). On the big maps the lightmaps are coarse on
  large surfaces (a sample every 32–48 units) and hold no sun shadows, so beyond the preset's
  shadow distance (2,400 units on Low to 6,000 on Ultra) everything is in sunlight.
- The OpenGL renderer (the Web export, and the fallback where Vulkan, Direct3D 12 or Metal is
  missing) has no screen-space ambient occlusion, volumetric fog or reflections, and its image
  is a little brighter.
- Your attachments and camo show in first person only; the third-person and dropped models stay
  stock. Bots never use attachments.
- Network play has no server list beyond your own network: over the internet you need the
  host's address and a forwarded port. Enemies behind walls are still sent to every client (no
  wallhack culling yet), snapshots aren't delta-compressed, the dedicated server stays on one
  map and takes no console commands, and the Web build can't play online (browsers have no UDP).
- Profiles, Elo and accounts stay on each player's computer; Elo is a rating against bots.
- Bots don't use cover deliberately; no fall damage; ragdolls are scripted falls.
- The Godot version has no touch controls.
- No finished executables have been built and tried yet. The game data has been exported as a
  `.pck` with the Linux preset and runs on its own with the Godot binary; the Windows, macOS
  and Web builds are untested.
- Maps are written in code (`assetgen/07-map-*.js`, with the building blocks in
  `assetgen/07-map-kit.js`) and exported; there is no in-editor map workflow yet.

## Next

The network groundwork is in (see [docs/ENGINE_AND_NETCODE.md](docs/ENGINE_AND_NETCODE.md)).
Next on that side: a map rotation and console for the dedicated server, an internet server
list, culling what each client can't see, then accounts, profiles and Elo on a server so ranked
play against people becomes possible.
