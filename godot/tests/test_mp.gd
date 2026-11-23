extends RefCounted
## Network play, end to end on this computer. This process hosts a 2v2 defuse match on Saltpan
## Depot (you and a bot against two bots), then starts a second Godot process as a client
## (tests/test_mp_client.gd) that finds the game on the LAN, joins it over localhost, walks, fires
## and leaves. The client writes its own checks to user://test-data/mp_client.txt; the host checks
## that the joiner took a bot's place, moved and fired on the host's copy, and that a bot came back
## when it left.

const RESULTS := "user://test-data/mp_client.txt"


func run(r: Node) -> void:
	var port := 27700 + randi() % 200
	var netsim := String(Game.args.get("netsim", ""))     # --netsim=delay,loss,jitter for both ends
	if FileAccess.file_exists(RESULTS):
		DirAccess.remove_absolute(RESULTS)
	var main: Node = await r.boot_game({"map": "depot", "mode": "defuse", "bots": "2", "allies": "1", "team": "1", "diff": "normal"})
	var cfg := Session.cfg.duplicate()
	cfg.mp = true
	cfg.size = 2
	cfg.fill = true
	var err := Net.host(cfg, port, "Test host")
	r.check("host: listening on port %d" % port, err == "", err)
	Game.state = "play"            # from here the match runs in real time (main._physics_process)
	var before := _sides()
	var args := PackedStringArray(["--headless", "--path", ProjectSettings.globalize_path("res://"), "res://tests/runner.tscn", "--", "--test=mp_client", "--port=%d" % port, "--keep-data"])
	if netsim != "":
		args.append("--netsim=" + netsim)
	var pid := OS.create_process(OS.get_executable_path(), args)
	r.check("host: started a client process", pid > 0)
	# the client joins
	var remote: Actor = null
	for i in 300:
		await r.get_tree().create_timer(0.1).timeout
		for a: Actor in Actors.list:
			if a.peer > 0:
				remote = a
		if remote:
			break
	r.check("host: a player joined over the network", remote != null, "after %.1f s" % (Time.get_ticks_msec() / 1000.0))
	if remote == null:
		Net.leave()
		OS.kill(pid)
		return
	var after := _sides()
	r.check("host: the joiner took a bot's place (2v2 stays 2v2)", after[0] == before[0] and after[1] == before[1] and not remote.is_bot,
		"sides %s -> %s, joined the %s" % [str(before), str(after), Actors.TEAMS[remote.team].name])
	# watch it play: it walks once the round is live, then fires
	var start: Vector3 = remote.player.pos
	var spawn_count := remote.player.spawns
	var moved := 0.0
	var fired := false
	var shots0 := _shots(remote)
	var bought := false
	for i in 400:
		await r.get_tree().create_timer(0.1).timeout
		if remote.player.spawns != spawn_count:
			spawn_count = remote.player.spawns
			start = remote.player.pos
		moved = maxf(moved, Vector2(remote.player.pos.x - start.x, remote.player.pos.z - start.z).length())
		fired = fired or _shots(remote) > shots0
		bought = bought or remote.armor >= 100
		if not OS.is_process_running(pid) or not Actors.list.has(remote):
			break
	r.check("host: the remote player moved on the host", moved > 150.0, "%.0f units" % moved)
	r.check("host: the remote player fired (host's copy of its gun)", fired, "%d shots" % (_shots(remote) - shots0))
	r.check("host: the remote player's purchase went through (vest)", bought)
	# it leaves: its place goes back to a bot
	for i in 200:
		if not Actors.list.has(remote):
			break
		await r.get_tree().create_timer(0.1).timeout
	r.check("host: the player left and a bot took its place again", not Actors.list.has(remote) and _sides() == before, "sides %s" % str(_sides()))
	var heard := false
	for c: Dictionary in HUD.chat_lines:
		heard = heard or String(c.text) == "hello host"
	r.check("host: the client's chat line reached us", heard)
	# the host changes sides itself: a bot goes the other way, squads (and so the score) stay right
	var t0 := Actors.me.team
	Net.switch_team(1 - t0)
	var squads_ok := true
	for a: Actor in Actors.list:
		squads_ok = squads_ok and Match.squad_on_side(a.team) == a.squad
	r.check("host: switching sides from the pause menu (a bot swaps back, squads stay right)", Actors.me.team == 1 - t0 and _sides() == before and squads_ok,
		"%s, sides %s" % [Actors.TEAMS[Actors.me.team].name, str(_sides())])
	for i in 100:
		if not OS.is_process_running(pid):
			break
		await r.get_tree().create_timer(0.1).timeout
	if OS.is_process_running(pid):
		OS.kill(pid)
	_report(r, RESULTS)
	# a second client stays until the host ends the game, and must be told
	var res2 := RESULTS.replace(".txt", "2.txt")
	if FileAccess.file_exists(res2):
		DirAccess.remove_absolute(res2)
	args.append("--role=stay")
	var pid2 := OS.create_process(OS.get_executable_path(), args)
	var remote2: Actor = null
	for i in 300:
		await r.get_tree().create_timer(0.1).timeout
		for a: Actor in Actors.list:
			if a.peer > 0:
				remote2 = a
		if remote2:
			break
	r.check("host: a second player joined", remote2 != null)
	await r.get_tree().create_timer(1.0).timeout
	Net.leave()
	for i in 150:
		if not OS.is_process_running(pid2):
			break
		await r.get_tree().create_timer(0.1).timeout
	if OS.is_process_running(pid2):
		OS.kill(pid2)
	_report(r, res2)
	Net.leave()
	Game.state = "menu"
	main.queue_free()
	await r.get_tree().process_frame


## The client process's own checks, written to a file it shares with us.
func _report(r: Node, path: String) -> void:
	var f := FileAccess.open(path, FileAccess.READ)
	r.check("client: reported back (%s)" % path.get_file(), f != null)
	if f:
		while not f.eof_reached():
			var line := f.get_line()
			if line.begins_with("PASS") or line.begins_with("FAIL"):
				var parts := line.split("\t")
				r.check(parts[1] if parts.size() > 1 else line, line.begins_with("PASS"), parts[2] if parts.size() > 2 else "")


func _shots(a: Actor) -> int:
	var n := 0
	for w: Weapon in a.loadout.list:
		if w is Gun:
			n += (w as Gun).shot_count
	return n


func _sides() -> Array:
	return [Actors.on_side(0), Actors.on_side(1)]
