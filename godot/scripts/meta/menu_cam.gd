extends Node
## Main-menu background: slow dolly shots through the loaded map, with a dip to black between them.

const DUR := 13.0

var shots: Array = []
var i := 0
var t := 0.0
var fade := 0.0


func reset(L: Level) -> void:
	shots = L.menu_shots if not L.menu_shots.is_empty() else auto_shots(L)
	i = 0
	t = 0.0


static func auto_shots(L: Level) -> Array:
	var c := (L.lo + L.hi) * 0.5
	var out: Array = []
	var sites: Array = L.sites if not L.sites.is_empty() else [{"center": [c.x, 0, c.z]}]
	for s: Dictionary in sites:
		var sc: Array = s.center
		out.append({"from": [sc[0] - 420, 300, sc[2] + 380], "to": [sc[0] - 220, 280, sc[2] + 460], "look": [sc[0], 30, sc[2]]})
	return out


func update(dt: float, cam: Camera3D) -> void:
	if shots.is_empty():
		return
	t += dt
	if t >= DUR:
		t = 0.0
		i = (i + 1) % shots.size()
	var s: Dictionary = shots[i]
	var k := U.smooth(0.0, 1.0, t / DUR)
	var p := U.v3(s.from).lerp(U.v3(s.to), k)
	var lk := U.v3(s.look)
	if s.get("lookTo") != null:
		lk = lk.lerp(U.v3(s.lookTo), k)
	var d := lk - p
	cam.global_transform = Transform3D(Basis.from_euler(Vector3(atan2(d.y, Vector2(d.x, d.z).length()), atan2(-d.x, -d.z), 0), EULER_ORDER_YXZ), p)
	fade = 1.0 - clampf(minf(1.0, minf(t / 0.7, (DUR - t) / 0.7)), 0.0, 1.0)
