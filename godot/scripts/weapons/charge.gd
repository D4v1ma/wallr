class_name Charge
extends Weapon
## The charge: hold fire inside a bomb site, standing on the ground, for plantTime seconds.

var progress := 0.0
var site: Variant = null


func speed() -> float:
	return 0.0 if state == "plant" else float(def.maxSpeed)


func tick(cmd: Dictionary, pl: Player, _time: float, dt: float) -> void:
	base_tick(dt)
	common_states()
	var here: Variant = Bomb.site_at(pl.pos) if Bomb.can_plant() else null
	if state == "idle" and cmd.fire and here != null and pl.on_ground:
		state = "plant"
		t = 0.0
		site = here
		progress = 0.0
		play("plant", def.plantMarks)
		events.append({"type": "plantStart", "site": here})
	if state == "plant":
		progress = clampf(t / float(def.plantTime), 0.0, 1.0)
		if not cmd.fire or not pl.on_ground or here == null:
			state = "idle"
			progress = 0.0
			play("idle")
			events.append({"type": "plantAbort"})
		elif t >= float(def.plantTime):
			state = "planted"
			events.append({"type": "planted", "site": site})
