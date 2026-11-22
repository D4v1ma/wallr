class_name Gun
extends Weapon
## Firearms: spray pattern + jitter, inaccuracy from movement/air/landing/firing, scoping in (ADS),
## the sniper scope levels, magazine and shell-by-shell reloads.

var ammo := 0
var reserve := 0
var next_fire := 0.0
var fire_inacc := 0.0
var spray_idx := 0.0
var jit := Vector2.ZERO
var trigger_held := true
var empty_reload := false
var slide_locked := false
var last_shot := -9.0
var shot_count := 0
var heat := 0.0
var reload_dur := 0.0
var rnd: U.Rng
var zoom := 0
var zoom_resume := 0
var alt_held := true
var reload_phase := ""
var phase_t := 0.0
var reload_abort := false
var end_dur := 0.0


func _init(d: Dictionary) -> void:
	super(d)
	ammo = int(d.mag)
	reserve = int(d.reserve)
	rnd = U.Rng.new(int(d.slot) * 977 + int(d.mag))


func spread_base() -> float:
	return float(def.spread) * (1.0 - (1.0 - ADS.spread) * ads)


func speed() -> float:
	var base := float(def.scopedSpeed) if zoom > 0 and def.has("scopedSpeed") else float(def.maxSpeed)
	return base * (1.0 - (1.0 - ADS.speed) * ads)


## Horizontal 4:3 FOV while scoped in with Mouse 2 (0 when not).
func ads_fov() -> float:
	if ads <= 0.001:
		return 0.0
	return float(Settings.get_value("fov")) * (1.0 - (1.0 - ADS.zoom) * U.smooth(0.0, 1.0, ads))


## Horizontal 4:3 FOV of the current sniper scope level (0 when not zoomed).
func scope_fov() -> float:
	if zoom > 0 and def.has("scope"):
		return float(def.scope[zoom - 1])
	return 0.0


func draw() -> void:
	super()
	trigger_held = true
	alt_held = true
	zoom = 0
	zoom_resume = 0
	ads = 0.0


func holster() -> void:
	super()
	zoom = 0
	zoom_resume = 0
	reload_phase = ""
	ads = 0.0


func inaccuracy(pl: Player) -> float:
	var scoped := zoom > 0
	var a: float
	if scoped:
		a = float(def.inScopedCrouch) if pl.ducked else float(def.inScoped)
	else:
		a = float(def.inCrouch) if pl.ducked else float(def.inStand)
	var ms := float(def.maxSpeed)
	a += float(def.inMove) * U.smooth(ms * 0.34, ms * 0.95, pl.speed())
	if not pl.on_ground and not pl.noclip:
		a += float(def.inAir)
	return (a + float(def.inLand) * pl.land_penalty + fire_inacc) * (1.0 - (1.0 - ADS.inacc) * ads)


func start_reload() -> void:
	var r: Dictionary = def.reload
	zoom = 0
	zoom_resume = 0
	empty_reload = ammo == 0
	state = "reload"
	t = 0.0
	if def.has("shellReload"):
		var sr: Dictionary = def.shellReload
		var n := mini(int(def.mag) - ammo, reserve)
		reload_phase = "start"
		phase_t = 0.0
		reload_abort = false
		reload_dur = float(sr.start) + float(sr.each) * n + (float(sr.end) if empty_reload else float(sr.endQuick))
		play("reloadStart")
	else:
		reload_dur = float(r.empty) if empty_reload else float(r.time)
		if empty_reload:
			play("reloadEmpty", (r.marks as Array) + (r.emptyMarks as Array))
		else:
			play("reload", r.marks)
	events.append({"type": "reload"})


func shell_reload_tick(cmd: Dictionary, dt: float) -> void:
	var sr: Dictionary = def.shellReload
	phase_t += dt
	if cmd.fire and ammo > 0:
		reload_abort = true      # firing interrupts after the current shell
	if reload_phase == "start" and phase_t >= float(sr.start):
		reload_phase = "shell"
		phase_t = 0.0
		play("reloadShell", sr.shellMarks)
	elif reload_phase == "shell" and phase_t >= float(sr.each):
		ammo += 1
		reserve -= 1
		phase_t = 0.0
		if ammo < int(def.mag) and reserve > 0 and not reload_abort:
			play("reloadShell", sr.shellMarks)
		else:
			# back to the shoulder; pump to chamber a round if the gun ran dry
			reload_phase = "end"
			end_dur = float(sr.end) if empty_reload else float(sr.endQuick)
			play("reloadEndPump" if empty_reload else "reloadEnd", sr.endMarks if empty_reload else null)
	elif reload_phase == "end" and phase_t >= end_dur:
		state = "idle"
		reload_phase = ""
		play("idle")


func tick(cmd: Dictionary, pl: Player, time: float, dt: float) -> void:
	base_tick(dt)
	var rc: Dictionary = def.recoil
	var interval := 60.0 / float(def.rpm)
	fire_inacc *= exp(-dt * 2.3 / (float(def.recoverCrouch) if pl.ducked else float(def.recoverStand)))
	heat = maxf(0.0, heat - dt * 0.5)
	if time - last_shot > interval * 1.25:
		spray_idx = maxf(0.0, spray_idx - dt * float(rc.recover))
	var P := Weapon.pattern_at(rc.pattern, maxf(0.0, spray_idx - 1.0))
	var fade := clampf(spray_idx, 0.0, 1.0)
	recoil = P + jit * fade

	common_states()
	if state == "reload":
		if def.has("shellReload"):
			shell_reload_tick(cmd, dt)
		elif t >= reload_dur:
			var take := mini(int(def.mag) - ammo, reserve)
			ammo += take
			reserve -= take
			state = "idle"
			slide_locked = false
	var ready := state == "idle" or state == "inspect"
	# scope: secondary fire steps through the zoom levels; the bolt cycle drops it and brings it back
	if def.has("scope"):
		var press: bool = cmd.alt and not alt_held
		if press and zoom_resume > 0:
			zoom_resume = 0
		elif press and ready:
			zoom = (zoom + 1) % ((def.scope as Array).size() + 1)
			state = "idle"
			events.append({"type": "zoom", "level": zoom})
		if zoom_resume > 0 and ready and time >= next_fire - 0.08:
			zoom = zoom_resume
			zoom_resume = 0
			events.append({"type": "zoom", "level": zoom})
	alt_held = cmd.alt
	# scope in (every gun without a real scope): hold Mouse 2; reloading drops it
	var ads_want: bool = not def.has("scope") and cmd.alt and (ready or state == "draw")
	if ads_want and state == "inspect":
		state = "idle"
	ads = minf(1.0, ads + dt / ADS.time) if ads_want else maxf(0.0, ads - dt / (ADS.time * 0.8))
	if cmd.reload and ready and ammo < int(def.mag) and reserve > 0:
		start_reload()
	elif cmd.inspect and zoom == 0 and ads < 0.05:
		start_inspect()
	if cmd.fire and (state == "idle" or state == "inspect") and time >= next_fire and (def.auto or not trigger_held):
		if ammo > 0:
			fire(pl, time, interval)
		else:
			events.append({"type": "dry"})
			next_fire = time + 0.25
			if reserve > 0:
				start_reload()
	trigger_held = cmd.fire


func fire(pl: Player, time: float, interval: float) -> void:
	var rc: Dictionary = def.recoil
	state = "idle"
	ammo -= 1
	next_fire = next_fire + interval if time - next_fire < interval * 1.5 else time + interval
	var idx := spray_idx
	var P := Weapon.pattern_at(rc.pattern, idx)
	var js := float(rc.jitter) * minf(1.0, 0.3 + idx * 0.1)
	jit = Vector2((rnd.next() - 0.5) * 2.0 * js, (rnd.next() - 0.5) * 2.8 * js)
	var off := P + jit
	recoil = off
	var every := int(def.tracerEvery)
	var tracer := every > 0 and shot_count % every == 0
	events.append({"type": "shot", "inacc": inaccuracy(pl), "off": off, "idx": int(floor(idx)), "tracer": tracer, "pellets": int(def.get("pellets", 1))})
	spray_idx = idx + 1.0
	shot_count += 1
	fire_inacc = minf(fire_inacc + float(def.inFire), float(def.inFireMax))
	last_shot = time
	last_shot_clock = clock
	view_kick = minf(view_kick + float(def.kick) * 0.3, 1.2)
	heat = minf(1.0, heat + 0.09)
	if ammo == 0 and id == "pistol":
		slide_locked = true
	if def.has("scope") and zoom > 0:
		zoom_resume = zoom if ammo > 0 else 0
		zoom = 0
	# pump and bolt guns cycle by hand after every shot (no cycle on the last round)
	play("fire" if ammo > 0 else "fireLast", def.get("fireMarks") if ammo > 0 else null)
