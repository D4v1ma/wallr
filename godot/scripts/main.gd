extends Node3D
## Boot and the frame loop: fixed 64 Hz simulation in _physics_process, interpolated rendering
## and mouse look every frame.
## Command line (after --): --map=depot  --pos=x,y,z --yaw=deg --pitch=deg  --shot=path.png  --quit=frames

var camera: Camera3D
var hud: Label
var _shot_frames := -1
var _frames := 0
var _fps_acc := 0.0
var _fps_n := 0
var _fps := 0.0


func _ready() -> void:
	Game.world_root = self
	camera = Camera3D.new()
	camera.near = 2.0
	camera.far = 14000.0
	camera.current = true
	add_child(camera)
	_build_hud()
	var key: String = Game.args.get("map", "range")
	var L := Game.load_level(key)
	var p := Game.player
	var s: Dictionary = L.spawns[0] if not L.spawns.is_empty() else L.team_spawn(1, 0)
	p.spawn(U.v3(s.pos), float(s.yaw))
	if Game.args.has("pos"):
		var c: PackedStringArray = String(Game.args.pos).split(",")
		p.spawn(Vector3(float(c[0]), float(c[1]), float(c[2])), p.yaw)
	if Game.args.has("yaw"):
		p.yaw = deg_to_rad(float(Game.args.yaw))
	if Game.args.has("pitch"):
		p.pitch = deg_to_rad(float(Game.args.pitch))
	if Game.args.has("shot"):
		_shot_frames = int(Game.args.get("frames", "8"))
		p.noclip = true
	Game.state = "play"
	_update_fov()
	Settings.changed.connect(func(_k: String, _v: Variant) -> void: _update_fov())
	if not Game.args.has("shot"):
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _exit_tree() -> void:
	if Game.L:
		Game.L.unload()
		Game.L = null


func _update_fov() -> void:
	camera.fov = U.vfov_from(float(Settings.get_value("fov")))


func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(12, 8)
	hud.add_theme_font_size_override("font_size", 14)
	hud.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	hud.add_theme_constant_override("outline_size", 4)
	layer.add_child(hud)
	var xh := ColorRect.new()
	xh.color = Color(0.3, 1.0, 0.42)
	xh.size = Vector2(2, 2)
	xh.set_anchors_preset(Control.PRESET_CENTER)
	xh.position -= Vector2(1, 1)
	layer.add_child(xh)


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and not Game.args.has("shot"):
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	if e is InputEventKey and e.pressed and e.physical_keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _physics_process(_delta: float) -> void:
	if Game.state != "play" or Game.L == null:
		return
	var p := Game.player
	var cmd := Controls.build_cmd()
	if Controls.pressed("noclip"):
		p.noclip = not p.noclip
	p.tick(cmd, Game.DT)
	for ev: Dictionary in p.events:
		match ev.type:
			"step": Snd.footstep(U.surf_name(ev.surf))
			"jump": Snd.jump()
			"land": Snd.land(U.surf_name(ev.surf), ev.speed)
	p.events.clear()
	if cmd.use:
		var d := Ents.door_in_reach(p.eye(1.0), U.view_dir(p.yaw, p.pitch))
		if d:
			d.toggle(p.pos)
	Ents.tick(Game.DT, [p])
	Game.time += Game.DT
	Game.ticks += 1


func _process(dt: float) -> void:
	if Game.L == null:
		return
	var p := Game.player
	var look := Controls.take_look()
	p.yaw -= deg_to_rad(look.x)
	p.pitch = clampf(p.pitch - deg_to_rad(look.y), deg_to_rad(-89.0), deg_to_rad(89.0))
	p.update_view(dt)
	var alpha := Engine.get_physics_interpolation_fraction()
	camera.global_transform = Transform3D(Basis.from_euler(Vector3(p.pitch, p.yaw, 0.0), EULER_ORDER_YXZ), p.eye(alpha))
	Ents.render(alpha)
	_fps_acc += dt
	_fps_n += 1
	if _fps_acc >= 0.5:
		_fps = _fps_n / _fps_acc
		_fps_acc = 0.0
		_fps_n = 0
	hud.text = "%s  ·  %d fps  ·  %d u/s%s\n%.0f %.0f %.0f" % [Game.L.name, _fps, roundi(p.speed()), "  ·  noclip" if p.noclip else "", p.pos.x, p.pos.y, p.pos.z]
	_frames += 1
	if _shot_frames >= 0 and _frames >= _shot_frames:
		var img := get_viewport().get_texture().get_image()
		img.save_png(String(Game.args.shot))
		print("saved ", Game.args.shot)
		get_tree().quit()
