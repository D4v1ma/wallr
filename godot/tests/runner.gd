extends Node3D
## Headless test runner: godot --headless --path godot res://tests/runner.tscn -- --test=move
## Each suite is tests/test_<name>.gd with `func run(r) -> void` calling r.check(name, cond, info).

var ok := true
var count := 0


func check(name: String, cond: bool, info: String = "") -> void:
	count += 1
	print("%s  %s  %s" % ["PASS" if cond else "FAIL", name, info])
	if not cond:
		ok = false


## Start the real game scene (quick start, no menus) inside the runner; returns the main node.
func boot_game(args: Dictionary) -> Node:
	Game.world_root = self
	Game.args = {"menu": "0"}
	Game.args.merge(args, true)
	var main: Node = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	for i in 3:
		await get_tree().physics_frame
	return main


func ticks(main: Node, n: int) -> void:
	for i in n:
		main.sim_tick(1.0 / 64.0)


func _ready() -> void:
	Game.world_root = self
	# Saves go to user://test-data/ (U.data_dir), never the player's; every run starts from scratch.
	if U.data_dir() != "user://test-data/":
		push_error("run the tests as the main scene (res://tests/runner.tscn) so they can't touch real saves")
		get_tree().quit(1)
		return
	# --keep-data: a second test process (the network client) shares the first one's folder
	if not Game.args.has("keep-data"):
		for sub in ["accounts/", ""]:
			for f in DirAccess.get_files_at(U.data_dir() + sub):
				DirAccess.remove_absolute(U.data_dir() + sub + f)
	Settings.load_settings()
	var names: PackedStringArray = String(Game.args.get("test", "move")).split(",")
	await get_tree().physics_frame
	for n in names:
		print("== ", n)
		var suite: Object = load("res://tests/test_%s.gd" % n).new()
		await suite.run(self)
		await get_tree().process_frame
		await get_tree().process_frame
	if Game.L:
		Game.L.unload()
		Game.L = null
	print("ALL PASS (%d checks)" % count if ok else "SOME FAILED")
	get_tree().quit(0 if ok else 1)
