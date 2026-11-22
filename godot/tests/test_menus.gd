extends RefCounted
## Front-end flows on a fresh device (like tools/gameplay6-check.mjs): create an account, the main
## menu, Create Game, buying and equipping an attachment, launching, pausing, leaving, results,
## settings with the admin box, career, signing out and back in with a PIN.
## With a display (xvfb-run), it also saves screenshots to --out.

var out := ""


func snap(r: Node, name: String) -> void:
	for i in 4:
		await r.get_tree().process_frame
	if out == "" or DisplayServer.get_name() == "headless":
		return
	DirAccess.make_dir_recursive_absolute(out)
	r.get_viewport().get_texture().get_image().save_png(out.path_join(name + ".png"))
	print("shot ", name)


func frames(r: Node, n: int) -> void:
	for i in n:
		await r.get_tree().process_frame


func run(r: Node) -> void:
	out = String(Game.args.get("out", ""))
	# a fresh device: no accounts
	for f in DirAccess.get_files_at(Accounts.DIR):
		DirAccess.remove_absolute(Accounts.DIR + f)
	Settings.v.map = "depot"      # the menu background; the match below loads another map
	Game.args = {"menu": "1"}
	Game.world_root = r
	var main: Node = load("res://scenes/main.tscn").instantiate()
	r.add_child(main)
	await frames(r, 8)
	r.check("first launch on a fresh device asks for an account", Menus.current == "newacct", Menus.current)
	await snap(r, "m-newacct")
	var res := Accounts.create("Ember", "1234")
	Menus.after_sign_in()
	await frames(r, 3)
	r.check("creating an account signs in and opens the main menu", res.ok and Accounts.cur != null and Accounts.cur.name == "Ember" and Menus.current == "home",
		"%s %s" % [res.get("msg", ""), Menus.current])
	r.check("the account and its profile are saved on the device", FileAccess.file_exists(Accounts.INDEX) and FileAccess.file_exists(Accounts.DIR + "profile_%s.json" % Accounts.cur.id))
	await snap(r, "m-home")
	# Create Game
	Menus.open_create()
	Menus._set_cfg("map", "range")
	Menus._set_cfg("mode", "skirmish")
	Menus._set_cfg("enemies", 2)
	Menus._set_cfg("allies", 1)
	await frames(r, 2)
	r.check("Create Game keeps the choices", Menus.current == "create" and Menus.cfg.map == "range" and Menus.cfg.mode == "skirmish" and int(Menus.cfg.enemies) == 2)
	await snap(r, "m-create")
	Menus.open_armory("loadout", true)
	Menus.arm.gun = "rifle"
	Menus._opt_pressed("rifle", "muzzle", "hush")
	var p0 := int(Profile.v.points)
	var b := Profile.buy("att", "hush", "rifle")
	Profile.equip("rifle", "muzzle", "hush")
	Menus._render()
	await frames(r, 2)
	r.check("the shop sells an attachment for points and it equips", b.ok and Profile.owns("att", "rifle:hush") and Arsenal.kit_for("rifle").muzzle == "hush" and int(Profile.v.points) == p0 - Arsenal.att_price("hush", "rifle"),
		"%s points %d -> %d" % [b.msg, p0, Profile.v.points])
	await snap(r, "m-loadout")
	# launch
	Menus.launch(Menus.norm_cfg(Menus.cfg.duplicate()))
	await frames(r, 12)
	r.check("launching a match loads the map and shows the ready card", Game.L.key == "range" and Menus.current == "ready", "%s %s" % [Game.L.key, Menus.current])
	Game.main.play()
	await frames(r, 4)
	var def: Dictionary = Actors.me.loadout.by_id("rifle").def
	r.check("deploying starts play with the bots and your attachment on the rifle", Game.state == "play" and Actors.list.size() == 4 and def.get("suppressed", false),
		"state=%s actors=%d" % [Game.state, Actors.list.size()])
	await snap(r, "m-play")
	Actors.me.kills = 3
	Actors.me.dmg = 250
	Game.main.pause()
	await frames(r, 2)
	r.check("Esc pauses with the pause menu", Game.state == "paused" and Menus.current == "pause")
	await snap(r, "m-pause")
	Session.leave()
	await frames(r, 3)
	r.check("leaving a skirmish shows practice results and records them", Menus.current == "results" and Session.results.outcome == "practice" and float(Profile.v.xp) > 0.0,
		"%s xp=%s" % [Menus.current, Profile.v.xp])
	await snap(r, "m-results")
	Menus.home()
	Menus.show_screen("settings")
	await frames(r, 2)
	await snap(r, "m-settings")
	Menus.show_screen("career")
	await frames(r, 2)
	await snap(r, "m-career")
	# sign out, then sign back in with the PIN
	Menus.switch_account()
	await frames(r, 2)
	r.check("signing out shows the account picker", Menus.current == "account" and Accounts.is_guest())
	await snap(r, "m-accounts")
	var acc: Dictionary = Accounts.list[0]
	r.check("a wrong PIN is refused, the right one accepted", not Accounts.verify(acc, "9999") and Accounts.verify(acc, "1234"))
	Accounts.sign_in(acc)
	r.check("signing back in restores the progress", Accounts.cur.name == "Ember" and float(Profile.v.xp) > 0.0 and Profile.owns("att", "rifle:hush"))
	Game.state = "menu"
	main.queue_free()
