extends RefCounted
## Screenshots of a client's view (needs a display: run under xvfb-run). This process hosts a 4v4
## on Saltpan Depot, starts a rendered client process (test_mp_client.gd, role "shots"), then
## freezes the bots and stands three of them in front of the client: two enemies and a teammate.
## The client saves its view and the scoreboard to --out.

func run(r: Node) -> void:
	var port := 27990 + randi() % 9
	var out := String(Game.args.get("out", "user://shots"))
	var main: Node = await r.boot_game({"map": "depot", "mode": "defuse", "bots": "4", "allies": "3", "team": "1", "diff": "normal"})
	var cfg := Session.cfg.duplicate()
	cfg.mp = true
	cfg.size = 4
	cfg.fill = true
	Net.host(cfg, port, "Shots host")
	Game.state = "play"
	var args := PackedStringArray(["--path", ProjectSettings.globalize_path("res://"), "--rendering-driver", "vulkan", "--resolution", "1280x720", "res://tests/runner.tscn", "--",
		"--test=mp_client", "--port=%d" % port, "--keep-data", "--role=shots", "--out=" + out])
	var pid := OS.create_process(OS.get_executable_path(), args)
	var remote: Actor = null
	for i in 600:
		await r.get_tree().create_timer(0.1).timeout
		for a: Actor in Actors.list:
			if a.peer > 0:
				remote = a
		if remote:
			break
	r.check("shots: a rendered client joined", remote != null)
	if remote == null:
		OS.kill(pid)
		Net.leave()
		return
	await r.get_tree().create_timer(3.0).timeout
	Game.bots_frozen = true
	var base := Vector3(-700, 0, 0)
	remote.player.spawn(base, deg_to_rad(-90.0))
	var foes := Actors.list.filter(func(a: Actor) -> bool: return a.is_bot and a.team != remote.team)
	var mates := Actors.list.filter(func(a: Actor) -> bool: return a.is_bot and a.team == remote.team)
	for i in mini(2, foes.size()):
		var a: Actor = foes[i]
		a.player.spawn(base + Vector3(300 + i * 120, 0, -60 + i * 130), deg_to_rad(90.0 + i * 10.0))
		a.alive = true
	if not mates.is_empty():
		(mates[0] as Actor).player.spawn(base + Vector3(140, 0, 150), deg_to_rad(-70.0))
		(mates[0] as Actor).alive = true
	me_out_of_the_way()
	await r.get_tree().create_timer(2.6).timeout
	Net.say("good luck all", false)
	for i in 300:
		if not OS.is_process_running(pid):
			break
		await r.get_tree().create_timer(0.1).timeout
	r.check("shots: the client finished", not OS.is_process_running(pid))
	if OS.is_process_running(pid):
		OS.kill(pid)
	Net.leave()
	Game.state = "menu"
	main.queue_free()
	await r.get_tree().process_frame


func me_out_of_the_way() -> void:
	Actors.me.player.spawn(Vector3(-5800, 0, -400), 0.0)
