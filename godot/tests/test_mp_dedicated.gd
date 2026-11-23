extends RefCounted
## The dedicated server: start one in its own process (--server, 2v2 defuse on Saltpan Depot, all
## bots), then join it from this process. Checks the LAN list shows it with nobody playing, that we
## take a bot's place and the match starts afresh for us, that chat goes round, that switching sides
## works, that the server keeps running when we leave, and that its console logged all of it.


func run(r: Node) -> void:
	var port := 27900 + randi() % 200
	var log_path := ProjectSettings.globalize_path("user://test-data/server.log")
	if FileAccess.file_exists(log_path):
		DirAccess.remove_absolute(log_path)
	var args := PackedStringArray(["--headless", "--log-file", log_path, "--path", ProjectSettings.globalize_path("res://"), "--",
		"--server", "--map=depot", "--mode=defuse", "--size=2", "--port=%d" % port, "--name=Test server"])
	var pid := OS.create_process(OS.get_executable_path(), args)
	r.check("server: started a dedicated server process", pid > 0)
	var main: Node = await r.boot_game({"map": "range", "mode": "skirmish"})
	Game.state = "menu"
	# it shows up on the LAN with nobody playing (the server itself doesn't count)
	var info := await _find(r, port, 300)
	r.check("server: the LAN browser lists it", not info.is_empty(), str(info))
	if info.is_empty():
		OS.kill(pid)
		return
	r.check("server: listed with its name, nobody playing, 4 places", String(info.get("name", "")) == "Test server" and int(info.get("players", -1)) == 0 and int(info.get("max", 0)) == 4,
		"%s · %d/%d" % [info.get("name", ""), int(info.get("players", -1)), int(info.get("max", 0))])
	# join
	Net.join("127.0.0.1", port)
	var ok := false
	for i in 300:
		await r.get_tree().create_timer(0.1).timeout
		if Net.client and Net.client.ready and Net.client.have_snap and Net.client.my_id > 0:
			ok = true
			break
		if not Net.is_client():
			break
	r.check("client: joined the dedicated server and gets snapshots", ok, "map %s" % (Game.L.key if Game.L else "?"))
	if not ok:
		Net.leave()
		OS.kill(pid)
		return
	Game.state = "play"
	await r.get_tree().create_timer(0.5).timeout
	var hosts := Actors.list.filter(func(a: Actor) -> bool: return a.peer == 1)
	r.check("client: 2v2 with us in a bot's place, no player for the server itself", Actors.list.size() == 4 and Actors.on_side(0) == 2 and Actors.on_side(1) == 2 and hosts.is_empty(),
		"%d players, %d-%d" % [Actors.list.size(), Actors.on_side(0), Actors.on_side(1)])
	r.check("client: the match starts afresh for the first player", Match.round == 1 and Match.phase == "freeze", "round %d, %s" % [Match.round, Match.phase])
	r.check("client: told in chat that we joined", _chat_has("", "joined the"))
	# chat through the box (Y), as a player would
	HUD.open_chat(false)
	var typing := Controls.typing and HUD.typing()
	HUD.chat_box.text = "hello from the test"
	HUD.chat_box.text_submitted.emit(HUD.chat_box.text)
	r.check("client: Y opens the chat box and Enter puts it away", typing and not Controls.typing and not HUD.typing())
	for i in 30:
		if _chat_has(Actors.me.name, "hello from the test"):
			break
		await r.get_tree().create_timer(0.1).timeout
	r.check("client: our chat line comes back from the server", _chat_has(Actors.me.name, "hello from the test"))
	# switch sides: a bot goes the other way so it stays 2v2
	var t0 := Actors.me.team
	Net.switch_team(1 - t0)
	for i in 40:
		if Actors.me.team != t0:
			break
		await r.get_tree().create_timer(0.1).timeout
	await r.get_tree().create_timer(0.3).timeout
	r.check("client: switched sides through the server", Actors.me.team == 1 - t0 and Actors.on_side(0) == 2 and Actors.on_side(1) == 2,
		"now %s, %d-%d" % [Actors.TEAMS[Actors.me.team].name, Actors.on_side(0), Actors.on_side(1)])
	r.check("client: everyone is told about the switch", _chat_has("", "switched to the"))
	# leave: the server stays up and lists nobody playing again
	Net.leave()
	Game.state = "menu"
	await r.get_tree().create_timer(1.0).timeout
	var after := await _find(r, port, 60)
	r.check("server: keeps running after the last player leaves", OS.is_process_running(pid) and not after.is_empty() and int(after.get("players", -1)) == 0,
		"%d playing" % int(after.get("players", -1)))
	OS.kill(pid)
	await r.get_tree().create_timer(0.3).timeout
	var log := FileAccess.get_file_as_string(log_path)
	var want := ["Test server · Saltpan Depot · Defuse · 2 per side", "joined the", "hello from the test", "switched to the", "left (0 playing)"]
	var missing: Array = []
	for w: String in want:
		if not log.contains(w):
			missing.append(w)
	r.check("server: its console logged the session", missing.is_empty() and not log.contains("SCRIPT ERROR"), "missing %s" % str(missing) if not missing.is_empty() else "%d lines" % log.count("\n"))
	if log.contains("SCRIPT ERROR"):
		print(log)
	main.queue_free()
	await r.get_tree().process_frame


func _find(r: Node, port: int, tries: int) -> Dictionary:
	Net.scan(true)
	var found := {}
	for i in tries:
		await r.get_tree().create_timer(0.1).timeout
		for k: String in Net.lan_games:
			if int(Net.lan_games[k].get("port", 0)) == port:
				found = Net.lan_games[k]
		if not found.is_empty():
			break
	Net.scan(false)
	return found


func _chat_has(n: String, text: String) -> bool:
	for c: Dictionary in HUD.chat_lines:
		if String(c.name) == n and String(c.text).contains(text):
			return true
	return false
