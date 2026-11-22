extends Node
## Player settings (sensitivity, field of view, crosshair, volume, match defaults), saved in user://.

signal changed(key: String, value: Variant)

const PATH := "user://settings.json"
const DEFAULTS := {
	"sensitivity": 2.0, "invertY": false, "rawInput": true,
	"fov": 90.0, "aspect": "wide", "vmFov": 64.0, "renderScale": 100.0, "maxDpr": 1.5,
	"xhStyle": "dynamic", "xhColor": "#4cff6a", "xhSize": 6.0, "xhGap": 3.0, "xhThick": 2.0, "xhDot": false, "xhOutline": true, "xhRecoil": false,
	"volume": 70.0, "showFps": true, "showSpeed": true, "showHints": true, "botSkill": "normal", "team": 1.0, "ff": false,
	"mode": "defuse", "matchLen": "standard", "map": "depot",
}

var v: Dictionary = {}


func _ready() -> void:
	load_settings()


func load_settings() -> void:
	v = DEFAULTS.duplicate(true)
	if not FileAccess.file_exists(PATH):
		return
	var saved: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	if typeof(saved) != TYPE_DICTIONARY:
		return
	for k in DEFAULTS:
		if saved.has(k) and typeof(saved[k]) == typeof(DEFAULTS[k]):
			v[k] = saved[k]


func save() -> void:
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(v, "\t"))


func get_value(k: String) -> Variant:
	return v.get(k, DEFAULTS.get(k))


func set_value(k: String, value: Variant) -> void:
	v[k] = value
	save()
	changed.emit(k, value)
