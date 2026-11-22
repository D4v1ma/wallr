class_name Trace
extends RefCounted
## Result of a hull or ray trace through the level (Quake-style fields).

var fraction := 1.0
var endpos := Vector3.ZERO
var normal := Vector3.ZERO
var startsolid := false
var allsolid := false
var surf := 0
var brush := -1     ## brush index in the level (-1: none)
var plane := -1     ## face index on that brush (-1: none)
var point := Vector3.ZERO


func reset() -> void:
	fraction = 1.0
	normal = Vector3.ZERO
	startsolid = false
	allsolid = false
	surf = 0
	brush = -1
	plane = -1
