class_name Knife
extends Weapon
## Slash (Mouse 1, alternating sides) and stab (Mouse 2); the hit lands after a short delay.

var next_attack := 0.0
var pending: Dictionary = {}
var flip := false
var attack_dur := 0.0


func tick(cmd: Dictionary, _pl: Player, time: float, dt: float) -> void:
	base_tick(dt)
	common_states()
	if state == "attack":
		if not pending.is_empty() and t >= float(pending.delay):
			var e := pending.duplicate()
			e.type = "knifeHit"
			events.append(e)
			pending = {}
		if t >= attack_dur:
			state = "idle"
	if cmd.inspect:
		start_inspect()
	var ready := (state == "idle" or state == "inspect") and time >= next_attack
	if ready and (cmd.fire or cmd.alt):
		var heavy: bool = cmd.alt
		var a: Dictionary = def.stab if heavy else def.slash
		state = "attack"
		t = 0.0
		attack_dur = float(a.interval)
		next_attack = time + attack_dur
		pending = {"heavy": heavy, "range": float(a.range), "damage": float(a.damage), "delay": float(a.delay)}
		play("stab" if heavy else ("slashR" if flip else "slashL"))
		if not heavy:
			flip = not flip
		events.append({"type": "swing", "heavy": heavy})
