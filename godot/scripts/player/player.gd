class_name Player
extends RefCounted
## Player movement on the fixed 64 Hz tick: Quake/Source ground and air acceleration, friction,
## Quake 3 slide-move with crease handling, 18-unit stepping, crouch-jumping, noclip.
## Positions are the feet; units are inches (eye height 64, run speed up to 250).

const GRAVITY := 800.0
const JUMP_SPEED := 301.993
const STEP := 18.0
const ACCEL := 5.5
const AIR_ACCEL := 12.0
const FRICTION := 5.2
const STOP_SPEED := 80.0
const AIR_CAP := 30.0
const WALK_FRAC := 0.52
const DUCK_FRAC := 0.34
const HALF := 16.0
const STAND_H := 72.0
const DUCK_H := 54.0
const STAND_EYE := 64.0
const DUCK_EYE := 46.0
const DUCK_DELTA := 9.0
const MIN_WALK_NORMAL := 0.7
const NOCLIP_SPEED := 900.0

var cw: CollisionWorld
var tr := Trace.new()
var pos := Vector3.ZERO
var prev := Vector3.ZERO
var vel := Vector3.ZERO
var yaw := 0.0
var pitch := 0.0
var ducked := false
var duck_amt := 0.0
var on_ground := false
var gn := Vector3.UP
var ground_surf := 0
var noclip := false
var stamina := 0.0
var max_speed := 225.0
var land_penalty := 0.0
var view_offset := 0.0
var land_kick := 0.0
var step_dist := 0.0
var spawns := 0                ## counts respawns and teleports (snapshots carry it)
var events: Array = []
var _pl: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO, Vector3.ZERO, Vector3.ZERO, Vector3.ZERO]


func _init(world: CollisionWorld = null) -> void:
	cw = world


func spawn(p: Vector3, y: float) -> void:
	spawns += 1
	vel = Vector3.ZERO
	yaw = y
	pitch = 0.0
	ducked = false
	duck_amt = 0.0
	noclip = false
	view_offset = 0.0
	land_kick = 0.0
	stamina = 0.0
	land_penalty = 0.0
	var t := trace(p + Vector3(0, 4, 0), p + Vector3(0, -64, 0), false)
	pos = Vector3(p.x, p.y + 4.0 if t.startsolid else t.endpos.y, p.z)
	prev = pos
	categorize()


func speed() -> float:
	return Vector2(vel.x, vel.z).length()


## Hull trace with feet positions (endpos converted back to feet).
func trace(s: Vector3, e: Vector3, duck: bool = ducked) -> Trace:
	var hh := (DUCK_H if duck else STAND_H) * 0.5
	var o := Vector3(0, hh, 0)
	cw.trace(tr, s + o, e + o, Vector3(HALF, hh, HALF), CollisionWorld.MASK_PLAYER)
	tr.endpos.y -= hh
	return tr


func fits(p: Vector3, duck: bool) -> bool:
	return not trace(p, p, duck).startsolid


## Absorb an instant origin change into the camera smoothing.
func shift_view(dy: float) -> void:
	view_offset -= dy
	prev.y += dy


func tick(cmd: Dictionary, dt: float) -> void:
	prev = pos
	if noclip:
		noclip_move(cmd, dt)
		return
	check_duck(cmd)
	stamina = maxf(0.0, stamina - 80.0 * dt)
	land_penalty = maxf(0.0, land_penalty - dt * 2.5)
	var scale := (DUCK_FRAC if ducked else (WALK_FRAC if cmd.walk else 1.0)) * (1.0 - stamina / 100.0)
	var maxspeed := max_speed * scale
	var sy := sin(yaw)
	var cy := cos(yaw)
	var fwd: float = cmd.fwd
	var side: float = cmd.side
	var wx := -sy * fwd + cy * side
	var wz := -cy * fwd - sy * side
	var wl := Vector2(wx, wz).length()
	if wl > 1e-6:
		wx /= wl
		wz /= wl
	var wishspeed := maxspeed * minf(1.0, wl) if wl > 1e-6 else 0.0

	if not on_ground:
		vel.y -= GRAVITY * dt * 0.5
	if cmd.jump and on_ground:
		do_jump(dt)
	if on_ground:
		friction(dt)
		accelerate(wx, wz, wishspeed, dt)
		vel.y = 0.0
		var sp := speed()
		if sp > maxspeed and maxspeed > 0.0:
			var k := maxspeed / sp
			vel.x *= k
			vel.z *= k
		walk_move(dt)
	else:
		air_accelerate(wx, wz, wishspeed, dt)
		slide_move(dt)
	var was_ground := on_ground
	var fall_v := -vel.y
	categorize()
	if not was_ground and on_ground:
		on_land(fall_v)
	if not on_ground:
		vel.y -= GRAVITY * dt * 0.5
	else:
		vel.y = 0.0
	if on_ground:
		var hs := speed()
		step_dist += hs * dt
		if step_dist > 76.0:
			step_dist = 0.0
			if hs > 150.0 and not ducked and not cmd.walk:
				events.append({"type": "step", "surf": ground_surf})


func do_jump(dt: float) -> void:
	var hs := speed()
	var cap := max_speed * 1.1
	if hs > cap:
		var k := cap / hs
		vel.x *= k
		vel.z *= k
	vel.y = JUMP_SPEED - GRAVITY * dt * 0.5
	on_ground = false
	stamina = minf(stamina + 12.0, 45.0)
	events.append({"type": "jump"})


func on_land(fall_v: float) -> void:
	if fall_v > 170.0:
		events.append({"type": "land", "speed": fall_v, "surf": ground_surf})
		land_kick = minf(fall_v / 60.0, 9.0)
	stamina = minf(stamina + clampf(fall_v / 28.0, 0.0, 22.0), 45.0)
	land_penalty = maxf(land_penalty, clampf(fall_v / 420.0, 0.0, 1.0))


func friction(dt: float) -> void:
	var sp := speed()
	if sp < 0.1:
		vel.x = 0.0
		vel.z = 0.0
		return
	var control := STOP_SPEED if sp < STOP_SPEED else sp
	var k := maxf(sp - control * FRICTION * dt, 0.0) / sp
	vel.x *= k
	vel.z *= k


func accelerate(wx: float, wz: float, wishspeed: float, dt: float) -> void:
	var add := wishspeed - (vel.x * wx + vel.z * wz)
	if add <= 0.0:
		return
	# acceleration uses the weapon's full speed (walk/crouch only lower the cap)
	var a := minf(ACCEL * dt * max_speed, add)
	vel.x += a * wx
	vel.z += a * wz


func air_accelerate(wx: float, wz: float, wishspeed: float, dt: float) -> void:
	var capped := minf(wishspeed, AIR_CAP)
	var add := capped - (vel.x * wx + vel.z * wz)
	if add <= 0.0:
		return
	var a := minf(AIR_ACCEL * wishspeed * dt, add)
	vel.x += a * wx
	vel.z += a * wz


func walk_move(dt: float) -> void:
	if speed() < 1.0:
		vel.x = 0.0
		vel.z = 0.0
		return
	var t := trace(pos, pos + Vector3(vel.x * dt, 0, vel.z * dt))
	if t.fraction == 1.0 and not t.startsolid:
		pos = t.endpos
		stay_on_ground()
		return
	step_move(dt)
	stay_on_ground()


func step_move(dt: float) -> void:
	var o := pos
	var ov := vel
	slide_move(dt)
	var down_pos := pos
	var down_vel := vel
	pos = o
	vel = ov
	var t := trace(o, o + Vector3(0, STEP + CollisionWorld.EPS, 0))
	if not t.startsolid and not t.allsolid:
		pos.y = t.endpos.y
	slide_move(dt)
	t = trace(pos, pos - Vector3(0, STEP + CollisionWorld.EPS, 0))
	if not t.startsolid and not t.allsolid:
		pos = t.endpos
	if t.fraction == 1.0 or t.normal.y < MIN_WALK_NORMAL:
		pos = down_pos
		vel = down_vel
		return
	var up_dist := (pos.x - o.x) ** 2 + (pos.z - o.z) ** 2
	var dn_dist := (down_pos.x - o.x) ** 2 + (down_pos.z - o.z) ** 2
	if dn_dist > up_dist:
		pos = down_pos
		vel = down_vel
	else:
		vel.y = down_vel.y
		var up := pos.y - o.y
		if up > 2.0:
			shift_view(up)


func stay_on_ground() -> void:
	var t := trace(pos, pos + Vector3(0, 2, 0))
	var sy := t.endpos.y
	t = trace(Vector3(pos.x, sy, pos.z), pos - Vector3(0, STEP, 0))
	if t.fraction > 0.0 and t.fraction < 1.0 and not t.startsolid and t.normal.y >= MIN_WALK_NORMAL:
		var d := t.endpos.y - pos.y
		if absf(d) > 0.01:
			pos.y = t.endpos.y
			if d < -2.0:
				shift_view(d)


func _clip(v: Vector3, n: Vector3) -> Vector3:
	var b := v.dot(n)
	b = b * 1.001 if b < 0.0 else b / 1.001
	return v - n * b


## Quake 3 PM_SlideMove (gravity handled by the caller).
func slide_move(dt: float) -> void:
	var np := 0
	if on_ground:
		_pl[0] = gn
		np = 1
	var vl := vel.length()
	if vl > 0.0:
		_pl[np] = vel / vl
		np += 1
	var time_left := dt
	for bump in 4:
		var t := trace(pos, pos + vel * time_left)
		if t.allsolid:
			vel.y = 0.0
			return
		if t.fraction > 0.0:
			pos = t.endpos
		if t.fraction == 1.0:
			break
		time_left -= time_left * t.fraction
		if np >= 5:
			vel = Vector3.ZERO
			return
		var dup := false
		for i in np:
			if t.normal.dot(_pl[i]) > 0.99:
				vel += t.normal
				dup = true
				break
		if dup:
			continue
		_pl[np] = t.normal
		np += 1
		for i in np:
			var pi := _pl[i]
			if vel.dot(pi) >= 0.1:
				continue
			var c := _clip(vel, pi)
			var stop := false
			for j in np:
				if j == i:
					continue
				var pj := _pl[j]
				if c.dot(pj) >= 0.1:
					continue
				c = _clip(c, pj)
				if c.dot(pi) >= 0.0:
					continue
				var dir := pi.cross(pj)
				var dl := dir.length()
				if dl < 1e-9:
					stop = true
					break
				dir /= dl
				c = dir * dir.dot(vel)
				for k in np:
					if k == i or k == j:
						continue
					if c.dot(_pl[k]) >= 0.1:
						continue
					stop = true
					break
				if stop:
					break
			if stop:
				vel = Vector3.ZERO
				return
			vel = c
			break


func categorize() -> void:
	if vel.y > 140.0:
		on_ground = false
		return
	var t := trace(pos, pos - Vector3(0, 2, 0))
	if t.fraction < 1.0 and not t.allsolid and t.normal.y >= MIN_WALK_NORMAL:
		on_ground = true
		gn = t.normal
		ground_surf = t.surf
		if t.fraction > 0.0:
			pos.y = t.endpos.y
	else:
		on_ground = false


func check_duck(cmd: Dictionary) -> void:
	var d := DUCK_DELTA
	if cmd.duck and not ducked:
		if not on_ground and fits(pos + Vector3(0, d, 0), true):
			pos.y += d
			shift_view(d)
		ducked = true
	elif not cmd.duck and ducked:
		if on_ground:
			if fits(pos, false):
				ducked = false
		elif fits(pos - Vector3(0, d, 0), false):
			pos.y -= d
			shift_view(-d)
			ducked = false
		elif fits(pos, false):
			ducked = false


func noclip_move(cmd: Dictionary, dt: float) -> void:
	var sp := NOCLIP_SPEED * (0.35 if cmd.walk else 1.0)
	var cp := cos(pitch); var spi := sin(pitch); var sy := sin(yaw); var cy := cos(yaw)
	var fwd: float = cmd.fwd
	var side: float = cmd.side
	var d := Vector3(-sy * cp * fwd + cy * side, spi * fwd + (1.0 if cmd.jumpHeld else 0.0) - (1.0 if cmd.duck else 0.0), -cy * cp * fwd - sy * side)
	if d.length() > 1e-6:
		d = d.normalized()
	vel = d * sp
	pos += vel * dt
	on_ground = false
	ducked = false


## Render-time smoothing (called every frame).
func update_view(dt: float) -> void:
	var target := 1.0 if ducked else 0.0
	duck_amt += clampf(target - duck_amt, -dt / 0.11, dt / 0.11)
	view_offset = U.damp(view_offset, 0.0, 14.0, dt)
	land_kick = U.damp(land_kick, 0.0, 8.0, dt)


func eye(alpha: float) -> Vector3:
	var e := lerpf(STAND_EYE, DUCK_EYE, U.smooth(0.0, 1.0, duck_amt))
	var p := prev.lerp(pos, alpha)
	p.y += e + view_offset - land_kick
	return p
