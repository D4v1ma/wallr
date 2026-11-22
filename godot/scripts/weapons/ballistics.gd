class_name Ballistics
extends RefCounted
## Bullet and knife resolution. Bullets punch through thin brushes depending on material:
## allowed thickness = MAT_PEN[surface] * the weapon's penetration power. Wallbang rounds go
## through every wall on the line.

const MAT_PEN := [3.0, 3.0, 4.0, 12.0, 4.5, 0.0, 3.0, 2.0, 40.0]   ## by surface id (concrete .. paper)

static var rnd := U.Rng.new(9)


## View direction + spray offset (deg) + centre-weighted random spread (mrad).
static func aim_dir(pl: Player, off: Vector2, inacc: float, spread: float) -> Vector3:
	var yaw := pl.yaw + deg_to_rad(off.y)
	var pitch := clampf(pl.pitch + deg_to_rad(off.x), -1.55, 1.55)
	var cp := cos(pitch); var sp := sin(pitch); var sy := sin(yaw); var cy := cos(yaw)
	var f := Vector3(-sy * cp, sp, -cy * cp)
	var r := Vector3(cy, 0, -sy)
	var u := Vector3(sy * sp, cp, cy * sp)
	var th := rnd.next() * TAU
	var rr := (inacc * rnd.next() + spread * rnd.next()) * 0.001
	return (f + r * (cos(th) * rr) + u * (sin(th) * rr)).normalized()


## Shotgun pellet i around a base direction: uniform over a disc of `spread` mrad.
static func pellet(base: Vector3, i: int, spread: float) -> Vector3:
	var up := Vector3(0, 1, 0) if absf(base.y) < 0.99 else Vector3(1, 0, 0)
	var r := base.cross(up)
	r = r.normalized() if r.length() > 0.0 else Vector3(1, 0, 0)
	var v := r.cross(base)
	var th := rnd.next() * TAU
	var rr := spread * 0.001 * sqrt(rnd.next()) * (0.25 if i == 0 else 1.0)
	return (base + r * (cos(th) * rr) + v * (sin(th) * rr)).normalized()


## Distance from a point inside a convex brush to where the ray leaves it -> [t, plane] or [].
static func exit(b: CollisionWorld.Brush, p: Vector3, d: Vector3) -> Array:
	var best := INF
	var plane := -1
	for i in b.n:
		var o := i * 4
		var den := b.P[o] * d.x + b.P[o + 1] * d.y + b.P[o + 2] * d.z
		if den <= 1e-9:
			continue
		var t := (b.P[o + 3] - (b.P[o] * p.x + b.P[o + 1] * p.y + b.P[o + 2] * p.z)) / den
		if t < best:
			best = t
			plane = i
	return [] if plane < 0 else [maxf(0.0, best), plane]


static func on_plane(b: CollisionWorld.Brush, plane: int, p: Vector3) -> Vector3:
	if plane < 0:
		return p
	var o := plane * 4
	var n := Vector3(b.P[o], b.P[o + 1], b.P[o + 2])
	return p - n * (p.dot(n) - b.P[o + 3])


static func _impact(b: CollisionWorld.Brush, plane: int, point: Vector3, normal: Vector3, surf: int, is_exit: bool, dist: float, damage: float) -> Dictionary:
	return {"kind": "door" if b.door != null else "world", "door": b.door, "brush": b, "plane": plane, "point": point, "normal": normal,
		"surf": surf, "exit": is_exit, "dist": dist, "damage": damage}


static func _res() -> Dictionary:
	return {"impacts": [], "target": null, "actor": null, "end": null, "dist": 0.0, "pens": 0, "wallbang": false}


## -> {impacts: [...], target, actor, end, dist, pens}
static func bullet(L: Level, eye: Vector3, dir: Vector3, def: Dictionary, shooter: Actor = null) -> Dictionary:
	var res := _res()
	var cw := L.cw
	var s := eye
	var remaining := float(def.range)
	var travelled := 0.0
	var power := float(def.penetration)
	var damage := float(def.damage)
	var range_mod := float(def.rangeMod)
	for seg in 4:
		var dist := cw.ray(s, dir, remaining, CollisionWorld.MASK_SHOT)
		if dist >= 0.0 and dist < 1e-4 and cw.hit_normal == Vector3.ZERO:
			return res   # started inside a wall
		var hit_wall := dist >= 0.0
		if not hit_wall:
			dist = remaining
		var wb := cw.hit_brush
		var wplane := cw.hit_plane
		var wnormal := cw.hit_normal
		var wpoint := cw.hit_point
		var hit_t: Variant = null
		var hit_td := INF
		for tg in Ents.targets:
			var d := tg.ray_hit(s, dir, dist)
			if d >= 0.0 and d < hit_td:
				hit_td = d
				hit_t = tg
		var ah := Actors.hitscan(s, dir, minf(dist, hit_td), shooter)
		if not ah.is_empty():
			var total: float = travelled + ah.t
			var p: Vector3 = s + dir * float(ah.t)
			res.actor = {"target": ah.actor, "group": ah.group, "point": p, "dist": total, "damage": damage * pow(range_mod, total / 500.0)}
			res.end = p
			res.dist = total
			return res
		if hit_t != null:
			var total2 := travelled + hit_td
			var p2 := s + dir * hit_td
			res.target = {"target": hit_t, "point": p2, "normal": Vector3(-1, 0, 0), "dist": total2, "damage": damage * pow(range_mod, total2 / 500.0)}
			res.end = p2
			res.dist = total2
			return res
		if not hit_wall or wb < 0:
			res.end = s + dir * dist
			res.dist = travelled + dist
			return res
		var b := cw.brushes[wb]
		var surf: int = b.surf[wplane] if wplane >= 0 else b.surf_default
		var pt := on_plane(b, wplane, wpoint)
		travelled += dist
		(res.impacts as Array).append(_impact(b, wplane, pt, wnormal, surf, false, travelled, damage))
		res.end = pt
		res.dist = travelled
		var allow: float = MAT_PEN[surf] * power
		if allow <= 0.0 or int(res.pens) >= 2:
			return res
		var ex := exit(b, pt + dir * 0.05, dir)
		if ex.is_empty():
			return res
		var thick: float = ex[0] + 0.05
		if thick > allow:
			return res
		var q := pt + dir * thick
		var ep: int = ex[1]
		var frac := thick / allow
		damage *= maxf(0.1, 1.0 - 0.45 * frac - 0.1)
		power *= maxf(0.0, 1.0 - frac * 0.75)
		res.pens = int(res.pens) + 1
		(res.impacts as Array).append(_impact(b, ep, q, Vector3(b.P[ep * 4], b.P[ep * 4 + 1], b.P[ep * 4 + 2]), b.surf[ep], true, travelled + thick, damage))
		travelled += thick
		remaining -= dist + thick + 0.1
		if remaining <= 0.0:
			return res
		s = q + dir * 0.1
	return res


## Every wall a ray crosses before max_t: merged entry/exit intervals with the brush faces they use.
static func crossings(L: Level, eye: Vector3, dir: Vector3, max_t: float) -> Array:
	var cw := L.cw
	var hits: Array = []
	var excl: Array[RID] = []
	# the physics server finds every solid brush on the line; the planes give the exact interval
	for guard in 64:
		var d := cw.ray(eye, dir, max_t, CollisionWorld.SOLID, excl)
		if d < 0.0 or cw.hit_brush < 0:
			break
		var b := cw.brushes[cw.hit_brush]
		excl.append(b.body)
		var t0 := -INF; var t1 := INF; var p0 := -1; var p1 := -1
		var skip := false
		for i in b.n:
			var o := i * 4
			var den := b.P[o] * dir.x + b.P[o + 1] * dir.y + b.P[o + 2] * dir.z
			var dist := b.P[o + 3] - (b.P[o] * eye.x + b.P[o + 1] * eye.y + b.P[o + 2] * eye.z)
			if absf(den) < 1e-9:
				if dist < 0.0:
					skip = true
					break
				continue
			var t := dist / den
			if den < 0.0:
				if t > t0:
					t0 = t
					p0 = i
			elif t < t1:
				t1 = t
				p1 = i
		if skip or not (t0 < t1 and t0 > 0.0 and t0 < max_t):
			continue
		hits.append({"b": b, "t0": t0, "p0": p0, "t1": minf(t1, max_t), "p1": p1 if t1 <= max_t else -1})
	hits.sort_custom(func(a: Dictionary, c: Dictionary) -> bool: return a.t0 < c.t0)
	var walls: Array = []
	for h: Dictionary in hits:
		var w: Dictionary = walls[-1] if not walls.is_empty() else {}
		if not w.is_empty() and h.t0 <= float(w.t1) + 0.5:
			if h.t1 > w.t1:
				w.t1 = h.t1
				w.out = h
		else:
			walls.append({"t0": h.t0, "t1": h.t1, "in": h, "out": h})
	return walls


## A wallbang round: straight through every wall to the first enemy on the line, at full damage
## (only the usual range falloff). Each wall it crosses still gets entry and exit marks.
static func wallbang(L: Level, eye: Vector3, dir: Vector3, def: Dictionary, shooter: Actor = null) -> Dictionary:
	var rng := maxf(float(def.range), 8192.0)
	var res := _res()
	res.wallbang = true
	var ah := Actors.hitscan(eye, dir, rng, shooter)
	var max_t: float = ah.t if not ah.is_empty() else rng
	var walls := crossings(L, eye, dir, max_t)
	var dmg := float(def.damage)
	for i in mini(walls.size(), 16):
		var w: Dictionary = walls[i]
		var a: Dictionary = w.in
		var c: Dictionary = w.out
		var ba: CollisionWorld.Brush = a.b
		var bc: CollisionWorld.Brush = c.b
		var pa: int = a.p0
		(res.impacts as Array).append(_impact(ba, pa, on_plane(ba, pa, eye + dir * float(w.t0)), Vector3(ba.P[pa * 4], ba.P[pa * 4 + 1], ba.P[pa * 4 + 2]), ba.surf[pa], false, w.t0, dmg))
		var pc: int = c.p1
		if pc >= 0:
			(res.impacts as Array).append(_impact(bc, pc, on_plane(bc, pc, eye + dir * float(w.t1)), Vector3(bc.P[pc * 4], bc.P[pc * 4 + 1], bc.P[pc * 4 + 2]), bc.surf[pc], true, w.t1, dmg))
	res.pens = walls.size()
	if not ah.is_empty():
		var p: Vector3 = eye + dir * float(ah.t)
		res.actor = {"target": ah.actor, "group": ah.group, "point": p, "dist": ah.t, "damage": dmg * pow(float(def.rangeMod), float(ah.t) / 500.0)}
		res.end = p
		res.dist = ah.t
	else:
		res.end = eye + dir * rng
		res.dist = rng
	return res


## Knife: a ray first, then a small hull sweep so edges still connect. Returns an impact or {}.
static func knife(L: Level, eye: Vector3, dir: Vector3, reach: float, shooter: Actor = null) -> Dictionary:
	var ah := Actors.hitscan(eye, dir, reach, shooter)
	if not ah.is_empty():
		return {"kind": "actor", "target": ah.actor, "group": ah.group, "point": eye + dir * float(ah.t), "normal": -dir, "surf": U.surf_id("cloth")}
	for tg in Ents.targets:
		var d := tg.ray_hit(eye, dir, reach)
		if d >= 0.0:
			return {"kind": "target", "target": tg, "point": eye + dir * d, "normal": Vector3(-1, 0, 0), "surf": U.surf_id("metal")}
	var cw := L.cw
	var e := eye + dir * reach
	var dist := cw.ray(eye, dir, reach, CollisionWorld.MASK_SHOT)
	var b: CollisionWorld.Brush = null
	var plane := -1
	var p := Vector3.ZERO
	var n := Vector3.ZERO
	if dist >= 0.0 and cw.hit_brush >= 0:
		b = cw.brushes[cw.hit_brush]
		plane = cw.hit_plane
		p = cw.hit_point
		n = cw.hit_normal
	else:
		var tr := Trace.new()
		cw.trace(tr, eye, e, Vector3(4, 4, 4), CollisionWorld.MASK_SHOT)
		if tr.fraction >= 1.0 or tr.brush < 0 or tr.startsolid:
			return {}
		b = cw.brushes[tr.brush]
		plane = tr.plane
		n = tr.normal
		p = tr.endpos - n * 4.0
	p = on_plane(b, plane, p)
	var surf: int = b.surf[plane] if plane >= 0 else b.surf_default
	return {"kind": "door" if b.door != null else "world", "door": b.door, "brush": b, "plane": plane, "point": p, "normal": n, "surf": surf, "exit": false}
