# wallr: multiplayer on the Godot version

This document had two tracks: port the browser prototype to a real engine, then add
multiplayer. **The engine port is done**: the game runs in Godot 4.7 (`godot/`); how it was done
is at the end. What's left is **multiplayer with server authority, client prediction and lag
compensation**, now planned against the Godot code.

The port kept the shape that makes networking an addition rather than a rewrite:

- The simulation is a fixed **64 Hz tick** (`main.sim_tick` from `_physics_process`) driven by
  **input commands**: `Controls.build_cmd()` produces `{ fwd, side, jump, jumpHeld, duck, walk,
  fire, alt, reload, use, useHeld, drop, inspect, slot, last, cycle, wallbang }`, and the view
  angles come from `Controls.take_look()`.
- Rendering only interpolates between ticks (`prev`/`pos` with
  `Engine.get_physics_interpolation_fraction()`).
- Players and bots run the same movement, weapon and damage code: `Player.tick(cmd, dt)`,
  `Loadout.tick(cmd, …)`, `Combat`, `Ballistics`, `Actors.hitscan`. A bot's `BotBrain.think()`
  returns the same command a keyboard does.
- The whole game runs headless (`godot --headless`): the match suite plays complete bot rounds
  without a window, at about 2 ms per tick for 16 players (8v8 on the big maps).
- Randomness in the simulation is already seeded (`U.Rng`, mulberry32): `Gun.rnd` per weapon,
  `Ballistics.rnd`, `Bots.rnd`, `Tactics.rnd`.

That is the shape a server-authoritative networked shooter needs.

---

## Multiplayer (server authority, client prediction, lag compensation)

### Architecture

```
 clients (Godot)                            dedicated server (the same project, headless)
 ───────────────                            ─────────────────────────────────────────────
 input → usercmd #n ──────────────────────▶ queue per player, applied in order each tick
 predict own movement/weapon (same code)    authoritative sim: movement, shots, damage,
 interpolate others ~100 ms in the past      economy, rounds, the charge, bots (64 Hz)
 render                ◀──────────────────── snapshots (20–32 Hz, delta-compressed)
                                             history of every player's hitboxes (1 s)
```

- **Transport:** a `MultiplayerPeer` carrying our own packets, not node RPCs or
  `MultiplayerSynchronizer` (a shooter wants its own snapshot format and delta compression).
  `SceneMultiplayer.send_bytes()` sends usercmds and snapshots with
  `TRANSFER_MODE_UNRELIABLE`, and events (kill feed, buys, chat) with `TRANSFER_MODE_RELIABLE`
  on a second channel. The same code runs over `ENetMultiplayerPeer` on desktop and
  `WebRTCMultiplayerPeer` for the Web export (`WebSocketMultiplayerPeer`, reliable only, is
  fine for LAN and testing).
- **Server:** the same project started with `--server` under `--headless`. The viewmodel, HUD,
  menus, effects and sound already sit idle headless (the tests run that way). A "dedicated
  server" export preset strips the textures and sounds. Run one process per match at 64 Hz.

### Messages

- **usercmd** (client → server, every tick, also carrying the previous 2–3 in case of packet
  loss): sequence number, client tick, a bitfield of buttons, move axes (fixed-point),
  yaw/pitch (16-bit each), weapon slot.
- **snapshot** (server → client): server tick, the last usercmd sequence processed for this
  client, then per-entity state, delta-compressed against the last snapshot the client
  acknowledged:
  - players: position, velocity, yaw/pitch, duck amount, health, armor, active weapon, weapon
    state and animation clock, alive;
  - items, the charge, doors, round phase and clock, money for your own team, wallbang rounds
    left (your own).
- **events** (reliable): kills (killer, victim, weapon id, headshot, wallbang), round start and
  end, plants and defuses, buy results, sounds that matter (footsteps are derived client-side
  from movement).

### Client-side prediction and reconciliation

1. The client applies its own usercmd immediately with the **same** `Player.tick` and
   `Loadout.tick` code. It keeps a ring buffer of `{ seq, cmd, predicted state }`.
2. When a snapshot says "processed up to seq N, your state was S", the client sets its player
   to S and **replays** every buffered cmd after N. That gives the corrected present.
3. Small errors are smoothed over ~100 ms (blend the camera, never the simulation). Large ones
   (teleports, respawns) snap.
4. Predict weapons too: fire rate, ammo, recoil index, reload timing, muzzle flash, sounds and
   viewmodel animation, so shooting feels instant. **Never** predict damage or kills;
   hitmarkers come from server events.
5. Spread must match between client and server: seed it per shot from `(player id, usercmd
   seq)` so the client draws tracers and decals where the server will actually hit.

Code changes this needs:

- Per-shot seeds: `Gun.rnd` and `Ballistics.rnd` are seeded per weapon today; reseed them from
  `(player id, seq)` for each shot. Cosmetic randomness (`FX.rnd`, `randf()` in effects, items
  and sound) can stay local.
- Serialisable state: `to_state()` / `from_state()` on `Player`, `Loadout` and the weapons
  (position, velocity, duck, timers, ammo, recoil and spray index, the weapon's state machine).
- Split the predicted local player from interpolated remote actors: today every `Actor`
  interpolates one tick (`prev`/`pos`); remote ones get a snapshot buffer instead.
- `main.sim_tick` becomes two loops: on the server, apply each player's queued cmds, tick,
  snapshot; on a client, predict yourself and interpolate the rest.

### Entity interpolation

- Render remote players at `serverTime − interpDelay` (about 100 ms: 2 snapshot intervals plus a
  margin for jitter).
- Interpolate position, angles and duck between the two snapshots around that time; the
  one-tick `prev`/`pos` path generalises to snapshot buffers.
- Animation is procedural from movement state (`PlayerModel.update`), so it needs no animation
  sync.
- Extrapolate at most 100–200 ms when packets are late, then freeze.

### Lag compensation

When the server processes a shot from player P with usercmd `seq`, it:

1. works out the time P was looking at: `t = cmdTime − P.interpDelay` (the client sends its
   interp delay; latency is implicit in `cmdTime`);
2. rewinds every other player's hitboxes to time `t` from a ring buffer of per-tick poses
   (position, yaw, duck, gait phase, so `PlayerModel` can rebuild its bones; the hitboxes are
   already bone-local boxes tested by `PlayerModel.hit_test`);
3. runs the existing `Ballistics` / `Actors.hitscan` path against the rewound poses (wallbang
   rounds included; walls are static, doors use their pose at `t` via
   `CollisionWorld.move_brush`);
4. restores the present and applies damage now.

Cap the rewind at 200 ms; beyond that the shooter's latency is their own problem. Log rewind
distances to spot abuse. This is the model the classic games use; "shot behind a wall"
complaints are its known trade-off.

### Authority and anti-cheat basics

- **The server owns** movement (it simulates from cmds, so speedhacks simply don't move you),
  fire rate and ammo, wallbang rounds (count and unlock time), money and buying (`Match.buy`
  runs only there), the charge, rounds and all damage.
- **Admin powers move to the server.** Today the passcode is checked on the player's own
  computer; online, admin is a server-side role, and x-ray and radar positions are sent only to
  admins.
- **Clamp** view-angle deltas per tick and cmd rates per second. Drop cmds from the future
  (client tick ahead of server tick plus slack).
- **Don't send** what the client shouldn't know: cull enemies behind walls per client with a
  line-of-sight test (`CollisionWorld.ray`) against hull corners, with a margin of a few ticks
  of movement. That is enough against basic wallhacks.
- **Accounts, profiles and Elo** move to a server too: the current accounts in
  `user://accounts/` are local, single-player saves.

### Milestones

1. `--server` mode: the headless project hosts a match over ENet; clients send cmds and render
   server snapshots (no prediction yet; laggy but working).
2. Client prediction and reconciliation for movement, then weapons; per-shot seeds.
3. Snapshot delta compression and interpolation buffers. Godot has no built-in network
   simulator, so add a test transport between `send_bytes` and the peer that adds latency,
   jitter and loss (100–200 ms, 2–5%).
4. Lag compensation with hitbox history; a debug overlay comparing the client's hitboxes with
   the server's rewound ones.
5. Web export over WebRTC; lobby and matchmaking (rooms of up to 16, bots filling empty slots, which
   already works; up to 16 per match); accounts, profiles and Elo on a server.

Each milestone gets a suite in `tests/`: for example a server and two clients in one process
over ENet on localhost, checking that a predicted position matches the server's within a unit
after scripted input, and that a lag-compensated shot at 150 ms hits.

---

## The engine port (done)

Godot 4 was the recommendation (MIT licence, no royalties or runtime fees, small desktop and web
exports) and is what the game now runs on: Godot 4.7 and Jolt physics. The port started on the
Compatibility renderer (OpenGL 3.3 / WebGL 2) to match the browser version pixel for pixel; the
graphics overhaul since then moved it to Forward+ (physically based materials, a real-time sun
with shadows, new models, maps ten times larger), with Compatibility kept for the Web export and
as a fallback. Where the port differs from the original plan, it was to keep the game identical:

| Area | Planned | Done |
| --- | --- | --- |
| Assets | Run the generators once to write PNGs, WAVs and glTF | `tools/godot-export.mjs` runs the original generators in headless Chromium and writes PNG, WAV, JSON and binary files into `godot/assets/` |
| Maps | Export to `.map`, edit in TrenchBroom, import with func_godot | The compiled levels (faces, UVs, lightmap atlas, brushes, entities, nav graph, tactical data) are exported directly, so geometry is identical and no plugin is needed. A `.map`/TrenchBroom workflow is still the way to give mappers a real editor |
| Lighting | LightmapGI and LightmapProbes | The exporter's own baker: lightmaps (bounce light, lamps, sky visibility) and probes, no bake step in the editor; since the overhaul the sun is a real-time light with shadows |
| Movement and collision | Our own accelerate/friction on a 64 Hz tick, `cast_motion` traces | As planned: one convex Jolt body per brush, `cast_motion`, then an exact clip against the brush planes (Quake 3 style) for the fraction and the plane; the movement suite checks the same numbers |
| Navigation | NavigationServer3D navmesh | `AStar3D` over the exported waypoint graph, keeping the routes and timings the tactics were tuned on |
| Models | glTF, `AnimationPlayer` | The generated meshes are rebuilt into `ArrayMesh` and `Skeleton3D` in code; viewmodel keyframes and procedural motion run in script as before |
| Viewmodel | Second camera or SubViewport | A SubViewport with its own world, field of view, sun and MSAA |
| Sound | Pre-rendered WAV, `AudioStreamPlayer3D` | As planned, with buses (compressor and limiter) |
| HUD, radar, menus | `Control` nodes | `Control` menus built in code; the HUD draws immediate-mode; the radar is the exported overview in a shader |
| Tests | GUT or C# unit tests | A small runner (`tests/runner.tscn`) with 87 checks (including the map layout checks) plus the match and screenshot suites |

### Where each browser module went

| Browser (`src/`) | Godot (`godot/scripts/`) |
| --- | --- |
| `01-util.js` | `core/u.gd`, `core/settings.gd` |
| `02-pix.js`, `03/04-tex-*.js` | generated into `assets/textures/` (the PBR materials from `assetgen/04-tex-pbr.js`); loaded by `world/assets.gd` |
| `05-collision.js` | `world/collision.gd`, `world/trace.gd` |
| `06-level.js`, `07-map*.js`, `08-bake.js` | generated into `assets/maps/<map>/` (the big maps, the map kit and the baker from `assetgen/`); loaded by `world/level.gd` |
| `09-render.js` | `shaders/`, `world/level.gd`, `view/viewmodel.gd`, `main.gd` (camera) |
| `10-fx.js` | `fx/fx.gd` |
| `11-audio.js` | generated into `assets/sounds/`; played by `audio/snd.gd` |
| `12-input.js` | `player/controls.gd` |
| `13-player.js` | `player/player.gd` |
| `14-weapons.js` | `weapons/weapon.gd`, `gun.gd`, `knife.gd`, `grenade.gd`, `charge.gd`, `loadout.gd` (table in `assets/data/weapons.json`) |
| `15-arsenal.js` | `weapons/arsenal.gd` (`assets/data/arsenal.json`) |
| `15-ballistics.js` | `weapons/ballistics.gd` |
| `16-grenades.js` | `weapons/grenades.gd`, `weapons/smoke_cloud.gd` |
| `17-vm-models.js`, `18-viewmodel.js` | generated into `assets/models/` (rebuilt in `assetgen/17-vm-models.js`) and `assets/data/vm_clips.json`; `models/models.gd`, `view/viewmodel.gd` |
| `19-entities.js` | `world/ents.gd` |
| `20-models.js` | `models/player_model.gd`, `models/models.gd` (characters and world weapons rebuilt in `assetgen/20-models.js`) |
| `21-nav.js` | generated into `assets/maps/<map>/nav.bin` (`assetgen/21-nav.js`); `bots/nav.gd` |
| `22-actors.js` | `actors/actors.gd`, `actors/actor.gd`, `actors/combat.gd` |
| `22-wallbang.js` | `weapons/wallbang.gd` |
| `23-bots.js` | `bots/bots.gd`, `bots/bot_brain.gd` |
| `24-items.js`, `25-bomb.js` | `match/items.gd`, `match/bomb.gd` |
| `26-accounts.js`, `26-admin.js`, `26-profile.js` | `meta/accounts.gd`, `meta/admin.gd`, `meta/profile.gd` |
| `26-match.js` | `match/match.gd`, `meta/session.gd` |
| `27-tactics.js` | `bots/tactics.gd` |
| `28-radar.js` | generated `radar.png` and icons; drawn by `ui/hud.gd` |
| `29-hud.js`, `29-menus.js` | `ui/hud.gd`, `ui/menus.gd`, `ui/ui.gd`, `ui/emblem.gd` |
| `30-main.js` | `main.gd`, `meta/menu_cam.gd` |
