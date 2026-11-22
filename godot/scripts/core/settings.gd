extends Node
## Player settings (sensitivity, field of view, crosshair, volume, match defaults), saved in
## user://settings.json (see U.data_dir).

signal changed(key: String, value: Variant)

const DEFAULTS := {
	"sensitivity": 2.0, "invertY": false, "rawInput": true,
	"fov": 90.0, "aspect": "wide", "vmFov": 64.0, "renderScale": 100.0, "maxDpr": 1.5,
	"xhStyle": "dynamic", "xhColor": "#4cff6a", "xhSize": 6.0, "xhGap": 3.0, "xhThick": 2.0, "xhDot": false, "xhOutline": true, "xhRecoil": false,
	"volume": 70.0, "showFps": true, "showSpeed": true, "showHints": true, "botSkill": "normal", "team": 1.0, "ff": false,
	"mode": "defuse", "matchLen": "standard", "map": "depot", "fullscreen": false, "gfx": "high", "brightness": 1.0,
}

var v: Dictionary = {}
var path := U.data_dir() + "settings.json"


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	load_settings()
	apply_window()


## F11 or Alt+Enter toggles fullscreen anywhere (menus, matches, text fields).
func _input(e: InputEvent) -> void:
	var k := e as InputEventKey
	if k == null or not k.pressed or k.echo:
		return
	if k.keycode == KEY_F11 or (k.alt_pressed and (k.keycode == KEY_ENTER or k.keycode == KEY_KP_ENTER)):
		set_value("fullscreen", not bool(v.fullscreen))
		get_viewport().set_input_as_handled()


## Windowed or fullscreen, from the saved setting.
func apply_window() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var full := bool(v.fullscreen)
	var mode := DisplayServer.window_get_mode()
	if full == (mode == DisplayServer.WINDOW_MODE_FULLSCREEN or mode == DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN):
		return
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if full else DisplayServer.WINDOW_MODE_WINDOWED)


func load_settings() -> void:
	v = DEFAULTS.duplicate(true)
	if not FileAccess.file_exists(path):
		return
	var saved: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(saved) != TYPE_DICTIONARY:
		return
	for k in DEFAULTS:
		if saved.has(k) and typeof(saved[k]) == typeof(DEFAULTS[k]):
			v[k] = saved[k]


func save() -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(v, "\t"))


func get_value(k: String) -> Variant:
	return v.get(k, DEFAULTS.get(k))


func set_value(k: String, value: Variant) -> void:
	v[k] = value
	save()
	if k == "fullscreen":
		apply_window()
	changed.emit(k, value)
