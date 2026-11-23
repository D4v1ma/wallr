class_name NetServer
extends RefCounted
## The host's side of a network match. The host's own game is the authority: each remote player is
## an Actor driven by the commands its client sends (one per tick, applied in order), and after every
## tick the host sends the reliable and effect events it collected, plus a snapshot every second
## tick: the round, the charge, every player, the items on the ground, grenades in flight, doors, and
## for each client its own ammo and the last command applied (so it can correct its prediction).

const SNAP_EVERY := 2        ## ticks per snapshot: 32 a second
const STATS_EVERY := 8       ## snapshots per refresh of the slow columns (money, kills, ping...)
const BACKLOG := 6           ## commands queued before the oldest are applied as movement only
const HIST_N := 64           ## ticks of positions kept for lag compensation (1 s)
const MAX_REWIND := 16.0     ## at most this many ticks back (250 ms): beyond that, lag is the shooter's


class Client:
	var peer := 0
	var name := "Player"
	var kits: Dictionary = {}
	var team_pref := -1
	var actor: Actor = null
	var ready := false
	var cmds: Array = []
	var last_seq := 0
	var last_cmd: Dictionary = {}
	var starved := 0


var clients: Dictionary = {}     ## peer id -> Client
var cfg: Dictionary = {}
var name := ""
var port := Net.PORT
var ev_rel: Array = []           ## [to (0 = all), except, event]
var ev_fx: Array = []
var snaps := 0
var roster_dirty := false
var lagcomp := true
var lag_hist: Dictionary = {}    ## actor -> [[tick, pos, yaw], ...] oldest first


func _init(c: Dictionary, n: String, p: int) -> void:
	cfg = c.duplicate(true)
	name = n
	port = p


func shutdown() -> void:
	clients.clear()
	ev_rel.clear()
	ev_fx.clear()


func size_per_side() -> int:
	return clampi(int(cfg.get("size", 8)), 1, 8)


func humans() -> int:
	var n := 1
	for c: Client in clients.values():
		if c.ready:
			n += 1
	return n


## What the LAN browser shows.
func lan_info() -> Dictionary:
	return {"name": name, "map": String(cfg.get("map", "")), "mapName": String(Level.MAPS.get(cfg.get("map", ""), {"name": cfg.get("map", "")}).name),
		"mode": String(cfg.get("mode", "defuse")), "players": humans(), "max": size_per_side() * 2, "port": port, "v": Net.VERSION}


# --- connections -----------------------------------------------------------------------------------

func on_connect(peer: int) -> void:
	var c := Client.new()
	c.peer = peer
	clients[peer] = c


func on_disconnect(peer: int) -> void:
	var c: Client = clients.get(peer)
	clients.erase(peer)
	if c == null or c.actor == null:
		return
	var team := c.actor.team
	Actors.remove_actor(c.actor)
	ev(["note", "%s left" % c.name])
	if bool(cfg.get("fill", true)) and Actors.on_side(team) < size_per_side():
		Actors.add_bot(team)
	roster_dirty = true


func on_msg(peer: int, type: int, data: Variant) -> void:
	var c: Client = clients.get(peer)
	if c == null:
		return
	match type:
		Net.M_HELLO:
			_hello(c, data)
		Net.M_READY:
			_ready_client(c)
		Net.M_BUY:
			if c.actor and data is Dictionary:
				var r := Match.buy(c.actor, String(data.get("id", "")))
				ev(["buy", r.ok, r.msg], peer)
		Net.M_TEAM:
			if c.actor and data is Dictionary:
				_switch(c, int(data.get("team", -1)))
		Net.M_CHAT:
			if c.actor and data is Dictionary:
				chat(c.actor, String(data.get("text", "")), bool(data.get("team", false)))


func _hello(c: Client, d: Variant) -> void:
	if not (d is Dictionary) or String(d.get("v", "")) != Net.VERSION:
		_reject(c, "Different game version (host has %s)" % Net.VERSION)
		return
	if humans() >= size_per_side() * 2:
		_reject(c, "The game is full")
		return
	c.name = String(d.get("name", "Player")).strip_edges().left(18)
	if c.name == "":
		c.name = "Player"
	c.kits = d.get("kits", {}) if d.get("kits") is Dictionary else {}
	c.team_pref = int(d.get("team", -1))
	Net.send_msg(c.peer, Net.M_WELCOME, {"map": cfg.map, "cfg": cfg, "name": name, "tick": Game.ticks})


func _reject(c: Client, why: String) -> void:
	Net.send_msg(c.peer, Net.M_REJECT, {"why": why})
	clients.erase(c.peer)
	Net.peer.disconnect_peer(c.peer, false)


## The client has the map loaded: give it a player (in place of a bot on that side if need be).
func _ready_client(c: Client) -> void:
	if c.ready:
		return
	var team := _pick_side(c.team_pref)
	if team < 0:
		_reject(c, "The game is full")
		return
	c.ready = true
	_make_room(team)
	c.actor = Actors.add_remote(c.peer, c.name, team, c.kits)
	roster_dirty = true
	ev(["note", "%s joined the %s" % [c.name, Actors.TEAMS[team].name]], 0, c.peer)
	Net.send_msg(c.peer, Net.M_STATE, {"history": Match.history, "score": Match.score, "len": Match.len, "ff": Actors.ff})


func _human_count(team: int) -> int:
	var n := 0
	for a: Actor in Actors.list:
		if not a.is_bot and a.team == team:
			n += 1
	return n


func _pick_side(pref: int) -> int:
	var size := size_per_side()
	var h := [_human_count(0), _human_count(1)]
	var team := pref
	if team != 0 and team != 1:
		team = 0 if h[0] < h[1] else (1 if h[1] < h[0] else (0 if Actors.on_side(0) <= Actors.on_side(1) else 1))
	if h[team] >= size:
		team = 1 - team
	return -1 if h[team] >= size else team


## A side that is full of bots loses one so a person can join.
func _make_room(team: int) -> void:
	if Actors.on_side(team) < size_per_side():
		return
	for a: Actor in Actors.list:
		if a.is_bot and a.team == team:
			Actors.remove_actor(a)
			return


func _switch(c: Client, team: int) -> void:
	if (team != 0 and team != 1) or c.actor.team == team or _human_count(team) >= size_per_side():
		return
	_make_room(team)
	var a := c.actor
	if a.alive:
		a.damage(999.0, "chest", a, {"name": "switched sides", "id": ""}, a.player.pos)
	Actors.set_side(a, team)
	a.squad = Match.squad_on_side(team) if Match.active else 0
	if bool(cfg.get("fill", true)) and Actors.on_side(1 - team) < size_per_side():
		Actors.add_bot(1 - team)
	roster_dirty = true


func chat(from: Actor, text: String, team_only: bool) -> void:
	text = text.strip_edges().left(120)
	if text == "":
		return
	var line := ["chat", from.id, from.name, from.team, text, team_only]
	if team_only:
		for c: Client in clients.values():
			if c.ready and c.actor and c.actor.team == from.team:
				ev(line, c.peer)
		if Actors.me and Actors.me.team == from.team:
			Net.client_event_local(line)
	else:
		ev(line)
		Net.client_event_local(line)


# --- commands --------------------------------------------------------------------------------------

func on_cmds(peer: int, pkt: PackedByteArray) -> void:
	var c: Client = clients.get(peer)
	if c == null or not c.ready or pkt.size() < 2:
		return
	var b := StreamPeerBuffer.new()
	b.data_array = pkt
	b.seek(1)
	var n := mini(b.get_u8(), 8)
	var got: Array = []
	for i in n:
		if b.get_available_bytes() < 24:
			break
		got.append(Wire.get_cmd(b))
	for cmd: Dictionary in got:
		var s := int(cmd.seq)
		if s <= c.last_seq:
			continue
		var dup := false
		for q: Dictionary in c.cmds:
			if int(q.seq) == s:
				dup = true
				break
		if not dup:
			c.cmds.append(cmd)
	c.cmds.sort_custom(func(x: Dictionary, y: Dictionary) -> bool: return int(x.seq) < int(y.seq))


## The command a remote player's actor uses this tick (its view angles come with it).
func next_cmd(a: Actor) -> Dictionary:
	var c: Client = clients.get(a.peer)
	if c == null:
		return Controls.IDLE.duplicate()
	# a burst left a backlog: walk the oldest ones (movement only) so positions stay in step
	while c.cmds.size() > BACKLOG:
		var old: Dictionary = c.cmds.pop_front()
		Wire.merge_edges(c.cmds[0], old)
		c.last_seq = int(old.seq)
		if a.alive and not Match.frozen() and not Bomb.defusing(a):
			a.player.yaw = float(old.yaw)
			a.player.pitch = float(old.pitch)
			a.player.tick(Wire.held_only(old), Game.DT)
			a.player.events.clear()
	var cmd: Dictionary
	if c.cmds.is_empty():
		cmd = Wire.held_only(c.last_cmd) if not c.last_cmd.is_empty() else Controls.IDLE.duplicate()
		c.starved += 1
	else:
		cmd = c.cmds.pop_front()
		c.last_seq = int(cmd.seq)
		c.last_cmd = cmd
	if cmd.has("yaw"):
		a.player.yaw = float(cmd.yaw)
		a.player.pitch = float(cmd.pitch)
	a.net_vt = float(int(cmd.get("vt", 0))) / 16.0
	return cmd


# --- lag compensation ------------------------------------------------------------------------------

## Remember where everyone stood after this tick.
func _record() -> void:
	for a: Actor in Actors.list:
		var h: Array = lag_hist.get(a, [])
		if h.size() >= HIST_N:
			h.pop_front()
		h.append([Game.ticks, a.player.pos, a.player.yaw])
		lag_hist[a] = h
	if Game.ticks % 256 == 0:
		for k: Actor in lag_hist.keys():
			if not Actors.list.has(k):
				lag_hist.erase(k)


## Before a remote player's shot is traced: put everyone else's hitboxes where that player saw
## them (the tick its client was drawing, at most MAX_REWIND back). Returns what to put back.
func rewind_for(shooter: Actor) -> Array:
	if not lagcomp or shooter.peer <= 0 or shooter.net_vt <= 0.0:
		return []
	var now := float(Game.ticks)
	var vt := clampf(shooter.net_vt, now - MAX_REWIND, now)
	var saved: Array = []
	for a: Actor in Actors.list:
		if a == shooter or not a.alive:
			continue
		var h: Array = lag_hist.get(a, [])
		if h.is_empty():
			continue
		var s0: Array = h[0]
		var s1: Array = h[0]
		for e: Array in h:
			if float(e[0]) <= vt:
				s0 = e
				s1 = e
			else:
				s1 = e
				break
		var k := 0.0 if int(s1[0]) == int(s0[0]) else clampf((vt - float(s0[0])) / float(int(s1[0]) - int(s0[0])), 0.0, 1.0)
		var root: Node3D = a.model.root
		saved.append([a, root.position, root.rotation])
		root.position = (s0[1] as Vector3).lerp(s1[1], k)
		root.rotation = Vector3(root.rotation.x, lerp_angle(float(s0[2]), float(s1[2]), k), root.rotation.z)
	return saved


func restore(saved: Array) -> void:
	for s: Array in saved:
		var root: Node3D = (s[0] as Actor).model.root
		root.position = s[1]
		root.rotation = s[2]


# --- events ----------------------------------------------------------------------------------------

## Queue an event for the clients: `to` one peer (0 = everyone), `except` one peer (its own client
## already shows it), reliable or as an effect (unreliable, may be dropped).
func ev(e: Array, to: int = 0, except: int = 0, reliable: bool = true) -> void:
	(ev_rel if reliable else ev_fx).append([to, except, e])


func roster() -> Array:
	var out: Array = []
	for a: Actor in Actors.list:
		out.append([a.id, a.name, a.team, a.is_bot, a.squad, 1 if a.is_me else a.peer])
	return out


## After each simulated tick: events out, and a snapshot every SNAP_EVERY ticks.
func after_tick() -> void:
	_record()
	if roster_dirty:
		roster_dirty = false
		var r := roster()
		for c: Client in clients.values():
			if c.ready:
				Net.send_msg(c.peer, Net.M_ROSTER, r)
	_flush(ev_rel, Net.M_EVENTS, Net.CH_REL, true)
	_flush(ev_fx, Net.M_FX, Net.CH_FX, false)
	if Game.ticks % SNAP_EVERY == 0:
		_snapshots()
	Net.flush()


func _flush(q: Array, type: int, channel: int, reliable: bool) -> void:
	if q.is_empty():
		return
	for c: Client in clients.values():
		if not c.ready:
			continue
		var mine: Array = []
		for x: Array in q:
			if (int(x[0]) == 0 or int(x[0]) == c.peer) and int(x[1]) != c.peer:
				mine.append(x[2])
		if not mine.is_empty():
			var b := PackedByteArray([type])
			b.append_array(var_to_bytes(mine))
			Net.send_raw(c.peer, b, channel, reliable)
	q.clear()


# --- snapshots -------------------------------------------------------------------------------------

func _snapshots() -> void:
	snaps += 1
	var stats := snaps % STATS_EVERY == 1
	var shared := StreamPeerBuffer.new()
	_put_shared(shared, stats)
	var body := shared.data_array
	for c: Client in clients.values():
		if not c.ready:
			continue
		var b := StreamPeerBuffer.new()
		b.put_u8(Net.M_SNAP)
		b.put_u32(Game.ticks)
		b.put_u32(c.last_seq)
		b.put_u8(c.actor.id if c.actor else 0)
		b.put_u8(1 if stats else 0)
		b.put_data(body)
		_put_me(b, c.actor)
		Net.send_raw(c.peer, b.data_array, Net.CH_UNREL, false)


func _put_shared(b: StreamPeerBuffer, stats: bool) -> void:
	# the round
	var M := Match
	b.put_u8(1 if M.active else 0)
	b.put_u8(maxi(0, Wire.PHASES.find(M.phase)))
	b.put_float(M.t)
	b.put_float(M.live_t)
	b.put_u8(M.round)
	b.put_u8(M.score[0])
	b.put_u8(M.score[1])
	b.put_u8(M.half)
	b.put_u8(1 if M.planted else 0)
	# the charge
	b.put_u8(maxi(0, Wire.BOMB.find(Bomb.state)))
	b.put_u8(Bomb.carrier.id if Bomb.carrier else 0)
	b.put_u8(Bomb.defuser.id if Bomb.defuser else 0)
	b.put_float(Bomb.timer)
	b.put_float(Bomb.defuse_t)
	b.put_float(Bomb.defuse_dur)
	var bp: Variant = Bomb.pos
	b.put_u8(1 if bp != null else 0)
	if bp != null:
		Wire.put_v3(b, bp)
		b.put_u8(Bomb.sites().find(Bomb.site) + 1 if Bomb.site != null else 0)
	# players
	b.put_u8(Actors.list.size())
	for a: Actor in Actors.list:
		var p := a.player
		var f := 0
		if a.alive: f |= Wire.F_ALIVE
		if p.ducked: f |= Wire.F_DUCKED
		if p.on_ground: f |= Wire.F_GROUND
		if p.noclip: f |= Wire.F_NOCLIP
		if a.helmet: f |= Wire.F_HELMET
		if a.kit: f |= Wire.F_KIT
		if a.wb_armed: f |= Wire.F_WB
		if a.is_bot: f |= Wire.F_BOT
		if a.loadout.by_id("charge") != null: f |= Wire.F_CHARGE
		b.put_u8(a.id)
		b.put_u16(f)
		Wire.put_v3(b, p.pos)
		Wire.put_h3(b, p.vel)
		Wire.put_yaw(b, p.yaw)
		Wire.put_pitch(b, p.pitch)
		b.put_u8(clampi(roundi(p.duck_amt * 255.0), 0, 255))
		b.put_u8(clampi(a.health, 0, 255))
		b.put_u8(clampi(a.armor, 0, 255))
		b.put_u8(Wire.wcode(a.loadout.active.id) if a.loadout.active else 0)
		b.put_u8(p.spawns & 0xff)
		if stats:
			b.put_u16(clampi(a.money, 0, 65535))
			b.put_16(clampi(a.kills, -32767, 32767))
			b.put_u16(clampi(a.deaths, 0, 65535))
			b.put_u16(clampi(a.dmg, 0, 65535))
			b.put_u8(clampi(a.hs, 0, 255))
			b.put_u8(clampi(a.plants, 0, 255))
			b.put_u8(clampi(a.defuses, 0, 255))
			b.put_u8(clampi(a.wb_charges, 0, 255))
			b.put_u8(a.squad)
			b.put_u16(clampi(Net.ping_of(a.peer) if a.peer > 0 else 0, 0, 65535))
	# weapons on the ground
	var its: Array = Items.list.filter(func(it: Dictionary) -> bool: return it.has("uid"))
	b.put_u8(mini(its.size(), 255))
	for i in mini(its.size(), 255):
		var it: Dictionary = its[i]
		b.put_u16(int(it.uid) & 0xffff)
		b.put_u8(Wire.wcode(String(it.id)))
		Wire.put_v3(b, it.p)
		b.put_half(float(it.yaw))
		b.put_half(float(it.roll))
		b.put_u8(1 if it.rest else 0)
	# grenades in flight (and resting until they pop)
	var gs: Array = Grenades.list.filter(func(g: Dictionary) -> bool: return g.has("uid"))
	b.put_u8(mini(gs.size(), 255))
	for i in mini(gs.size(), 255):
		var g: Dictionary = gs[i]
		b.put_u16(int(g.uid) & 0xffff)
		Wire.put_v3(b, g.p)
		Wire.put_h3(b, g.rot)
		b.put_u8((1 if g.rest else 0) | (2 if g.popped else 0))
	# doors
	b.put_u8(Ents.doors.size())
	for d: Ents.Door in Ents.doors:
		b.put_half(d.angle)
		b.put_half(d.target)


## The receiving client's own details: movement leftovers for its prediction, and its guns.
func _put_me(b: StreamPeerBuffer, a: Actor) -> void:
	if a == null:
		b.put_u8(0)
		return
	b.put_u8(1)
	b.put_float(a.player.stamina)
	b.put_float(a.player.land_penalty)
	b.put_u8(Wire.wcode(a.loadout.active.id) if a.loadout.active else 0)
	b.put_u8(a.loadout.list.size())
	for w: Weapon in a.loadout.list:
		b.put_u8(Wire.wcode(w.id))
		if w is Gun:
			b.put_u16((w as Gun).ammo)
			b.put_u16((w as Gun).reserve)
		elif w is Grenade:
			b.put_u16((w as Grenade).count)
			b.put_u16(0)
		else:
			b.put_u16(0)
			b.put_u16(0)


# --- game hooks (called from the simulation on the host) -----------------------------------------

## A shot as the clients need to draw it: where it went, what it hit (walls by brush and face, so
## decals land on the same polygons), who bled.
func ev_shot(a: Actor, w: Weapon, e: Dictionary, shot: Dictionary) -> void:
	var rs: Array = []
	for r: Dictionary in shot.results:
		var res: Dictionary = r.res
		var imps: Array = []
		for imp: Dictionary in res.impacts:
			imps.append([imp.point, imp.normal, int(imp.surf), bool(imp.exit), (imp.brush as CollisionWorld.Brush).id, int(imp.plane)])
		var hit: Array = []
		if res.actor != null:
			var h: Dictionary = res.actor
			hit = [(h.target as Actor).id, h.point, String(h.group)]
		var tg: Array = []
		if res.target != null:
			var t: Dictionary = res.target
			tg = [Ents.targets.find(t.target), t.point, t.normal]
		rs.append([r.dir, res.end, imps, hit, tg, int(res.pens)])
	ev(["shot", a.id, w.id, bool(e.get("tracer", false)), bool(shot.wallbang), shot.eye, shot.dir, rs], 0, 0, false)
	# the shooter's client gets a hitmarker; victims' clients get the hurt (Actor.damage)
	if a.peer > 0:
		var head := false
		var any := false
		for r: Dictionary in shot.results:
			if r.res.actor != null:
				any = true
				head = head or r.res.actor.group == "head"
		if any:
			ev(["hit", head], a.peer)


func ev_knife(a: Actor, e: Dictionary, r: Dictionary) -> void:
	var hit: Dictionary = r.hit
	if hit.is_empty():
		ev(["knife", a.id, bool(e.heavy), ""], 0, 0, false)
		return
	match String(hit.kind):
		"actor":
			ev(["knife", a.id, bool(e.heavy), "actor", (hit.target as Actor).id, hit.point, int(hit.surf)], 0, 0, false)
			if a.peer > 0:
				ev(["hit", false], a.peer)
		"target":
			ev(["knife", a.id, bool(e.heavy), "target", Ents.targets.find(hit.target), hit.point, hit.normal, int(hit.surf)], 0, 0, false)
		_:
			ev(["knife", a.id, bool(e.heavy), "world", hit.point, hit.normal, int(hit.surf), (hit.brush as CollisionWorld.Brush).id, int(hit.plane)], 0, 0, false)
