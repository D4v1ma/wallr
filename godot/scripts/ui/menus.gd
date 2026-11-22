extends CanvasLayer
## Menus (first version: boots straight into a skirmish on the practice hall; the full menus come next).

var current := ""


func boot() -> void:
	Accounts.init()
	if Accounts.remembered != null and Accounts.remembered.get("pin") == null:
		Accounts.sign_in(Accounts.remembered)
	Game.main.load_map(String(Settings.get_value("map")))
	Session.begin({"map": Game.L.key, "mode": "skirmish", "ranked": false, "diff": "normal", "team": "1", "allies": 0, "enemies": 2, "len": "standard", "ff": false})
	Game.main.play()


func hide_all() -> void:
	current = ""
	visible = false


func show_screen(name: String) -> void:
	current = name
	visible = true


func show_results(_res: Dictionary) -> void:
	show_screen("results")


func home() -> void:
	show_screen("home")
