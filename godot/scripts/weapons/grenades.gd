extends Node
## Thrown smoke grenades: bouncing projectile physics and the clouds they release.

const GRAVITY := 320.0     ## grenades fall slower than players (0.4x)
const HALF := 2.0

var list: Array = []
var clouds: Array = []
var tr := Trace.new()
var L: Level = null
var mesh: ArrayMesh = null
var seed := 1
var _uid := 1


func init(level: Level) -> void:
	L = level
	clear()
	if mesh == null:
		mesh = _nade_mesh()


func _nade_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	var body := CylinderMesh.new()
	body.top_radius = 1.2; body.bottom_radius = 1.2; body.height = 4.2; body.radial_segments = 10; body.rings = 1
	var top := CylinderMesh.new()
	top.top_radius = 0.55; top.bottom_radius = 0.62; top.height = 1.0; top.radial_segments = 8; top.rings = 1
	var lever := BoxMesh.new()
	lever.size = Vector3(0.5, 3.2, 0.14)
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.append_from(body, 0, Transform3D())
	st.append_from(top, 0, Transform3D(Basis(), Vector3(0, 2.6, 0)))
	st.append_from(lever, 0, Transform3D(Basis(), Vector3(0, 1.0, 1.28)))
	return st.commit()


## New round: no grenades in flight, no smoke left over.
func clear() -> void:
	for g: Dictionary in list:
		if is_instance_valid(g.node):
			(g.node as Node3D).queue_free()
	list.clear()
	clouds.clear()


func spawn(pl: Player, mode: String, eye: Vector3, dir: Vector3) -> Dictionary:
	var d := Data.weapon("smoke")
	var speed := float(d.throwSpeed) if mode == "over" else float(d.lobSpeed)
	var up := 0.12 if mode == "over" else 0.3
	var v := Vector3(dir.x, dir.y + up, dir.z).normalized()
	var r := Vector3(cos(pl.yaw), 0, -sin(pl.yaw))
	var target := eye + dir * 14.0 + r * 3.0 - Vector3(0, 1.0 if mode == "over" else 12.0, 0)
	L.cw.trace(tr, eye, target, Vector3(HALF, HALF, HALF), CollisionWorld.MASK_SHOT)
	var p := tr.endpos
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.scale = Vector3(0.85, 0.85, 0.85)
	var mat := Models.world_material("nade")
	node.material_override = mat
	node.rotation_order = EULER_ORDER_XYZ
	L.root.add_child(node)
	var g := {"p": p, "prev": p, "v": v * speed + Vector3(pl.vel.x, pl.vel.y * 0.6, pl.vel.z), "rot": Vector3(0, pl.yaw, 0),
		"spin": Vector3(8.0 + randf() * 6.0, 0.0, 3.0), "age": 0.0, "rest": false, "rest_t": 0.0, "popped": false, "node": node, "mat": mat,
		"bounces": 0, "cloud": null, "uid": _uid}
	_uid = _uid % 60000 + 1
	list.append(g)
	return g


func _node() -> Dictionary:
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.scale = Vector3(0.85, 0.85, 0.85)
	var mat := Models.world_material("nade")
	node.material_override = mat
	node.rotation_order = EULER_ORDER_XYZ
	L.root.add_child(node)
	return {"node": node, "mat": mat}


## A client's copy from a snapshot: [uid, position, rotation, flags (1 resting, 2 popped)].
func client_sync(entries: Array) -> void:
	if L == null:
		return
	var by := {}
	for g: Dictionary in list:
		by[int(g.get("uid", 0))] = g
	var seen := {}
	for e: Array in entries:
		var uid := int(e[0])
		seen[uid] = true
		var g: Dictionary = by.get(uid, {})
		if g.is_empty():
			var nm := _node()
			g = {"p": e[1], "prev": e[1], "v": Vector3.ZERO, "rot": e[2], "spin": Vector3.ZERO, "age": 0.0, "rest": false, "rest_t": 0.0, "popped": false,
				"node": nm.node, "mat": nm.mat, "bounces": 0, "cloud": null, "uid": uid}
			list.append(g)
		g.prev = g.p
		g.p = e[1]
		g.rot = e[2]
		g.rest = (int(e[3]) & 1) != 0
	for g: Dictionary in list.duplicate():
		if not seen.has(int(g.get("uid", 0))):
			if is_instance_valid(g.node):
				(g.node as Node3D).queue_free()
			list.erase(g)


## A smoke grenade popped on the host: the same cloud here (same seed, same puffs).
func client_smoke(uid: int, p: Vector3, s: int) -> void:
	if L == null:
		return
	var c := SmokeCloud.new(L, p, s)
	clouds.append(c)
	for g: Dictionary in list:
		if int(g.get("uid", 0)) == uid:
			g.popped = true
			g.cloud = c
	Snd.smoke_pop(p)


## Clouds age on a client too (they block the view and fade).
func client_tick(dt: float) -> void:
	for c: SmokeCloud in clouds:
		c.t += dt
	clouds = clouds.filter(func(c: SmokeCloud) -> bool: return c.alive())


func tick(dt: float) -> void:
	if L == null:
		return
	var cw := L.cw
	for g: Dictionary in list:
		g.prev = g.p
		g.age += dt
		if g.rest:
			g.rest_t += dt
		else:
			var v: Vector3 = g.v
			v.y -= GRAVITY * dt
			var left := dt
			for i in 3:
				if left <= 1e-5:
					break
				var p: Vector3 = g.p
				cw.trace(tr, p, p + v * left, Vector3(HALF, HALF, HALF), CollisionWorld.MASK_SHOT)
				if tr.allsolid:
					v = Vector3.ZERO
					g.rest = true
					break
				g.p = tr.endpos
				if tr.fraction >= 1.0:
					break
				left *= 1.0 - tr.fraction
				var n := tr.normal
				var vn := v.dot(n)
				if vn < 0.0:
					v -= 1.45 * vn * n
					if n.y > 0.7:
						v.x *= 0.7
						v.z *= 0.7
					else:
						v *= 0.8
					g.spin = Vector3(g.spin.x * 0.55, g.spin.y, g.spin.z * 0.55)
					if -vn > 55.0 and int(g.bounces) < 8:
						Snd.nade_bounce(U.surf_name(tr.surf), -vn, g.p)
						Net.snd("nade_bounce", [U.surf_name(tr.surf), -vn, g.p])
						g.bounces = int(g.bounces) + 1
					if n.y > 0.7 and v.length() < 32.0:
						v = Vector3.ZERO
						g.rest = true
						break
			g.v = v
			g.rot = Vector3(g.rot.x + g.spin.x * dt, g.rot.y, g.rot.z + g.spin.z * dt)
		if not g.popped and ((g.rest and g.rest_t > 0.3 and g.age > 1.0) or g.age > 6.0):
			g.popped = true
			var c := SmokeCloud.new(L, g.p, seed * 7919)
			if Net.is_host():
				Net.server.ev(["smoke", int(g.uid), g.p, seed * 7919])
			seed += 1
			g.cloud = c
			clouds.append(c)
			Snd.smoke_pop(g.p)
	for c: SmokeCloud in clouds:
		c.t += dt
	clouds = clouds.filter(func(c: SmokeCloud) -> bool: return c.alive())
	var keep: Array = []
	for g: Dictionary in list:
		if not g.popped or (g.cloud as SmokeCloud).alive():
			keep.append(g)
		elif is_instance_valid(g.node):
			(g.node as Node3D).queue_free()
	list = keep


func render(alpha: float) -> void:
	if L == null:
		return
	for g: Dictionary in list:
		var node: Node3D = g.node
		var pos: Vector3 = (g.prev as Vector3).lerp(g.p, alpha)
		if g.rest:
			node.rotation = Vector3(PI / 2.0, g.rot.y, 0)
			pos.y -= HALF - 1.0
		else:
			node.rotation = g.rot
		node.position = pos
		Models.light(g.mat as ShaderMaterial, L.probe_sky(g.p + Vector3(0, 8, 0)))


## Does a dense cloud sit across the line a -> b? (bot sight)
func blocks(a: Vector3, b: Vector3) -> bool:
	for c: SmokeCloud in clouds:
		var dens := c.density() * U.smooth(0.4, 1.6, c.t)
		if dens < 0.35:
			continue
		var ctr := c.p + Vector3(0, c.R * 0.4, 0)
		var r := c.R * 0.78 * dens
		var d := b - a
		var ll := d.length_squared()
		if ll == 0.0:
			ll = 1.0
		var t := clampf((ctr - a).dot(d) / ll, 0.0, 1.0)
		var q := a + d * t - ctr
		if Vector3(q.x, q.y * 1.3, q.z).length() < r:
			return true
	return false


## Strongest "inside the smoke" factor at a point -> [factor, colour].
func inside_at(x: Vector3) -> Array:
	var best := 0.0
	var col := Color(0.5, 0.5, 0.5)
	for c: SmokeCloud in clouds:
		var k := c.inside(x)
		if k > best:
			best = k
			col = c.light
	return [best, col]
