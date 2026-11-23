class_name NetClient
extends RefCounted
## A client's side of a network match. Every tick it sends its command (with the two before it, in
## case one is lost) and plays it at once on its own player: movement and the gun in hand are
## predicted with the same code the host runs. Each snapshot says which command the host applied
## last; the client puts its player where the host had it and replays the commands since, so a
## difference shows only as a small, smoothed correction. Everyone else is drawn INTERP ticks in the
## past, between the two snapshots around that moment. Kills, rounds, sounds and effects arrive as
## events from the host.

const INTERP := 5           ## ticks behind the newest snapshot that other players are drawn at
const MAX_EXTRAP := 8       ## ticks a late player keeps moving on its last velocity
const HIST := 256

var welcomed := false
var ready := false
var drop_reason := ""
var cfg: Dictionary = {}
var host_name := ""
var map_key := ""
var my_id := 0
var seq := 0
var hist: Array = []        ## [seq, cmd] the host hasn't applied yet, oldest first
var ack := 0
var snap_tick := 0
var est := 0.0              ## estimated host tick now
var have_snap := false
var bufs: Dictionary = {}   ## actor id -> [[tick, pos, vel, yaw, pitch, flags, duck], ...]
var spawns: Dictionary = {} ## actor id -> spawn counter last seen
var wcache: Dictionary = {} ## weapon id -> Weapon, to draw other players' shots
var last_switch := 0        ## seq of the last weapon switch we predicted
var last_trigger := 0       ## seq of the last trigger / reload we predicted
var pings: Dictionary = {}  ## actor id -> ms
var corr := Vector3.ZERO    ## camera offset that hides a prediction correction, fading out
var bytes_in := 0
var quiet := 0.0            ## seconds since the last snapshot


# --- handshake -------------------------------------------------------------------------------------

func send_hello() -> void:
	var kits := {}
	for gun: String in ["pistol", "smg", "shotgun", "rifle", "sniper"]:
		kits[gun] = Arsenal.kit_for(gun)
	Net.send_msg(1, Net.M_HELLO, {"v": Net.VERSION, "name": Net.player_name(), "kits": kits, "team": int(Settings.get_value("mpTeam")) if Settings.v.has("mpTeam") else -1})


func on_msg(type: int, data: Variant) -> void:
	match type:
		Net.M_WELCOME:
			if not (data is Dictionary):
				return
			welcomed = true
			cfg = data.get("cfg", {})
			host_name = String(data.get("name", "Host"))
			map_key = String(data.get("map", "depot"))
			est = float(data.get("tick", 0))
			Net.status = "Loading %s…" % Level.MAPS.get(map_key, {"name": map_key}).name
			Net.state_changed.emit()
			_load.call_deferred()
		Net.M_REJECT:
			drop_reason = String(data.get("why", "The host turned us away")) if data is Dictionary else "The host turned us away"
			Net.leave(drop_reason)
			Session.network_lost(drop_reason)
		Net.M_ROSTER:
			if data is Array and ready:
				_roster(data)
		Net.M_STATE:
			if data is Dictionary:
				Match.history = data.get("history", [])
				Match.score = data.get("score", [0, 0])
				Match.len = data.get("len", Match.LENGTHS.standard)
				Actors.ff = bool(data.get("ff", false))
		Net.M_EVENTS, Net.M_FX:
			if data is Array and ready:
				for e: Variant in data:
					if e is Array and not (e as Array).is_empty():
						event(e)


## Load the host's map, then tell the host we're in.
func _load() -> void:
	if Net.client != self:
		return
	Menus.show_screen("loading", false)
	await Menus.get_tree().process_frame
	await Menus.get_tree().process_frame
	if Net.client != self:
		return
	Game.main.load_map(map_key)
	Session.begin_client(cfg, host_name)
	Actors.me.alive = false
	ready = true
	Net.send_msg(1, Net.M_READY, {})
	Net.status = "In game · %s" % host_name
	Net.state_changed.emit()
	Game.main.play()


func _roster(r: Array) -> void:
	var mine := Net.peer.get_unique_id() if Net.peer else 0
	var seen := {}
	for e: Variant in r:
		if not (e is Array) or (e as Array).size() < 6:
			continue
		var id := int(e[0])
		var n := String(e[1])
		var team := int(e[2])
		var bot := bool(e[3])
		var owner := int(e[5])
		var a: Actor
		if owner == mine:
			a = Actors.me
			my_id = id
			a.id = id
		else:
			a = Actors.by_id(id)
			if a == null or a == Actors.me:
				a = Actors.add_puppet(id, n, team, bot)
		a.name = n
		if a.team != team:
			Actors.set_side(a, team)
		a.squad = int(e[4])
		a.is_bot = bot
		a.peer = owner
		seen[id] = true
	for a: Actor in Actors.list.duplicate():
		if a != Actors.me and not seen.has(a.id):
			bufs.erase(a.id)
			Actors.remove_actor(a)


# --- the tick --------------------------------------------------------------------------------------

func tick(dt: float) -> void:
	if not ready:
		return
	Game.time += dt
	Game.ticks += 1
	est += 1.0
	var me := Actors.me
	var cmd: Dictionary = Controls.build_cmd() if Game.state == "play" else Controls.IDLE.duplicate()
	seq += 1
	cmd.seq = seq
	cmd.sid = me.id
	cmd.yaw = me.player.yaw
	cmd.pitch = me.player.pitch
	cmd.vt = maxi(0, int((est - INTERP) * 16.0))     # the tick we draw the others at, in 1/16 ticks
	if int(cmd.slot) > 0 or cmd.last or int(cmd.cycle) != 0 or cmd.drop:
		last_switch = seq
	if cmd.fire or cmd.alt or cmd.reload or cmd.drop:
		last_trigger = seq
	if cmd.wallbang:
		pass  # the host answers with a "wb" event
	_send(cmd)
	# predict: the same restrictions the host applies (buy time, defusing)
	var c := cmd.duplicate()
	if Match.frozen() or Bomb.defusing(me):
		c.fwd = 0.0; c.side = 0.0; c.jump = false; c.fire = false; c.alt = false; c.drop = false
	hist.append([seq, c])
	if hist.size() > HIST:
		hist.pop_front()
	if me.alive:
		me.player.tick(c, dt)
		me.loadout.tick(c, me.player, Game.time, dt)
		_own_events(me)
	else:
		me.player.events.clear()
		for w: Weapon in me.loadout.list:
			w.events.clear()
	_others(dt)
	corr = corr * exp(-dt * 12.0)
	# the host went quiet (crashed, cable pulled): don't wait for ENet's long timeout
	quiet += dt
	if have_snap and quiet > 6.0:
		var r := "Lost the connection to the host"
		Net.leave(r)
		Session.network_lost(r)


func _send(cmd: Dictionary) -> void:
	var b := StreamPeerBuffer.new()
	b.put_u8(Net.M_CMD)
	var n := mini(3, hist.size() + 1)
	b.put_u8(n)
	Wire.put_cmd(b, cmd)
	for i in n - 1:
		var h: Array = hist[hist.size() - 1 - i]
		var old: Dictionary = (h[1] as Dictionary).duplicate()
		Wire.put_cmd(b, old)
	Net.send_raw(1, b.data_array, Net.CH_UNREL, false)
	Net.flush()


## Our own footsteps, gun and knife: sounds and effects at once (the host decides the damage).
func _own_events(me: Actor) -> void:
	for ev: Dictionary in me.player.events:
		match ev.type:
			"step": Snd.footstep(U.surf_name(ev.surf))
			"jump": Snd.jump()
			"land": Snd.land(U.surf_name(ev.surf), ev.speed)
	me.player.events.clear()
	for w: Weapon in me.loadout.list:
		for e: Dictionary in w.events:
			match String(e.type):
				"shot":
					var shot := Combat.shot(me, w, e, true)
					Game.main.shot_fx(me, w, e, shot, "world")
				"sfx":
					if e.part == w.def.get("ejectOn", ""):
						Game.main.eject_shell(me, w)
					Snd.sfx(e.part)
				"dry": Snd.dry()
				"zoom": Snd.sfx("zoom")
				"swing": Snd.knife_swish(e.heavy)
		w.events.clear()


## Everyone else: drawn between the two snapshots around (newest - INTERP).
func _others(dt: float) -> void:
	var rt := est - INTERP
	for a: Actor in Actors.list:
		if a.alive:
			a.alive_t += dt
		else:
			a.dead_t += dt
		a.hurt_t = maxf(0.0, a.hurt_t - dt * 1.6)
		if a == Actors.me:
			continue
		var buf: Array = bufs.get(a.id, [])
		var p := a.player
		p.prev = p.pos
		if buf.is_empty():
			continue
		while buf.size() > 2 and float(buf[1][0]) <= rt:
			buf.pop_front()
		var s0: Array = buf[0]
		var s1: Array = buf[1] if buf.size() > 1 else buf[0]
		var t0 := float(s0[0])
		var t1 := float(s1[0])
		var pos: Vector3
		var k := 0.0
		if rt <= t0 or s1 == s0:
			pos = s0[1]
			if rt > t0:   # past the newest sample: keep going a little on the last velocity
				pos = (s0[1] as Vector3) + (s0[2] as Vector3) * (minf(rt - t0, MAX_EXTRAP) * Game.DT)
		else:
			k = clampf((rt - t0) / (t1 - t0), 0.0, 1.0)
			pos = (s0[1] as Vector3).lerp(s1[1], k)
		p.pos = pos
		p.vel = (s0[2] as Vector3).lerp(s1[2], k)
		p.yaw = lerp_angle(float(s0[3]), float(s1[3]), k)
		p.pitch = lerpf(float(s0[4]), float(s1[4]), k)
		var f: int = s1[5] if k >= 0.5 else s0[5]
		p.ducked = (f & Wire.F_DUCKED) != 0
		p.on_ground = (f & Wire.F_GROUND) != 0
		p.noclip = (f & Wire.F_NOCLIP) != 0
		p.duck_amt = lerpf(float(s0[6]), float(s1[6]), k)
	for d: Ents.Door in Ents.doors:
		d.prev_angle = d.angle
	Grenades.client_tick(dt)
	Bomb.client_tick(dt)
	Actors.tick_feed(dt)


# --- snapshots -------------------------------------------------------------------------------------

func on_snapshot(pkt: PackedByteArray) -> void:
	if not ready or Game.L == null:
		return
	bytes_in += pkt.size()
	var b := StreamPeerBuffer.new()
	b.data_array = pkt
	b.seek(1)
	var tick := b.get_u32()
	if tick <= snap_tick:
		return       # late or duplicate
	var ack_seq := b.get_u32()
	b.get_u8()       # our actor id (the roster says it too)
	var stats := (b.get_u8() & 1) != 0
	snap_tick = tick
	quiet = 0.0
	if not have_snap or absf(est - tick) > 48.0:
		est = float(tick)
		have_snap = true
	else:
		est += (float(tick) - est) * 0.08
	# the round
	var M := Match
	M.active = b.get_u8() == 1
	M.phase = Wire.PHASES[mini(b.get_u8(), Wire.PHASES.size() - 1)]
	M.t = b.get_float()
	M.live_t = b.get_float()
	M.round = b.get_u8()
	M.score = [b.get_u8(), b.get_u8()]
	M.half = b.get_u8()
	M.planted = b.get_u8() == 1
	# the charge
	var bs: String = Wire.BOMB[mini(b.get_u8(), Wire.BOMB.size() - 1)]
	var carrier := Actors.by_id(b.get_u8())
	var defuser := Actors.by_id(b.get_u8())
	var timer := b.get_float()
	var dft := b.get_float()
	var dfd := b.get_float()
	var bpos: Variant = null
	var site_i := 0
	if b.get_u8() == 1:
		bpos = Wire.get_v3(b)
		site_i = b.get_u8()
	Bomb.client_state(bs, carrier, defuser, timer, dft, dfd, bpos, site_i)
	# players
	var me_st: Dictionary = {}
	var n := b.get_u8()
	for i in n:
		var id := b.get_u8()
		var f := b.get_u16()
		var pos := Wire.get_v3(b)
		var vel := Wire.get_h3(b)
		var yaw := Wire.get_yaw(b)
		var pitch := Wire.get_pitch(b)
		var dk := b.get_u8() / 255.0
		var hp := b.get_u8()
		var ar := b.get_u8()
		var wc := b.get_u8()
		var sp := b.get_u8()
		var st: Array = []
		if stats:
			st = [b.get_u16(), b.get_16(), b.get_u16(), b.get_u16(), b.get_u8(), b.get_u8(), b.get_u8(), b.get_u8(), b.get_u8(), b.get_u16()]
		var a := Actors.by_id(id)
		if a == null:
			continue
		var was_alive := a.alive
		a.alive = (f & Wire.F_ALIVE) != 0
		a.health = hp
		a.armor = ar
		a.helmet = (f & Wire.F_HELMET) != 0
		a.kit = (f & Wire.F_KIT) != 0
		if not st.is_empty():
			a.money = st[0]; a.kills = st[1]; a.deaths = st[2]; a.dmg = st[3]; a.hs = st[4]; a.plants = st[5]; a.defuses = st[6]; a.wb_charges = st[7]; a.squad = st[8]
			pings[id] = st[9]
		if a.alive and not was_alive:
			a.alive_t = 0.0
			a.model.dead = 0.0
		if not a.alive and was_alive:
			a.dead_t = 0.0
		var spawned := int(spawns.get(id, -1)) != sp
		spawns[id] = sp
		if a == Actors.me:
			a.wb_armed = (f & Wire.F_WB) != 0
			me_st = {"pos": pos, "vel": vel, "yaw": yaw, "pitch": pitch, "f": f, "dk": dk, "spawned": spawned, "revived": a.alive and not was_alive}
			continue
		a.wb_armed = (f & Wire.F_WB) != 0
		_remote_weapon(a, Wire.wid(wc), (f & Wire.F_CHARGE) != 0)
		var buf: Array = bufs.get(a.id, [])
		if spawned or (a.alive and not was_alive):
			buf.clear()
			a.player.pos = pos
			a.player.prev = pos
		buf.append([tick, pos, vel, yaw, pitch, f, dk])
		bufs[a.id] = buf
	# items, grenades, doors
	var items: Array = []
	for i in b.get_u8():
		items.append([b.get_u16(), Wire.wid(b.get_u8()), Wire.get_v3(b), b.get_half(), b.get_half(), b.get_u8() == 1])
	Items.client_sync(items)
	var nades: Array = []
	for i in b.get_u8():
		nades.append([b.get_u16(), Wire.get_v3(b), Wire.get_h3(b), b.get_u8()])
	Grenades.client_sync(nades)
	var nd := b.get_u8()
	for i in nd:
		var ang := b.get_half()
		var tgt := b.get_half()
		if i < Ents.doors.size():
			Ents.doors[i].client_set(ang, tgt)
	# ourselves
	if b.get_u8() == 1:
		var stamina := b.get_float()
		var lp := b.get_float()
		var act := Wire.wid(b.get_u8())
		var guns: Array = []
		for i in b.get_u8():
			guns.append([Wire.wid(b.get_u8()), b.get_u16(), b.get_u16()])
		if not me_st.is_empty():
			me_st.stamina = stamina
			me_st.lp = lp
			_reconcile(ack_seq, me_st)
			_sync_loadout(ack_seq, act, guns)
	ack = ack_seq


## Put our player where the host had it after command `ack_seq` and replay the commands since.
func _reconcile(ack_seq: int, st: Dictionary) -> void:
	var me := Actors.me
	var p := me.player
	while not hist.is_empty() and int(hist[0][0]) <= ack_seq:
		hist.pop_front()
	if not me.alive:
		return
	if st.spawned or st.revived:
		# the host moved us (a new round, a respawn): take its place and view, no smoothing
		p.spawn(st.pos, st.yaw)
		p.pos = st.pos
		p.prev = st.pos
		p.pitch = st.pitch
		corr = Vector3.ZERO
		hist.clear()
		return
	var before := p.pos
	var yaw0 := p.yaw
	var pitch0 := p.pitch
	var f: int = st.f
	p.pos = st.pos
	p.vel = st.vel
	p.ducked = (f & Wire.F_DUCKED) != 0
	p.on_ground = (f & Wire.F_GROUND) != 0
	p.noclip = (f & Wire.F_NOCLIP) != 0
	p.duck_amt = st.dk
	p.stamina = st.stamina
	p.land_penalty = st.lp
	for h: Array in hist:
		var c: Dictionary = h[1]
		p.yaw = float(c.yaw)
		p.pitch = float(c.pitch)
		p.tick(c, Game.DT)
	p.events.clear()
	p.yaw = yaw0
	p.pitch = pitch0
	var err := p.pos - before
	if err.length() > 160.0:
		corr = Vector3.ZERO          # a teleport: just go
	else:
		corr -= err                  # draw where we were and let the difference fade
	p.prev += err


## Our weapons as the host has them: new ones (bought, picked up) appear, gone ones go; ammo and
## the gun in hand follow the host once it has applied our last trigger pull or switch.
func _sync_loadout(ack_seq: int, active: String, guns: Array) -> void:
	var lo := Game.loadout
	var want := {}
	for g: Array in guns:
		if String(g[0]) != "":
			want[String(g[0])] = g
	for id: String in want:
		if lo.by_id(id) == null:
			lo.give(id, false)
	for w: Weapon in lo.list.duplicate():
		if not want.has(w.id) and lo.list.size() > 1:
			lo.remove(w)
	if ack_seq >= last_trigger:
		for w: Weapon in lo.list:
			var g: Array = want.get(w.id, [])
			if g.is_empty():
				continue
			if w is Gun and w.state != "reload":
				(w as Gun).ammo = int(g[1])
				(w as Gun).reserve = int(g[2])
			elif w is Grenade and w.state != "pull" and w.state != "ready" and w.state != "throw":
				(w as Grenade).count = int(g[1])
	if ack_seq >= last_switch and active != "" and lo.active and lo.active.id != active:
		var w2 := lo.by_id(active)
		if w2 and lo.active.state != "plant":
			lo.select(w2)


## What another player holds, for its model (and the charge on its back).
func _remote_weapon(a: Actor, id: String, charge: bool) -> void:
	var lo := a.loadout
	if id != "" and (lo.active == null or lo.active.id != id):
		var w := lo.by_id(id)
		if w == null:
			var nw := Weapon.make(id)
			lo.list.append(nw)
			lo.sort()
			w = nw
		lo.active = w
	var has := lo.by_id("charge")
	if charge and has == null:
		lo.list.append(Weapon.make("charge"))
		lo.sort()
	elif not charge and has != null and lo.active != has:
		lo.list.erase(has)


func _weapon_for(a: Actor, id: String) -> Weapon:
	var w := a.loadout.by_id(id) if a != Actors.me else Game.loadout.by_id(id)
	if w:
		return w
	if not wcache.has(id):
		wcache[id] = Weapon.make(id)
	return wcache[id]


# --- events ----------------------------------------------------------------------------------------

func event(e: Array) -> void:
	var me := Actors.me
	match String(e[0]):
		"shot":
			_shot(e)
		"knife":
			_knife(e)
		"step":
			var a := Actors.by_id(int(e[1]))
			if a and a != me:
				Snd.footstep(U.surf_name(int(e[2])), float(e[3]), a.player.pos)
		"eject":
			var a := Actors.by_id(int(e[1]))
			if a and a != me:
				Game.main.eject_shell(a, _weapon_for(a, String(e[2])))
		"kill":
			_kill(e)
		"hurt":
			HUD.hurt(int(e[1]))
			me.hurt_t = 1.0
			me.hurt_from = e[2]
		"hit":
			HUD.hitmarker(bool(e[1]))
		"note":
			HUD.note(String(e[1]))
		"buy":
			HUD.buy_msg = String(e[2])
			HUD.buy_msg_t = 2.5
			if bool(e[1]):
				Snd.buy()
			else:
				Snd.dry()
		"pickup":
			Snd.pickup()
			HUD.note("Picked up %s" % e[1])
		"wb":
			HUD.wallbang_note(String(e[1]))
		"snd":
			if Snd.has_method(String(e[1])) and e[2] is Array:
				Snd.callv(String(e[1]), e[2])
		"door":
			if int(e[1]) >= 0 and int(e[1]) < Ents.doors.size():
				var d: Ents.Door = Ents.doors[int(e[1])]
				Snd.door(d.center, d.metal, bool(e[2]))
		"smoke":
			Grenades.client_smoke(int(e[1]), e[2], int(e[3]))
		"plant":
			Bomb.client_plant(e[1], float(e[2]), String(e[3]))
			Match.client_event(e)
		"defused":
			Bomb.client_defused()
		"explode":
			Bomb.client_explode(e[1])
		"round", "go", "end":
			Match.client_event(e)
		"chat":
			HUD.chat_line(String(e[2]), int(e[3]), String(e[4]), bool(e[5]))
		"sys":
			HUD.chat_line("", -1, String(e[1]), false)


func _shot(e: Array) -> void:
	var a := Actors.by_id(int(e[1]))
	if a == null or Game.L == null:
		return
	var mine := a == Actors.me
	var cw := Game.L.cw
	var results: Array = []
	for r: Variant in e[7]:
		var imps: Array = []
		for im: Variant in r[2]:
			var bi := int(im[4])
			if bi < 0 or bi >= cw.brushes.size():
				continue
			var br: CollisionWorld.Brush = cw.brushes[bi]
			imps.append({"kind": "door" if br.door != null else "world", "door": br.door, "brush": br, "plane": int(im[5]), "point": im[0], "normal": im[1],
				"surf": int(im[2]), "exit": bool(im[3]), "dist": 0.0, "damage": 0.0})
		var hit: Variant = null
		if not (r[3] as Array).is_empty():
			var v := Actors.by_id(int(r[3][0]))
			if v:
				hit = {"target": v, "point": r[3][1], "group": String(r[3][2]), "damage": 0.0}
		var tg: Variant = null
		if not (r[4] as Array).is_empty() and int(r[4][0]) >= 0 and int(r[4][0]) < Ents.targets.size():
			tg = {"target": Ents.targets[int(r[4][0])], "point": r[4][1], "normal": r[4][2], "damage": 0.0}
		results.append({"res": {"impacts": imps, "target": tg, "actor": hit, "end": r[1], "dist": 0.0, "pens": int(r[5])}, "dir": r[0]})
	if results.is_empty():
		return
	var shot := {"eye": e[5], "dir": e[6], "results": results, "wallbang": bool(e[4]), "dealt": 0, "res": results[0].res}
	Game.main.shot_fx(a, _weapon_for(a, String(e[2])), {"tracer": bool(e[3])}, shot, "bodies" if mine else "all")


func _knife(e: Array) -> void:
	var a := Actors.by_id(int(e[1]))
	if a == null:
		return
	var kind := String(e[3])
	var r := {"hit": {}, "eye": a.eye(), "dir": a.view_dir(), "dealt": 0}
	match kind:
		"actor":
			var v := Actors.by_id(int(e[4]))
			if v:
				r.hit = {"kind": "actor", "target": v, "point": e[5], "surf": int(e[6]), "group": "chest"}
		"target":
			if int(e[4]) >= 0 and int(e[4]) < Ents.targets.size():
				r.hit = {"kind": "target", "target": Ents.targets[int(e[4])], "point": e[5], "normal": e[6], "surf": int(e[7])}
		"world":
			var bi := int(e[7])
			if bi >= 0 and bi < Game.L.cw.brushes.size():
				var br: CollisionWorld.Brush = Game.L.cw.brushes[bi]
				r.hit = {"kind": "door" if br.door != null else "world", "door": br.door, "brush": br, "plane": int(e[8]), "point": e[4], "normal": e[5], "surf": int(e[6])}
	if (r.hit as Dictionary).is_empty():
		return
	Game.main.knife_fx(a, {"heavy": bool(e[2])}, r)


func _kill(e: Array) -> void:
	# ["kill", victim, killer (0 none), weapon name, weapon id, headshot, wallbang, fall direction]
	var v := Actors.by_id(int(e[1]))
	var k := Actors.by_id(int(e[2])) if int(e[2]) != 0 else null
	var me := Actors.me
	if v:
		v.alive = false
		v.dead_t = 0.0
		v.killer = k
		v.model.death_dir = float(e[7])
		Snd.death(v.player.pos)
	Actors.feed.append({"killer": k.name if k else "", "kTeam": k.team if k else (v.team if v else 0), "victim": v.name if v else "?", "vTeam": v.team if v else 0,
		"weapon": String(e[3]), "wid": String(e[4]), "hs": bool(e[5]), "wb": bool(e[6]), "age": 0.0, "me": (k != null and k == me) or v == me})
	if Actors.feed.size() > 6:
		Actors.feed.pop_front()
