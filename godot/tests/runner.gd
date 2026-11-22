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
