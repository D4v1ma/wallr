extends RefCounted
## Screenshots for the visual check (run under a display: xvfb-run ... -- --test=shots --out=dir).

const DT := 1.0 / 64.0
var out := "user://shots"


func place(a: Actor, p: Vector3, yaw_deg: float) -> void:
	a.player.spawn(p, deg_to_rad(yaw_deg))
	a.player.pitch = 0.0
	a.alive = true
	a.health = 100
	if a.brain:
		a.brain.reset()


func snap(r: Node, name: String, frames: int = 6) -> void:
	for i in frames:
		await r.get_tree().process_frame
	var img := r.get_viewport().get_texture().get_image()
	DirAccess.make_dir_recursive_absolute(out)
	img.save_png(out.path_join(name + ".png"))
	print("shot %s · %s" % [name, Game.frame_cost()])


func fire(main: Node, a: Actor) -> void:
	var g := a.loadout.active as Gun
	g.state = "idle"
	g.next_fire = 0.0
	g.fire(a.player, Game.time, 60.0 / float(g.def.rpm))
	for e: Dictionary in g.events:
		if e.type == "shot":
			main.fire_shot(a, g, e)
	g.events.clear()


func run(r: Node) -> void:
	out = String(Game.args.get("out", out))
	var main: Node = await r.boot_game({"map": "depot", "mode": "skirmish", "bots": "3", "allies": "2", "team": "1"})
	Game.bots_frozen = true
	Settings.v.showHints = false
	var me := Actors.me
	var enemies := Actors.list.filter(func(a: Actor) -> bool: return a.is_bot and a.team != me.team)
	var mates := Actors.list.filter(func(a: Actor) -> bool: return a.is_bot and a.team == me.team)
	# characters in the yard: two enemies facing you, a teammate to the side
	var base := Vector3(-200, 0, 0)
	place(me, base, -90)
	place(enemies[0], base + Vector3(260, 0, -40), 90)
	place(enemies[1], base + Vector3(420, 0, 70), 100)
	enemies[1].player.ducked = true
	place(mates[0], base + Vector3(120, 0, 120), -60)
	await snap(r, "g-chars", 10)
	# a burst at the wall: muzzle flash, tracer, impacts, decals
	place(enemies[0], base + Vector3(-400, 0, -40), 90)
	place(enemies[1], base + Vector3(-400, 0, 70), 90)
	me.player.pitch = -0.04
	for i in 4:
		me.player.yaw = deg_to_rad(-90.0 + (i - 1.5) * 1.6)
		fire(main, me)
		r.ticks(main, 6)
		await r.get_tree().process_frame
	await snap(r, "g-fire", 1)
	await snap(r, "g-decals", 30)
	# close up on the hut wall after a few hits
	place(me, Vector3(20, 0, 0), -90)
	me.player.pitch = -0.02
	for i in 5:
		me.player.yaw = deg_to_rad(-90.0 + (i - 2) * 4.0)
		fire(main, me)
		r.ticks(main, 8)
	me.player.yaw = deg_to_rad(-90.0)
	await snap(r, "g-closeup", 20)
	# scoped in with the rifle
	Game.state = "play"
	Controls.test_hold = {"alt": true}
	r.ticks(main, 30)
	await snap(r, "g-ads", 4)
	Controls.test_hold = {}
	r.ticks(main, 30)
	Game.state = "menu"
	main.queue_free()
