class_name Weapon
extends RefCounted
## Base for every weapon: animation clock with sound marks, draw/inspect, recoil view smoothing.
## Angles in degrees, inaccuracy in milliradians, distances in units (same as the original).

const ADS := {"time": 0.16, "zoom": 0.82, "inacc": 0.78, "spread": 0.85, "speed": 0.8}

var def: Dictionary
var kind := ""
var id := ""
var state := "holstered"
var t := 0.0
var clock := 0.0
var events: Array = []
var anim := "draw"
var anim_start := 0.0
var marks: Array = []
var mark_idx := 0
var recoil := Vector2.ZERO        ## spray offset: x = pitch up, y = yaw left (degrees)
var recoil_view := Vector2.ZERO
var view_kick := 0.0
var last_shot_clock := -9.0
var ads := 0.0


static func make(wid: String, d: Dictionary = {}) -> Weapon:
	if d.is_empty():
		d = Data.weapon(wid)
	match String(d.kind):
		"gun": return Gun.new(d)
		"knife": return Knife.new(d)
		"grenade": return Grenade.new(d)
		_: return Charge.new(d)


## Spray offset [pitch, yaw] at (fractional) shot index.
static func pattern_at(pat: Array, idx: float) -> Vector2:
	if idx <= 0.0:
		return Vector2.ZERO
	var n := pat.size()
	if idx >= n - 1:
		var a: Array = pat[n - 2]
		var b: Array = pat[n - 1]
		var k := idx - (n - 1)
		return Vector2(b[0] + (b[0] - a[0]) * k * 0.4, b[1] + sin(idx * 1.3) * 0.5)
	var i := int(floor(idx))
	var f := idx - i
	return Vector2(lerpf(pat[i][0], pat[i + 1][0], f), lerpf(pat[i][1], pat[i + 1][1], f))


func _init(d: Dictionary) -> void:
	def = d
	kind = d.kind
	id = d.id


func play(name: String, m: Variant = null) -> void:
	anim = name
	anim_start = clock
	marks = m if m != null else []
	mark_idx = 0


func anim_time() -> float:
	return clock - anim_start


func draw() -> void:
	state = "draw"
	t = 0.0
	play("draw", def.get("drawMarks"))
	events.append({"type": "draw", "id": id})


func holster() -> void:
	state = "holstered"
	marks = []


func inaccuracy(_pl: Player) -> float:
	return 0.0


func spread_base() -> float:
	return 0.0


func speed() -> float:
	return float(def.maxSpeed)


func start_inspect() -> void:
	if float(def.get("inspectTime", 0)) <= 0.0 or state != "idle":
		return
	state = "inspect"
	t = 0.0
	play("inspect", def.get("inspectMarks"))


func base_tick(dt: float) -> void:
	clock += dt
	t += dt
	while mark_idx < marks.size() and anim_time() >= float(marks[mark_idx][0]):
		events.append({"type": "sfx", "part": marks[mark_idx][1], "id": id})
		mark_idx += 1
	view_kick = maxf(0.0, view_kick * exp(-dt * 18.0) - dt * 0.5)
	recoil_view.x = U.damp(recoil_view.x, recoil.x, 30.0, dt)
	recoil_view.y = U.damp(recoil_view.y, recoil.y, 30.0, dt)


func common_states() -> void:
	if state == "draw" and t >= float(def.drawTime):
		state = "idle"
	if state == "inspect" and t >= float(def.get("inspectTime", 0)):
		state = "idle"


func tick(_cmd: Dictionary, _pl: Player, _time: float, dt: float) -> void:
	base_tick(dt)
	common_states()
