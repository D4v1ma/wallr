class_name BotBrain
extends RefCounted
## One bot's brain: perception with awareness that builds up, hearing, callouts and memory; aim error
## that settles while tracking, recoil compensation, burst fire with counter-strafing; waypoint
## navigation with string pulling, jump links, doors and unsticking; orders from Tactics.

var a: Actor
var cmd: Dictionary = {}
var target: Actor = null
var visible := false
var last_seen: Variant = null
var last_seen_t := -9.0
var react_until := 0.0
var err := Vector2.ZERO
var aim_head := false
var goal: Variant = null
var path: Array = []
var pi := 0
var repath_t := 0.0
var perceive_t := 0.0
var clock := 0.0
var burst_left := 0
var cool := 0.0
var last_shots := 0
var strafe := 0.0
var strafe_t := 0.0
var stuck_t := 0.0
var ledge_t := 0.0
var anchor: Variant = null
var anchor_t := 0.0
var door_t := 0.0
var pull_t := 0.0
var investigate: Variant = null
var look_yaw: Variant = null
var want_yaw := 0.0
var want_pitch := 0.0
var fire_toggle := false
var order: Dictionary = {}
var via: Variant = null
var alt_prev := false
var glance_t := 0.0
var glance := 0.0
var smoke_at: Variant = null
var smoke_t := 0.0
var aware: Dictionary = {}
var inbox: Array = []
var scan_t := 0.0
var wb_try: Dictionary = {}
var lost_t := -9.0
var crouch_pref := false
var buy_at := 0.0
var bought := false
var post := 0


func _init(actor: Actor) -> void:
	a = actor
	reset()


func reset() -> void:
	target = null; visible = false; last_seen = null; last_seen_t = -9.0; react_until = 0.0
	err = Vector2.ZERO; aim_head = false; goal = null; path = []; pi = 0; repath_t = 0.0
	perceive_t = Bots.r() * 0.1; clock = 0.0; burst_left = 0; cool = 0.0; last_shots = 0
	strafe = 0.0; strafe_t = 0.0; stuck_t = 0.0; anchor = null; anchor_t = 0.0; door_t = 0.0; pull_t = 0.0
	investigate = null; look_yaw = null; want_yaw = a.player.yaw; want_pitch = 0.0; fire_toggle = false
	order = {}; via = null; alt_prev = false; glance_t = 0.0; glance = 0.0; smoke_at = null; smoke_t = 0.0
	aware = {}; inbox = []; scan_t = 0.0; wb_try = {}; lost_t = -9.0


static func yaw_to(d: Vector3) -> float:
	return atan2(-d.x, -d.z)


static func flat_dist(p: Vector3, q: Vector3) -> float:
	return Vector2(p.x - q.x, p.z - q.z).length()


## Orders come from Tactics; repeating the same order keeps the current route.
func set_order(o: Dictionary) -> void:
	if not order.is_empty() and order.kind == o.kind and flat_dist(order.base, o.pos) < 64.0:
		order.face = o.get("face")
		order.yaw = o.get("yaw")
		order.site = o.get("site")
		return
	o.base = o.pos
	if o.has("spread"):
		var s: float = o.spread
		o.pos = Vector3(o.pos.x + (Bots.r() - 0.5) * 2.0 * s, o.pos.y, o.pos.z + (Bots.r() - 0.5) * 2.0 * s)
	order = o
	via = o.get("via")
	goal = null
	path = []


## The gun a bot wants in hand: a primary with ammo, else the pistol.
func wanted_gun() -> Weapon:
	var lo := a.loadout
	var prim := lo.primary() as Gun
	var pistol := lo.by_slot(2) as Gun
	if prim and prim.ammo + prim.reserve > 0:
		return prim
	if pistol and pistol.ammo + pistol.reserve > 0:
		return pistol
	return prim if prim else pistol


## A rough position from a sound: turn toward close ones, go and check.
func hear(pos: Vector3, k: float) -> void:
	if target and visible:
		return
	if investigate == null or k < 0.5 or Bots.r() < 0.4:
		investigate = pos
	if k < 0.7:
		look_yaw = yaw_to(pos - a.player.pos)
	goal = null


## Shot by someone: only the rough direction it came from, not how far.
func on_hurt(_attacker: Actor, from: Variant) -> void:
	if from == null or (target and visible):
		return
	var p := a.player.pos
	var f: Vector3 = from
	var dx := f.x - p.x
	var dz := f.z - p.z
	var yaw := atan2(-dx, -dz) + (Bots.r() - 0.5) * 0.35
	var guess := minf(Vector2(dx, dz).length(), 350.0 + Bots.r() * 450.0)
	look_yaw = yaw
	investigate = Vector3(p.x - sin(yaw) * guess, p.y, p.z - cos(yaw) * guess)
	goal = null


## A teammate's callout: go and check where the enemy was seen (if it isn't fighting already).
func read_inbox() -> void:
	if inbox.is_empty():
		return
	var now := inbox.filter(func(m: Dictionary) -> bool: return m.at <= clock)
	if now.is_empty():
		return
	inbox = inbox.filter(func(m: Dictionary) -> bool: return m.at > clock)
	if target and visible:
		return
	var m: Dictionary = now[-1]
	var p := a.player.pos
	investigate = m.pos
	goal = null
	if flat_dist(m.pos, p) < 900.0:
		look_yaw = yaw_to(m.pos - p)


func los(p: Vector3, q: Vector3) -> bool:
	var d := p.distance_to(q)
	if d < 1e-3:
		return true
	return Game.L.cw.ray(p, (q - p) / d, d, CollisionWorld.MASK_SHOT) < 0.0 and not Grenades.blocks(p, q)


## Head and chest of another actor (from its movement state).
static func points(e: Actor) -> Array:
	var p := e.player.pos
	var eye_h := Player.DUCK_EYE if e.player.ducked else Player.STAND_EYE
	return [p + Vector3(0, eye_h + 2.0, 0), p + Vector3(0, eye_h - 14.0, 0)]


## Sight, 10 times a second. Each enemy in view builds up "noticed" until the bot has really seen
## it; out of view it fades. Nothing outside the view cone (bar someone brushing past) is seen.
func perceive(sk: Dictionary) -> void:
	var pl := a.player
	var eye := a.eye()
	var f := a.view_dir()
	var cos_f := cos(deg_to_rad(float(sk.fov) / 2.0))
	var dt := 0.1
	var best: Actor = null
	var best_d := INF
	for e: Actor in Actors.list:
		if not e.alive or e.team == a.team:
			aware.erase(e)
			continue
		var pts := points(e)
		var head: Vector3 = pts[0]
		var chest: Vector3 = pts[1]
		var to := chest - eye
		var d := maxf(to.length(), 1.0)
		var c := to.dot(f) / d
		var touching := d < 90.0
		var seen := d < 5000.0 and (c > cos_f or touching) and (los(eye, chest) or los(eye, head))
		var aw: float = aware.get(e, 0.0)
		if seen:
			var cc := U.smooth(cos_f, 0.995, c)
			var center := 0.25 + 2.75 * cc * cc           # straight ahead: almost at once; the edge of view: slowly
			var far := clampf(1.6 - d / 1600.0, 0.3, 1.6)  # close and big, or far and small
			var move := 1.3 if e.player.speed() > 130.0 else (0.6 if e.player.ducked else 0.9)
			var loud := 2.2 if Game.time - e.last_shot_t < 0.6 else 1.0   # muzzle flash
			var known := 1.0
			if e == target or (last_seen != null and flat_dist(e.player.pos, last_seen) < 300.0):
				known = 3.0
			aw += dt * float(sk.spot) * center * far * move * loud * known * (4.0 if touching else 1.0)
		else:
			aw -= dt * 0.35
		if aw > 0.0:
			aware[e] = minf(aw, 1.6)
		else:
			aware.erase(e)
		if seen and aw >= 1.0 and d < best_d:
			best_d = d
			best = e
	if best:
		if best != target:
			if clock - last_seen_t > 4.0 and Bots.r() < 0.85:
				Bots.callout(a, best)
			var fresh := clock - last_seen_t > 1.5
			target = best
			react_until = clock + float(sk.react) * (0.75 + Bots.r() * 0.5) * (1.0 if fresh else 0.4)
			var spread := float(sk.aimErr) * (0.6 + minf(1.5, best_d / 900.0))
			err = Vector2((Bots.r() - 0.5) * 2.0 * spread, (Bots.r() - 0.5) * 2.0 * spread * 0.6)
			aim_head = Bots.r() < float(sk.head)
			burst_left = 0
			cool = 0.0
		visible = true
		last_seen = best.player.pos
		last_seen_t = clock
	elif target:
		if visible:
			lost_t = clock
		visible = false
		if not target.alive or clock - last_seen_t > 2.5:
			if target.alive and last_seen != null:
				investigate = last_seen
				scan_t = 0.0
			target = null
			goal = null
			path = []


## Just lost sight of someone: sometimes put a wall-piercing shot through the cover where they were.
func wallbang_try(dt: float, c: Dictionary, sk: Dictionary, w: Weapon) -> bool:
	var pl := a.player
	if wb_try.is_empty():
		if target == null or visible or lost_t < 0.0 or clock - lost_t > 0.25 or last_seen == null:
			return false
		if not (w is Gun) or (w as Gun).ammo <= 0 or not Wallbang.ready(a) or Bots.r() >= float(sk.wallbang):
			lost_t = -9.0
			return false
		var p: Vector3 = last_seen
		var d := flat_dist(p, pl.pos)
		lost_t = -9.0
		if d > 1800.0 or d < 120.0:
			return false
		var e := float(sk.aimErr) * 1.5
		wb_try = {"pos": p + Vector3(0, 48, 0), "t": 0.0, "err": Vector2((Bots.r() - 0.5) * e, (Bots.r() - 0.5) * e * 0.6), "armed": false}
	var t := wb_try
	var eye := a.eye()
	t.t += dt
	if t.t > 1.6 or not (w is Gun) or visible:
		wb_try = {}
		if Wallbang.armed(a):
			Wallbang.toggle(a)
		return false
	var to: Vector3 = t.pos - eye
	want_yaw = yaw_to(to) + deg_to_rad(t.err.x)
	want_pitch = atan2(to.y, Vector2(to.x, to.z).length()) + deg_to_rad(t.err.y)
	if not Wallbang.armed(a):
		if t.armed:
			wb_try = {}          # the round went out: done
			return false
		t.armed = true
		if Wallbang.toggle(a) != "armed":
			wb_try = {}
			return false
		return true
	var off := rad_to_deg(Vector2(U.wrap_angle(want_yaw - pl.yaw), want_pitch - pl.pitch).length())
	var g := w as Gun
	if off < 1.2 and (g.state == "idle" or g.state == "inspect") and g.ammo > 0:
		c.fire = not fire_toggle
		fire_toggle = not fire_toggle
	if pl.speed() > 60.0:
		var lat := pl.vel.x * cos(pl.yaw) + pl.vel.z * -sin(pl.yaw)
		if absf(lat) > 40.0:
			c.side = -signf(lat)
	return true


func _near(q: Variant, r: float) -> bool:
	if q == null:
		return false
	var p := a.player.pos
	var v: Vector3 = q
	return flat_dist(v, p) < r and absf(v.y - p.y) < 60.0


func think(dt: float) -> Dictionary:
	var sk := Bots.skill()
	cmd = Controls.IDLE.duplicate()
	if not a.alive:
		return cmd
	clock += dt
	perceive_t -= dt
	if perceive_t <= 0.0:
		perceive_t = 0.1
		perceive(sk)
	read_inbox()
	if target and not target.alive:
		target = null
		visible = false
	var w := a.loadout.active
	var o := order
	var p := a.player.pos
	# a defuser out of time keeps its hands on the charge whatever happens
	var must_defuse: bool = not o.is_empty() and o.kind == "defuse" and Bomb.state == "planted" and _near(Bomb.pos, 44.0) and Bomb.timer < Bomb.defuse_dur + 1.5
	var busy := false
	if target and visible and not must_defuse:
		fight(dt, cmd, sk, w)
	elif not must_defuse and wallbang_try(dt, cmd, sk, w):
		busy = true
	else:
		if target and last_seen != null and investigate == null:
			investigate = last_seen
		if smoke_at != null:
			smoke_t += dt
			busy = smoke_t < 4.0 and throw_smoke(cmd, smoke_at)
			if not busy:
				smoke_at = null
				smoke_t = 0.0
		elif not o.is_empty() and o.kind == "plant" and Bomb.site_at(p) != null and (_near(o.pos, 220.0) or w is Charge):
			busy = plant_now(cmd)
		elif not o.is_empty() and o.kind == "defuse" and Bomb.state == "planted" and _near(Bomb.pos, 44.0):
			busy = defuse_now(cmd)
		elif not o.is_empty() and (o.kind == "hold" or o.kind == "guard" or o.kind == "stack") and investigate == null and via == null and _near(o.pos, 48.0):
			hold_post(dt, o)
		else:
			roam(dt, cmd, sk)
		if not busy:
			if w is Gun:
				var g := w as Gun
				if g.ammo < int(g.def.mag) * 0.4 and g.reserve > 0 and g.state == "idle":
					cmd.reload = true
			var want := wanted_gun()
			if want and w != want and w.state != "reload":
				cmd.slot = int(want.def.slot)
	turn(dt, sk, target != null or busy)
	alt_prev = cmd.alt
	return cmd


func plant_now(c: Dictionary) -> bool:
	var lo := a.loadout
	var ch := lo.by_id("charge")
	if ch == null:
		return false
	if lo.active != ch:
		c.slot = 5
	elif ch.state == "idle" or ch.state == "plant":
		c.fire = true
	want_pitch = -0.5
	return true


func defuse_now(c: Dictionary) -> bool:
	var p := a.player.pos
	want_yaw = yaw_to(Bomb.pos - p)
	want_pitch = -1.0
	c.useHeld = true
	return true


## Smoke a spot: draw the grenade, aim a lob that lands there, pull the pin and let go.
func throw_smoke(c: Dictionary, spot: Vector3) -> bool:
	var lo := a.loadout
	var g := lo.by_id("smoke") as Grenade
	var pl := a.player
	if g == null or g.count <= 0:
		return false
	if lo.active != g:
		c.slot = 4
		return true
	var eye := a.eye()
	var to := spot - eye
	want_yaw = yaw_to(to)
	want_pitch = lob_pitch(Vector2(to.x, to.z).length() * 0.85, to.y)
	var aimed := absf(U.wrap_angle(want_yaw - pl.yaw)) < 0.06 and absf(want_pitch - pl.pitch) < 0.06
	if g.state == "pull" or (g.state == "idle" and aimed):
		c.fire = true
	return true


## Launch pitch for an overhand throw to land `d` units away and `h` units lower/higher.
static func lob_pitch(d: float, h: float) -> float:
	var v := float(Data.weapon("smoke").throwSpeed)
	var best := 0.4
	var best_err := INF
	var p := -0.3
	while p <= 1.1:
		var hx := cos(p)
		var vy := sin(p) + 0.12
		var l := Vector2(hx, vy).length()
		hx /= l
		vy /= l
		var vv := vy * v
		var disc := vv * vv - 2.0 * Grenades.GRAVITY * h
		if disc >= 0.0:
			var t := (vv + sqrt(disc)) / Grenades.GRAVITY
			var e := absf(hx * v * t - d)
			if e < best_err:
				best_err = e
				best = p
		p += 0.02
	return best


## At a post: face the expected approach and glance around now and then.
func hold_post(dt: float, o: Dictionary) -> void:
	var p := a.player.pos
	var base: Variant = o.get("yaw")
	if o.get("face") != null:
		var f: Vector3 = o.face
		base = atan2(f.x - p.x, f.z - p.z)      # guards look away from the charge
	if base == null:
		base = want_yaw
	glance_t -= dt
	if glance_t <= 0.0:
		glance_t = 1.2 + Bots.r() * 2.2
		glance = (Bots.r() - 0.5) * 1.1
	want_yaw = float(base) + glance
	want_pitch = 0.0


func fight(dt: float, c: Dictionary, sk: Dictionary, w: Weapon) -> void:
	var pl := a.player
	var eye := a.eye()
	var pts := points(target)
	var aim: Vector3 = pts[0] if aim_head else pts[1]
	var to := aim - eye
	var dist := to.length()
	var k := exp(-dt * float(sk.settle))
	err *= k
	var rc := w.recoil if w is Gun else Vector2.ZERO
	want_yaw = yaw_to(to) + deg_to_rad(err.x - rc.y * float(sk.recoil))
	want_pitch = atan2(to.y, Vector2(to.x, to.z).length()) + deg_to_rad(err.y - rc.x * float(sk.recoil))
	# weapons: draw a gun, reload when empty, pistol when the primary is dry, scope in at range
	var want := wanted_gun()
	if not (w is Gun):
		if want:
			c.slot = int(want.def.slot)
		return
	var g := w as Gun
	if g.ammo == 0:
		if int(g.def.slot) == 1 and g.reserve == 0:
			c.slot = 2
		else:
			c.reload = true
	if g.def.has("scope") and g.zoom == 0 and g.zoom_resume == 0 and dist > 280.0 and g.state == "idle":
		c.alt = not alt_prev
	# shoot when the crosshair is on the target's silhouette
	var off := rad_to_deg(Vector2(U.wrap_angle(want_yaw - pl.yaw), want_pitch - pl.pitch).length())
	var size := maxf(1.0, rad_to_deg(atan2(12.0, dist)))
	var ready := clock >= react_until and (g.state == "idle" or g.state == "inspect") and g.ammo > 0
	var long := dist > 1000.0
	var firing := false
	if cool > 0.0:
		cool -= dt
	elif ready and off < size:
		if burst_left <= 0:
			var b: Array = sk.burst
			burst_left = 1 + int(Bots.r() * 2.0) if long else int(b[0]) + int(Bots.r() * (int(b[1]) - int(b[0]) + 1))
			last_shots = g.shot_count
			crouch_pref = long and Bots.r() < 0.35
		firing = true
		if g.def.auto:
			c.fire = true
		else:
			fire_toggle = not fire_toggle
			c.fire = fire_toggle
		if g.shot_count - last_shots >= burst_left:
			burst_left = 0
			cool = (0.45 if long else 0.22) + Bots.r() * 0.25
			c.fire = false
	# movement: stop (counter-strafe) to shoot, strafe between bursts
	var sp := pl.speed()
	if firing:
		if sp > 60.0:
			var lat := pl.vel.x * cos(pl.yaw) + pl.vel.z * -sin(pl.yaw)
			if absf(lat) > 40.0:
				c.side = -signf(lat)
		c.duck = crouch_pref
	elif dist > 1600.0 and not order.is_empty() and order.kind != "hold" and order.kind != "guard" and order.kind != "stack":
		# a long way off and somewhere to be: keep walking the route between bursts, so a far
		# exchange of fire on a big map doesn't pin both sides in place
		follow_path(dt, c)
	else:
		strafe_t -= dt
		if strafe_t <= 0.0:
			strafe = 0.0 if Bots.r() < 0.25 else (-1.0 if Bots.r() < 0.5 else 1.0)
			strafe_t = 0.25 + Bots.r() * 0.45
		c.side = strafe
		if dist > 700.0 and dist < 1600.0 and strafe == 0.0:
			c.fwd = 1.0


func pick_goal() -> Variant:
	var L := Game.L
	var o := order
	if not o.is_empty():
		if via != null:
			return via
		# posted bots only chase noises close to their post; carriers and defusers ignore them
		var inv: Variant = investigate
		investigate = null
		if inv != null and o.kind != "plant" and o.kind != "defuse" and o.kind != "pickup" and flat_dist(inv, o.pos) < 900.0:
			return inv
		return o.pos
	if investigate != null:
		var g: Variant = investigate
		investigate = null
		return g
	if not L.hotspots.is_empty() and Bots.r() < 0.75:
		var h: Array = L.hotspots[int(Bots.r() * L.hotspots.size()) % L.hotspots.size()].pos
		return Vector3(float(h[0]) + (Bots.r() - 0.5) * 60.0, h[1], float(h[2]) + (Bots.r() - 0.5) * 60.0)
	return Nav.random_node(Bots.rnd)


func roam(dt: float, c: Dictionary, _sk: Dictionary) -> void:
	var to: Variant = follow_path(dt, c)
	if to == null:
		return
	var pl := a.player
	want_yaw = float(look_yaw) if look_yaw != null else yaw_to(to)
	if look_yaw != null and absf(U.wrap_angle(float(look_yaw) - pl.yaw)) < 0.1:
		look_yaw = null
	want_pitch = 0.0


## Walk the path to the current goal: repath now and then, string-pull, jump, open doors and get
## unstuck. Sets the move keys relative to where the bot faces (so it can aim elsewhere) and
## returns the offset to the next waypoint, or null when there is none.
func follow_path(dt: float, c: Dictionary) -> Variant:
	var pl := a.player
	var p := pl.pos
	if via != null and flat_dist(p, via) < 130.0:
		via = null
		goal = null
		path = []
	repath_t -= dt
	if goal == null or repath_t <= 0.0 or path.is_empty():
		if goal == null:
			goal = pick_goal()
		path = Nav.path(p, goal) if goal != null else []
		pi = 0
		repath_t = 5.0 + Bots.r() * 3.0
		if path.is_empty():
			goal = null
			return null
	# string pulling: skip ahead while a straight walk is clear
	pull_t -= dt
	if pull_t <= 0.0:
		pull_t = 0.3
		var j := mini(path.size() - 1, pi + 3)
		while j > pi:
			var jumpy := false
			for q in range(pi, j + 1):
				if path[q].jump:
					jumpy = true
					break
			if not jumpy:
				var wk := Nav.walk(p, path[j].p)
				if not wk.is_empty() and not wk.jump:
					pi = j
					break
			j -= 1
	var n: Variant = path[pi] if pi < path.size() else null
	while n != null and Vector2(n.p.x - p.x, n.p.z - p.z).length() < 22.0 and absf(n.p.y - p.y) < 40.0:
		pi += 1
		n = path[pi] if pi < path.size() else null
	if n == null:
		goal = null
		path = []
		return null
	# knocked off a ledge: the next waypoint is high above and can't be walked to, so plan again
	# (string pulling can rightly aim higher than that up a ramp or steep stairs)
	ledge_t -= dt
	if ledge_t <= 0.0 and pl.on_ground and n.p.y - p.y > 60.0:
		ledge_t = 0.5
		if Nav.walk(p, n.p).is_empty():
			path = []
			return null
	var to: Vector3 = n.p - p
	var d2 := Vector2(to.x, to.z).length()
	# move toward the waypoint regardless of where we look
	var rel := yaw_to(to) - pl.yaw
	c.fwd = cos(rel)
	c.side = -sin(rel)
	if n.jump and d2 < 60.0 and pl.on_ground:
		c.jump = true
	if not pl.on_ground and pl.vel.y < 120.0:
		c.duck = n.jump
	# doors and getting stuck
	anchor_t -= dt
	if anchor == null or anchor_t <= 0.0:
		var moved := flat_dist(p, anchor) if anchor != null else 99.0
		stuck_t = stuck_t + 0.6 if moved < 14.0 else 0.0
		anchor = p
		anchor_t = 0.6
	if stuck_t > 0.0:
		door_t -= dt
		var door := Ents.door_in_reach(a.eye(), a.view_dir())
		if door and not door.is_open() and door_t <= 0.0:
			c.use = true
			door_t = 1.5
		elif stuck_t >= 1.2 and pl.on_ground:
			c.jump = true
		if stuck_t >= 2.4:
			goal = null
			path = []
			stuck_t = 0.0
	return to


func turn(dt: float, sk: Dictionary, combat: bool) -> void:
	var pl := a.player
	var rate := deg_to_rad(float(sk.turn)) * dt * (1.0 if combat else 0.65)
	var dy := U.wrap_angle(want_yaw - pl.yaw)
	var dp := want_pitch - pl.pitch
	pl.yaw += clampf(dy * minf(1.0, dt * 14.0), -rate, rate)
	pl.pitch = clampf(pl.pitch + clampf(dp * minf(1.0, dt * 14.0), -rate * 0.7, rate * 0.7), -1.4, 1.4)
