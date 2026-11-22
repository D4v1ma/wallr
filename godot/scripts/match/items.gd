extends Node
## Weapons on the ground: thrown with G, dropped on death, picked up by walking over them (into an
## empty slot) or swapped with E. The charge is an item too while nobody carries it; only Raiders take it.

const HALF := Vector3(4, 1.5, 4)

var list: Array = []
var tr := Trace.new()


func init() -> void:
	clear()


func clear() -> void:
	for it: Dictionary in list:
		if it.node != null and is_instance_valid(it.node):
			(it.node as Node3D).queue_free()
	list.clear()


func spawn(w: Weapon, pos: Vector3, vel: Vector3, yaw: float, owner: Actor) -> Dictionary:
	var it := {"w": w, "id": w.id, "p": pos, "v": vel, "yaw": yaw, "roll": 0.0, "spin": Vector2((randf() - 0.5) * 10.0, (randf() - 0.5) * 6.0),
		"rest": false, "age": 0.0, "owner": owner, "node": null, "mat": null}
	list.append(it)
	if Game.L and Game.L.root:
		var mi := MeshInstance3D.new()
		mi.mesh = Models.weapon_mesh(w.id)[0]
		var mat := Models.world_material("gun_metal", true)
		mi.material_override = mat
		mi.rotation_order = EULER_ORDER_YXZ
		Game.L.root.add_child(mi)
		it.node = mi
		it.mat = mat
	return it


func remove(it: Dictionary) -> void:
	list.erase(it)
	if it.node != null and is_instance_valid(it.node):
		(it.node as Node3D).queue_free()


## Throw a weapon out of an actor's hands. toss=false lets it fall at the body (deaths).
func drop(actor: Actor, w: Weapon, toss: bool = true) -> Variant:
	if w == null or w is Knife or w is Grenade or w.state == "plant":
		return null
	var pl := actor.player
	var eye := actor.eye()
	var f := actor.view_dir()
	var cw := Game.L.cw
	actor.loadout.remove(w)
	if w is Charge:
		(w as Charge).progress = 0.0
	var pos: Vector3
	if toss:
		pos = Vector3(eye.x + f.x * 14.0, eye.y - 10.0, eye.z + f.z * 14.0)
	else:
		pos = Vector3(pl.pos.x + (randf() - 0.5) * 10.0, pl.pos.y + 30.0, pl.pos.z + (randf() - 0.5) * 10.0)
	cw.trace(tr, pl.pos + Vector3(0, 36, 0), pos, HALF, CollisionWorld.MASK_SHOT)
	if tr.fraction < 1.0:
		pos = tr.endpos
	var sp := 250.0
	var vel: Vector3
	if toss:
		vel = Vector3(f.x * sp + pl.vel.x * 0.6, maxf(f.y, -0.2) * sp + 110.0, f.z * sp + pl.vel.z * 0.6)
	else:
		vel = Vector3((randf() - 0.5) * 70.0 + pl.vel.x * 0.3, 70.0, (randf() - 0.5) * 70.0 + pl.vel.z * 0.3)
	var it := spawn(w, pos, vel, pl.yaw + (randf() - 0.5) * 0.6, actor)
	if w is Charge:
		Bomb.on_drop(actor, it)
	return it


func near(a: Actor, it: Dictionary, r: float) -> bool:
	var p := a.player.pos
	var ip: Vector3 = it.p
	return Vector2(ip.x - p.x, ip.z - p.z).length() < r and ip.y > p.y - 10.0 and ip.y < p.y + 72.0


## Walking over an item takes it only into an empty slot (never back right after dropping it).
func can_auto(a: Actor, it: Dictionary) -> bool:
	if it.owner == a and float(it.age) < 1.5:
		return false
	var w: Weapon = it.w
	if w is Charge:
		return a.team == 0
	return a.loadout.by_slot(int(w.def.slot)) == null


func pick(a: Actor, it: Dictionary) -> void:
	remove(it)
	var w: Weapon = it.w
	a.loadout.give(w, true)
	if a.is_me:
		Snd.pickup()
		HUD.note("Picked up %s" % w.def.name)
	if w is Charge:
		Bomb.on_pickup(a)


## The item an actor is looking at, within reach and in plain view.
func look_at_item(a: Actor, reach: float = 100.0) -> Dictionary:
	var eye := a.eye()
	var d := a.view_dir()
	var best := {}
	var best_score := INF
	for it: Dictionary in list:
		if it.w is Charge and a.team != 0:
			continue
		var to: Vector3 = (it.p as Vector3) - eye
		var dist := maxf(to.length(), 1.0)
		if dist > reach:
			continue
		var c := to.dot(d) / dist
		if c < 0.88:
			continue
		var score := dist * (2.2 - c)
		if score < best_score:
			best_score = score
			best = it
	if not best.is_empty():
		var to2: Vector3 = (best.p as Vector3) - eye
		var len := to2.length()
		var hit := Game.L.cw.ray(eye, to2 / len, len, CollisionWorld.MASK_SHOT) if len > 0.0 else -1.0
		if hit >= 0.0 and hit < len * 0.97:
			best = {}
	return best


## E: swap the weapon in that slot for the one you are looking at.
func use(a: Actor) -> bool:
	var it := look_at_item(a)
	if it.is_empty():
		return false
	var old := a.loadout.by_slot(int((it.w as Weapon).def.slot))
	if old and not (old is Knife) and not (old is Grenade):
		drop(a, old, true)
	pick(a, it)
	return true


func tick(dt: float, max_age: float = 0.0) -> void:
	var cw := Game.L.cw
	for it: Dictionary in list:
		it.age += dt
		if it.rest:
			continue
		var v: Vector3 = it.v
		v.y -= 800.0 * dt
		var p: Vector3 = it.p
		cw.trace(tr, p, p + v * dt, HALF, CollisionWorld.MASK_SHOT)
		if tr.startsolid:
			it.p = p + Vector3(0, 4, 0)
			it.v = v
			continue
		it.p = tr.endpos
		if tr.fraction < 1.0:
			var n := tr.normal
			var vn := v.dot(n)
			v -= 1.35 * vn * n
			v *= 0.5
			it.spin = Vector2(it.spin.x * 0.4, it.spin.y * 0.6)
			if -vn > 70.0:
				Snd.item_drop(it.p, (it.w as Weapon).kind)
			if n.y > 0.7 and v.length() < 45.0:
				it.rest = true
				v = Vector3.ZERO
		it.v = v
		if not it.rest:
			it.yaw += it.spin.y * dt
			it.roll += it.spin.x * dt
	for a: Actor in Actors.list:
		if not a.alive:
			continue
		for it: Dictionary in list.duplicate():
			if near(a, it, 36.0) and can_auto(a, it):
				pick(a, it)
	if max_age > 0.0:
		for it: Dictionary in list.duplicate():
			if float(it.age) > max_age and not (it.w is Charge):
				remove(it)


func render() -> void:
	for it: Dictionary in list:
		var m: Node3D = it.node
		if m == null:
			continue
		var flat: bool = it.w is Charge
		var p: Vector3 = it.p
		if it.rest:
			m.position = Vector3(p.x, p.y - HALF.y + (0.75 if flat else 0.7), p.z)
			m.rotation = Vector3(0, it.yaw, 0.0 if flat else PI / 2.0)
		else:
			m.position = p
			m.rotation = Vector3(float(it.roll) * 0.3, it.yaw, float(it.roll) * 0.2 if flat else float(it.roll))
		var lc := FX.light_at(p + Vector3(0, 8, 0))
		(it.mat as ShaderMaterial).set_shader_parameter("color", Vector3(lc.r, lc.g, lc.b))
