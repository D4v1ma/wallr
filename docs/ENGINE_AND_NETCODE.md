# wallr: the engine port and network play

This document had two tracks: port the browser prototype to a real engine, then add
multiplayer. **Both are done**: the game runs in Godot 4.7 (`godot/`, how the port was done is
at the end), and it plays over the network with host authority, client prediction,
interpolation and lag compensation. This part describes the network code as built and what is
still to do.

The port kept the shape that made networking an addition rather than a rewrite:

- The simulation is a fixed **64 Hz tick** (`main.sim_tick` from `_physics_process`) driven by
  **input commands**: `Controls.build_cmd()` produces `{ fwd, side, jump, jumpHeld, duck, walk,
  fire, alt, reload, use, useHeld, drop, inspect, slot, last, cycle, wallbang }` plus the view
  angles.
- Rendering only interpolates between ticks (`prev`/`pos` with
  `Engine.get_physics_interpolation_fraction()`).
- Players and bots run the same movement, weapon and damage code: `Player.tick(cmd, dt)`,
  `Loadout.tick(cmd, …)`, `Combat`, `Ballistics`, `Actors.hitscan`. A bot's `BotBrain.think()`
  returns the same command a keyboard does, and so does a remote player's queue on the host.
- The whole game runs headless (`godot --headless`), which is what a dedicated server is.

---

## Network play (as built)

### Architecture

```
 clients                                     the host (a player's PC, or a dedicated server)
 ───────                                     ───────────────────────────────────────────────
 input → cmd #n, sent with #n-1 and #n-2 ──▶ queue per player, one cmd applied per tick
 predict own movement and gun (same code)    the match: movement, shots, damage, money,
 draw the others 5 ticks behind the          rounds, the charge, doors, smoke, bots (64 Hz)
   newest snapshot, between snapshots   ◀─── snapshot every 2nd tick (32 Hz), unreliable
 effects, sounds, kill feed, banners    ◀─── events: reliable (kills, rounds, buys, chat)
                                             and effects (shots, steps), unreliable
                                             1 s of everyone's positions for lag compensation
```

- **Transport:** `ENetMultiplayerPeer` used as a raw packet pipe (`put_packet` with a target,
  transfer mode and channel; no RPCs, no `SceneMultiplayer`, no synchronizer nodes), with
  ENet's range coder compression. Channel 0 is reliable (handshake, roster, events), channel 1
  unreliable (commands and snapshots), channel 2 unreliable (effects). The first byte of every
  packet is the message type. `scripts/net/net.gd` (the `Net` autoload) owns the peer, the LAN
  discovery and the network simulator; `net_server.gd` is the host's side, `net_client.gd` the
  client's, `wire.gd` the binary format.
- **Who hosts:** a player's own game (a listen server: the host plays and its menus don't pause
  the match), or a **dedicated server**: the same project started with `--server` under
  `--headless`. On a dedicated server the local player exists only as a viewpoint (it is not in
  `Actors.list`), profiles aren't touched, the match idles while nobody is connected and
  restarts for the first player in, and `Net.log_line` writes a console log.
- **Ports:** UDP 27620 for the game; UDP 27621 for LAN discovery (a client sends `WALLR?` to
  255.255.255.255, to each of its networks' /24 broadcast address, since on a PC with several
  adapters the plain broadcast can leave by the wrong one, and to 127.0.0.1; every host answers
  with its name, map, mode, players and port as JSON, and a game on the same PC is listed once).
  The host lists its own addresses home and office networks first, VPNs next and adapters only
  it can use (containers, virtual machines, WSL) last.
- **Up to 16 players** (8 a side). People take bots' places when they join and bots come back
  when they leave (`fill`).

### Joining

1. Client → `HELLO`: protocol version, name (`Guest 123` for a guest), the attachments on its
   guns (so its weapons behave the same on the host), preferred side.
2. Host → `WELCOME`: the map, the match settings, the game's name, the host's tick; or
   `REJECT` with a reason (another version, the game is full). Names are made unique.
   A client that hasn't been welcomed within 10 seconds gives up (ENet's own timeout is much
   longer) and goes back to the Join screen saying what to check; one that drops or is turned
   away before its first snapshot also lands there, and one that loses a match it was playing
   lands on the Multiplayer screen with the reason.
3. The client loads the map, then → `READY`. The host gives it an actor on a side (removing a
   bot there if the side is full), sends `ROSTER` to everyone and `STATE` (score, round
   history, rules) to the joiner. In a defuse match the joiner plays at once during buy time,
   otherwise from the next round.

### Messages

- **Commands** (client → host, every tick, unreliable): sequence number, buttons (13 bits),
  move axes, weapon slot and wheel, yaw and pitch as floats, and the tick the client is drawing
  the others at (in 1/16 ticks), 24 bytes each. Every packet repeats the two before it, so a
  lost packet costs nothing. The host drops duplicates and old ones, applies one per tick, and
  when a burst piles up more than 6 it walks the oldest as movement only so positions stay in
  step; a starved queue repeats the held buttons of the last command.
- **Snapshots** (host → each client, 32 a second, unreliable): the host tick, the last command
  applied for this client, its actor id; the round (phase, clock, score, half); the charge
  (state, carrier, defuser, fuse and defuse timers, position, site); every player (flags,
  position, velocity in half floats, yaw and pitch, duck, health, armor, weapon, a spawn
  counter, and every 8th snapshot the slow columns: money, kills, deaths, damage, headshots,
  plants, defuses, wallbang rounds, squad, ping); weapons on the ground; grenades in flight;
  doors; and for this client only: stamina, landing slowdown, the active weapon and every
  weapon's ammo. Each player receives about 7 KB/s in a 2v2 and 19 KB/s in an 8v8, before
  compression.
- **Events** (reliable unless marked): `roster`, `round`, `go`, `end`, `plant`, `defused`,
  `explode`, `kill` (killer, weapon, headshot, wallbang, death direction), `hurt` and `hit`
  (to the player concerned), `buy` (the result of a purchase), `pickup`, `note`, `wb` (wallbang
  round state), `door`, `smoke` (a cloud's seed, so it billows the same everywhere), `snd`
  (positional sounds such as the charge being defused), `chat` and `sys` (joins, leaves and
  side switches in the chat); and as effects (unreliable): `shot` (tracer, impacts with the
  brush and plane they hit, bodies hit), `knife`, `step`, `eject`.
- Client → host, reliable: `BUY` (the host runs `Match.buy`), `TEAM` (switch sides), `CHAT`
  (rate-limited).

### Client-side prediction and reconciliation

1. Each tick the client builds its command, sends it and applies it at once to its own player
   with the **same** `Player.tick` and `Loadout.tick` the host runs (with the host's
   restrictions: frozen in buy time, pinned while defusing). It keeps the commands the host
   hasn't confirmed.
2. When a snapshot says "applied up to command N, you are at S", the client takes S and
   **replays** every command after N. The difference between the old and the replayed position
   goes into a camera offset that fades out over about 80 ms; the simulation itself is never
   blended. A respawn (the spawn counter changed) takes the host's state and view outright.
3. Weapons are predicted too: fire rate, ammo, recoil, reload, switching, the viewmodel and the
   sound, so shooting feels instant. Ammo and the active weapon only take the host's value once
   it has seen the trigger pull or switch that changed them. Damage and kills are **never**
   predicted: hitmarkers, hurt flashes and the kill feed come from the host.
4. **Spread is seeded per shot** from `(shooter id, command sequence)` (`Wire.shot_seed`), for
   both the gun's jitter and every pellet, so the tracer and the impacts the client draws are
   where the host's shot actually goes.

### Entity interpolation

- Everyone else is drawn 5 ticks (78 ms) behind the newest snapshot, between the two snapshots
  around that time: position, velocity, yaw, pitch and duck. The client's estimate of the host
  tick advances one per tick and drifts toward the snapshots' ticks.
- A player whose snapshots are late keeps moving on its last velocity for up to 8 ticks, then
  stops.
- Animation is procedural from the movement state (`PlayerModel.update`), so it needs no
  syncing. Grenades, dropped weapons, doors and the charge come from the snapshots.

### Lag compensation

1. The host keeps 64 ticks (one second) of every player's position and yaw.
2. Each command says which tick the client was drawing the others at. Before tracing a remote
   player's shot or knife (wallbang rounds included), the host moves everyone else's hitboxes
   to where they were at that tick, interpolated between the two recorded ticks around it, at
   most 16 ticks (250 ms) back: beyond that, the lag is the shooter's.
3. It runs the usual `Combat.shot` / `Ballistics` / `PlayerModel.hit_test` path, puts everyone
   back and applies the damage in the present.

In the `mp_lag` test a client taps 16 shots at the host strafing across its view: all 16 land
with compensation at a 100 ms round trip, against 18% without it (44% on localhost).

### Authority

- The host owns movement (it simulates from commands, so a client can't move faster than the
  rules allow), fire rate and ammo, wallbang rounds, money and buying, the charge, rounds, doors,
  grenades and all damage. A client's own state is only ever a prediction.
- Admin powers are off in network games. Network matches pay XP and points like casual matches
  on each player's own profile; Elo stays a rating against bots.

### Testing it

- `--netsim=delay,loss,jitter` holds every outgoing packet for `delay` ms (unreliable ones up
  to `jitter` ms longer, so they can arrive out of order as on the internet) and drops `loss`
  percent of the unreliable ones, at whichever end it's given (the tests pass it to both).
  Reliable messages keep their order.
- The suites start real Godot processes on one computer: `mp` (a host and two clients),
  `mp_dedicated` (a dedicated server and a client), `mp_lag` (hit rates with and without lag
  compensation) and `mp_shots` (a rendered client's screenshots). The client process writes
  its checks to the tests' data folder and the host process reports them.

### Still to do

1. **Dedicated server:** a map rotation (send `WELCOME` again so clients reload), console
   commands (kick, change map, say), a "dedicated server" export preset without the textures
   and sounds.
2. **Internet play without addresses:** a small master server that hosts register with and
   clients list, plus NAT punch-through or relays.
3. **Bandwidth:** delta-compress snapshots against the last one the client acknowledged, and
   send far-away players less often.
4. **Don't send what a client shouldn't know:** cull enemies behind walls per client with a
   line-of-sight test (`CollisionWorld.ray`) against their hull corners, with a margin of a few
   ticks of movement; clamp view-angle changes and command rates.
5. **Web:** WebRTC for the Web export (`WebRTCMultiplayerPeer` with a signalling server);
   browsers have no UDP, so ENet is desktop only.
6. **Accounts, profiles and Elo on a server**, so ranked play against people is possible, and
   admin as a server-side role.

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
| Tests | GUT or C# unit tests | A small runner (`tests/runner.tscn`) with 87 checks (including the map layout checks) plus the match, network and screenshot suites |

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
