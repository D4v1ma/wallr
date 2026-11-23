extends RefCounted
## The client half of test_mp.gd (started by it, never on its own): find the host on the LAN, join,
## wait for the round to go live, walk forward, fire, then leave. Writes its checks to
## user://test-data/mp_client.txt for the host process to report.

var lines: PackedStringArray = []


func check(name: String, ok: bool, info: String = "") -> void:
	lines.append("%s\t%s\t%s" % ["PASS" if ok else "FAIL", name, info])
	print("%s  %s  %s" % ["PASS" if ok else "FAIL", name, info])


var _out := "user://shots"


func run(r: Node) -> void:
	var port := int(Game.args.get("port", str(Net.PORT)))
	_out = String(Game.args.get("out", _out))
	var role := String(Game.args.get("role", ""))         # read before boot_game replaces the arguments
	var main: Node = await r.boot_game({"map": "range", "mode": "skirmish"})
	Game.state = "menu"
	# the LAN browser
	Net.scan(true)
	var found := ""
	for i in 50:
		await r.get_tree().create_timer(0.1).timeout
		for k: String in Net.lan_games:
			if int(Net.lan_games[k].get("port", 0)) == port:
				found = k
		if found != "":
			break
	Net.scan(false)
	check("client: the LAN browser finds the game", found != "", found)
	# join
	Net.join("127.0.0.1", port)
	var ok := false
	for i in 200:
		await r.get_tree().create_timer(0.1).timeout
		if Net.client and Net.client.ready and Net.client.have_snap and Net.client.my_id > 0:
			ok = true
			break
		if not Net.is_client():
			break
	check("client: joined, loaded the host's map and gets snapshots", ok, "map %s, actor %d" % [Game.L.key if Game.L else "?", Net.client.my_id if Net.client else 0])
	if not ok:
		_finish(r)
		return
	check("client: sees everyone in the match", Actors.list.size() == (8 if role == "shots" else (2 if role == "aim" else 4)), "%d players" % Actors.list.size())
	if role == "shots":
		await _shots(r)
		_finish(r, "user://test-data/mp_client_shots.txt")
		return
	if role == "aim":
		await _aim(r)
		_finish(r, "user://test-data/mp_client_aim.txt")
		return
	if role == "stay":
		# stay until the host ends the game: we must land back in the menus, told why
		for i in 300:
			if not Net.is_client():
				break
			await r.get_tree().create_timer(0.1).timeout
		check("client 2: told when the host ends the game", not Net.is_client() and Menus.mp_message == "The host left the game", "\"%s\", screen %s" % [Menus.mp_message, Menus.current])
		_finish(r, "user://test-data/mp_client2.txt")
		return
	check("client: plays on the side the host gave it", Actors.me.team == 0 or Actors.me.team == 1)
	# buy a vest through the host while it's buy time (we joined during it)
	for i in 30:
		if Actors.me.alive and Match.phase == "freeze":
			break
		await r.get_tree().create_timer(0.1).timeout
	if Match.phase == "freeze" and Actors.me.alive:
		HUD.buy_press(6)
		for i in 20:
			await r.get_tree().create_timer(0.1).timeout
			if Actors.me.armor >= 100:
				break
		check("client: buying goes through the host (vest)", Actors.me.armor >= 100 and HUD.buy_msg.begins_with("Bought"), "armor %d · %s" % [Actors.me.armor, HUD.buy_msg])
	else:
		check("client: buying goes through the host (vest)", false, "joined after buy time (phase %s)" % Match.phase)
	# wait for the round to go live (buy time pins everyone in place)
	for i in 160:
		if Match.phase == "live":
			break
		await r.get_tree().create_timer(0.1).timeout
	check("client: follows the host's round (live)", Match.phase == "live", "phase %s, round %d" % [Match.phase, Match.round])
	await r.get_tree().create_timer(0.3).timeout
	# walk forward 2 s, watching how much the host corrects our prediction
	Game.state = "play"
	var me := Actors.me
	var p0 := me.player.pos
	var max_corr := 0.0
	Controls.test_hold = {"fwd": 1.0}
	var others0 := {}
	for a: Actor in Actors.list:
		if a != me:
			others0[a.id] = a.player.pos
	for i in 40:
		await r.get_tree().create_timer(0.05).timeout
		max_corr = maxf(max_corr, Net.client.corr.length())
	Controls.test_hold = {}
	var moved := Vector2(me.player.pos.x - p0.x, me.player.pos.z - p0.z).length()
	check("client: walks at once (prediction)", moved > 150.0, "%.0f units in 2 s" % moved)
	check("client: the host agrees where we are (corrections stay small)", max_corr < 24.0, "largest correction %.1f units" % max_corr)
	var others_moved := 0
	for a: Actor in Actors.list:
		if a != me and others0.has(a.id) and a.alive and Vector2(a.player.pos.x - others0[a.id].x, a.player.pos.z - others0[a.id].z).length() > 40.0:
			others_moved += 1
	check("client: other players move on our screen (interpolated)", others_moved >= 1, "%d of %d" % [others_moved, Actors.list.size() - 1])
	# fire a few rounds
	var g := Game.loadout.active as Gun
	var ammo0 := g.ammo if g else 0
	Controls.test_hold = {"fire": true}
	await r.get_tree().create_timer(0.8).timeout
	Controls.test_hold = {}
	await r.get_tree().create_timer(0.6).timeout
	var g2 := Game.loadout.active as Gun
	check("client: our gun fires (predicted, then confirmed)", g2 != null and g2.ammo < ammo0, "%d -> %d" % [ammo0, g2.ammo if g2 else -1])
	check("client: snapshots keep coming", Net.client.snap_tick > 0 and Net.client.bytes_in > 0, "%d bytes in, tick %d" % [Net.client.bytes_in, Net.client.snap_tick])
	_finish(r)


func _finish(r: Node, path: String = "user://test-data/mp_client.txt") -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f:
		f.store_string("\n".join(lines) + "\n")
		f.close()
	Net.leave()
	Game.state = "menu"


## Role "aim" (test_mp_lag.gd): wait for the host to place us, then aim at the host where we draw
## it and tap single shots for six seconds.
func _aim(r: Node) -> void:
	var host: Actor = null
	for a: Actor in Actors.list:
		if a.peer == 1:
			host = a
	if host == null:
		return
	var me := Actors.me
	var sp := me.player.spawns
	for i in 60:
		await r.get_tree().create_timer(0.1).timeout
		if me.player.spawns != sp:
			break
	await r.get_tree().create_timer(0.8).timeout
	Game.state = "play"
	var t0 := Time.get_ticks_msec()
	var next_tap := 0
	while Time.get_ticks_msec() - t0 < 6500 and Net.is_client():
		var now := Time.get_ticks_msec() - t0
		var target := host.player.pos + Vector3(0, 50, 0)
		var eye := me.eye()
		var d := target - eye
		me.player.yaw = atan2(-d.x, -d.z)
		me.player.pitch = atan2(d.y, Vector2(d.x, d.z).length())
		if now >= next_tap:
			Controls.test_hold = {"fire": true}
			next_tap = now + 380
		elif now >= next_tap - 380 + 40:
			Controls.test_hold = {}
		await r.get_tree().process_frame
	Controls.test_hold = {}


## Role "shots" (test_mp_shots.gd): once the host has placed us and the bots, save our view and
## the scoreboard.
func _shots(r: Node) -> void:
	var out := String(Game.args.get("out", "user://shots")) if Game.args.has("out") else _out
	var me := Actors.me
	var sp := me.player.spawns
	for i in 100:
		await r.get_tree().create_timer(0.1).timeout
		if me.player.spawns != sp:
			break
	Game.state = "play"
	await r.get_tree().create_timer(1.5).timeout
	DirAccess.make_dir_recursive_absolute(out)
	await r.get_tree().process_frame
	r.get_viewport().get_texture().get_image().save_png(out.path_join("mp-client.png"))
	Controls.held["scores"] = true
	await r.get_tree().create_timer(0.3).timeout
	r.get_viewport().get_texture().get_image().save_png(out.path_join("mp-scoreboard.png"))
	Controls.held["scores"] = false
	check("client: saved its view and the scoreboard", FileAccess.file_exists(out.path_join("mp-client.png")), out)

