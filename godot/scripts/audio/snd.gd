extends Node
## Sound effects. Every effect was synthesised by the original WebAudio code and rendered offline
## (tools/godot-export.mjs) into a few random variants; here they play through pooled players:
## 2D for your own actions, 3D (inverse distance, like the original panner) for everything else.

const DIR := "res://assets/sounds/"
const POOL_2D := 16
const POOL_3D := 40

var streams: Dictionary = {}
var _p2: Array[AudioStreamPlayer] = []
var _p3: Array[AudioStreamPlayer3D] = []
var _i2 := 0
var _i3 := 0
var ready_ok := false
var listener_pos := Vector3.ZERO


func _ready() -> void:
	var idx: Variant = Assets.read_json(DIR + "sounds.json")
	if typeof(idx) != TYPE_DICTIONARY:
		return
	_setup_buses(float(idx.gain))
	for name: String in idx.sounds:
		var list: Array[AudioStream] = []
		for i in int(idx.sounds[name]):
			var s: AudioStream = load(DIR + "%s_%d.wav" % [name, i])
			if s:
				list.append(s)
		streams[name] = list
	for i in POOL_2D:
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		_p2.append(p)
	for i in POOL_3D:
		var p := AudioStreamPlayer3D.new()
		p.bus = "SFX"
		p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		p.unit_size = 100.0
		p.max_db = 0.0
		p.max_distance = 8000.0
		p.attenuation_filter_cutoff_hz = 9000.0
		p.attenuation_filter_db = -12.0
		p.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_DISABLED
		add_child(p)
		_p3.append(p)
	ready_ok = true
	set_volume()
	Settings.changed.connect(func(k: String, _v: Variant) -> void:
		if k == "volume":
			set_volume())


## Master: compressor like the original (-12 dB, 4:1); SFX bus undoes the export headroom.
func _setup_buses(gain: float) -> void:
	if AudioServer.get_bus_index("SFX") >= 0:
		return
	var comp := AudioEffectCompressor.new()
	comp.threshold = -12.0
	comp.ratio = 4.0
	comp.attack_us = 2000.0
	comp.release_ms = 160.0
	AudioServer.add_bus_effect(0, comp)
	var lim := AudioEffectHardLimiter.new()
	AudioServer.add_bus_effect(0, lim)
	AudioServer.add_bus(1)
	AudioServer.set_bus_name(1, "SFX")
	AudioServer.set_bus_send(1, "Master")
	AudioServer.set_bus_volume_db(1, linear_to_db(1.0 / maxf(gain, 0.01)))


func set_volume() -> void:
	var v: float = float(Settings.get_value("volume")) / 100.0
	AudioServer.set_bus_volume_db(0, linear_to_db(maxf(v * v * 0.9, 0.00001)))


## Play effect `name` (random variant). pos null = non-positional.
func play(name: String, pos: Variant = null, vol: float = 1.0, pitch: float = 1.0) -> void:
	if not ready_ok or vol <= 0.0:
		return
	var list: Array = streams.get(name, [])
	if list.is_empty():
		return
	var s: AudioStream = list[randi() % list.size()]
	var db := linear_to_db(vol)
	if pos == null:
		var p := _p2[_i2]
		_i2 = (_i2 + 1) % POOL_2D
		p.stream = s
		p.volume_db = db
		p.pitch_scale = pitch
		p.play()
	else:
		var p3 := _p3[_i3]
		_i3 = (_i3 + 1) % POOL_3D
		p3.stream = s
		p3.volume_db = db
		p3.pitch_scale = pitch
		p3.global_position = pos
		p3.play()


static func _jit(a: float) -> float:
	return 1.0 + randf_range(-a, a)


# --- the original effect API -------------------------------------------------------------------

func shot(kind: String, pos: Variant = null, supp: bool = false) -> void:
	if supp:
		play("supp_" + ("sniper" if kind == "sniper" else "pistol" if kind == "pistol" else "rifle"), pos)
	elif kind in ["pistol", "smg", "shotgun", "sniper"]:
		play("shot_" + kind, pos, 1.0, _jit(0.02))
	else:
		play("shot_rifle", pos, 1.0, _jit(0.02))


func wallbang(pos: Variant = null) -> void: play("wallbang", pos)


func footstep(surf: String, vol: float = 1.0, pos: Variant = null) -> void:
	var k := vol * (1.4 if pos != null else 1.0)
	var n := "step_concrete"
	match surf:
		"metal", "wood", "sand", "cloth", "tile":
			n = "step_" + surf
	play(n, pos, k)


func land(surf: String, speed: float) -> void:
	var k := clampf(speed / 450.0, 0.4, 1.6)
	footstep(surf, 1.2 * k)
	play("land", null, k)


func jump() -> void: play("jump")


func impact(surf: String, pos: Variant) -> void:
	match surf:
		"metal":
			play("impact_metal", pos)
			if randf() < 0.35:
				play("ricochet", pos)
		"wood", "paper":
			play("impact_wood", pos)
		"sand", "cloth":
			play("impact_sand", pos)
		_:
			play("impact_concrete", pos)


func ricochet(pos: Variant) -> void: play("ricochet", pos)
func plate(pos: Variant) -> void: play("plate", pos)
func dry() -> void: play("dry")


func reload(part: String) -> void:
	match part:
		"out": play("sfx_magout")
		"in": play("sfx_magin")
		"bolt": play("sfx_bolt")
		"cloth": play("sfx_cloth")


func door(pos: Variant, metal: bool, opening: bool) -> void:
	play("door_metal" if metal else ("door_wood_open" if opening else "door_wood_close"), pos)


func sfx(part: String) -> void: play("sfx_" + part)
func knife_swish(heavy: bool) -> void: play("swish_heavy" if heavy else "swish")


func knife_hit(surf: String, pos: Variant, heavy: bool) -> void:
	var k := 1.3 if heavy else 1.0
	match surf:
		"metal": play("knifehit_metal", pos, k)
		"wood", "paper": play("knifehit_wood", pos, k)
		"sand", "cloth": play("knifehit_sand", pos, k)
		_: play("knifehit_concrete", pos, k)


func nade_bounce(surf: String, speed: float, pos: Variant) -> void:
	var k := clampf(speed / 400.0, 0.25, 1.2)
	match surf:
		"sand", "cloth": play("bounce_soft", pos, k)
		"wood": play("bounce_wood", pos, k)
		_: play("bounce_hard", pos, k)


func smoke_pop(pos: Variant) -> void: play("smoke_pop", pos)


func shell(pos: Variant, kind: String, n: int, surf: String) -> void:
	var k := 1.0 if n == 0 else 0.55
	if surf == "sand" or surf == "cloth":
		play("shell_soft", pos, k)
	elif kind == "shotgun":
		play("shell_shotgun", pos, k)
	elif kind == "pistol":
		play("shell_pistol", pos, k, _jit(0.05))
	else:
		play("shell_rifle", pos, k, _jit(0.05))


func body_hit(pos: Variant, helmet: bool) -> void: play("bodyhit_helmet" if helmet else "bodyhit", pos)
func hurt() -> void: play("hurt")
func death(pos: Variant) -> void: play("death", pos)
func armed(pos: Variant) -> void: play("armed", pos)
func beep(pos: Variant, urgency: float) -> void: play("beep_%d" % clampi(roundi(urgency * 2.0), 0, 2), pos)
func defuse_start(pos: Variant) -> void: play("defuse_start", pos)
func defused(pos: Variant) -> void: play("defused", pos)
func explosion(pos: Variant) -> void: play("explosion", pos)
func buy() -> void: play("buy")
func round_go() -> void: play("round_go")
func round_end(won: bool) -> void: play("round_win" if won else "round_lose")
func pickup() -> void: play("pickup")
func item_drop(pos: Variant, kind: String) -> void: play("drop_heavy" if kind == "charge" else "drop", pos)
func ui() -> void: play("ui")
