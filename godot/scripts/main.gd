extends Node3D
## Boot, the fixed 64 Hz simulation (_physics_process) and the frame loop (_process): input and
## mouse look, camera (recoil, shake, death and spectator cameras, scope and scope-in zoom),
## viewmodel, effects, HUD.
## Command line (after --): --map=depot --mode=defuse|skirmish --bots=N --diff=normal --team=0|1
##   --menu=0 to skip the menus; --shot=path.png --frames=N to save a screenshot and quit;
##   --pos=x,y,z --yaw=deg --pitch=deg to place the camera (noclip) for screenshots.

const TICK := 1.0 / 64.0

var camera: Camera3D
var spec_tr := Trace.new()
var _shot_frames := -1
var _frames := 0
var look := Vector2.ZERO


func _ready() -> void:
	Game.world_root = self
	Game.main = self
	camera = Camera3D.new()
	camera.near = 2.0
	camera.far = 14000.0
	camera.current = true
	add_child(camera)
	Viewmodel.build(self)
	Settings.changed.connect(_on_setting)
	if Game.args.has("shot"):
		_shot_frames = int(Game.args.get("frames", "12"))
	if Game.args.get("menu", "1") == "0" or Game.args.has("shot"):
		quick_start()
	else:
		Menus.boot()


func _exit_tree() -> void:
	if Game.main == self and Game.L:
		Game.L.unload()
		Game.L = null


func _on_setting(k: String, _v: Variant) -> void:
	if k == "vmFov":
		Viewmodel.update_fov()


## Straight into a match from the command line (tests, screenshots).
func quick_start() -> void:
	var cfg := {"map": Game.args.get("map", "range"), "mode": Game.args.get("mode", "skirmish"), "ranked": false, "diff": Game.args.get("diff", "normal"),
		"team": Game.args.get("team", "1"), "allies": int(Game.args.get("allies", "0")), "enemies": int(Game.args.get("bots", "0")), "len": "standard", "ff": false}
	load_map(String(cfg.map))
	Session.begin(cfg)
	if Game.args.has("pos"):
		var c: PackedStringArray = String(Game.args.pos).split(",")
		Actors.me.player.spawn(Vector3(float(c[0]), float(c[1]), float(c[2])), Actors.me.player.yaw)
		Actors.me.player.noclip = Game.args.has("shot")
	if Game.args.has("yaw"):
		Actors.me.player.yaw = deg_to_rad(float(Game.args.yaw))
	if Game.args.has("pitch"):
		Actors.me.player.pitch = deg_to_rad(float(Game.args.pitch))
	if Game.args.has("shot"):
		Game.bots_frozen = true
	play()


## Build a map in place: level, entities, effects, nav, the local player and the actors.
func load_map(key: String) -> void:
	Game.state = "loading"
	HUD.buy_open = false
	Items.clear()
	Grenades.clear()
	Bomb.reset()
	if Actors.list.size() > 0:
		Actors.remove_bots()
	var L := Game.load_level(key)
	FX.init(L)
	Grenades.init(L)
	Items.init()
	Nav.build(L)
	HUD.level_changed(L)
	if Game.loadout == null:
		Game.loadout = Loadout.new(["rifle", "pistol", "knife", "smoke"], func(id: String) -> Dictionary: return Arsenal.def_for(id))
	Actors.init()
	Actors.me.name = Accounts.display_name()
	Admin.apply()
	Game.player.max_speed = Game.loadout.active.speed()
	MenuCam.reset(L)


func play() -> void:
	Game.state = "play"
	Controls.active = true
	HUD.set_active(true)
	Menus.hide_all()
	Viewmodel.set_visible(true)
	if not Game.args.has("shot") and DisplayServer.get_name() != "headless":
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func pause() -> void:
	if Game.state != "play":
		return
	HUD.toggle_buy(false)
	Game.state = "paused"
	Controls.active = false
	Controls.release_all()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	HUD.set_active(false)
	Menus.show_screen("pause")


func _unhandled_input(e: InputEvent) -> void:
	if Game.state != "play":
		return
	if e is InputEventMouseButton and e.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and not Game.args.has("shot"):
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


# --- simulation ------------------------------------------------------------------------------------

func _physics_process(_delta: float) -> void:
	var paused := Game.state != "play" or Game.freeze or Game.L == null
	if paused:
		return
	sim_tick(TICK)


func sim_tick(dt: float) -> void:
	Game.time += dt
	Game.ticks += 1
	var me := Actors.me
	for a: Actor in Actors.list:
		var cmd: Dictionary
		if a.is_me and a.brain == null:
			cmd = Controls.build_cmd() if Game.state == "play" else Controls.IDLE.duplicate()
		else:
			cmd = Controls.IDLE.duplicate() if Game.bots_frozen else a.brain.think(dt)
		if not a.alive:
			continue
		# freeze time: look and buy only; defusing pins you in place
		if Match.frozen() or Bomb.defusing(a):
			cmd.fwd = 0.0; cmd.side = 0.0; cmd.jump = false; cmd.fire = false; cmd.alt = false; cmd.drop = false
		Bomb.control(a, cmd, dt)
		if cmd.get("wallbang", false) and a.is_me:
			HUD.wallbang_note(Wallbang.toggle(a))
		if cmd.use and not Bomb.defusing(a) and not Items.use(a):
			var d := Ents.door_in_reach(a.eye(), a.view_dir())
			if d:
				d.toggle(a.player.pos)
		if cmd.drop:
			Items.drop(a, a.loadout.active, true)
		a.player.tick(cmd, dt)
		a.loadout.tick(cmd, a.player, Game.time, dt)
		for ev: Dictionary in a.player.events:
			match ev.type:
				"step":
					if a.is_me:
						Snd.footstep(U.surf_name(ev.surf))
					else:
						Snd.footstep(U.surf_name(ev.surf), 1.0, a.player.pos)
					Bots.noise(a.player.pos, a, 650.0)
				"jump":
					if a.is_me:
						Snd.jump()
				"land":
					if a.is_me:
						Snd.land(U.surf_name(ev.surf), ev.speed)
					else:
						Snd.footstep(U.surf_name(ev.surf), 1.3, a.player.pos)
		a.player.events.clear()
		for w: Weapon in a.loadout.list.duplicate():
			for e: Dictionary in w.events:
				var t: String = e.type
				if t == "shot":
					fire_shot(a, w, e)
				elif t == "planted":
					Bomb.plant(a, w, e.site)
				elif t == "sfx" and e.part == w.def.get("ejectOn", ""):
					eject_shell(a, w)
					if a.is_me:
						Snd.sfx(e.part)
				elif not a.is_me:
					continue
				elif t == "dry":
					Snd.dry()
				elif t == "sfx":
					Snd.sfx(e.part)
				elif t == "zoom":
					Snd.sfx("zoom")
				elif t == "swing":
					Snd.knife_swish(e.heavy)
				elif t == "knifeHit":
					knife_hit(a, e)
				elif t == "throwNade":
					Grenades.spawn(a.player, e.mode, a.eye(), a.view_dir())
			w.events.clear()
	if not me.alive:
		for w: Weapon in me.loadout.list:
			w.events.clear()
	var players: Array = []
	for a: Actor in Actors.list:
		if a.alive:
			players.append(a.player)
	Ents.tick(dt, players)
	Items.tick(dt, 0.0 if Match.active else 45.0)
	Grenades.tick(dt)
	Bomb.tick(dt)
	Actors.tick(dt)
	Match.tick(dt)
	Tactics.tick(dt)


func world_impact(imp: Dictionary, decal_scale: float = 1.0) -> void:
	var b: CollisionWorld.Brush = imp.brush
	if imp.kind == "door":
		var door: Ents.Door = imp.door
		door.add_impact(imp, decal_scale)
		return
	var plane: int = imp.plane
	var clip: Variant = b.polys[plane] if plane >= 0 and plane < b.face_count else null
	FX.impact(imp.point, imp.normal, imp.surf, FX.decals if clip != null else null, clip, null, null, decal_scale)


## Casing out of the ejection port: from the viewmodel for you, from the world model for others.
func eject_shell(actor: Actor, w: Weapon) -> void:
	var pl := actor.player
	var r := Vector3(cos(pl.yaw), 0, -sin(pl.yaw))
	if actor.is_me:
		var ep: Variant = Viewmodel.anchor_world("eject", 19.0, camera)
		if ep == null:
			return
		var f := actor.view_dir()
		var r1 := randf()
		var r2 := randf()
		var v := r * (95.0 + r1 * 45.0) + f * (-12.0 + r2 * 18.0) + Vector3(pl.vel.x, 0, pl.vel.z)
		v.y = 85.0 + r2 * 45.0 + pl.vel.y * 0.5
		FX.shells.spawn(String(w.def.shell), ep, v, FX.light_at(ep))
	else:
		var mz := actor.model.muzzle_world()
		var dir := actor.view_dir()
		var ep2 := mz - dir * 14.0 + r * 1.5 + Vector3(0, 1, 0)
		FX.shells.spawn(String(w.def.shell), ep2, Vector3(r.x * 110.0 + pl.vel.x, 90.0 + randf() * 30.0, r.z * 110.0 + pl.vel.z), FX.light_at(ep2))


func fire_shot(actor: Actor, w: Weapon, e: Dictionary) -> void:
	var shot := Combat.shot(actor, w, e)
	var eye: Vector3 = shot.eye
	var dir: Vector3 = shot.dir
	var def := w.def
	var suppressed: bool = def.get("suppressed", false)
	var mz: Vector3
	if actor.is_me:
		Ents.stats.shots += 1
		Snd.shot(String(def.sound), null, suppressed)
		Viewmodel.on_shot(w)
		var a: Variant = Viewmodel.anchor_world("muzzle", 22.0, camera)
		mz = a if a != null else eye + dir * 22.0
	else:
		actor.model.fire()
		mz = actor.model.muzzle_world()
		Snd.shot(String(def.sound), mz, suppressed)
		if not suppressed:
			FX.world_flash(mz, dir, float(def.flash))
	if not def.has("ejectOn"):
		eject_shell(actor, w)
	FX.add_light(mz, Color(1.0, 0.62, 0.3), 240.0 * float(def.flash) + 40.0, 0.06)
	var what := "nothing"
	var damage := 0.0
	var sounds := 0
	var head := false
	var hits := 0
	var bodies := {}
	var results: Array = shot.results
	for r: Dictionary in results:
		var res: Dictionary = r.res
		for imp: Dictionary in res.impacts:
			world_impact(imp, 0.7 if results.size() > 1 else 1.0)
			if not imp.exit and sounds < 3:
				sounds += 1
				Snd.impact(U.surf_name(imp.surf), imp.point)
		if not (res.impacts as Array).is_empty() and what == "nothing":
			var last: Dictionary = res.impacts[-1]
			what = U.surf_name(last.surf)
			damage = last.damage
		if res.target != null:
			var tg: Dictionary = res.target
			FX.impact(tg.point, tg.normal, U.surf_id("metal"))
			if (tg.target as Ents.Target).hit() and actor.is_me:
				HUD.hitmarker()
			what = "plate"
			damage = tg.damage
		if res.actor != null:
			var h: Dictionary = res.actor
			var hs: bool = h.group == "head"
			var victim: Actor = h.target
			FX.blood(h.point, r.dir)
			if not bodies.has(victim):
				bodies[victim] = true
				Snd.body_hit(h.point, hs and victim.helmet)
			head = head or hs
			hits += 1
			what = "%s (%s)%s" % [victim.name, h.group, " x%d" % hits if results.size() > 1 else ""]
			damage = float(h.damage) * float(Actor.GROUP_MUL.get(h.group, 1.0))
	if not bodies.is_empty() and actor.is_me:
		HUD.hitmarker(head)
	var r0: Dictionary = results[0].res
	var end: Vector3 = r0.end if r0.end != null else eye + dir * float(def.range)
	if shot.wallbang:
		# a wallbang round: a hot streak along the whole line, sparks where it leaves each wall
		FX.tracers.spawn(mz, end, 9500.0, 900.0)
		FX.tracers.spawn(mz, end, 9000.0, 600.0)
		Snd.wallbang(null if actor.is_me else mz)
		FX.add_light(mz, Color(1.0, 0.45, 0.2), 360.0, 0.09)
		if actor.is_me:
			var n: int = r0.pens
			HUD.note("Wallbang · %d wall%s" % [n, "" if n == 1 else "s"])
	elif e.tracer:
		FX.tracers.spawn(mz, end)
	FX.muzzle_smoke(mz, dir, (w as Gun).heat if w is Gun else 0.0)
	if actor.is_me:
		Game.last_hit = {"what": what, "damage": damage, "pens": r0.pens, "dist": r0.dist, "dealt": shot.dealt}


func knife_hit(actor: Actor, e: Dictionary) -> void:
	var r := Combat.knife(actor, e)
	var hit: Dictionary = r.hit
	if hit.is_empty():
		return
	if hit.kind == "actor":
		FX.blood(hit.point, actor.view_dir())
		Snd.body_hit(hit.point, false)
		if actor.is_me:
			HUD.hitmarker(false)
	elif hit.kind == "target":
		FX.impact(hit.point, hit.normal, U.surf_id("metal"))
		if (hit.target as Ents.Target).hit() and actor.is_me:
			HUD.hitmarker()
	else:
		world_impact(hit, 0.8 if e.heavy else 0.6)
	Snd.knife_hit(U.surf_name(hit.surf), hit.point, e.heavy)
	if actor.is_me:
		var what := String((hit.target as Actor).name) if hit.kind == "actor" else ("plate" if hit.kind == "target" else U.surf_name(hit.surf))
		Game.last_hit = {"what": what, "damage": float(r.dealt) if int(r.dealt) > 0 else float(e.damage), "pens": 0, "dist": (hit.point as Vector3).distance_to(r.eye)}


func handle_hotkeys() -> void:
	var pl := Game.player
	if Controls.pressed("noclip"):
		if not Actors.me.admin:
			HUD.note("Noclip is an admin power")
		else:
			pl.noclip = not pl.noclip
			if not pl.noclip:
				pl.vel = Vector3.ZERO
			HUD.note("Noclip on · Space up, Ctrl down" if pl.noclip else "Noclip off")
	if Controls.pressed("debug"):
		HUD.debug = not HUD.debug
	if Controls.pressed("hints"):
		var shown: bool = Settings.get_value("showHints") and (HUD.hint_age < 30.0 or HUD.hint_pinned)
		HUD.hint_pinned = not shown
		Settings.set_value("showHints", not shown)
	if Controls.pressed("buy"):
		HUD.toggle_buy()
	if HUD.buy_open:
		for n in range(1, 10):
			if Controls.pressed("slot%d" % n):
				HUD.buy_press(n)
	if Controls.pressed("pause"):
		if HUD.buy_open:
			HUD.toggle_buy(false)
		else:
			pause()


# --- frame -------------------------------------------------------------------------------------------

func _process(dt: float) -> void:
	if Game.L == null or Game.state == "loading":
		return
	dt = minf(dt, 0.1)
	var me := Actors.me
	var pl := Game.player
	var held := Game.loadout.active
	var in_menu := Game.state == "menu" or Game.state == "results"
	var zoom_fov := 0.0
	if me.alive and held is Gun:
		var g := held as Gun
		zoom_fov = g.scope_fov() if g.scope_fov() > 0.0 else g.ads_fov()
	if Game.state == "play":
		look = Controls.take_look()
		if me.alive:
			var k := zoom_fov / float(Settings.get_value("fov")) if zoom_fov > 0.0 else 1.0   # scoped aim keeps the same feel per screen width
			pl.yaw -= deg_to_rad(look.x) * k
			pl.pitch = clampf(pl.pitch - deg_to_rad(look.y) * k, deg_to_rad(-89.0), deg_to_rad(89.0))
		handle_hotkeys()
	else:
		look = Vector2.ZERO
		Controls.take_look()
	var alpha := Engine.get_physics_interpolation_fraction() if Game.state == "play" else 1.0
	var w := Game.loadout.active
	var vf: float = float(w.def.recoil.viewFrac) if w is Gun else 0.0
	pl.update_view(dt)
	var eye := pl.eye(alpha)
	if in_menu:
		MenuCam.update(dt, camera)
	elif me.alive:
		var rot := Vector3(pl.pitch + deg_to_rad(w.recoil_view.x * vf + w.view_kick), pl.yaw + deg_to_rad(w.recoil_view.y * vf), 0.0)
		camera.global_transform = Transform3D(Basis.from_euler(rot, EULER_ORDER_YXZ), eye)
	elif not (Match.active and me.dead_t > 2.2 and spectate_cam(me, alpha)):
		death_cam(me, eye)
	if me.alive:
		Game.spec_target = null
	if Game.shake > 0.0:
		var k2 := Game.shake * Game.shake
		var e := camera.global_transform.basis.get_euler(EULER_ORDER_YXZ) + Vector3((randf() - 0.5) * 0.05 * k2, (randf() - 0.5) * 0.05 * k2, (randf() - 0.5) * 0.03 * k2)
		camera.global_transform = Transform3D(Basis.from_euler(e, EULER_ORDER_YXZ), camera.global_position)
		Game.shake = maxf(0.0, Game.shake - dt * 1.1)
	Ents.render(alpha)
	Items.render()
	Bomb.render()
	Grenades.render(alpha)
	Actors.hidden = in_menu
	Actors.render(dt, alpha)
	var zf := (w as Gun).scope_fov() if me.alive and w is Gun else 0.0
	var af := (w as Gun).ads_fov() if me.alive and w is Gun else 0.0
	var fov43: float = zf if zf > 0.0 else (af if af > 0.0 else float(Settings.get_value("fov")))
	camera.fov = U.vfov_from(fov43)
	Viewmodel.set_visible(me.alive and zf <= 0.0 and not in_menu)
	Viewmodel.update(dt, pl, w, look, eye, alpha, camera)
	FX.update(0.0 if Game.freeze_fx else dt)
	HUD.update(dt, camera)
	_frames += 1
	if _shot_frames >= 0 and _frames >= _shot_frames:
		var img := get_viewport().get_texture().get_image()
		img.save_png(String(Game.args.shot))
		print("saved ", Game.args.shot)
		get_tree().quit()


## Dead in a defuse round: follow a living teammate (anyone if none) from behind; Mouse 1 switches.
func spectate_cam(me: Actor, alpha: float) -> bool:
	var alive := Actors.list.filter(func(a: Actor) -> bool: return a.alive and a != me)
	var mates := alive.filter(func(a: Actor) -> bool: return a.team == me.team)
	var pool: Array = mates if not mates.is_empty() else alive
	if pool.is_empty():
		return false
	var t: Actor = Game.spec_target
	if t == null or not t.alive or not pool.has(t):
		t = pool[0]
	if Game.state == "play" and Controls.take_mouse_edge(0):
		t = pool[(pool.find(t) + 1) % pool.size()]
	Game.spec_target = t
	var p := t.player
	var pos := p.prev.lerp(p.pos, alpha)
	var yaw := p.yaw
	var pitch := clampf(p.pitch * 0.6, -0.6, 0.5)
	var cp := cos(pitch)
	var back := 135.0
	var head := pos + Vector3(0, 46.0 if p.ducked else 62.0, 0)
	Game.L.cw.trace(spec_tr, head, head + Vector3(sin(yaw) * cp * back, 24.0 - sin(pitch) * back, cos(yaw) * cp * back), Vector3(6, 6, 6), CollisionWorld.MASK_SHOT)
	camera.global_transform = Transform3D(Basis.from_euler(Vector3(pitch - 0.08, yaw, 0), EULER_ORDER_YXZ), spec_tr.endpos)
	return true


## Death camera: sink to the floor beside the body and turn toward whoever did it.
func death_cam(me: Actor, eye: Vector3) -> void:
	var t := U.smooth(0.0, 0.8, me.dead_t)
	var p := me.player.pos
	var pos := Vector3(p.x, p.y + lerpf(eye.y - p.y, 14.0, t), p.z)
	var yaw := me.player.yaw
	var pitch := me.player.pitch * (1.0 - t)
	if me.killer and me.killer != me:
		var k := me.killer.player.pos
		var want := atan2(-(k.x - p.x), -(k.z - p.z))
		yaw = me.player.yaw + U.wrap_angle(want - me.player.yaw) * t
		pitch = lerpf(pitch, atan2(k.y + 50.0 - (p.y + 14.0), Vector2(k.x - p.x, k.z - p.z).length()), t)
	camera.global_transform = Transform3D(Basis.from_euler(Vector3(pitch, yaw, 0.35 * t), EULER_ORDER_YXZ), pos)
