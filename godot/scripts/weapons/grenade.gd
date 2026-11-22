class_name Grenade
extends Weapon
## Smoke grenade: hold to pull the pin (Mouse 1 overhand, Mouse 2 underhand lob), release to throw.

var count := 1
var mode := "over"
var restock_t := 0.0
var released := false


func draw() -> void:
	if count > 0:
		super()


func tick(cmd: Dictionary, _pl: Player, _time: float, dt: float) -> void:
	base_tick(dt)
	var held: bool = cmd.fire or cmd.alt
	common_states()
	if state == "idle" and held:
		mode = "under" if cmd.alt and not cmd.fire else "over"
		state = "pull"
		t = 0.0
		play("pullOver" if mode == "over" else "pullUnder", [[0.12, "pin"]])
	elif state == "pull" and t >= float(def.pullTime):
		state = "ready"
		t = 0.0
	if state == "ready" and not held:
		state = "throw"
		t = 0.0
		released = false
		play("throwOver" if mode == "over" else "throwUnder", [[0.0, "throw"]])
	if state == "throw":
		if not released and t >= float(def.releaseAt):
			released = true
			count -= 1
			events.append({"type": "throwNade", "mode": mode})
		if t >= float(def.throwTime):
			if count > 0:
				draw()
			else:
				state = "empty"
				events.append({"type": "switchAway"})
