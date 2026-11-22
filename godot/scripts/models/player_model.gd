class_name PlayerModel
extends RefCounted
## Third-person character: one rigidly skinned mesh on a 19-bone skeleton, animated procedurally
## (gait from speed, crouch/jump, aim pitch split across spine/chest/weapon, two-bone IK holding the
## weapon, death fall). Bone transforms are computed here in model space (also used for hitboxes)
## and pushed to a Skeleton3D for skinning. Facing -Z; units ~ inches; feet at y = 0.

const XYZ := EULER_ORDER_XYZ
const YXZ := EULER_ORDER_YXZ
const YXZ_BONES := ["spine", "chest", "head", "pelvis", "gun"]
const WEAPON_IDS := ["rifle", "pistol", "knife", "smoke", "smg", "shotgun", "sniper", "charge"]
const TEAM_COLORS := [Color(1.0, 0.54, 0.24), Color(0.37, 0.71, 1.0)]

var team := 0
var root: Node3D
var skel: Skeleton3D
var body: MeshInstance3D
var xray: MeshInstance3D = null
var mat: ShaderMaterial
var wmat: ShaderMaterial
var gun_node: Node3D
var chest_node: Node3D
var weapons: Dictionary = {}
var muzzles: Dictionary = {}
var weapon_id := "rifle"
var pack: MeshInstance3D
var carry := false
var phase := 0.0
var leg_yaw := 0.0
var crouch := 0.0
var air := 0.0
var kick := 0.0
var dead := 0.0
var death_dir := 1.0
var light := Color(0.5, 0.5, 0.5)
var nb := 0
var parent_of: PackedInt32Array
var rest: Array[Vector3] = []         ## local rest offsets (from the parent bone)
var bpos: Array[Vector3] = []
var brot: Array[Basis] = []
var g: Array[Transform3D] = []         ## model-space bone transforms
var idx: Dictionary = {}


func _init(t: int, parent: Node3D) -> void:
	team = t
	var B: Array = Models.bones
	nb = B.size()
	parent_of.resize(nb)
	for i in nb:
		var b: Array = B[i]
		idx[String(b[0])] = i
		var p := int(b[1])
		parent_of[i] = p
		var pp := Vector3.ZERO if p < 0 else Vector3(B[p][2], B[p][3], B[p][4])
		rest.append(Vector3(b[2], b[3], b[4]) - pp)
		bpos.append(rest[i])
		brot.append(Basis())
		g.append(Transform3D())
	root = Node3D.new()
	root.rotation_order = YXZ
	parent.add_child(root)
	skel = Skeleton3D.new()
	root.add_child(skel)
	var skin := Skin.new()
	for i in nb:
		skel.add_bone(String(B[i][0]))
		if parent_of[i] >= 0:
			skel.set_bone_parent(i, parent_of[i])
		skel.set_bone_rest(i, Transform3D(Basis(), rest[i]))
		skin.add_bind(i, Transform3D(Basis(), -Vector3(B[i][2], B[i][3], B[i][4])))
	body = MeshInstance3D.new()
	body.mesh = Models.char_mesh(team)
	body.skin = skin
	root.add_child(body)
	body.skeleton = body.get_path_to(skel)
	mat = Models.world_material("ch%d" % team)
	body.material_override = mat
	body.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	body.extra_cull_margin = 64.0
	wmat = Models.world_material("gun_metal", true)
	gun_node = Node3D.new()
	root.add_child(gun_node)
	chest_node = Node3D.new()
	root.add_child(chest_node)
	for id in WEAPON_IDS:
		var wm: Array = Models.weapon_mesh(id)
		var mi := MeshInstance3D.new()
		mi.mesh = wm[0]
		mi.material_override = wmat
		mi.visible = false
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		gun_node.add_child(mi)
		weapons[id] = mi
		muzzles[id] = wm[1]
	weapons.rifle.visible = true
	# the charge rides on the back while its carrier holds something else
	pack = MeshInstance3D.new()
	pack.mesh = Models.weapon_mesh("charge")[0]
	pack.material_override = wmat
	pack.position = Vector3(0, -2.5, 9.0 if team == 0 else 7.1)
	pack.rotation = Vector3(PI / 2.0, 0, 0)
	pack.visible = false
	chest_node.add_child(pack)


func free_nodes() -> void:
	if is_instance_valid(root):
		root.queue_free()


func set_weapon(id: String, has_charge: bool = false) -> void:
	carry = has_charge
	pack.visible = has_charge and id != "charge"
	if id == weapon_id:
		return
	for k: String in weapons:
		weapons[k].visible = k == id
	weapon_id = id


func fire() -> void:
	kick = 1.0


func _set_rot(name: String, x: float, y: float = 0.0, z: float = 0.0) -> void:
	var i: int = idx[name]
	brot[i] = Basis.from_euler(Vector3(x, y, z), YXZ if YXZ_BONES.has(name) else XYZ)


func _rx(name: String) -> float:
	return brot[idx[name]].get_euler(XYZ).x


## st: {x, y, z, yaw, pitch, vx, vz, ducked, onGround, alive}
func update(dt: float, st: Dictionary) -> void:
	var sp := Vector2(st.vx, st.vz).length()
	var moving: bool = sp > 25.0 and st.alive
	var rel := 0.0
	var back := false
	if moving:
		rel = U.wrap_angle(atan2(-float(st.vx), -float(st.vz)) - float(st.yaw))
		if absf(rel) > PI / 2.0 + 0.25:
			back = true
			rel = U.wrap_angle(rel - PI)
	leg_yaw = U.damp(leg_yaw, clampf(rel, -1.0, 1.0) if moving else 0.0, 8.0, dt)
	crouch = U.damp(crouch, 1.0 if st.ducked else 0.0, 12.0, dt)
	air = U.damp(air, 0.0 if st.onGround else 1.0, 10.0, dt)
	kick = U.damp(kick, 0.0, 14.0, dt)
	var run := U.smooth(120.0, 215.0, sp)
	var cr := crouch
	phase += (-1.0 if back else 1.0) * sp * dt / lerpf(30.0, 38.0, run)
	var amp := lerpf(0.38, 0.7, run) * (1.0 - 0.4 * cr) if moving else 0.0
	var s := sin(phase)
	var c := cos(phase)
	var knee_amp := lerpf(0.35, 1.15, run) if moving else 0.0
	# legs
	var t_base := 1.2 * cr + 0.45 * air
	var k_base := 2.0 * cr + 0.9 * air
	var mv := 0.12 if moving else 0.0
	var thl := t_base + amp * s
	var shl := -(k_base + knee_amp * maxf(0.0, c) + mv)
	var thr := t_base - amp * s
	var shr := -(k_base + knee_amp * maxf(0.0, -c) + mv)
	# death: fall around the feet
	if not st.alive:
		dead = minf(1.0, dead + dt / 0.7)
	else:
		dead = 0.0
	var f := U.smooth(0.0, 1.0, dead)
	_set_rot("thighL", thl + 0.4 * f)
	_set_rot("shinL", shl - 0.7 * f)
	_set_rot("thighR", thr)
	_set_rot("shinR", shr - 0.5 * f)
	_set_rot("footL", -(thl + shl) * 0.7)
	_set_rot("footR", -(thr + shr) * 0.7)
	# hips, torso, aim
	var bob := -absf(s) * lerpf(0.6, 1.5, run) if moving else sin(Time.get_ticks_msec() * 0.0018) * 0.25
	var pel: int = idx.pelvis
	bpos[pel] = Vector3(rest[pel].x, rest[pel].y - 15.5 * cr - 3.0 * air + bob, rest[pel].z)
	_set_rot("pelvis", 0.0, leg_yaw)
	var p := clampf(float(st.pitch), -1.2, 1.2)
	var lean := 0.16 * cr + (0.1 * run if moving else 0.0)
	_set_rot("spine", p * 0.25 - lean, -leg_yaw * 0.5)
	_set_rot("chest", p * 0.3, -leg_yaw * 0.5)
	_set_rot("head", p * 0.3)
	var hold: Dictionary = Models.holds.get(weapon_id, Models.holds.rifle)
	var gi: int = idx.gun
	bpos[gi] = Vector3(hold.gun[0], hold.gun[1], float(hold.gun[2]) + kick * 1.4)
	_set_rot("gun", p * 0.45 + lean + kick * 0.07)
	# arms: two-bone IK in chest space onto the weapon's grips
	var gun_local := Transform3D(brot[gi], bpos[gi])
	_arm_ik("R", hold.r, gun_local)
	_arm_ik("L", hold.l, gun_local)
	root.position = Vector3(st.x, float(st.y) - 1.5 * f, st.z)
	root.rotation = Vector3(death_dir * 1.42 * f, st.yaw, 0.12 * f * death_dir)
	_pose()


func _arm_ik(side: String, grip: Variant, gun_local: Transform3D) -> void:
	var up: int = idx["uArm" + side]
	var fo: int = idx["fArm" + side]
	var S := rest[up]
	var T: Vector3
	if grip != null:
		T = gun_local * Vector3(grip[0], grip[1], grip[2])
	else:
		T = Vector3(-9.6 if side == "L" else 9.6, -14.0, 1.5)
	var L1 := 10.5
	var L2 := 10.5
	var d := T - S
	var dist := d.length()
	d = d / dist if dist > 0.0 else Vector3.DOWN
	dist = clampf(dist, 1.5, L1 + L2 - 0.05)
	var cos_a := clampf((L1 * L1 + dist * dist - L2 * L2) / (2.0 * L1 * dist), -1.0, 1.0)
	var sin_a := sqrt(1.0 - cos_a * cos_a)
	var pole := Vector3(-1.0 if side == "L" else 1.0, -1.2, 0.4)
	pole = (pole - d * pole.dot(d)).normalized()
	var E := S + d * (L1 * cos_a) + pole * (L1 * sin_a)
	var qu := _arc(Vector3.DOWN, (E - S).normalized())
	brot[up] = Basis(qu)
	var Tc := S + d * dist
	var fe := qu.inverse() * (Tc - E).normalized()
	brot[fo] = Basis(_arc(Vector3.DOWN, fe))


static func _arc(a: Vector3, b: Vector3) -> Quaternion:
	var dt := a.dot(b)
	if dt > 0.999999:
		return Quaternion()
	if dt < -0.999999:
		var ax := Vector3(1, 0, 0).cross(a)
		if ax.length() < 1e-6:
			ax = Vector3(0, 1, 0).cross(a)
		return Quaternion(ax.normalized(), PI)
	return Quaternion(a, b)


## Model-space bone transforms, the skeleton pose, weapon and pack placement.
func _pose() -> void:
	for i in nb:
		var local := Transform3D(brot[i], bpos[i])
		var pi := parent_of[i]
		g[i] = local if pi < 0 else g[pi] * local
		skel.set_bone_pose_position(i, bpos[i])
		skel.set_bone_pose_rotation(i, brot[i].get_rotation_quaternion())
	gun_node.transform = g[idx.gun]
	chest_node.transform = g[idx.chest]


func set_light(c: Color) -> void:
	light = c
	Models.light(mat, c)
	Models.light(wmat, c)


## Admin x-ray: the body drawn in a flat colour wherever a wall is in front of it.
func set_xray(on: bool) -> void:
	if not on and xray == null:
		return
	if xray == null:
		xray = MeshInstance3D.new()
		xray.mesh = body.mesh
		xray.skin = body.skin
		root.add_child(xray)
		xray.skeleton = xray.get_path_to(skel)
		var m := ShaderMaterial.new()
		m.shader = preload("res://shaders/xray.gdshader")
		var tc: Color = TEAM_COLORS[team]
		m.set_shader_parameter("color", Vector3(tc.r, tc.g, tc.b))
		m.render_priority = 10
		xray.material_override = m
		xray.extra_cull_margin = 64.0
	xray.visible = on


func world_xform() -> Transform3D:
	return root.transform


func muzzle_world() -> Vector3:
	return root.transform * (g[idx.gun] * (muzzles[weapon_id] as Vector3))


func bone_world(name: String) -> Transform3D:
	return root.transform * g[idx[name]]


## Ray vs hitboxes (uses the last posed skeleton) -> {t, group, bone} or {}.
func hit_test(o: Vector3, d: Vector3, max_t: float) -> Dictionary:
	var c := root.position
	var oc := o - (c + Vector3(0, 36, 0))
	var b := oc.dot(d)
	var cc := oc.dot(oc) - 52.0 * 52.0
	if b > 0.0 and cc > 0.0:
		return {}
	if b * b - cc < 0.0:
		return {}
	var best := {}
	var rx := root.transform
	for hb: Array in Models.hitboxes:
		var wt: Transform3D = rx * g[idx[String(hb[0])]]
		var inv := wt.affine_inverse()
		var lo := inv * o
		var ld := (inv.basis * d).normalized()
		var lim: float = best.t if not best.is_empty() else max_t
		var t := slab(lo, ld, U.v3(hb[1]), U.v3(hb[2]), lim)
		if t >= 0.0:
			best = {"t": t, "group": String(hb[3]), "bone": String(hb[0])}
	return best


static func slab(o: Vector3, d: Vector3, c: Vector3, h: Vector3, tmax: float) -> float:
	var t0 := 0.0
	var t1 := tmax
	for a in 3:
		var oa := o[a]
		var da := d[a]
		var lo := c[a] - h[a]
		var hi := c[a] + h[a]
		if absf(da) < 1e-9:
			if oa < lo or oa > hi:
				return -1.0
			continue
		var ta := (lo - oa) / da
		var tb := (hi - oa) / da
		if ta > tb:
			var tmp := ta
			ta = tb
			tb = tmp
		t0 = maxf(t0, ta)
		t1 = minf(t1, tb)
		if t0 > t1:
			return -1.0
	return t0
