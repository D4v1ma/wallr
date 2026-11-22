extends RefCounted
## Movement checks against the practice hall (same cases and numbers as tools/node-move-check.mjs).

const DT := 1.0 / 64.0
var P: Player


func cmd(o: Dictionary = {}) -> Dictionary:
	var c := Controls.IDLE.duplicate()
	c.merge(o, true)
	return c


func run_ticks(n: int, c: Variant, each: Callable = Callable()) -> void:
	for i in n:
		P.tick(c.call(i) if c is Callable else c, DT)
		if each.is_valid():
			each.call(i)


func fmt(v: Vector3) -> String:
	return "%.1f, %.1f, %.1f" % [v.x, v.y, v.z]


func box_try(x: float, crouch: bool) -> float:
	P.spawn(Vector3(x, 0, 470), PI)
	run_ticks(30, cmd({"fwd": 1.0}))
	run_ticks(1, cmd({"fwd": 1.0, "jump": true}))
	run_ticks(90, func(i: int) -> Dictionary: return cmd({"fwd": 1.0, "duck": crouch and i > 6 and i < 60}))
	return P.pos.y


func run(r: Node) -> void:
	var L := Game.load_level("range")
	await r.get_tree().physics_frame
	P = Player.new(L.cw)
	var t0 := Time.get_ticks_usec()
	# 1) run, walk and crouch speeds
	P.spawn(Vector3(96, 0, -416), -PI / 2); run_ticks(96, cmd({"fwd": 1.0}))
	r.check("run speed caps at 225", absf(P.speed() - 225.0) < 1.0, "speed=%.1f pos=%s" % [P.speed(), fmt(P.pos)])
	P.spawn(Vector3(96, 0, -300), -PI / 2); run_ticks(96, cmd({"fwd": 1.0, "walk": true}))
	r.check("walk speed 52%", absf(P.speed() - 117.0) < 1.5, "speed=%.1f" % P.speed())
	P.spawn(Vector3(96, 0, -200), -PI / 2); run_ticks(96, cmd({"fwd": 1.0, "duck": true}))
	r.check("crouch speed 34%", absf(P.speed() - 76.5) < 1.5, "speed=%.1f ground=%s ducked=%s" % [P.speed(), P.on_ground, P.ducked])
	# 2) jump height
	P.spawn(Vector3(300, 0, -100), 0); run_ticks(4, cmd())
	var acc := {"y": 0.0}
	run_ticks(1, cmd({"jump": true}))
	run_ticks(80, cmd(), func(_i: int) -> void: acc.y = maxf(acc.y, P.pos.y))
	r.check("standing jump height ~57", absf(acc.y - 57.0) < 1.5, "apex=%.2f landed=%s" % [acc.y, P.on_ground])
	# 3) steps
	for row in [[128.0, 16.0, true], [224.0, 18.0, true], [320.0, 20.0, false]]:
		P.spawn(Vector3(row[0], 0, 618), 0)
		var top := {"y": 0.0}
		run_ticks(60, cmd({"fwd": 1.0}), func(_i: int) -> void: top.y = maxf(top.y, P.pos.y))
		var up: bool = top.y > float(row[1]) - 0.5
		r.check("step %d %s" % [row[1], "climbs" if row[2] else "blocks"], up == row[2], "max y=%.2f z=%.1f" % [top.y, P.pos.z])
	# 4) jump boxes
	var y := box_try(-832, false)
	r.check("48 box: plain jump lands on top", y > 47.0, "y=%.1f" % y)
	y = box_try(-736, false)
	r.check("64 box: plain jump fails", y < 1.0, "y=%.1f" % y)
	y = box_try(-736, true)
	r.check("64 box: crouch-jump lands on top", y > 63.0, "y=%.1f" % y)
	y = box_try(-640, true)
	r.check("72 box: crouch-jump fails", y < 1.0, "y=%.1f" % y)
	# 5) stairs and ramp up to the catwalk
	P.spawn(Vector3(-150, 0, -592), PI / 2); run_ticks(160, cmd({"fwd": 1.0}))
	r.check("stairs reach catwalk height 128", absf(P.pos.y - 128.0) < 1.0, "pos=%s" % fmt(P.pos))
	P.spawn(Vector3(-976, 0, -100), 0); run_ticks(160, cmd({"fwd": 1.0}))
	r.check("ramp reaches catwalk", P.pos.y > 127.0, "pos=%s" % fmt(P.pos))
	# 6) walls
	P.spawn(Vector3(600, 0, -560), 0); run_ticks(120, cmd({"fwd": 1.0}))
	r.check("north wall stops player (z >= -623.9)", P.pos.z > -624.1 and P.pos.z < -600.0, "z=%.3f" % P.pos.z)
	P.spawn(Vector3(600, 0, -560), -PI / 4); run_ticks(120, cmd({"fwd": 1.0}))
	r.check("slides along wall", P.pos.x > 700.0, "pos=%s" % fmt(P.pos))
	# 7) the closed hall door blocks; once opened you walk through
	P.spawn(Vector3(-60, 0, 448), -PI / 2); run_ticks(120, cmd({"fwd": 1.0}))
	r.check("closed door blocks", P.pos.x < 0.0, "x=%.2f" % P.pos.x)
	var d: Object = Ents.door_in_reach(P.eye(1.0), U.view_dir(P.yaw, 0.0))
	r.check("the door is in reach and opens", d != null, "")
	if d:
		d.toggle(P.pos)
		P.spawn(Vector3(-200, 0, 448), -PI / 2)
		for i in 64:
			Ents.tick(DT, [P])
		run_ticks(140, cmd({"fwd": 1.0}))
		r.check("an open door lets you through", P.pos.x > 40.0, "x=%.2f angle=%.2f" % [P.pos.x, d.angle])
	var ms := (Time.get_ticks_usec() - t0) / 1000.0
	r.check("movement is fast enough (%d ticks)" % 1500, ms < 3000.0, "%.0f ms" % ms)
