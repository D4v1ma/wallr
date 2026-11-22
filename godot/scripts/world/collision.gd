class_name CollisionWorld
extends RefCounted
## Brush collision for the level. Every brush is a convex Jolt body (collision layer = its contents
## bits). Hull traces sweep a box with the physics server to find the brush hit first, then clip
## against that brush's own planes (Quake 3 style, with axial bevels) for the exact fraction and plane,
## so movement behaves exactly like the original slide-move.

const SOLID := 1
const PLAYERCLIP := 2
const OPAQUE := 4
const MASK_PLAYER := SOLID | PLAYERCLIP
const MASK_SHOT := SOLID
const MASK_LIGHT := OPAQUE
const EPS := 0.03125


class Brush:
	var id := -1
	var P := PackedFloat64Array()      ## planes (n*4) incl. axial bevels, world space
	var n := 0                         ## plane count incl. bevels
	var face_count := 0
	var surf := PackedInt32Array()     ## surface per plane
	var surf_default := 0
	var polys: Array = []              ## per face: PackedVector3Array or null
	var contents := 0
	var lo := Vector3.ZERO
	var hi := Vector3.ZERO
	var entity := ""
	var o: Dictionary = {}
	var mats: Array = []
	var body := RID()
	var shape := RID()
	var dynamic := false
	var active := true
	var door: Object = null            ## Door entity driving this brush
	var origin := Vector3.ZERO         ## the physics shape is built around this point (precision)

	func set_planes(planes: Array, surfs: Array) -> void:
		face_count = planes.size()
		polys = CollisionWorld.brush_polygons(planes)
		var x0 := INF; var y0 := INF; var z0 := INF
		var x1 := -INF; var y1 := -INF; var z1 := -INF
		for p in polys:
			if p == null:
				continue
			for v: Vector3 in p:
				x0 = minf(x0, v.x); y0 = minf(y0, v.y); z0 = minf(z0, v.z)
				x1 = maxf(x1, v.x); y1 = maxf(y1, v.y); z1 = maxf(z1, v.z)
		var all: Array = planes.duplicate()
		var sf: Array = surfs.duplicate() if surfs.size() == planes.size() else []
		if sf.is_empty():
			for i in planes.size():
				sf.append(surf_default)
		for a in [[1, 0, 0, x1], [-1, 0, 0, -x0], [0, 1, 0, y1], [0, -1, 0, -y0], [0, 0, 1, z1], [0, 0, -1, -z0]]:
			var dup := false
			for p in planes:
				if float(p[0]) * a[0] + float(p[1]) * a[1] + float(p[2]) * a[2] > 0.99999:
					dup = true
					break
			if not dup:
				all.append(a)
				sf.append(surf_default)
		n = all.size()
		P.resize(n * 4)
		for i in n:
			for k in 4:
				P[i * 4 + k] = float(all[i][k])
		surf = PackedInt32Array(sf)
		lo = Vector3(x0, y0, z0)
		hi = Vector3(x1, y1, z1)

	## Unique corner points relative to `origin`. The faces are rebuilt in local space with a small
	## starting quad, so the corners stay exact far from the world origin (Jolt's hull builder
	## rejects near-duplicates and points a hair off their face).
	func points(origin: Vector3) -> PackedVector3Array:
		var planes: Array = []
		for i in face_count:
			var o := i * 4
			planes.append([P[o], P[o + 1], P[o + 2], P[o + 3] - (P[o] * origin.x + P[o + 1] * origin.y + P[o + 2] * origin.z)])
		var out := PackedVector3Array()
		for p: Variant in CollisionWorld.brush_polygons(planes, (hi - lo).length() + 64.0):
			if p == null:
				continue
			for v: Vector3 in p:
				var dup := false
				for w: Vector3 in out:
					if v.distance_squared_to(w) < 0.0025:
						dup = true
						break
				if not dup:
					out.append(v)
		return out


var brushes: Array[Brush] = []
var dynamic: Array[Brush] = []
var space := RID()
var _by_rid := {}
var _box_shapes := {}
var _q := PhysicsShapeQueryParameters3D.new()
var _rq := PhysicsRayQueryParameters3D.new()
var _pq := PhysicsPointQueryParameters3D.new()
var _excl: Array[RID] = []
## last ray hit (set by ray())
var hit_brush := -1
var hit_plane := -1
var hit_normal := Vector3.ZERO
var hit_point := Vector3.ZERO


static func clip_polygon(poly: PackedVector3Array, nx: float, ny: float, nz: float, d: float) -> PackedVector3Array:
	var out := PackedVector3Array()
	var cnt := poly.size()
	for i in cnt:
		var a := poly[i]
		var b := poly[(i + 1) % cnt]
		var da := a.x * nx + a.y * ny + a.z * nz - d
		var db := b.x * nx + b.y * ny + b.z * nz - d
		if da <= 0.0:
			out.append(a)
		if (da < 0.0 and db > 0.0) or (da > 0.0 and db < 0.0):
			var t := da / (da - db)
			out.append(a + (b - a) * t)
	return out


## Face polygons of a convex brush (one per plane; null where the plane is redundant).
static func brush_polygons(planes: Array, S := 65536.0) -> Array:
	var polys: Array = []
	for i in planes.size():
		var p: Array = planes[i]
		var n := Vector3(float(p[0]), float(p[1]), float(p[2]))
		var d := float(p[3])
		var up := Vector3(0, 0, 1) if absf(n.y) > 0.9 else Vector3(0, 1, 0)
		var r := up.cross(n).normalized()
		var u := n.cross(r)
		var c := n * d
		var poly := PackedVector3Array([c + (r + u) * S, c + (u - r) * S, c - (r + u) * S, c + (r - u) * S])
		for j in planes.size():
			if j == i:
				continue
			var q: Array = planes[j]
			poly = clip_polygon(poly, float(q[0]), float(q[1]), float(q[2]), float(q[3]))
			if poly.size() < 3:
				break
		polys.append(poly if poly.size() >= 3 else null)
	return polys


func build(list: Array, world_space: RID) -> void:
	space = world_space
	for i in list.size():
		var d: Dictionary = list[i]
		var b := Brush.new()
		b.id = i
		b.contents = int(d.contents)
		b.surf_default = int(d.surf)
		b.entity = d.entity if d.entity != null else ""
		b.o = d.o
		b.mats = d.mats
		b.set_planes(d.planes, d.surfs)
		brushes.append(b)
		if b.entity == "door":
			b.dynamic = true
			dynamic.append(b)
			_make_body(b, true)
		elif b.entity == "" and b.contents != 0:
			_make_body(b, false)


func _make_body(b: Brush, kinematic: bool) -> void:
	# Build the hull around the brush's own centre: Jolt's hull builder works in 32-bit floats and
	# fails on detailed brushes far from the origin of a big map.
	b.origin = ((b.lo + b.hi) * 0.5).round()
	var pts := b.points(b.origin)
	if pts.size() < 4:
		return
	b.shape = PhysicsServer3D.convex_polygon_shape_create()
	PhysicsServer3D.shape_set_data(b.shape, pts)
	PhysicsServer3D.shape_set_margin(b.shape, 0.0)
	b.body = PhysicsServer3D.body_create()
	PhysicsServer3D.body_set_mode(b.body, PhysicsServer3D.BODY_MODE_STATIC)
	PhysicsServer3D.body_add_shape(b.body, b.shape)
	PhysicsServer3D.body_set_collision_layer(b.body, b.contents)
	PhysicsServer3D.body_set_collision_mask(b.body, 0)
	PhysicsServer3D.body_set_space(b.body, space)
	PhysicsServer3D.body_set_state(b.body, PhysicsServer3D.BODY_STATE_TRANSFORM, Transform3D(Basis.IDENTITY, b.origin))
	_by_rid[b.body] = b


func free_all() -> void:
	for b in brushes:
		if b.body.is_valid():
			PhysicsServer3D.free_rid(b.body)
		if b.shape.is_valid():
			PhysicsServer3D.free_rid(b.shape)
	for s: RID in _box_shapes.values():
		PhysicsServer3D.free_rid(s)
	brushes.clear()
	dynamic.clear()
	_by_rid.clear()
	_box_shapes.clear()


## A door brush moved: new planes (world space) and the body transform that carries its shape.
func move_brush(b: Brush, planes: Array, xform: Transform3D) -> void:
	var keep := b.surf.slice(0, b.face_count)
	b.set_planes(planes, Array(keep))
	if b.body.is_valid():
		PhysicsServer3D.body_set_state(b.body, PhysicsServer3D.BODY_STATE_TRANSFORM, xform * Transform3D(Basis.IDENTITY, b.origin))


func set_active(b: Brush, on: bool) -> void:
	b.active = on
	if b.body.is_valid():
		PhysicsServer3D.body_set_collision_layer(b.body, b.contents if on else 0)


func _state() -> PhysicsDirectSpaceState3D:
	return PhysicsServer3D.space_get_direct_state(space)


func _box(half: Vector3) -> RID:
	var key := "%.3f,%.3f,%.3f" % [half.x, half.y, half.z]
	var s: RID = _box_shapes.get(key, RID())
	if not s.is_valid():
		s = PhysicsServer3D.box_shape_create()
		PhysicsServer3D.shape_set_data(s, half)
		PhysicsServer3D.shape_set_margin(s, 0.0)
		_box_shapes[key] = s
	return s


## Sweep a box (center s -> e, half extents) through every brush matching mask.
func trace(tr: Trace, s: Vector3, e: Vector3, half: Vector3, mask: int) -> Trace:
	tr.reset()
	var st := _state()
	var motion := e - s
	_q.shape_rid = _box(half)
	_q.collision_mask = mask
	_q.margin = 0.0
	_q.transform = Transform3D(Basis.IDENTITY, s)
	_excl.clear()
	_q.exclude = _excl
	if motion.length_squared() < 1e-12:
		_q.motion = Vector3.ZERO
		var hits := st.intersect_shape(_q, 1)
		if not hits.is_empty():
			tr.startsolid = true
			tr.allsolid = true
			tr.fraction = 0.0
			tr.brush = _brush_of(hits[0].rid)
		tr.endpos = s
		return tr
	_q.motion = motion
	var r := st.cast_motion(_q)
	if r[0] == 0.0 and r[1] == 0.0:
		# overlapping at the start: Quake ignores brushes the box is leaving
		_q.motion = Vector3.ZERO
		var inside := st.intersect_shape(_q, 8)
		if not inside.is_empty():
			tr.startsolid = true
			var excl: Array[RID] = []
			for h in inside:
				var b := _brush_of_b(h.rid)
				if b != null and _leaves(b, s, e, half):
					excl.append(h.rid)
				else:
					tr.allsolid = true
					tr.fraction = 0.0
					tr.brush = b.id if b != null else -1
					tr.endpos = s
					return tr
			_q.exclude = excl
			_q.motion = motion
			r = st.cast_motion(_q)
	if r[1] >= 1.0:
		tr.endpos = e
		return tr
	# the brush hit first, then the exact clip against its planes
	_q.motion = Vector3.ZERO
	_q.transform = Transform3D(Basis.IDENTITY, s + motion * minf(1.0, r[1] + 0.0005))
	var info := st.get_rest_info(_q)
	var b: Brush = _brush_of_b(info.rid) if not info.is_empty() else null
	var done := false
	if b != null:
		done = _clip_brush(tr, b, s, e, half)
	if not done:
		var nrm: Vector3 = info.normal if not info.is_empty() else -motion.normalized()
		var into := -motion.dot(nrm)
		tr.fraction = maxf(0.0, r[0] - (EPS / into if into > 1e-6 else 0.0))
		tr.normal = nrm
		tr.brush = b.id if b != null else -1
		tr.plane = _plane_for(b, nrm) if b != null else -1
	tr.endpos = s + motion * tr.fraction
	if tr.brush >= 0:
		var bb := brushes[tr.brush]
		tr.surf = bb.surf[tr.plane] if tr.plane >= 0 else bb.surf_default
	return tr


## True when a box starting inside b ends outside it along s -> e (Quake's getout).
func _leaves(b: Brush, s: Vector3, e: Vector3, h: Vector3) -> bool:
	var P := b.P
	for i in b.n:
		var o := i * 4
		var nx := P[o]; var ny := P[o + 1]; var nz := P[o + 2]
		var dist := P[o + 3] + absf(nx) * h.x + absf(ny) * h.y + absf(nz) * h.z
		if e.x * nx + e.y * ny + e.z * nz - dist > 0.0:
			return true
	return false


## Quake 3 brush clip for one brush. Returns false when the planes don't confirm a hit.
func _clip_brush(tr: Trace, b: Brush, s: Vector3, e: Vector3, h: Vector3) -> bool:
	var P := b.P
	var enter := -1.0
	var leave := 1.0
	var clip := -1
	for i in b.n:
		var o := i * 4
		var nx := P[o]; var ny := P[o + 1]; var nz := P[o + 2]
		var dist := P[o + 3] + absf(nx) * h.x + absf(ny) * h.y + absf(nz) * h.z
		var d1 := s.x * nx + s.y * ny + s.z * nz - dist
		var d2 := e.x * nx + e.y * ny + e.z * nz - dist
		if d1 > 0.0 and (d2 >= EPS or d2 >= d1):
			return false
		if d1 <= 0.0 and d2 <= 0.0:
			continue
		if d1 > d2:
			var f := maxf(0.0, (d1 - EPS) / (d1 - d2))
			if f > enter:
				enter = f
				clip = i
		else:
			var f2 := minf(1.0, (d1 + EPS) / (d1 - d2))
			if f2 < leave:
				leave = f2
	if clip < 0 or enter >= leave:
		return false
	tr.fraction = maxf(enter, 0.0)
	tr.brush = b.id
	tr.plane = clip
	tr.normal = Vector3(P[clip * 4], P[clip * 4 + 1], P[clip * 4 + 2])
	return true


func _plane_for(b: Brush, nrm: Vector3) -> int:
	var best := -1
	var bd := 0.9
	for i in b.n:
		var d := b.P[i * 4] * nrm.x + b.P[i * 4 + 1] * nrm.y + b.P[i * 4 + 2] * nrm.z
		if d > bd:
			bd = d
			best = i
	return best


func _brush_of(rid: RID) -> int:
	var b: Brush = _by_rid.get(rid)
	return b.id if b != null else -1


func _brush_of_b(rid: RID) -> Brush:
	return _by_rid.get(rid)


## Ray from o along unit dir d. Returns hit distance or -1; fills hit_* fields.
func ray(o: Vector3, d: Vector3, tmax: float, mask: int, exclude: Array[RID] = []) -> float:
	hit_brush = -1
	hit_plane = -1
	_rq.from = o
	_rq.to = o + d * tmax
	_rq.collision_mask = mask
	_rq.hit_from_inside = true
	_rq.hit_back_faces = false
	_rq.exclude = exclude
	var res := _state().intersect_ray(_rq)
	if res.is_empty():
		return -1.0
	var b := _brush_of_b(res.rid)
	hit_point = res.position
	hit_normal = res.normal
	if b != null:
		hit_brush = b.id
		hit_plane = _plane_for(b, hit_normal) if hit_normal != Vector3.ZERO else -1
	return o.distance_to(hit_point)


func ray_rid() -> RID:
	return brushes[hit_brush].body if hit_brush >= 0 else RID()


func surf_at_hit() -> int:
	if hit_brush < 0:
		return 0
	var b := brushes[hit_brush]
	return b.surf[hit_plane] if hit_plane >= 0 else b.surf_default


## Is the point inside any brush matching mask?
func point_contents(p: Vector3, mask: int) -> bool:
	_pq.position = p
	_pq.collision_mask = mask
	return not _state().intersect_point(_pq, 1).is_empty()


func point_in_brush(b: Brush, p: Vector3) -> bool:
	for i in b.n:
		var o := i * 4
		if b.P[o] * p.x + b.P[o + 1] * p.y + b.P[o + 2] * p.z - b.P[o + 3] > 0.0:
			return false
	return true


## Does the box (center c, half extents h) overlap the plane set P (n planes)?
static func box_overlaps_planes(P: PackedFloat64Array, n: int, c: Vector3, h: Vector3) -> bool:
	for i in n:
		var o := i * 4
		var nx := P[o]; var ny := P[o + 1]; var nz := P[o + 2]
		var dist := P[o + 3] + absf(nx) * h.x + absf(ny) * h.y + absf(nz) * h.z
		if nx * c.x + ny * c.y + nz * c.z - dist > -0.05:
			return false
	return true


## Ray vs one brush's planes (doors, doorways): distance or -1.
static func ray_planes(P: PackedFloat64Array, n: int, o: Vector3, d: Vector3, tmax: float) -> float:
	var t0 := 0.0
	var t1 := tmax
	for i in n:
		var k := i * 4
		var nx := P[k]; var ny := P[k + 1]; var nz := P[k + 2]
		var den := nx * d.x + ny * d.y + nz * d.z
		var dist := P[k + 3] - (nx * o.x + ny * o.y + nz * o.z)
		if absf(den) < 1e-12:
			if dist < 0.0:
				return -1.0
			continue
		var t := dist / den
		if den < 0.0:
			t0 = maxf(t0, t)
		else:
			t1 = minf(t1, t)
		if t0 > t1:
			return -1.0
	return t0
