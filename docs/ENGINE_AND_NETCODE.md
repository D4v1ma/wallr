# Short Fuse: the path to a real engine and to multiplayer

The browser prototype is built so both moves are incremental rather than rewrites:

- The simulation is a fixed **64 Hz tick** driven by **input commands** (`Input.buildCmd`
  produces `{ fwd, side, jump, duck, walk, fire, alt, reload, use, slot, … }` plus view
  angles).
- Rendering only interpolates between ticks.
- Players and bots run the same movement, weapon and damage code.
- The whole game already runs headless in Node; the test suites play complete bot matches
  without a browser.

That is exactly the shape a server-authoritative networked shooter needs.

There are two independent tracks. Do them in this order:

1. **Multiplayer on the current JavaScript code** (fastest to something playable online).
2. **Port to an engine** (for production art, performance, tooling and platforms). The network
   design carries over unchanged.

---

## Track 1 — Multiplayer (server authority, client prediction, lag compensation)

### Architecture

```
 clients (browser)                         dedicated server (Node, headless)
 ─────────────────                         ─────────────────────────────────
 input → usercmd #n ──────────────────────▶ queue per player, applied in order each tick
 predict own movement/weapon (same code)    authoritative sim: movement, shots, damage,
 interpolate others ~100 ms in the past      economy, rounds, the charge, bots (64 Hz)
 render                ◀──────────────────── snapshots (20–32 Hz, delta-compressed)
                                             history of every player's hitboxes (1 s)
```

- **Transport:** WebRTC data channels in unreliable, unordered mode for usercmds and snapshots,
  plus one reliable channel for events (kill feed, buys, chat). A WebSocket fallback
  (reliable) is fine for LAN or testing.
  - In an engine: ENet (Godot) or UTP / Steam sockets (Unity).
- **Server:** the existing modules minus rendering, audio and DOM. That is exactly what the
  Node test harnesses (`tools/node-match-check.mjs`, `tools/node-depot-check.mjs`) load today
  with stubs for `R`, `FX` and `Snd`. Each game server is one process per match at 64 Hz.
  Measured cost: about 0.15–0.45 ms per tick for 10 players including bots.

### Messages

- **usercmd** (client → server, every tick, redundantly carrying the last 2–3 for packet loss):
  sequence number, client tick, buttons bitfield, move axes (fixed-point), yaw/pitch
  (16-bit each), weapon slot.
- **snapshot** (server → client): server tick, last processed usercmd sequence for this
  client, then delta-compressed per-entity state against the last snapshot the client
  acknowledged:
  - players: position, velocity, yaw/pitch, duck amount, health, armor, active weapon, weapon
    state and animation clock, alive;
  - items, the charge, doors, round phase and clock, money for your own team.
- **events** (reliable): kills (killer, victim, weapon id, headshot), round start and end,
  plants and defuses, buy results, sounds that matter (footsteps are derived client-side
  from movement).

### Client-side prediction and reconciliation

1. The client applies its own usercmd immediately with the **same** `Player.tick` and
   `Loadout.tick` code. It keeps a ring buffer of `{ seq, cmd, predicted state }`.
2. When a snapshot arrives saying "processed up to seq N, your state was S", the client sets
   its player to S and **replays** every buffered cmd after N. That gives the corrected
   present.
3. Small errors are smoothed over ~100 ms (blend the camera, never the simulation). Large
   ones (teleports, respawns) snap.
4. Predict weapons too: fire rate, ammo, recoil index, reload timing, muzzle flash, sounds and
   viewmodel animation, so shooting feels instant. **Never** predict damage or kills;
   hitmarkers come from server events.
5. Spread must match between client and server. Seed it per shot from `(player id, usercmd
   seq)` instead of `Math.random`, so the client draws tracers and decals where the server
   will actually hit. `Ballistics.rnd` becomes `seededRandom(playerId, seq)`.

Code changes this needs here:

- Make every `Math.random` in simulation paths seedable.
- Make `Player` and `Gun` state serialisable with `copy()` and `restore()`.
- Separate the "predicted local player" from the "interpolated remote players".

### Entity interpolation

- Render remote players at `serverTime − interpDelay` (about 100 ms, or 2 snapshot intervals
  plus jitter margin).
- Interpolate position, angles and duck between the two bracketing snapshots. Today's
  `prev`/`pos` and `alpha` render path already does this within one tick; it generalises to
  snapshot buffers.
- Animation is procedural from movement state (`PlayerModel.update`), so it needs no
  animation sync.
- Extrapolate at most 100–200 ms when packets are late, then freeze.

### Lag compensation

When the server processes a shot from player P with usercmd `seq` it:

1. computes the time P was looking at:
   `t = cmdTime − P.interpDelay` (the client sends its interp delay; latency is implicit in
   `cmdTime`);
2. rewinds every other player's hitboxes to time `t` from a ring buffer of per-tick poses
   (position, yaw, duck, gait phase, so `PlayerModel` can rebuild bone matrices; the
   hitboxes are already bone-local boxes);
3. runs the existing `Ballistics.bullet` / `Actors.hitscan` against the rewound poses
   (walls are static, doors use their pose at `t`);
4. restores the present and applies damage now.

Cap the rewind at 200 ms; beyond that the shooter's latency is their own problem. Log rewind
distances to detect abuse. This is the same model the classic games use; "shot behind a wall"
complaints are its known trade-off.

### Authority and anti-cheat basics

- **The server owns** movement validation (it simulates from cmds, so speedhacks simply don't
  move you), fire rate and ammo, money and buy rules (`Match.buy` runs only on the server), the
  charge, rounds and all damage.
- **Clamp** view-angle deltas per tick and cmd rates per second. Drop cmds from the future
  (client tick ahead of server tick plus slack).
- **Don't send** what the client shouldn't know: enemy positions behind walls are culled
  per client with a coarse PVS from the brush BVH (a line-of-sight test against hull
  corners, with a margin of a few ticks of movement). That is enough against basic
  wallhacks.

### Milestones

1. Headless server process from today's modules; WebSocket transport; clients send cmds and
   render server snapshots (no prediction yet, which feels laggy but works).
2. Client prediction and reconciliation for movement, then weapons. Seeded spread.
3. Snapshot delta compression and interpolation buffers; packet-loss and jitter tests with a
   simulated bad network (100–200 ms, 2–5% loss).
4. Lag compensation with hitbox history; a debug overlay comparing client hitboxes with the
   server's rewound ones.
5. WebRTC unreliable channels; lobby and matchmaking service (rooms of 10, bot fill for empty
   slots, which already works).

---

## Track 2 — Port to an engine

### Recommendation: Godot 4

- **Licence and size:** MIT-licensed, no royalties or runtime fees, small exports (desktop and
  web).
- **Level workflow:** our maps are already convex brushes. Export them to the Quake `.map`
  format, edit them in **TrenchBroom**, and import them with **func_godot**. Mappers then get
  a real brush editor instead of the JavaScript DSL.
- **Built-in tools that cover the rest:** LightmapGI replaces `08-bake.js` (same idea: baked
  direct light, bounces and light probes for dynamic objects). NavigationServer3D's navmesh
  replaces the grid graph. glTF import covers the skinned models. GDScript or C# for
  gameplay, and ENet for multiplayer.

**Unity** is the alternative if you want its asset ecosystem and console pipelines. Use
ProBuilder or a `.map` importer for brushes, Progressive Lightmapper and light probes, and
Netcode for GameObjects or Fish-Net (both support client prediction and reconciliation;
lag compensation is usually your own code). Mind the licence terms. The plan below maps
almost one to one.

### Module-by-module mapping (Godot 4)

| Prototype module | Godot 4 |
| --- | --- |
| `05-collision.js` swept boxes, brush BVH | Keep the movement code's semantics. Use `PhysicsDirectSpaceState3D.cast_motion` with a box shape (or a custom shape-cast "trace" helper) so `13-player.js` ports nearly verbatim: Q3-style slide-move, step-up, stay-on-ground |
| `13-player.js` movement | `CharacterBody3D` driven manually from `_physics_process` at `physics_ticks_per_second = 64`, using our own accelerate/friction/air-accelerate; don't use `move_and_slide` if you want the exact feel |
| `06-level.js`, `07-map*.js` | A `.map` exporter in `tools/` (brushes, faces, texture names, spawns, sites, areas, tactical data as entity key-values). TrenchBroom for editing, func_godot import, LightmapGI bake |
| `03/04-tex-*.js` procedural textures | Run the generators once in Node to write PNGs (same seeds, same look), or port the noise to shaders. Keep 2× lightmap modulate, or switch to standard PBR with low roughness variety |
| `08-bake.js` | LightmapGI (bounces 1–2, texel size about 16 units scaled to metres) + LightmapProbes |
| `09-render.js` viewmodel pass | A second camera on a separate render layer, or a SubViewport, for the viewmodel with its own FOV; muzzle flash as an additive sprite + OmniLight |
| `14/15/16-*.js` weapons, ballistics, grenades | Port as plain GDScript/C# classes (they are engine-agnostic state machines). Raycasts via `intersect_ray` against world and hitbox layers; penetration uses the same thickness × material rule |
| `17/18-vm-*.js` viewmodels | Export the generated meshes to glTF (or rebuild in Blender); keyframes to `AnimationPlayer` tracks; keep procedural bob, sway and kick in script |
| `20-models.js` players | glTF skinned characters (export ours as a start), `Skeleton3D`; procedural gait and IK in script or `SkeletonIK3D`; hitboxes as `Area3D` boxes on `BoneAttachment3D` |
| `21-nav.js`, `23-bots.js`, `27-tactics.js` | NavigationRegion3D navmesh + NavigationAgent3D for paths; bot brain and tactics port directly (they only use positions, LOS raycasts and orders); tactical spots become map entities |
| `22/24/25/26-*.js` actors, items, the charge, rounds, money | Server-side GDScript/C# (autoloads/singletons), unchanged rules |
| `11-audio.js` WebAudio synthesis | Pre-render each sound to WAV with the same parameters (offline Node + a WebAudio polyfill, or OfflineAudioContext in a browser), then `AudioStreamPlayer3D` with attenuation and a reverb bus |
| `28-radar.js`, `29-hud.js` | `Control` nodes; radar as a `SubViewport` top-down render or the same 2D overview approach drawn into a `TextureRect` |

### Order of work

1. Exporter: our maps to `.map` + entity data; import Saltpan Depot into Godot and bake lighting.
2. Movement and collision port; compare jump height, strafe speeds and stair stepping against
   the `node-move-check` numbers.
3. Weapons, viewmodels, hitboxes, damage (port the weapon and bot test suites as GUT or C#
   unit tests so behaviour stays identical).
4. Rounds, economy, the charge, bots on the navmesh.
5. Networking with the Track 1 design (server-authoritative, prediction, interpolation, lag
   compensation) using ENet.
6. Art pass: replace procedural assets where it pays off; keep the procedural ones as
   placeholders.
