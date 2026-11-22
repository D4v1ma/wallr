extends Node
## Shared game state: the loaded level, the local player, the clock, the screen state.

signal level_loaded(L: Level)

const DT := 1.0 / 64.0

var L: Level = null
var player: Player = null
var loadout: Loadout = null
var main: Node = null
var spec_target: Actor = null
var last_hit: Dictionary = {}
var freeze := false
var freeze_fx := false
var time := 0.0
var ticks := 0
var state := "boot"          ## boot | menu | loading | play | paused | results
var shake := 0.0
var bots_frozen := false
var world_root: Node3D = null
var args: Dictionary = {}


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--"):
			var kv := a.substr(2).split("=", true, 1)
			args[kv[0]] = kv[1] if kv.size() > 1 else "1"


func load_level(key: String) -> Level:
	if L:
		L.unload()
	L = Level.load_map(key, world_root)
	Ents.init(L)
	if player == null:
		player = Player.new(L.cw)
	else:
		player.cw = L.cw
	level_loaded.emit(L)
	return L


## What the last frame cost the renderer (all viewports): for screenshots and performance notes.
func frame_cost() -> String:
	var calls := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	var tris := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	return "%d draw calls, %dk triangles" % [calls, roundi(tris / 1000.0)]
