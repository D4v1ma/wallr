extends Node
## First-person weapon: every viewmodel lives in its own small 3D world drawn over the main view
## (so it never clips into walls), posed from the base pose + the weapon's animation clip + kick,
## with bob, sway, scoping in (sights to the screen centre), attachments, camos, the muzzle flash.
## Lighting: the sun turned into view space (dimmed where your eye is in shade), a flash light, and
## the baked probe light at your eye as the indirect term.

const TICK := 1.0 / 64.0
const RAIL := {"rifle": 1.46, "pistol": 1.525, "smg": 1.425, "shotgun": 1.5}
const BUILD_ORDER := ["rifle", "pistol", "knife", "smoke", "smg", "shotgun", "sniper", "charge"]

var layer: CanvasLayer
var screen: TextureRect
var vp: SubViewport
var cam: Camera3D
var rig: Node3D
var vsun: DirectionalLight3D
var vflash: OmniLight3D
var venv: Environment
var models: Dictionary = {}
var shared: Dictionary = {}       ## shared materials by name
var cur: Dictionary = {}
var time := 0.0
var bob := 0.0
var sway := Vector2.ZERO
var kick := 0.0
var kick_roll := 0.0
var flash_t := 0.0
var flash_i := 0.0
var team := 1
var built := false


func build(parent: Node) -> void:
	if built and is_instance_valid(layer):
		return
	models.clear()
	shared.clear()
	cur = {}
	layer = CanvasLayer.new()
	layer.layer = 0
	parent.add_child(layer)
	# rendered at the window's real pixel size and shown 1:1 (the 2D canvas is stretched from 1280x720)
	vp = SubViewport.new()
	vp.transparent_bg = true
	vp.own_world_3d = true
	vp.msaa_3d = Viewport.MSAA_2X
	vp.handle_input_locally = false
	vp.gui_disable_input = true
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.size = parent.get_window().size
	layer.add_child(vp)
	screen = TextureRect.new()
	screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	screen.stretch_mode = TextureRect.STRETCH_SCALE
	screen.texture = vp.get_texture()
	layer.add_child(screen)
	cam = Camera3D.new()
	cam.near = 0.5
	cam.far = 400.0
	cam.current = true
	vp.add_child(cam)
	venv = Environment.new()
	venv.background_mode = Environment.BG_CLEAR_COLOR
	venv.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	venv.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	venv.tonemap_mode = Environment.TONE_MAPPER_AGX
	var we := WorldEnvironment.new()
	we.environment = venv
	vp.add_child(we)
	vsun = DirectionalLight3D.new()
	vsun.shadow_enabled = true
	vsun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	vsun.directional_shadow_max_distance = 60.0
	vsun.shadow_bias = 0.02
	vsun.shadow_normal_bias = 0.6
	vp.add_child(vsun)
	vflash = OmniLight3D.new()
	vflash.omni_range = 40.0
	vflash.light_color = Color(1.0, 0.69, 0.38)
	vflash.visible = false
	vp.add_child(vflash)
	rig = Node3D.new()
	rig.rotation_order = EULER_ORDER_XYZ
	vp.add_child(rig)
	for id in BUILD_ORDER:
		var m := Models.build_vm(id, shared)
		(m.root as Node3D).visible = false
		rig.add_child(m.root)
		models[id] = m
	set_team(team)
	built = true
	update_fov()


func update_fov() -> void:
	if cam:
		cam.fov = U.vfov_from(float(Settings.get_value("vmFov")))


func set_visible(on: bool) -> void:
	if layer:
		layer.visible = on


## Hands and sleeves follow the local player's team (same uniform as the third-person model).
func set_team(t: int) -> void:
	team = t
	if shared.has("glove"):
		(shared.glove as ShaderMaterial).set_shader_parameter("map", Assets.tex("glove%d" % t))
	if shared.has("sleeve"):
		(shared.sleeve as ShaderMaterial).set_shader_parameter("map", Assets.tex("sleeve%d" % t))


func show(id: String) -> void:
	if not cur.is_empty() and cur.id == id:
		return
	for k: String in models:
		(models[k].root as Node3D).visible = k == id
	cur = models.get(id, {})
	kick = 0.0
	flash_t = 0.0


func on_shot(w: Weapon) -> void:
	var k := float(w.def.kick)
	kick = minf(kick + k, 1.6 * k)
	kick_roll = (randf() - 0.5) * 0.05
	if cur.is_empty() or cur.flash == null:
		return
	flash_t = 0.045
	var s := (3.2 + randf() * 1.6) * float(cur.flash_scale)
	var f: Node3D = cur.flash
	f.scale = Vector3(s, s, s)
	if f.get_child_count() > 0:
		(f.get_child(0) as Node3D).rotation.z = randf() * TAU
	flash_i = 2.2 * float(cur.flash_scale)


## World point that appears at a viewmodel anchor on screen (for tracers, casings, smoke).
func anchor_world(name: String, depth: float, main_cam: Camera3D) -> Variant:
	if cur.is_empty() or not (cur.anchors as Dictionary).has(name) or main_cam == null:
		return null
	var a: Node3D = cur.anchors[name]
	var p := _vm_global(a).origin
	var clip := cam.get_camera_projection() * Vector4(p.x, p.y, p.z, 1.0)
	if absf(clip.w) < 1e-6:
		return null
	var ndc := Vector2(clip.x / clip.w, clip.y / clip.w)
	var inv := main_cam.get_camera_projection().inverse()
	var v := inv * Vector4(ndc.x, ndc.y, 0.5, 1.0)
	var dir := Vector3(v.x / v.w, v.y / v.w, v.z / v.w).normalized()
	var xf := main_cam.global_transform
	return xf.origin + (xf.basis * dir) * depth


func _vm_global(n: Node3D) -> Transform3D:
	var t := n.transform
	var p := n.get_parent()
	while p != null and p != vp:
		t = (p as Node3D).transform * t
		p = p.get_parent()
	return t


static func sample_keys(keys: Variant, t: float) -> PackedFloat32Array:
	var out := PackedFloat32Array([0, 0, 0, 0, 0, 0])
	if keys == null or (keys as Array).is_empty():
		return out
	var ks: Array = keys
	if t <= float(ks[0][0]):
		for i in 6:
			out[i] = ks[0][i + 1]
		return out
	var last: Array = ks[-1]
	if t >= float(last[0]):
		for i in 6:
			out[i] = last[i + 1]
		return out
	var k := 1
	while float(ks[k][0]) < t:
		k += 1
	var a: Array = ks[k - 1]
	var b: Array = ks[k]
	var f := U.smooth(0.0, 1.0, (t - float(a[0])) / (float(b[0]) - float(a[0])))
	for i in 6:
		out[i] = float(a[i + 1]) + (float(b[i + 1]) - float(a[i + 1])) * f
	return out


static func in_windows(wins: Variant, t: float) -> bool:
	if wins == null:
		return false
	for w: Array in wins:
		if t >= float(w[0]) and t < float(w[1]):
			return true
	return false


## Show a weapon def's attachments and camo on its viewmodel (stock defs show neither).
func apply_kit(m: Dictionary, def: Dictionary) -> void:
	if (m.mats as Dictionary).is_empty():
		return
	var kit: Dictionary = def.get("kit", {})
	var sig := String(def.get("kitSig", ""))
	if m.kit_sig == sig:
		return
	m.kit_sig = sig
	var on := {}
	for k in ["muzzle", "optic", "mag", "grip"]:
		if String(kit.get(k, "")) != "":
			on[kit[k]] = true
	for aid: String in m.att:
		(m.att[aid] as Node3D).visible = on.has(aid)
	var ext := 0.0
	var mz := String(kit.get("muzzle", ""))
	if mz != "" and (m.att_ext as Dictionary).has(mz):
		ext = float(m.att_ext[mz])
	if (m.anchors as Dictionary).has("muzzle"):
		(m.anchors.muzzle as Node3D).position.z = float(m.muzzle_base) - ext
	if m.flash:
		(m.flash as Node3D).position.z = float(m.flash_base) - ext
	var stock := Data.weapon(m.id)
	m.flash_scale = float(m.flash_base_scale) * (float(def.flash) / float(stock.flash) if stock.has("flash") else 1.0)
	# a red dot or holo sight sits higher than the iron sights
	var optic := String(kit.get("optic", ""))
	if m.ads_pose != null:
		var rail: float = RAIL.get(m.id, 0.0)
		if optic == "pip" and rail > 0.0:
			m.ads_pose.y = -(rail + 0.58 * (0.78 if m.id == "pistol" else 1.0))
		elif optic == "halo" and rail > 0.0:
			m.ads_pose.y = -(rail + 0.78)
		else:
			m.ads_pose.y = -float(m.iron_y)
	var camo := String(kit.get("camo", ""))
	var cd: Dictionary = Arsenal.CAMOS.get(camo, {})
	for k: String in m.mats:
		var mat: ShaderMaterial = m.mats[k]
		if not cd.is_empty():
			var pb := Models.pbr_from_phong(float(cd.shine), float(cd.spec))
			mat.set_shader_parameter("use_camo", true)
			mat.set_shader_parameter("camo_tex", Assets.tex("camo_" + camo))
			mat.set_shader_parameter("rough", pb.x)
			mat.set_shader_parameter("metal", pb.y)
		else:
			mat.set_shader_parameter("use_camo", false)
			mat.set_shader_parameter("rough", float(mat.get_meta("base_rough", 0.6)))
			mat.set_shader_parameter("metal", float(mat.get_meta("base_metal", 0.0)))


func update(dt: float, pl: Player, w: Weapon, look: Vector2, eye: Vector3, alpha: float, main_cam: Camera3D) -> void:
	if not built:
		return
	var ws := layer.get_window().size
	if vp.size != ws and ws.x > 0 and ws.y > 0:
		vp.size = ws
	show(w.id)
	var m := cur
	if m.is_empty():
		return
	apply_kit(m, w.def)
	time += dt
	# --- procedural layer on the rig
	var x := 0.0; var y := 0.0; var rx := 0.0; var ry := 0.0; var rz := 0.0
	var sp := pl.speed() if pl.on_ground else 0.0
	var a := clampf(sp / 250.0, 0.0, 1.0)
	bob += sp * dt * 0.021
	x += sin(bob) * 0.32 * a
	y += sin(bob * 2.0) * 0.16 * a - a * 0.12
	rz += sin(bob) * 0.012 * a
	y += sin(time * 1.7) * 0.05
	rx += sin(time * 1.7) * 0.004
	sway.x = clampf(sway.x - look.x * 0.018, -1.3, 1.3)
	sway.y = clampf(sway.y - look.y * 0.018, -1.0, 1.0)
	sway.x = U.damp(sway.x, 0.0, 9.0, dt)
	sway.y = U.damp(sway.y, 0.0, 9.0, dt)
	x += sway.x * 0.45
	y += sway.y * 0.35
	ry += sway.x * 0.035
	rx -= sway.y * 0.03
	rz += sway.x * 0.05
	y += pl.duck_amt * 0.35 - pl.land_kick * 0.08 + (0.25 if not pl.on_ground and not pl.noclip else 0.0)
	rz -= pl.duck_amt * 0.04
	var ak := U.smooth(0.0, 1.0, w.ads) if w is Gun and m.ads_pose != null else 0.0
	var calm := 1.0 - 0.8 * ak
	rig.position = Vector3(x * calm, y * calm, 0.0)
	rig.rotation = Vector3(rx * calm, ry * calm, rz * calm)
	# --- weapon pose: base + clip + kick
	var rate := 1.0
	if w.anim.begins_with("reload") and w.def.has("reloadRate"):
		rate = float(w.def.reloadRate)
	elif w.anim == "draw" and w.def.has("drawRate"):
		rate = float(w.def.drawRate)
	var t := (w.anim_time() + alpha * TICK) * rate
	var clips: Dictionary = Data.CLIPS.get(m.id, {})
	var clip: Dictionary = clips.get(w.anim, {})
	var b0: Dictionary = m.base
	var ap: Dictionary = m.ads_pose if m.ads_pose != null else b0
	var b := {}
	for k in ["x", "y", "z", "rx", "ry", "rz"]:
		b[k] = lerpf(float(b0[k]), float(ap[k]), ak)
	var s := sample_keys(clip.get("root"), t)
	kick = U.damp(kick, 0.0, 15.0, dt)
	var root: Node3D = m.root
	root.position = Vector3(b.x + s[0], b.y + s[1] + kick * 0.12, b.z + s[2] + kick * 1.15)
	root.rotation = Vector3(b.rx + s[3] + kick * 0.055, b.ry + s[4], b.rz + s[5] + kick_roll * kick)
	var parts_clip: Dictionary = clip.get("parts", {})
	var show_w: Dictionary = clip.get("show", {})
	var hide_w: Dictionary = clip.get("hide", {})
	for pname: String in m.parts:
		var part: Node3D = m.parts[pname]
		var rest: Dictionary = m.rest[pname]
		var ps := sample_keys(parts_clip.get(pname), t)
		part.position = rest.p + Vector3(ps[0], ps[1], ps[2])
		part.rotation = rest.r + Vector3(ps[3], ps[4], ps[5])
		var vis := not (m.hidden as Array).has(pname)
		if show_w.has(pname):
			vis = in_windows(show_w[pname], t)
		if hide_w.has(pname) and in_windows(hide_w[pname], t):
			vis = false
		part.visible = vis
	if m.id == "charge" and (m.parts as Dictionary).has("led"):
		(m.parts.led as Node3D).visible = fmod(time * 1.25, 1.0) < 0.18 or w.state == "plant"
	if m.id == "pistol" and w is Gun:
		# slide blowback, lock-back on empty, release during the empty reload
		var g := w as Gun
		var ts := g.clock - g.last_shot_clock + alpha * TICK
		var back := ts / 0.025 if ts < 0.025 else maxf(0.0, 1.0 - (ts - 0.025) / 0.06)
		var releasing := g.anim == "reloadEmpty" and t > 1.85
		if g.slide_locked and not releasing:
			back = 1.0
		(m.parts.slide as Node3D).position.z += back * 1.2
	# --- muzzle flash + lighting from the baked probes at the eye
	flash_t -= dt
	if m.flash:
		(m.flash as Node3D).visible = flash_t > 0.0
	flash_i = maxf(0.0, flash_i - dt * 50.0)
	var L := Game.L
	var pr := L.probe_sky(eye)
	var sunv := L.probe(eye).a
	var env := L.env
	var cam_basis := main_cam.global_transform.basis if main_cam else Basis.IDENTITY
	var sun_v := cam_basis.inverse() * U.v3(env.sunDir).normalized()
	vsun.basis = Basis.looking_at(-sun_v, Vector3.UP if absf(sun_v.y) < 0.99 else Vector3.FORWARD)
	var sc: Array = env.sunColor
	vsun.light_color = Color(sc[0], sc[1], sc[2])
	vsun.light_energy = (L.sun.light_energy if L.sun else 2.5) * sunv
	vsun.visible = sunv > 0.01
	vflash.position = root.position + Vector3(0, 1, -6)
	vflash.light_energy = flash_i * 4.0
	vflash.visible = flash_i > 0.01
	if L.world_env:
		venv.tonemap_exposure = L.world_env.environment.tonemap_exposure
		venv.tonemap_mode = L.world_env.environment.tonemap_mode
		venv.adjustment_enabled = true
		venv.adjustment_contrast = L.world_env.environment.adjustment_contrast
		venv.adjustment_saturation = L.world_env.environment.adjustment_saturation
	var mats: Array = shared.values() + (m.mats as Dictionary).values()
	for mat: ShaderMaterial in mats:
		Models.light(mat, pr)
		mat.set_shader_parameter("to_world", cam_basis)
