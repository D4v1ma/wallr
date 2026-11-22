extends Node
## Effects: bullet-hole decals, billboard particles (dust, chips, sparks, blood, fire, smoke), tracers,
## shell casings, smoke-grenade clouds and short-lived dynamic lights (4 nearest feed the world shader).

const SURF_FX := {
	"concrete": {"cell": 0, "dust": [0.62, 0.6, 0.56], "chip": [0.36, 0.35, 0.33]},
	"brick": {"cell": 0, "dust": [0.64, 0.47, 0.38], "chip": [0.46, 0.25, 0.17]},
	"plaster": {"cell": 0, "dust": [0.84, 0.78, 0.66], "chip": [0.72, 0.66, 0.54]},
	"tile": {"cell": 0, "dust": [0.86, 0.85, 0.8], "chip": [0.9, 0.89, 0.85]},
	"wood": {"cell": 1, "dust": [0.62, 0.5, 0.34], "chip": [0.5, 0.36, 0.2]},
	"paper": {"cell": 1, "dust": [0.92, 0.91, 0.88], "chip": [0.95, 0.94, 0.9]},
	"metal": {"cell": 2, "dust": [0.42, 0.42, 0.42], "chip": [0.3, 0.3, 0.3], "sparks": true},
	"sand": {"cell": 3, "dust": [0.8, 0.69, 0.5], "chip": [0.7, 0.6, 0.42], "puff": true},
	"cloth": {"cell": 3, "dust": [0.64, 0.56, 0.42], "chip": [0.55, 0.47, 0.33], "puff": true},
}

var L: Level = null
var rnd := U.Rng.new(77)
var root: Node3D
var decals: DecalSet
var dust: Particles
var sparks: Particles
var tracers: Tracers
var shells: Shells
var smoke: SmokeRenderer
var dlights: Array = []


func init(level: Level) -> void:
	L = level
	if root and is_instance_valid(root):
		root.queue_free()
	root = Node3D.new()
	root.name = "FX"
	level.root.add_child(root)
	decals = DecalSet.new(320, root)
	dust = Particles.new(900, false, root)
	sparks = Particles.new(500, true, root)
	tracers = Tracers.new(48, root)
	shells = Shells.new(96, root)
	smoke = SmokeRenderer.new(200, root)
	dlights.clear()


## Light at a point (probe ambient + visible sun), for dynamic objects.
func light_at(p: Vector3) -> Color:
	var pr := L.probe(p)
	var env := L.env
	var s := pr.a * float(env.sunIntensity) * 0.6
	var sc: Array = env.sunColor
	return Color(pr.r + sc[0] * s, pr.g + sc[1] * s, pr.b + sc[2] * s)


func add_light(p: Vector3, col: Color, radius: float, life: float) -> void:
	dlights.append({"p": p, "col": col, "radius": radius, "life": life, "max": life})
	if dlights.size() > 12:
		dlights.pop_front()


func _update_lights(dt: float) -> void:
	for l: Dictionary in dlights:
		l.life -= dt
	dlights = dlights.filter(func(l: Dictionary) -> bool: return l.life > 0.0)
	var n := dlights.size()
	for i in 4:
		var j := n - 4 + i
		if j >= 0 and j < n:
			var l: Dictionary = dlights[j]
			var k: float = l.life / l.max
			var c: Color = l.col
			RenderingServer.global_shader_parameter_set("dl_pos_%d" % i, Vector4(l.p.x, l.p.y, l.p.z, l.radius))
			RenderingServer.global_shader_parameter_set("dl_col_%d" % i, Vector4(c.r * k, c.g * k, c.b * k, 0))
		else:
			RenderingServer.global_shader_parameter_set("dl_pos_%d" % i, Vector4.ZERO)
			RenderingServer.global_shader_parameter_set("dl_col_%d" % i, Vector4.ZERO)


func _r() -> float:
	return rnd.next()


func _rv(m: float) -> Vector3:
	return Vector3((_r() - 0.5) * m, (_r() - 0.5) * m, (_r() - 0.5) * m)


func muzzle_smoke(p: Vector3, dir: Vector3, heat: float) -> void:
	var lc := light_at(p)
	var k := (lc.r + lc.g + lc.b) / 3.0
	var n := 2 if heat > 0.5 else 1
	for i in n:
		dust.spawn({"p": p + dir * 4.0, "v": Vector3(dir.x * 30.0 + (randf() - 0.5) * 10.0, 10.0 + randf() * 14.0, dir.z * 30.0 + (randf() - 0.5) * 10.0),
			"life": 0.9 + randf() * 0.9, "s0": 1.4, "s1": 7.0 + heat * 7.0, "c": Color(0.62 * k, 0.62 * k, 0.6 * k), "a0": 0.14 + heat * 0.24, "a1": 0.0,
			"rot": randf() * TAU, "spin": randf() - 0.5, "cell": 1, "grav": -16.0, "drag": 2.2})


## Impact at p with surface normal n. decal_set/clip optional (null = no decal).
func impact(p: Vector3, n: Vector3, surf_id: int, decal_set: DecalSet = null, clip: Variant = null, decal_p: Variant = null, decal_n: Variant = null, decal_scale: float = 1.0) -> void:
	var sname := U.surf_name(surf_id)
	var S: Dictionary = SURF_FX.get(sname, SURF_FX.concrete)
	var cell: int = S.cell
	var puff: bool = S.get("puff", false)
	if decal_set:
		var dp: Vector3 = decal_p if decal_p != null else p
		var dn: Vector3 = decal_n if decal_n != null else n
		decal_set.add(dp, dn, (7.0 if cell == 3 else 5.5 + _r() * 1.5) * decal_scale, cell, clip, rnd)
	var pr := L.probe(p)
	var lum := clampf((pr.r + pr.g + pr.b) / 3.0 + pr.a * 0.9, 0.5, 1.4)
	var dc: Array = S.dust
	var cc: Array = S.chip
	var base := p + n * 1.5
	for i in (4 if puff else 2):
		var j := _rv(40.0)
		var sp := 25.0 + _r() * (70.0 if puff else 40.0)
		dust.spawn({"p": base, "v": Vector3(n.x * sp + j.x, n.y * sp + j.y + (25.0 if puff else 6.0), n.z * sp + j.z), "life": 0.55 + _r() * 0.5,
			"s0": 2.5 + _r() * 2.0, "s1": (20.0 if puff else 13.0) + _r() * 6.0, "c": Color(dc[0] * lum, dc[1] * lum, dc[2] * lum),
			"a0": 0.75 if puff else 0.6, "a1": 0.0, "rot": _r() * TAU, "spin": (_r() - 0.5) * 2.0, "cell": 1, "grav": -12.0, "drag": 3.2})
	var chips := 2 if S.get("sparks", false) else 4 + int(_r() * 4.0)
	for i in chips:
		var j := _rv(220.0)
		var sp := 70.0 + _r() * 140.0
		dust.spawn({"p": base, "v": Vector3(n.x * sp + j.x, n.y * sp + j.y + 50.0, n.z * sp + j.z), "life": 0.45 + _r() * 0.4,
			"s0": 0.5 + _r() * 0.6, "c": Color(cc[0] * lum * 0.9, cc[1] * lum * 0.9, cc[2] * lum * 0.9), "a0": 1.0, "a1": 1.0, "cell": 0, "grav": 700.0, "drag": 0.6})
	if cell == 0:
		# hard masonry: a couple of quick sparks and a tiny flash so hits read in dark corners
		for i in 3:
			var j := _rv(300.0)
			var sp := 140.0 + _r() * 160.0
			sparks.spawn({"p": base, "v": Vector3(n.x * sp + j.x, n.y * sp + j.y + 40.0, n.z * sp + j.z), "life": 0.08 + _r() * 0.12,
				"s0": 0.35 + _r() * 0.25, "c": Color(1.0, 0.78, 0.45), "a0": 0.9, "a1": 0.0, "cell": 2, "grav": 400.0, "drag": 1.5, "stretch": true})
		sparks.spawn({"p": base, "v": Vector3.ZERO, "life": 0.05, "s0": 3.5, "s1": 4.5, "c": Color(1, 0.85, 0.6), "a0": 0.7, "a1": 0.0, "cell": 0})
	if S.get("sparks", false):
		for i in 6 + int(_r() * 7.0):
			var j := _rv(420.0)
			var sp := 120.0 + _r() * 260.0
			sparks.spawn({"p": base, "v": Vector3(n.x * sp + j.x, n.y * sp + j.y + 60.0, n.z * sp + j.z), "life": 0.12 + _r() * 0.3,
				"s0": 0.45 + _r() * 0.35, "c": Color(1.0, 0.72 + _r() * 0.2, 0.32), "a0": 1.0, "a1": 0.2, "cell": 2, "grav": 520.0, "drag": 1.2, "stretch": true})
		sparks.spawn({"p": base, "v": Vector3.ZERO, "life": 0.07, "s0": 5.0, "s1": 7.0, "c": Color(1, 0.8, 0.45), "a0": 0.9, "a1": 0.0, "cell": 0})
		add_light(base + n * 6.0, Color(0.9, 0.6, 0.25), 70.0, 0.08)


func blood(p: Vector3, dir: Vector3) -> void:
	var lc := light_at(p)
	var k := clampf((lc.r + lc.g + lc.b) / 3.0, 0.35, 1.2)
	var c := Color(0.42 * k, 0.06 * k, 0.05 * k)
	for i in 3:
		dust.spawn({"p": p, "v": Vector3(dir.x * 40.0 + (randf() - 0.5) * 50.0, 10.0 + randf() * 30.0, dir.z * 40.0 + (randf() - 0.5) * 50.0), "life": 0.35 + randf() * 0.3,
			"s0": 1.5, "s1": 6.0 + randf() * 4.0, "c": c, "a0": 0.7, "a1": 0.0, "rot": randf() * TAU, "cell": 1, "grav": 40.0, "drag": 3.0})
	for i in 5:
		dust.spawn({"p": p, "v": Vector3(dir.x * 120.0 + (randf() - 0.5) * 120.0, 40.0 + randf() * 80.0, dir.z * 120.0 + (randf() - 0.5) * 120.0), "life": 0.4 + randf() * 0.3,
			"s0": 0.45 + randf() * 0.35, "c": c, "a0": 1.0, "a1": 1.0, "cell": 0, "grav": 700.0, "drag": 0.5})


## The charge going off: a white-hot core, fire puffs, sparks, a rising smoke column, a big light.
func explosion(p: Vector3) -> void:
	var fire := [Color(1, 0.52, 0.14), Color(1, 0.72, 0.3), Color(0.95, 0.3, 0.08), Color(1, 0.86, 0.5)]
	for i in 4:
		sparks.spawn({"p": p + Vector3(0, 20 + i * 10, 0), "v": Vector3(0, 30, 0), "life": 0.22 + i * 0.04, "s0": 40.0, "s1": 150.0, "c": Color(1, 0.9, 0.7), "a0": 1.0, "a1": 0.0, "cell": 0})
	for i in 28:
		var a := _r() * TAU
		var r := _r() * 40.0
		var out := 150.0 + _r() * 220.0
		sparks.spawn({"p": p + Vector3(cos(a) * r, 12.0 + _r() * 50.0, sin(a) * r), "v": Vector3(cos(a) * out, 90.0 + _r() * 160.0, sin(a) * out),
			"life": 0.45 + _r() * 0.45, "s0": 22.0 + _r() * 16.0, "s1": 75.0 + _r() * 60.0, "c": fire[i % 4], "a0": 1.0, "a1": 0.0, "rot": _r() * TAU,
			"spin": (_r() - 0.5) * 3.0, "cell": 1, "drag": 3.2, "grav": -60.0})
	for i in 50:
		var a2 := _r() * TAU
		var e := _r() * 0.9 + 0.1
		var sp := 500.0 + _r() * 900.0
		sparks.spawn({"p": p + Vector3(0, 12, 0), "v": Vector3(cos(a2) * cos(e) * sp, sin(e) * sp, sin(a2) * cos(e) * sp), "life": 0.5 + _r() * 0.7,
			"s0": 2.2, "s1": 1.2, "c": Color(1, 0.7, 0.35), "a0": 1.0, "a1": 0.2, "cell": 0, "grav": 600.0, "drag": 0.8, "stretch": true})
	var lc := light_at(p + Vector3(0, 60, 0))
	var lk := (lc.r + lc.g + lc.b) / 3.0
	for i in 30:
		var a3 := _r() * TAU
		var r3 := _r() * 55.0
		var k := (0.16 + _r() * 0.1) * clampf(lk * 1.4, 0.5, 1.2)
		dust.spawn({"p": p + Vector3(cos(a3) * r3, 20.0 + _r() * 70.0, sin(a3) * r3), "v": Vector3(cos(a3) * 45.0, 70.0 + _r() * 110.0, sin(a3) * 45.0),
			"life": 4.5 + _r() * 3.0, "s0": 38.0 + _r() * 22.0, "s1": 130.0 + _r() * 80.0, "c": Color(k * 1.05, k, k * 0.95), "a0": 0.95, "a1": 0.0,
			"rot": _r() * TAU, "spin": (_r() - 0.5) * 0.3, "cell": 1, "grav": -22.0, "drag": 0.85})
	add_light(p + Vector3(0, 60, 0), Color(1.0, 0.62, 0.3), 1500.0, 0.9)


## Muzzle flash seen from the outside (other players).
func world_flash(p: Vector3, dir: Vector3, scale: float) -> void:
	sparks.spawn({"p": p + dir * 2.0, "v": Vector3.ZERO, "life": 0.05, "s0": 7.0 * scale, "s1": 9.0 * scale, "c": Color(1, 0.78, 0.45), "a0": 1.0, "a1": 0.4, "rot": randf() * TAU, "cell": 3})
	sparks.spawn({"p": p, "v": Vector3.ZERO, "life": 0.07, "s0": 10.0 * scale, "s1": 13.0 * scale, "c": Color(1, 0.6, 0.3), "a0": 0.5, "a1": 0.0, "cell": 0})


func update(dt: float) -> void:
	if L == null or root == null:
		return
	dust.update(dt)
	sparks.update(dt)
	tracers.update(dt)
	shells.update(dt, L.cw)
	var cam := get_viewport().get_camera_3d()
	if cam:
		smoke.update(Grenades.clouds, cam.global_transform)
	_update_lights(dt)


# ------------------------------------------------------------------------------------------------
## Ring buffer of decals; each slot holds up to 6 triangles (clipped octagon fan).
class DecalSet:
	var max_n := 0
	var next := 0
	var vpd := 18
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var mi: MeshInstance3D
	var mesh := ArrayMesh.new()
	var mat: ShaderMaterial

	func _init(m: int, parent: Node3D) -> void:
		max_n = m
		pos.resize(m * vpd)
		uv.resize(m * vpd)
		mat = ShaderMaterial.new()
		mat.shader = preload("res://shaders/decal.gdshader")
		mat.set_shader_parameter("atlas", Assets.tex("decals"))
		mat.render_priority = 1
		mi = MeshInstance3D.new()
		mi.mesh = mesh
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.extra_cull_margin = 16384.0
		parent.add_child(mi)

	func clear() -> void:
		pos.fill(Vector3.ZERO)
		next = 0
		_upload()

	func _upload() -> void:
		mesh.clear_surfaces()
		var a := []
		a.resize(Mesh.ARRAY_MAX)
		a[Mesh.ARRAY_VERTEX] = pos
		a[Mesh.ARRAY_TEX_UV] = uv
		var nrm := PackedVector3Array()
		nrm.resize(pos.size())
		a[Mesh.ARRAY_NORMAL] = nrm
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
		mesh.surface_set_material(0, mat)

	## p, n in the parent's space; clip = convex face polygon (same space) or null.
	func add(p: Vector3, n: Vector3, size: float, cell: int, clip: Variant, r: U.Rng) -> void:
		var ax := Vector3(0, 1, 0) if absf(n.y) < 0.9 else Vector3(1, 0, 0)
		var t1 := n.cross(ax).normalized()
		var t2 := n.cross(t1)
		var a := r.next() * TAU
		var c := cos(a)
		var s := sin(a)
		var r1 := t1 * c + t2 * s
		t2 = t2 * c - t1 * s
		var h := size / 2.0
		var off := n * 0.12
		var poly := PackedVector3Array()
		for q in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
			poly.append(p + (r1 * q.x + t2 * q.y) * h + off)
		if clip != null and (clip as PackedVector3Array).size() >= 3:
			var cp: PackedVector3Array = clip
			var ctr := Vector3.ZERO
			for v in cp:
				ctr += v
			ctr /= cp.size()
			for i in cp.size():
				if poly.size() < 3:
					break
				var A := cp[i]
				var B := cp[(i + 1) % cp.size()]
				var en := (B - A).cross(n)
				if en.length() < 1e-9:
					continue
				en = en.normalized()
				if en.dot(ctr - A) > 0.0:
					en = -en
				poly = CollisionWorld.clip_polygon(poly, en.x, en.y, en.z, en.dot(A))
			if poly.size() < 3:
				return
		var slot := next
		next = (next + 1) % max_n
		var base := slot * vpd
		var cu := cell & 1
		var cv := 1 - (cell >> 1)
		# winding: Godot front faces are clockwise seen from the front (the fan runs counter-clockwise)
		var vi := 0
		for i in range(1, poly.size() - 1):
			if vi >= vpd:
				break
			for k in [0, i + 1, i]:
				var v := poly[k]
				var d := v - p
				var lu := clampf(d.dot(r1) / size + 0.5, 0.01, 0.99)
				var lv := clampf(d.dot(t2) / size + 0.5, 0.01, 0.99)
				pos[base + vi] = v
				uv[base + vi] = Vector2((cu + lu) * 0.5, 1.0 - (cv + lv) * 0.5)
				vi += 1
		while vi < vpd:
			pos[base + vi] = Vector3.ZERO
			vi += 1
		_upload()


# ------------------------------------------------------------------------------------------------
## CPU-simulated billboards drawn from one MultiMesh (see shaders/particles*.gdshader).
class Particles:
	const STRIDE := 20
	var max_n := 0
	var n := 0
	var s := PackedFloat32Array()
	var buf := PackedFloat32Array()
	var mm := MultiMesh.new()
	var mmi := MultiMeshInstance3D.new()

	func _init(m: int, additive: bool, parent: Node3D) -> void:
		max_n = m
		s.resize(m * STRIDE)
		buf.resize(m * 20)
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = FX.quad_mesh()
		mm.instance_count = m
		mm.visible_instance_count = 0
		mm.custom_aabb = AABB(Vector3(-1e5, -1e5, -1e5), Vector3(2e5, 2e5, 2e5))
		var mat := ShaderMaterial.new()
		mat.shader = preload("res://shaders/particles_add.gdshader") if additive else preload("res://shaders/particles.gdshader")
		mat.set_shader_parameter("atlas", Assets.tex("sprites"))
		mat.render_priority = 3 if additive else 2
		mmi.multimesh = mm
		mmi.material_override = mat
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		parent.add_child(mmi)

	## o: {p, v, life, s0, s1, c, a0, a1, rot, spin, cell, grav, drag, stretch}
	func spawn(o: Dictionary) -> void:
		if n >= max_n:
			return
		var q := n * STRIDE
		n += 1
		var p: Vector3 = o.p
		var v: Vector3 = o.v
		var c: Color = o.c
		s[q] = p.x; s[q + 1] = p.y; s[q + 2] = p.z
		s[q + 3] = v.x; s[q + 4] = v.y; s[q + 5] = v.z
		s[q + 6] = 0.0; s[q + 7] = o.life
		s[q + 8] = o.s0; s[q + 9] = o.get("s1", o.s0)
		s[q + 10] = c.r; s[q + 11] = c.g; s[q + 12] = c.b
		s[q + 13] = o.get("a0", 1.0); s[q + 14] = o.get("a1", 0.0)
		s[q + 15] = o.get("rot", 0.0); s[q + 16] = o.get("spin", 0.0); s[q + 17] = o.get("cell", 0)
		s[q + 18] = o.get("grav", 0.0); s[q + 19] = float(o.get("drag", 0.0)) + (1000.0 if o.get("stretch", false) else 0.0)

	func update(dt: float) -> void:
		var w := 0
		for i in n:
			var q := i * STRIDE
			s[q + 6] += dt
			if s[q + 6] >= s[q + 7]:
				continue
			var pack := s[q + 19]
			var stretch := 0.035 if pack >= 1000.0 else 0.0
			var drag := pack - 1000.0 if pack >= 1000.0 else pack
			var k := exp(-drag * dt)
			s[q + 3] *= k
			s[q + 4] = s[q + 4] * k - s[q + 18] * dt
			s[q + 5] *= k
			s[q] += s[q + 3] * dt; s[q + 1] += s[q + 4] * dt; s[q + 2] += s[q + 5] * dt
			s[q + 15] += s[q + 16] * dt
			if w != i:
				var dd := w * STRIDE
				for j in STRIDE:
					s[dd + j] = s[q + j]
			var d := w * STRIDE
			var t := s[d + 6] / s[d + 7]
			var b := w * 20
			# transform rows: basis x column = velocity, origin = position
			buf[b] = s[d + 3]; buf[b + 1] = 0.0; buf[b + 2] = 0.0; buf[b + 3] = s[d]
			buf[b + 4] = s[d + 4]; buf[b + 5] = 1.0; buf[b + 6] = 0.0; buf[b + 7] = s[d + 1]
			buf[b + 8] = s[d + 5]; buf[b + 9] = 0.0; buf[b + 10] = 1.0; buf[b + 11] = s[d + 2]
			buf[b + 12] = s[d + 10]; buf[b + 13] = s[d + 11]; buf[b + 14] = s[d + 12]; buf[b + 15] = lerpf(s[d + 13], s[d + 14], t)
			buf[b + 16] = lerpf(s[d + 8], s[d + 9], sqrt(t)); buf[b + 17] = s[d + 15]; buf[b + 18] = s[d + 17]; buf[b + 19] = stretch
			w += 1
		n = w
		if w > 0:
			mm.buffer = buf
		mm.visible_instance_count = w

	func clear() -> void:
		n = 0
		mm.visible_instance_count = 0


# ------------------------------------------------------------------------------------------------
## Tracers: short glowing streaks racing from the muzzle to the impact point.
class Tracers:
	var max_n := 0
	var list: Array = []
	var mm := MultiMesh.new()
	var buf := PackedFloat32Array()

	func _init(m: int, parent: Node3D) -> void:
		max_n = m
		buf.resize(m * 16)
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = FX.quad_mesh(true)
		mm.instance_count = m
		mm.visible_instance_count = 0
		mm.custom_aabb = AABB(Vector3(-1e5, -1e5, -1e5), Vector3(2e5, 2e5, 2e5))
		var mat := ShaderMaterial.new()
		mat.shader = preload("res://shaders/tracer.gdshader")
		mat.render_priority = 3
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.material_override = mat
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		parent.add_child(mmi)

	func spawn(s: Vector3, e: Vector3, speed: float = 6500.0, len: float = 170.0) -> void:
		var dist := s.distance_to(e)
		if dist < 48.0:
			return
		list.append({"s": s, "d": (e - s) / dist, "dist": dist, "travel": 0.0, "speed": speed, "len": len})
		if list.size() > max_n:
			list.pop_front()

	func update(dt: float) -> void:
		var keep: Array = []
		for t: Dictionary in list:
			t.travel += t.speed * dt
			if t.travel - t.len < t.dist:
				keep.append(t)
		list = keep
		var n := 0
		for t: Dictionary in list:
			var head: float = minf(t.travel, t.dist)
			var tail: float = clampf(t.travel - t.len, 0.0, t.dist)
			var A: Vector3 = t.s + t.d * tail
			var B: Vector3 = t.s + t.d * head
			var b := n * 16
			buf[b] = B.x; buf[b + 1] = 0.0; buf[b + 2] = 0.0; buf[b + 3] = A.x
			buf[b + 4] = B.y; buf[b + 5] = 1.0; buf[b + 6] = 0.0; buf[b + 7] = A.y
			buf[b + 8] = B.z; buf[b + 9] = 0.0; buf[b + 10] = 1.0; buf[b + 11] = A.z
			buf[b + 12] = 1.0; buf[b + 13] = 1.0; buf[b + 14] = 1.0; buf[b + 15] = 0.95
			n += 1
		if n > 0:
			mm.buffer = buf
		mm.visible_instance_count = n


# ------------------------------------------------------------------------------------------------
## Shell casings: instanced brass cylinders with bounce physics; they settle and fade.
class Shells:
	var max_n := 0
	var list: Array = []
	var mms := {}
	var tint := {"rifle": Color(0.84, 0.68, 0.38), "pistol": Color(0.84, 0.68, 0.38), "shotgun": Color(0.62, 0.12, 0.09)}

	func _init(m: int, parent: Node3D) -> void:
		max_n = m
		for kind in [["rifle", 1.75, 0.21], ["pistol", 0.78, 0.2], ["shotgun", 2.5, 0.36]]:
			var cyl := CylinderMesh.new()
			cyl.height = kind[1]
			cyl.top_radius = kind[2]
			cyl.bottom_radius = kind[2]
			cyl.radial_segments = 8
			cyl.rings = 1
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.use_colors = true
			mm.mesh = cyl
			mm.instance_count = m
			mm.visible_instance_count = 0
			var mat := Models.world_material("")
			mat.set_shader_parameter("use_vcolor", true)
			var mmi := MultiMeshInstance3D.new()
			mmi.multimesh = mm
			mmi.material_override = mat
			mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			mm.custom_aabb = AABB(Vector3(-1e5, -1e5, -1e5), Vector3(2e5, 2e5, 2e5))
			parent.add_child(mmi)
			mms[kind[0]] = mm

	func spawn(kind: String, p: Vector3, v: Vector3, light: Color) -> void:
		if not mms.has(kind):
			kind = "rifle"
		if list.size() >= max_n:
			list.pop_front()
		list.append({"kind": kind, "p": p, "v": v, "rot": Vector3(randf() * TAU, randf() * TAU, PI / 2.0),
			"spin": Vector3(18.0 + randf() * 20.0, 6.0, 10.0 + randf() * 12.0), "rest": false, "age": 0.0, "bounces": 0, "light": light})

	func update(dt: float, cw: CollisionWorld) -> void:
		for sh: Dictionary in list:
			sh.age += dt
			if sh.rest:
				continue
			var v: Vector3 = sh.v
			v.y -= 800.0 * dt
			var p: Vector3 = sh.p
			var step := v * dt
			var len := step.length()
			var hit := cw.ray(p, step / len, len, CollisionWorld.MASK_SHOT) if len > 1e-6 else -1.0
			if hit >= 0.0 and cw.hit_normal != Vector3.ZERO:
				var nrm := cw.hit_normal
				p = cw.hit_point + nrm * 0.25
				var vn := v.dot(nrm)
				v -= 1.4 * vn * nrm
				v *= 0.55
				sh.spin = Vector3(sh.spin.x * 0.5, sh.spin.y, sh.spin.z * 0.5)
				if -vn > 45.0 and int(sh.bounces) < 3:
					Snd.shell(p, sh.kind, sh.bounces, U.surf_name(cw.surf_at_hit()))
					sh.bounces = int(sh.bounces) + 1
				if nrm.y > 0.7 and v.length() < 30.0:
					sh.rest = true
					sh.rot = Vector3(PI / 2.0, randf() * TAU, 0.0)
					p.y = cw.hit_point.y + 0.2
			elif hit >= 0.0:
				sh.rest = true
			else:
				p += step
			sh.p = p
			sh.v = v
			if not sh.rest:
				sh.rot += sh.spin * dt
		list = list.filter(func(x: Dictionary) -> bool: return x.age < 16.0)
		var counts := {"rifle": 0, "pistol": 0, "shotgun": 0}
		for sh: Dictionary in list:
			var mm: MultiMesh = mms[sh.kind]
			var i: int = counts[sh.kind]
			counts[sh.kind] = i + 1
			var k: float = maxf(0.01, 1.0 - (sh.age - 14.0) / 2.0) if sh.age > 14.0 else 1.0
			var b := Basis.from_euler(sh.rot, EULER_ORDER_YXZ).scaled(Vector3(k, k, k))
			mm.set_instance_transform(i, Transform3D(b, sh.p))
			var c: Color = tint[sh.kind]
			var lc: Color = sh.light
			mm.set_instance_color(i, Color(c.r * lc.r, c.g * lc.g, c.b * lc.b))
		for kind: String in mms:
			(mms[kind] as MultiMesh).visible_instance_count = counts[kind]

	func clear() -> void:
		list.clear()
		for kind: String in mms:
			(mms[kind] as MultiMesh).visible_instance_count = 0


# ------------------------------------------------------------------------------------------------
## Smoke: large lit billboards from every active cloud, sorted back to front each frame.
class SmokeRenderer:
	var max_n := 0
	var mm := MultiMesh.new()
	var buf := PackedFloat32Array()

	func _init(m: int, parent: Node3D) -> void:
		max_n = m
		buf.resize(m * 20)
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = FX.quad_mesh()
		mm.instance_count = m
		mm.visible_instance_count = 0
		mm.custom_aabb = AABB(Vector3(-1e5, -1e5, -1e5), Vector3(2e5, 2e5, 2e5))
		var mat := ShaderMaterial.new()
		mat.shader = preload("res://shaders/smoke.gdshader")
		mat.set_shader_parameter("atlas", Assets.tex("smoke"))
		mat.render_priority = 4
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.material_override = mat
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		parent.add_child(mmi)

	func update(clouds: Array, cam: Transform3D) -> void:
		var items: Array = []
		var fwd := -cam.basis.z
		for c: SmokeCloud in clouds:
			for it: Array in c.items():
				if items.size() >= max_n:
					break
				if it[3] <= 0.003:
					continue
				var p: Vector3 = it[0]
				items.append([(p - cam.origin).dot(fwd), p, it[1], it[2], it[3], it[4], c.light * float(it[5])])
		items.sort_custom(func(a: Array, b: Array) -> bool: return a[0] > b[0])
		var i := 0
		for it: Array in items:
			var b := i * 20
			var p: Vector3 = it[1]
			var c: Color = it[6]
			buf[b] = 1.0; buf[b + 1] = 0.0; buf[b + 2] = 0.0; buf[b + 3] = p.x
			buf[b + 4] = 0.0; buf[b + 5] = 1.0; buf[b + 6] = 0.0; buf[b + 7] = p.y
			buf[b + 8] = 0.0; buf[b + 9] = 0.0; buf[b + 10] = 1.0; buf[b + 11] = p.z
			buf[b + 12] = c.r; buf[b + 13] = c.g; buf[b + 14] = c.b; buf[b + 15] = 1.0
			buf[b + 16] = it[2]; buf[b + 17] = it[3]; buf[b + 18] = it[4]; buf[b + 19] = it[5]
			i += 1
		if i > 0:
			mm.buffer = buf
		mm.visible_instance_count = i


static var _quads := {}


## Unit quad (corners -1..1 in x/y), or the tracer strip (x 0..1, y -1..1).
static func quad_mesh(strip: bool = false) -> ArrayMesh:
	if _quads.has(strip):
		return _quads[strip]
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	if strip:
		a[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(0, -1, 0), Vector3(1, -1, 0), Vector3(1, 1, 0), Vector3(0, 1, 0)])
	else:
		a[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(-1, -1, 0), Vector3(1, -1, 0), Vector3(1, 1, 0), Vector3(-1, 1, 0)])
	a[Mesh.ARRAY_INDEX] = PackedInt32Array([0, 2, 1, 0, 3, 2])
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	m.custom_aabb = AABB(Vector3(-1e5, -1e5, -1e5), Vector3(2e5, 2e5, 2e5))
	_quads[strip] = m
	return m
