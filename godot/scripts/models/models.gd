extends Node
## The procedural models exported from the original builders (tools/godot-export.mjs): first-person
## viewmodels with their attachments, the two characters (rigidly skinned to a 19-bone skeleton) and
## the third-person weapons. Builds Godot meshes, nodes and materials from models.json + models.bin.

const MODEL_SHADER := preload("res://shaders/model.gdshader")
const MODEL_ALPHA_SHADER := preload("res://shaders/model_alpha.gdshader")
const MODEL_ADD_SHADER := preload("res://shaders/model_add.gdshader")

## Roughness and metalness of the viewmodel materials (Phong materials in the original builders).
const VM_PBR := {
	"metal": [0.36, 0.85], "poly": [0.62, 0.0], "tan": [0.66, 0.0], "glove": [0.85, 0.0], "sleeve": [0.92, 0.0],
	"blade": [0.2, 1.0], "nade": [0.5, 0.35], "wood": [0.5, 0.0], "shell": [0.45, 0.0], "brass": [0.28, 1.0],
	"putty": [0.92, 0.0], "tape": [0.75, 0.0], "wireR": [0.5, 0.0], "wireB": [0.5, 0.0], "lens": [0.05, 0.0], "band": [0.7, 0.0],
}

var data: Dictionary = {}
var bin := PackedByteArray()
var bones: Array = []          ## [name, parent, x, y, z] (absolute bind positions)
var bone_index: Dictionary = {}
var holds: Dictionary = {}
var hitboxes: Array = []
var mounts: Dictionary = {}
var _char_mesh: Dictionary = {}
var _weapon_mesh: Dictionary = {}
var _wmats: Dictionary = {}      ## shared materials of the third-person weapons, by viewmodel material
var _char_mat: Dictionary = {}


func _ready() -> void:
	data = Assets.read_json("res://assets/models/models.json")
	bin = FileAccess.get_file_as_bytes("res://assets/models/models.bin")
	bones = data.bones
	for i in bones.size():
		bone_index[String(bones[i][0])] = i
	holds = data.holds
	hitboxes = data.hitboxes
	mounts = data.mounts


func _f32(span: Variant) -> PackedByteArray:
	return Assets.blob(bin, span)


## ShaderMaterial for one of the viewmodel materials (metal, poly, glove, flash, ...).
func vm_material(name: String) -> ShaderMaterial:
	var mi: Dictionary = data.mats.get(name, {})
	var m := ShaderMaterial.new()
	if mi.get("additive", false):
		m.shader = MODEL_ADD_SHADER
		m.set_shader_parameter("map", Assets.tex(String(mi.map)) if mi.map != null else null)
		var c: Array = mi.color
		m.set_shader_parameter("color", Vector3(c[0], c[1], c[2]))
		m.render_priority = 2
		return m
	m.shader = MODEL_ALPHA_SHADER if mi.get("transparent", false) else MODEL_SHADER
	var c2: Array = mi.get("color", [1, 1, 1])
	m.set_shader_parameter("color", Vector3(c2[0], c2[1], c2[2]))
	var tex: Variant = mi.get("map")
	m.set_shader_parameter("has_map", tex != null)
	if tex != null:
		m.set_shader_parameter("map", Assets.tex(String(tex)))
		_set_normal(m, String(tex))
	m.set_shader_parameter("unlit", mi.get("type", "") == "basic")
	var sp: Array = mi.get("specular", [0, 0, 0])
	var pr: Array = VM_PBR.get(name, [])
	var pb := Vector2(pr[0], pr[1]) if pr.size() == 2 else pbr_from_phong(float(mi.get("shininess", 0)), (float(sp[0]) + float(sp[1]) + float(sp[2])) / 3.0)
	m.set_shader_parameter("rough", pb.x)
	m.set_shader_parameter("metal", pb.y)
	m.set_shader_parameter("opacity", float(mi.get("opacity", 1.0)))
	m.set_meta("base_map", tex)
	m.set_meta("base_rough", pb.x)
	m.set_meta("base_metal", pb.y)
	return m


## The texture's normal map, if the exporter made one (name_n.png).
static func _set_normal(m: ShaderMaterial, tex: String) -> void:
	var n := Assets.tex(tex + "_n") if Assets.def(tex).get("normal") != null else null
	m.set_shader_parameter("has_normal", n != null)
	if n:
		m.set_shader_parameter("normal_map", n)


## Roughness / metalness from the original Phong shininess and specular level.
static func pbr_from_phong(shine: float, spec: float) -> Vector2:
	return Vector2(clampf(1.0 - sqrt(shine / 110.0) * 0.85, 0.12, 0.95), clampf((spec - 0.3) * 1.6, 0.0, 1.0))


## Probe light at a model: rgb = indirect light, a = sky visibility (Level.probe_sky).
static func light(mat: ShaderMaterial, c: Color) -> void:
	mat.set_shader_parameter("irr", Vector3(c.r, c.g, c.b))
	mat.set_shader_parameter("sky_vis", c.a)


## The same, per mesh instance (all its surfaces), so instances can share materials.
static func light_inst(gi: GeometryInstance3D, c: Color) -> void:
	gi.set_instance_shader_parameter("irr_i", Vector3(c.r, c.g, c.b))
	gi.set_instance_shader_parameter("sky_i", c.a)


## An indexed copy of a triangle soup with tangents and automatic LODs (characters, world guns).
static func _lod_mesh(a: Array, skinned: bool, mat: Material = null) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.create_from_arrays(a)
	st.index()
	st.generate_tangents()
	var im := ImporterMesh.new()
	im.add_surface(Mesh.PRIMITIVE_TRIANGLES, st.commit_to_arrays(), [], {}, mat)
	im.generate_lods(25.0, 60.0, [])
	return im.get_mesh()


func _mesh_from(md: Dictionary, mat: Material) -> ArrayMesh:
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = _f32(md.pos).to_vector3_array()
	a[Mesh.ARRAY_NORMAL] = _f32(md.nrm).to_vector3_array()
	if md.get("uv") != null:
		a[Mesh.ARRAY_TEX_UV] = _f32(md.uv).to_vector2_array()
	if md.get("uvCamo") != null:
		a[Mesh.ARRAY_TEX_UV2] = _f32(md.uvCamo).to_vector2_array()
	if md.get("color") != null:
		a[Mesh.ARRAY_COLOR] = _colors(_f32(md.color).to_float32_array())
	var mesh := ArrayMesh.new()
	if md.get("uv") != null:
		var st := SurfaceTool.new()
		st.create_from_arrays(a)
		st.generate_tangents()
		a = st.commit_to_arrays()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	mesh.surface_set_material(0, mat)
	return mesh


static func _colors(f: PackedFloat32Array) -> PackedColorArray:
	var out := PackedColorArray()
	out.resize(f.size() / 3)
	for i in out.size():
		out[i] = Color(f[i * 3], f[i * 3 + 1], f[i * 3 + 2])
	return out


## A viewmodel: {id, root, parts, rest, anchors, flash, att, att_ext, base, ads_pose, iron_y,
## flash_scale, body (meshes that take camo), mats (this gun's own metal/poly/tan/wood)}.
func build_vm(id: String, shared: Dictionary) -> Dictionary:
	var d: Dictionary = data.vm[id]
	var gun: bool = d.get("adsPose") != null
	var own: Dictionary = {}
	if gun:
		for k in ["metal", "poly", "tan", "wood"]:
			own[k] = vm_material(k)
	var m := {"id": id, "parts": {}, "rest": {}, "anchors": {}, "flash": null, "att": {}, "att_ext": d.get("attExt", {}),
		"base": d.base, "ads_pose": d.get("adsPose"), "iron_y": float(d.get("ironY", 0)), "flash_scale": float(d.get("flashScale", 1)),
		"flash_base_scale": float(d.get("flashScale", 1)), "body": [], "mats": own, "hidden": d.get("hidden", []), "kit_sig": ""}
	var nodes: Array = []
	for nd: Dictionary in d.nodes:
		var n: Node3D
		if nd.has("mesh"):
			var md: Dictionary = nd.mesh
			var mname := String(md.mat)
			var mat: Material = own[mname] if own.has(mname) else shared.get(mname)
			if mat == null:
				mat = vm_material(mname)
				shared[mname] = mat
			var mi := MeshInstance3D.new()
			mi.mesh = _mesh_from(md, mat)
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			if own.has(mname) and md.get("uvCamo") != null:
				(m.body as Array).append(mi)
			n = mi
		else:
			n = Node3D.new()
		n.name = String(nd.name) if String(nd.name) != "" else "n%d" % nodes.size()
		n.rotation_order = EULER_ORDER_XYZ
		n.position = U.v3(nd.p)
		n.quaternion = Quaternion(nd.q[0], nd.q[1], nd.q[2], nd.q[3])
		n.scale = U.v3(nd.s)
		n.visible = nd.visible
		var parent := int(nd.parent)
		if parent >= 0:
			(nodes[parent] as Node3D).add_child(n)
		nodes.append(n)
		var tag := String(nd.get("tag", ""))
		if tag.begins_with("part:"):
			var pn := tag.substr(5)
			var rd: Dictionary = d.rest[pn]
			m.parts[pn] = n
			m.rest[pn] = {"p": U.v3(rd.p), "r": U.v3(rd.r)}
		elif tag.begins_with("anchor:"):
			m.anchors[tag.substr(7)] = n
		elif tag == "flash":
			m.flash = n
		elif tag.begins_with("att:"):
			m.att[tag.substr(4)] = n
	m.root = nodes[0]
	m.muzzle_base = (m.anchors.muzzle as Node3D).position.z if m.anchors.has("muzzle") else 0.0
	m.flash_base = (m.flash as Node3D).position.z if m.flash else 0.0
	return m


## Character body for a team, skinned to the CH_BONES skeleton (up to 4 bones per vertex), with LODs.
func char_mesh(team: int) -> ArrayMesh:
	if _char_mesh.has(team):
		return _char_mesh[team]
	var c: Dictionary = data.chars[str(team)]
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = _f32(c.pos).to_vector3_array()
	a[Mesh.ARRAY_NORMAL] = _f32(c.nrm).to_vector3_array()
	a[Mesh.ARRAY_TEX_UV] = _f32(c.uv).to_vector2_array()
	var bi := PackedInt32Array()
	var bw := PackedFloat32Array()
	if c.has("bones"):
		var b := _f32(c.bones)
		bi.resize(b.size())
		for i in b.size():
			bi[i] = b[i]
		bw = _f32(c.weights).to_float32_array()
	else:
		var bone := _f32(c.bone)
		bi.resize(bone.size() * 4)
		bw.resize(bone.size() * 4)
		for i in bone.size():
			bi[i * 4] = bone[i]
			bw[i * 4] = 1.0
	a[Mesh.ARRAY_BONES] = bi
	a[Mesh.ARRAY_WEIGHTS] = bw
	var mesh := _lod_mesh(a, true, char_material(team))
	_char_mesh[team] = mesh
	return mesh


## Shared body material per team (lit per instance with light_inst).
func char_material(team: int) -> ShaderMaterial:
	if not _char_mat.has(team):
		var m := world_material("ch%d" % team)
		_set_normal(m, "ch%d" % team)
		_char_mat[team] = m
	return _char_mat[team]


## Third-person weapon mesh (the viewmodel gun: one surface per material, shared materials, LODs)
## and its muzzle point in gun space. Light instances with light_inst.
func weapon_mesh(id: String) -> Array:
	if _weapon_mesh.has(id):
		return _weapon_mesh[id]
	var w: Dictionary = data.weapons.get(id, data.weapons.smoke)
	var im := ImporterMesh.new()
	for s: Dictionary in w.surfaces:
		var a := []
		a.resize(Mesh.ARRAY_MAX)
		a[Mesh.ARRAY_VERTEX] = _f32(s.pos).to_vector3_array()
		a[Mesh.ARRAY_NORMAL] = _f32(s.nrm).to_vector3_array()
		a[Mesh.ARRAY_TEX_UV] = _f32(s.uv).to_vector2_array()
		var st := SurfaceTool.new()
		st.create_from_arrays(a)
		st.index()
		st.generate_tangents()
		var mn := String(s.mat)
		if not _wmats.has(mn):
			_wmats[mn] = vm_material(mn)
		im.add_surface(Mesh.PRIMITIVE_TRIANGLES, st.commit_to_arrays(), [], {}, _wmats[mn])
	im.generate_lods(25.0, 60.0, [])
	var out := [im.get_mesh(), U.v3(w.muzzle)]
	_weapon_mesh[id] = out
	return out


## Lit material for world objects (characters, dropped guns, grenades, casings); light it per frame
## with Models.light(mat, Level.probe_sky(position)).
func world_material(tex_name: String, vcolor: bool = false) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = MODEL_SHADER
	var t := Assets.tex(tex_name) if tex_name != "" else null
	m.set_shader_parameter("has_map", t != null)
	m.set_shader_parameter("map", t)
	m.set_shader_parameter("use_vcolor", vcolor)
	var pb := Vector2(0.75, 0.0)
	if tex_name == "gun_metal":
		pb = Vector2(0.45, 0.55)
	elif tex_name == "nade":
		pb = Vector2(0.5, 0.3)
	elif tex_name.begins_with("ch"):
		pb = Vector2(0.82, 0.0)
	m.set_shader_parameter("rough", pb.x)
	m.set_shader_parameter("metal", pb.y)
	return m
