extends Node
## Data tables exported from the original sources (tools/godot-export.mjs): the weapon table with
## its spray patterns, the viewmodel animation clips, attachment and camo descriptions.

var WEAPONS: Dictionary = {}
var CLIPS: Dictionary = {}
var ARSENAL: Dictionary = {}


func _ready() -> void:
	WEAPONS = Assets.read_json("res://assets/data/weapons.json")
	CLIPS = Assets.read_json("res://assets/data/vm_clips.json")
	ARSENAL = Assets.read_json("res://assets/data/arsenal.json")


func weapon(id: String) -> Dictionary:
	return WEAPONS.get(id, {})
