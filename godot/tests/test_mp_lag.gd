extends RefCounted
## Lag compensation. This process hosts a skirmish on Saltpan Depot with no bots; a client process
## (test_mp_client.gd, role "aim") joins, stands 600 units away and taps single shots at the host
## while the host strafes left and right. Without compensation the client aims at where it drew the
## host (a few ticks in the past) and many shots miss; with it the host traces each shot against
## where that client saw it. Options: --netsim=delay_ms,loss_pct,jitter_ms for both ends,
## --nolagcomp to switch the compensation off (to compare).

func run(r: Node) -> void:
	var port := 27900 + randi() % 90
	var netsim := String(Game.args.get("netsim", ""))
	var nolag := Game.args.has("nolagcomp")
	var main: Node = await r.boot_game({"map": "depot", "mode": "skirmish", "bots": "0", "allies": "0", "team": "1"})
	var cfg := Session.cfg.duplicate()
	cfg.mp = true
	cfg.size = 8
	cfg.fill = false
	r.check("lag: hosting", Net.host(cfg, port, "Lag test") == "")
	Net.server.lagcomp = not nolag
	Game.state = "play"
	var args := PackedStringArray(["--headless", "--path", ProjectSettings.globalize_path("res://"), "res://tests/runner.tscn", "--", "--test=mp_client", "--port=%d" % port, "--keep-data", "--role=aim"])
	if netsim != "":
		args.append("--netsim=" + netsim)
	var pid := OS.create_process(OS.get_executable_path(), args)
	var remote: Actor = null
	for i in 300:
		await r.get_tree().create_timer(0.1).timeout
		for a: Actor in Actors.list:
			if a.peer > 0:
				remote = a
		if remote:
			break
	r.check("lag: the client joined", remote != null)
	if remote == null:
		OS.kill(pid)
		Net.leave()
		return
	await r.get_tree().create_timer(1.0).timeout
	# face each other across the Plaza, 600 units apart
	var me := Actors.me
	me.player.spawn(Vector3(300, 0, -1000), PI)
	remote.player.spawn(Vector3(300, 0, -400), 0.0)
	await r.get_tree().create_timer(1.0).timeout
	var shots0 := _shots(remote)
	var hits := 0
	me.health = 1000
	var hp := me.health
	var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < 7000:
		var t := (Time.get_ticks_msec() - t0) / 1000.0
		Controls.test_hold = {"side": 1.0 if int(t / 0.45) % 2 == 0 else -1.0}
		await r.get_tree().process_frame
		if me.health < hp:
			hits += 1
		if me.health < 400:
			me.health = 1000
		hp = me.health
		me.armor = 0
	Controls.test_hold = {}
	var shots := _shots(remote) - shots0
	var rate := float(hits) / maxf(1.0, float(shots))
	var what := "%s, %s" % ["no compensation" if nolag else "compensated", ("netsim " + netsim) if netsim != "" else "localhost"]
	r.check("lag: the client fired at the strafing host", shots >= 10, "%d shots" % shots)
	if nolag:
		print("lag: hit rate without compensation %d/%d (%.0f%%)" % [hits, shots, rate * 100.0])
	else:
		r.check("lag: shots at a strafing target land (%s)" % what, rate >= 0.6, "%d of %d hit (%.0f%%)" % [hits, shots, rate * 100.0])
	for i in 100:
		if not OS.is_process_running(pid):
			break
		await r.get_tree().create_timer(0.1).timeout
	if OS.is_process_running(pid):
		OS.kill(pid)
	Net.leave()
	Game.state = "menu"
	main.queue_free()
	await r.get_tree().process_frame


func _shots(a: Actor) -> int:
	var n := 0
	for w: Weapon in a.loadout.list:
		if w is Gun:
			n += (w as Gun).shot_count
	return n
