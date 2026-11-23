extends Node
## Brush entities: hinged doors (moving collision) and knock-down steel plates.

var doors: Array[Door] = []
var targets: Array[Target] = []
var stats := {"hits": 0, "shots": 0}


static func rot_y_planes(planes: Array, hinge: Vector3, a: float) -> Array:
	var c := cos(a); var s := sin(a); var hx := hinge.x; var hz := hinge.z
	var out: Array = []
	for p in planes:
		var nx: float = p[0]; var ny: float = p[1]; var nz: float = p[2]; var d: float = p[3]
		var px := nx * d - hx; var py := ny * d; var pz := nz * d - hz
		var rnx := nx * c + nz * s; var rnz := -nx * s + nz * c
		var rpx := px * c + pz * s + hx; var rpz := -px * s + pz * c + hz
		out.append([rnx, ny, rnz, rnx * rpx + ny * py + rnz * rpz])
	return out


class Door:
	var L: Level
	var brush: CollisionWorld.Brush
	var hinge := Vector3.ZERO
	var closed: Array = []
	var surfs: Array = []
	var angle := 0.0
	var prev_angle := 0.0
	var target := 0.0
	var speed := 2.6
	var metal := false
	var obj: Node3D
	var center := Vector3.ZERO
	var doorway := CollisionWorld.Brush.new()
	var local_polys: Array = []
	var decals: Object = null

	func _init(level: Level, def: Dictionary) -> void:
		L = level
		brush = L.cw.brushes[int(def.brush)]
		brush.door = self
		hinge = Vector3(def.hinge[0], 0, def.hinge[1])
		closed = []
		for i in brush.face_count:
			closed.append([brush.P[i * 4], brush.P[i * 4 + 1], brush.P[i * 4 + 2], brush.P[i * 4 + 3]])
		surfs = Array(brush.surf.slice(0, brush.face_count))
		metal = brush.mats.has("door_metal")
		obj = L.entity_node(brush.id, hinge)
		center = (brush.lo + brush.hi) * 0.5
		for p in brush.polys:
			if p == null:
				local_polys.append(null)
			else:
				var lp := PackedVector3Array()
				for v: Vector3 in p:
					lp.append(v - hinge)
				local_polys.append(lp)
		# doorway volume (closed pose, slightly thickened) so an open door can be closed by looking through its frame
		var thick: Array = []
		for p in closed:
			thick.append([p[0], p[1], p[2], p[3] + (10.0 if absf(p[1]) < 0.5 else 0.0)])
		doorway.surf_default = int(surfs[0]) if not surfs.is_empty() else 0
		doorway.set_planes(thick, surfs)

	func is_open() -> bool:
		return target != 0.0

	func toggle(from: Vector3) -> void:
		if target != 0.0:
			target = 0.0
		else:
			# swing away from whoever opens it
			var best_s := 1.0
			var best_d := -1.0
			for s in [1.0, -1.0]:
				var a: float = s * PI / 2.0
				var cs := cos(a); var sn := sin(a)
				var x := (center.x - hinge.x) * cs + (center.z - hinge.z) * sn + hinge.x
				var z := -(center.x - hinge.x) * sn + (center.z - hinge.z) * cs + hinge.z
				var d := Vector2(x - from.x, z - from.z).length()
				if d > best_d:
					best_d = d
					best_s = s
			target = best_s * 1.7
		Snd.door(center, metal, target != 0.0)
		if Net.is_host():
			Net.server.ev(["door", Ents.doors.find(self), target != 0.0])

	## A client's copy: the angle the host has, and the collision moved with it.
	func client_set(a: float, tgt: float) -> void:
		target = tgt
		if absf(a - angle) < 1e-4:
			return
		angle = a
		L.cw.move_brush(brush, Ents.rot_y_planes(closed, hinge, angle), xform(angle))

	func xform(a: float) -> Transform3D:
		var b := Basis(Vector3.UP, a)
		return Transform3D(b, hinge - b * hinge)

	func tick(dt: float, players: Array) -> void:
		prev_angle = angle
		if angle == target:
			return
		var diff := target - angle
		var step := signf(diff) * minf(absf(diff), speed * dt)
		var next := angle + step
		var planes := Ents.rot_y_planes(closed, hinge, next)
		var tmp := CollisionWorld.Brush.new()
		tmp.set_planes(planes, surfs)
		for pl: Player in players:
			var hh := (Player.DUCK_H if pl.ducked else Player.STAND_H) * 0.5
			if not pl.noclip and CollisionWorld.box_overlaps_planes(tmp.P, tmp.n, pl.pos + Vector3(0, hh, 0), Vector3(Player.HALF + 0.5, hh, Player.HALF + 0.5)):
				return   # blocked by someone
		angle = target if absf(target - next) < 1e-6 else next
		L.cw.move_brush(brush, planes, xform(angle))

	func render(alpha: float) -> void:
		obj.rotation.y = lerpf(prev_angle, angle, alpha)

	## Bullet hole in door-local space (decals ride along with the door).
	func add_impact(hit: Dictionary, decal_scale: float = 1.0) -> void:
		if decals == null:
			decals = FX.DecalSet.new(48, obj)
		var b := Basis(Vector3.UP, -angle)
		var lp: Vector3 = b * ((hit.point as Vector3) - hinge)
		var ln: Vector3 = b * (hit.normal as Vector3)
		var plane: int = hit.plane
		var clip: Variant = local_polys[plane] if plane >= 0 and plane < closed.size() else null
		FX.impact(hit.point, hit.normal, hit.surf, decals, clip, lp, ln, decal_scale)


class Target:
	var c := Vector3.ZERO
	var h := Vector3.ZERO
	var action := ""
	var pivot := Vector3.ZERO
	var obj: Node3D
	var angle := 0.0
	var prev_angle := 0.0
	var state := "up"
	var t := 0.0

	func _init(L: Level, def: Dictionary) -> void:
		c = U.v3(def.center)
		h = U.v3(def.half)
		action = String(def.opts.get("action", "")) if def.opts.get("action") != null else ""
		pivot = Vector3(c.x, c.y - h.y, c.z)
		obj = L.entity_node(int(def.brush), pivot)

	func ray_hit(eye: Vector3, d: Vector3, max_dist: float) -> float:
		if state != "up" and state != "wobble":
			return -1.0
		var box := AABB(c - h, h * 2.0)
		var hit: Variant = box.intersects_segment(eye, eye + d * max_dist)
		if hit == null:
			return -1.0
		return eye.distance_to(hit)

	func hit() -> bool:
		Snd.plate(c)
		if action == "reset":
			state = "wobble"
			t = 0.0
			Ents.stats.hits = 0
			Ents.stats.shots = 0
			Ents.board_wiped.emit()
			return false
		if state != "up":
			return false
		state = "falling"
		t = 0.0
		Ents.stats.hits += 1
		return true

	func tick(dt: float) -> void:
		prev_angle = angle
		t += dt
		if state == "falling":
			angle = -1.42 * U.smooth(0.0, 0.22, t) + sin(t * 20.0) * 0.06 * exp(-t * 6.0) * (1.0 if t > 0.22 else 0.0)
			if t > 2.4:
				state = "rising"
				t = 0.0
		elif state == "rising":
			angle = -1.42 * (1.0 - U.smooth(0.0, 0.5, t))
			if t >= 0.5:
				state = "up"
				angle = 0.0
		elif state == "wobble":
			angle = -0.32 * exp(-t * 4.0) * sin(t * 16.0)
			if t > 1.2:
				state = "up"
				angle = 0.0

	func render(alpha: float) -> void:
		obj.rotation.z = lerpf(prev_angle, angle, alpha)


signal board_wiped


func init(L: Level) -> void:
	doors.clear()
	targets.clear()
	stats = {"hits": 0, "shots": 0}
	for d: Dictionary in L.meta.doors:
		doors.append(Door.new(L, d))
	for t: Dictionary in L.meta.targets:
		targets.append(Target.new(L, t))


func tick(dt: float, players: Array) -> void:
	for d in doors:
		d.tick(dt, players)
	for t in targets:
		t.tick(dt)


func render(alpha: float) -> void:
	for d in doors:
		d.render(alpha)
	for t in targets:
		t.render(alpha)


func plates_up() -> int:
	var n := 0
	for t in targets:
		if t.action == "" and t.state == "up":
			n += 1
	return n


func plate_count() -> int:
	var n := 0
	for t in targets:
		if t.action == "":
			n += 1
	return n


## Door under the crosshair within reach, or null.
func door_in_reach(eye: Vector3, dir: Vector3) -> Door:
	var best: Door = null
	var bd := 100.0
	for d in doors:
		var t := CollisionWorld.ray_planes(d.brush.P, d.brush.n, eye, dir, bd)
		if t < 0.0 and d.angle != 0.0:
			t = CollisionWorld.ray_planes(d.doorway.P, d.doorway.n, eye, dir, bd)
		if t >= 0.0 and t < bd:
			bd = t
			best = d
	return best
