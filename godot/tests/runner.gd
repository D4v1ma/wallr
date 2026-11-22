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


func _ready() -> void:
	Game.world_root = self
	var names: PackedStringArray = String(Game.args.get("test", "move")).split(",")
	await get_tree().physics_frame
	for n in names:
		print("== ", n)
		var suite: Object = load("res://tests/test_%s.gd" % n).new()
		await suite.run(self)
	if Game.L:
		Game.L.unload()
		Game.L = null
	print("ALL PASS (%d checks)" % count if ok else "SOME FAILED")
	get_tree().quit(0 if ok else 1)
