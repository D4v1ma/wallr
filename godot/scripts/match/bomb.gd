extends Node
## The charge: who carries it, planting at A or B, the 40 s fuse, defusing and the blast.
## States: none -> carried <-> dropped -> planted -> defused | exploded.

const FUSE := 40.0
const DEFUSE := 10.0
const KIT_DEFUSE := 5.0
const DAMAGE := 500.0
const SIGMA := 480.0
const REACH := 64.0
const BLAST := {"id": "blast", "name": "THE CHARGE", "armorPen": 0.6, "killReward": 0}

var state := "none"
var carrier: Actor = null
var item: Dictionary = {}
var pos: Variant = null
var site: Variant = null
var timer := 0.0
var planter: Actor = null
var defuser: Actor = null
var defuse_t := 0.0
var defuse_dur := DEFUSE
var beep_t := 0.0
var led_t := 0.0
var node: Node3D = null
var led: MeshInstance3D = null
var planted_at := 0.0


func reset() -> void:
	if node and is_instance_valid(node):
		node.queue_free()
	node = null
	led = null
	state = "none"
	carrier = null
	item = {}
	pos = null
	site = null
	timer = 0.0
	planter = null
	defuser = null
	defuse_t = 0.0


func sites() -> Array:
	return Game.L.sites if Game.L else []


func site_at(p: Vector3) -> Variant:
	for s: Dictionary in sites():
		var lo: Array = s.min
		var hi: Array = s.max
		if p.x >= lo[0] and p.x <= hi[0] and p.z >= lo[2] and p.z <= hi[2] and p.y >= lo[1] and p.y <= hi[1]:
			return s
	return null


func site_by_name(n: String) -> Variant:
	for s: Dictionary in sites():
		if s.name == n:
			return s
	return null


## Planting only while a round is being played (any time outside defuse mode).
func can_plant() -> bool:
	return not Match.active or Match.phase == "live"


## Where the charge is right now, whoever has it.
func where() -> Variant:
	if state == "carried" and carrier:
		return carrier.player.pos
	if state == "dropped" and not item.is_empty():
		return item.p
	return pos


func assign(actor: Actor) -> void:
	actor.loadout.give("charge", false)
	state = "carried"
	carrier = actor
	item = {}


func on_drop(actor: Actor, it: Dictionary) -> void:
	state = "dropped"
	carrier = null
	item = it
	if Actors.me and Actors.me.team == 0:
		HUD.note("You dropped the charge" if actor.is_me else "The charge was dropped")


func on_pickup(actor: Actor) -> void:
	state = "carried"
	carrier = actor
	item = {}
	if actor.is_me:
		HUD.note("You have the charge: plant it at A or B (hold fire)")


func plant(actor: Actor, w: Weapon, s: Variant) -> void:
	actor.loadout.remove(w)
	var p := actor.player.pos
	state = "planted"
	carrier = null
	item = {}
	pos = p
	site = s
	timer = FUSE
	beep_t = 0.4
	planter = actor
	planted_at = Game.time
	if Game.L and Game.L.root:
		var mi := MeshInstance3D.new()
		mi.mesh = Models.weapon_mesh("charge")[0]
		var mat := Models.world_material("gun_metal", true)
		var lc := FX.light_at(p + Vector3(0, 8, 0))
		mat.set_shader_parameter("color", Vector3(lc.r, lc.g, lc.b))
		mi.material_override = mat
		mi.position = p + Vector3(0, 0.75, 0)
		mi.rotation.y = actor.player.yaw
		Game.L.root.add_child(mi)
		node = mi
		led = MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.4, 0.3, 0.4)
		led.mesh = box
		var lm := Models.world_material("")
		lm.set_shader_parameter("unlit", true)
		lm.set_shader_parameter("color", Vector3(1.0, 0.165, 0.094))
		led.material_override = lm
		led.position = Vector3(1.75, 1.45, -0.55)
		mi.add_child(led)
	Snd.armed(pos)
	Match.on_plant(actor, s)


func can_defuse(a: Actor) -> bool:
	if state != "planted" or not a.alive or a.team != 1 or not a.player.on_ground:
		return false
	var p := a.player.pos
	var bp: Vector3 = pos
	return Vector2(p.x - bp.x, p.z - bp.z).length() < REACH and absf(p.y - bp.y) < 40.0


func defusing(a: Actor) -> bool:
	return defuser == a


## Per actor and tick: holding use near the planted charge defuses it (and pins you in place).
func control(a: Actor, cmd: Dictionary, dt: float) -> void:
	if defuser == a:
		if not cmd.useHeld or not can_defuse(a):
			defuser = null
			defuse_t = 0.0
			return
		defuse_t += dt
		if defuse_t >= defuse_dur:
			defuse(a)
	elif defuser == null and cmd.useHeld and can_defuse(a):
		defuser = a
		defuse_t = 0.0
		defuse_dur = KIT_DEFUSE if a.kit else DEFUSE
		Snd.defuse_start(pos)


func defuse(a: Actor) -> void:
	state = "defused"
	defuser = null
	if led:
		led.visible = false
	Snd.defused(pos)
	Match.on_defuse(a)


func tick(dt: float) -> void:
	if state != "planted":
		return
	if defuser and not defuser.alive:
		defuser = null
		defuse_t = 0.0
	timer -= dt
	beep_t -= dt
	led_t -= dt
	if beep_t <= 0.0:
		var f := clampf(timer / FUSE, 0.0, 1.0)
		beep_t = 0.12 if timer < 2.0 else 0.16 + 0.84 * f
		Snd.beep(pos, 1.0 - f)
		led_t = 0.07
		FX.add_light((pos as Vector3) + Vector3(0, 4, 0), Color(1, 0.12, 0.06), 70.0, 0.08)
	if timer <= 0.0:
		explode()


func explode() -> void:
	state = "exploded"
	defuser = null
	var c: Vector3 = (pos as Vector3) + Vector3(0, 16, 0)
	var s2 := 2.0 * SIGMA * SIGMA
	for a: Actor in Actors.list:
		if not a.alive:
			continue
		var p := a.player.pos + Vector3(0, 36, 0)
		var dmg := DAMAGE * exp(-p.distance_squared_to(c) / s2)
		if dmg >= 1.0:
			a.damage(dmg, "chest", null, BLAST, c)
	if node and is_instance_valid(node):
		node.queue_free()
	node = null
	led = null
	FX.explosion(c)
	if Game.player:
		Game.shake = maxf(Game.shake, clampf(1.6 - Vector2(Game.player.pos.x - c.x, Game.player.pos.z - c.z).length() / 1600.0, 0.25, 1.4))
	Snd.explosion(c)
	Match.on_explode()


func render() -> void:
	if led:
		led.visible = state == "planted" and led_t > 0.0
