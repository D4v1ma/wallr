class_name SmokeCloud
extends RefCounted
## One smoke grenade's cloud: ~46 puffs that grow, drift and fade over 18 s, kept inside the room.

var p := Vector3.ZERO
var t := 0.0
var life := 18.0
var R := 150.0
var puffs: Array = []
var light := Color(0.5, 0.5, 0.5)


func _init(L: Level, pos: Vector3, seed: int) -> void:
	p = pos
	var rnd := U.Rng.new(seed)
	var tr := Trace.new()
	var c := pos + Vector3(0, 26, 0)
	for i in 46:
		var a := rnd.next() * TAU
		var r := sqrt(rnd.next()) * R
		var h := pow(rnd.next(), 1.4) * R * 0.95
		var o := Vector3(cos(a) * r, 14.0 + h * (1.0 - pow(r / R, 2.0) * 0.55), sin(a) * r)
		# keep the cloud inside the room: pull puffs back from walls
		L.cw.trace(tr, c, pos + o, Vector3(10, 10, 10), CollisionWorld.MASK_SHOT)
		if tr.fraction < 1.0:
			var k := maxf(0.0, tr.fraction - 0.06)
			o = (c - pos) + (pos + o - c) * k
		puffs.append({"o": o, "size": 62.0 + rnd.next() * 44.0, "rot": rnd.next() * TAU, "spin": (rnd.next() - 0.5) * 0.12, "v": float(int(rnd.next() * 4.0)),
			"shade": 0.88 + rnd.next() * 0.16 + (o.y / R) * 0.08, "delay": rnd.next() * 0.45,
			"drift": Vector3((rnd.next() - 0.5) * 3.0, 1.2 + rnd.next() * 2.2, (rnd.next() - 0.5) * 3.0)})
	var pr := L.probe(c + Vector3(0, 40, 0))
	var env := L.env
	var sun_k := pr.a * float(env.sunIntensity) * 0.55
	var sc: Array = env.sunColor
	light = Color(clampf(0.78 * (pr.r + sc[0] * sun_k), 0.12, 1.05), clampf(0.78 * (pr.g + sc[1] * sun_k), 0.12, 1.05), clampf(0.78 * (pr.b + sc[2] * sun_k), 0.12, 1.05))


func density() -> float:
	return U.smooth(0.0, 0.5, t) * (1.0 - U.smooth(life - 3.2, life, t))


func alive() -> bool:
	return t < life


## Every puff's current state: [position, size, rotation, alpha, atlas cell, shade].
func items() -> Array:
	var out: Array = []
	var dens := density()
	for q: Dictionary in puffs:
		var tt := maxf(0.0, t - float(q.delay))
		var grow := 1.0 - exp(-tt * 2.1)
		var k := 0.22 + 0.78 * grow
		var pos: Vector3 = p + (q.o as Vector3) * k + (q.drift as Vector3) * t
		out.append([pos, float(q.size) * (0.3 + 0.7 * grow), float(q.rot) + float(q.spin) * t, dens * U.smooth(0.0, 0.25, tt) * 0.82, q.v, q.shade])
	return out


## 0..1: how deep a point sits inside the cloud.
func inside(x: Vector3) -> float:
	var d := Vector3(x.x - p.x, (x.y - (p.y + R * 0.35)) * 1.4, x.z - p.z).length() / (R * 0.85)
	return clampf(1.25 - d, 0.0, 1.0) * density() * U.smooth(0.4, 1.4, t)
