class_name Level
extends RefCounted
## A compiled map: lightmapped render geometry (in spatial chunks), brush collision, doors and
## plates, light probes, spawns, bomb sites, named areas, bot tactics and the nav graph (exported
## from the map compiler, see tools/godot-export.mjs). The sun is a real-time light with shadow
## maps; the lightmap and probes carry the sky, bounce and lamp light.

const MAP_DIR := "res://assets/maps/"
const MAPS := {
	"depot": {"name": "Saltpan Depot", "blurb": "Salt-works rail yard · A Platform 2, B Shed 4"},
	"kiln": {"name": "Kilnworks", "blurb": "Brick works on a clay quarry · A Kiln Yard, B Press Hall"},
	"frost": {"name": "Frostline", "blurb": "Mountain radar station in snow · A Hangar 2, B Dish Array"},
	"range": {"name": "Hall B", "blurb": "Small practice hall · plates, spray board, jump boxes", "practice": true},
}

var key := ""
var name := ""
var meta: Dictionary = {}
var env: Dictionary = {}
var cw := CollisionWorld.new()
var root: Node3D
var world_env: WorldEnvironment
var sun: DirectionalLight3D
var sky_mat: ShaderMaterial
var lightmap: Texture2D
var lm_range := 0.0
var radar: Texture2D
var materials: Dictionary = {}
var ent_groups: Dictionary = {}       ## brush index -> Array of group dictionaries
var bin := PackedByteArray()
var nav: Dictionary = {}
var spawns: Array = []
var team_spawns: Array = []
var hotspots: Array = []
var sites: Array = []
var areas: Array = []
var tactics: Dictionary = {}
var menu_shots: Array = []
var lo := Vector3.ZERO
var hi := Vector3.ZERO
## light probes: rgb + sun visibility per grid point
var pr_n := Vector3i.ZERO
var pr_o := Vector3.ZERO
var pr_step := 64.0
var pr_stride := 4
var pr_data := PackedFloat32Array()
var pr_valid := PackedByteArray()


static func load_map(map_key: String, parent: Node3D) -> Level:
	var L := Level.new()
	L._load(map_key if MAPS.has(map_key) else "depot", parent)
	return L


func _load(map_key: String, parent: Node3D) -> void:
	key = map_key
	var dir := MAP_DIR + key + "/"
	meta = Assets.read_json(dir + "level.json")
	bin = FileAccess.get_file_as_bytes(dir + "level.bin")
	name = meta.name
	env = meta.env
	spawns = meta.spawns
	team_spawns = meta.teamSpawns
	hotspots = meta.hotspots
	sites = meta.sites
	areas = meta.areas
	tactics = meta.tactics if meta.tactics != null else {}
	menu_shots = meta.menuShots if meta.menuShots != null else []
	lo = U.v3(meta.bounds.lo)
	hi = U.v3(meta.bounds.hi)
	var p: Dictionary = meta.probes
	pr_n = Vector3i(int(p.nx), int(p.ny), int(p.nz))
	pr_o = Vector3(p.x0, p.y0, p.z0)
	pr_step = p.step
	pr_stride = int(p.get("stride", 4))
	lm_range = float(meta.get("lmRange", 0.0))
	pr_data = Assets.blob(bin, meta.probeData).to_float32_array()
	pr_valid = Assets.blob(bin, meta.probeValid)
	lightmap = load(dir + "lightmap.png")
	radar = load(dir + "radar.png")
	nav = Assets.read_json(dir + "nav.json")

	root = Node3D.new()
	root.name = "Level_" + key
	parent.add_child(root)
	cw.build(Assets.read_json(dir + "brushes.json"), root.get_world_3d().space)

	# static world: one mesh per spatial chunk (culled on its own), one surface per material.
	# Shadows are cast double-sided: some brush faces nobody sees (roof tops) are never built.
	var chunks: Dictionary = {}
	for g: Dictionary in meta.groups:
		var c := int(g.get("chunk", 0))
		if not chunks.has(c):
			chunks[c] = []
		(chunks[c] as Array).append(g)
	for c: int in chunks:
		var mesh := ArrayMesh.new()
		var all_pos := PackedVector3Array()
		for g: Dictionary in chunks[c]:
			_add_surface(mesh, g, Vector3.ZERO)
			all_pos.append_array(Assets.blob(bin, g.pos).to_vector3_array())
		var mi := MeshInstance3D.new()
		mi.name = "World_%d" % c
		mi.mesh = mesh
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(mi)
		# the chunk casts its shadow as one merged surface (one draw call per shadow split, not one
		# per material), double-sided because some faces nobody sees (roof tops) are never built
		var sh := ArrayMesh.new()
		var sa := []
		sa.resize(Mesh.ARRAY_MAX)
		sa[Mesh.ARRAY_VERTEX] = all_pos
		sh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, sa)
		var smi := MeshInstance3D.new()
		smi.name = "Shadow_%d" % c
		smi.mesh = sh
		smi.material_override = _shadow_mat()
		smi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
		root.add_child(smi)
	for e: Dictionary in meta.ents:
		ent_groups[int(e.brush)] = e.groups
	_build_env()
	apply_globals()


func mat(m: String) -> ShaderMaterial:
	if not materials.has(m):
		var wm := Assets.world_material(m, lightmap)
		if lm_range > 0.0:
			wm.set_shader_parameter("lm_range", lm_range)
		materials[m] = wm
	return materials[m]


static var _shadow_material: StandardMaterial3D = null


static func _shadow_mat() -> StandardMaterial3D:
	if _shadow_material == null:
		_shadow_material = StandardMaterial3D.new()
		_shadow_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		_shadow_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	return _shadow_material


## One material group as a mesh surface, with tangents for the normal maps.
func _add_surface(mesh: ArrayMesh, g: Dictionary, offset: Vector3) -> void:
	var st := SurfaceTool.new()
	st.create_from_arrays(_arrays(g, offset))
	st.generate_tangents()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, st.commit_to_arrays())
	mesh.surface_set_material(mesh.get_surface_count() - 1, mat(g.mat))


func _arrays(g: Dictionary, offset: Vector3) -> Array:
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	var pos := Assets.blob(bin, g.pos).to_vector3_array()
	if offset != Vector3.ZERO:
		for i in pos.size():
			pos[i] -= offset
	a[Mesh.ARRAY_VERTEX] = pos
	a[Mesh.ARRAY_NORMAL] = Assets.blob(bin, g.nrm).to_vector3_array()
	a[Mesh.ARRAY_TEX_UV] = Assets.blob(bin, g.uv).to_vector2_array()
	a[Mesh.ARRAY_TEX_UV2] = Assets.blob(bin, g.lm).to_vector2_array()
	return a


## Render node for a brush entity (door, plate) pivoted at `pivot`.
func entity_node(brush: int, pivot: Vector3) -> Node3D:
	var n := Node3D.new()
	n.position = pivot
	var groups: Array = ent_groups.get(brush, [])
	if not groups.is_empty():
		var mesh := ArrayMesh.new()
		for g: Dictionary in groups:
			_add_surface(mesh, g, pivot)
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		n.add_child(mi)
	root.add_child(n)
	return n


## Sky, sun and environment (post effects are set by Gfx from the quality preset).
func _build_env() -> void:
	var look: Dictionary = Gfx.look_for(self)
	sky_mat = ShaderMaterial.new()
	sky_mat.shader = Assets.sky_shader
	sky_mat.set_shader_parameter("sun_dir", U.v3(env.sunDir))
	sky_mat.set_shader_parameter("zen", U.v3(env.skyZenith))
	sky_mat.set_shader_parameter("hor", U.v3(env.skyHorizon))
	sky_mat.set_shader_parameter("sun_col", U.v3(env.get("skySun", [1.0, 0.86, 0.62])))
	sky_mat.set_shader_parameter("ground", U.v3(env.get("skyGround", [0.62, 0.55, 0.45])))
	sky_mat.set_shader_parameter("mtn", U.v3(env.get("skyMountains", [0.6, 0.53, 0.44])))
	sky_mat.set_shader_parameter("cover", float(look.cloud_cover))
	sky_mat.set_shader_parameter("cloud_dark", float(look.cloud_dark))
	sky_mat.set_shader_parameter("energy", float(look.sky_energy))
	var sky := Sky.new()
	sky.sky_material = sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_32
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	e.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	world_env = WorldEnvironment.new()
	world_env.environment = e
	root.add_child(world_env)
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	var sd := U.v3(env.sunDir).normalized()
	sun.basis = Basis.looking_at(-sd, Vector3.UP if absf(sd.y) < 0.99 else Vector3.FORWARD)
	var sc: Array = env.sunColor
	sun.light_color = Color(sc[0], sc[1], sc[2])
	sun.light_energy = float(env.sunIntensity) * float(look.sun_k)
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_blend_splits = true
	sun.shadow_bias = 0.6
	sun.shadow_normal_bias = 1.2
	sun.directional_shadow_pancake_size = 600.0
	root.add_child(sun)
	RenderingServer.global_shader_parameter_set("sky_pano", _sky_pano(look))
	Gfx.apply_level(self)


## Small sky panorama (no clouds) for the reflections in the world and model shaders.
func _sky_pano(look: Dictionary) -> ImageTexture:
	var w := 128
	var h := 64
	var img := Image.create(w, h, false, Image.FORMAT_RGBH)
	var z := U.lin(Color(env.skyZenith[0], env.skyZenith[1], env.skyZenith[2]))
	var hz := U.lin(Color(env.skyHorizon[0], env.skyHorizon[1], env.skyHorizon[2]))
	var gc: Array = env.get("skyGround", [0.62, 0.55, 0.45])
	var gr := U.lin(Color(gc[0], gc[1], gc[2])) * 0.8
	var ss: Array = env.get("skySun", [1.0, 0.86, 0.62])
	var sc := U.lin(Color(ss[0], ss[1], ss[2]))
	var sd := U.v3(env.sunDir).normalized()
	var en := float(look.sky_energy)
	for y in h:
		var th := (y + 0.5) / h * PI
		for x in w:
			var ph := ((x + 0.5) / w - 0.5) * TAU
			var d := Vector3(sin(th) * sin(ph), cos(th), -sin(th) * cos(ph))
			var c := hz.lerp(z, pow(clampf(d.y, 0.0, 1.0), 0.5))
			if d.y < 0.0:
				c = c.lerp(gr, clampf(-d.y * 8.0, 0.0, 1.0))
			var sdot := maxf(d.dot(sd), 0.0)
			c += sc * (pow(sdot, 8.0) * 0.35 + pow(sdot, 64.0) * 3.0)
			img.set_pixel(x, y, Color(c.r * en, c.g * en, c.b * en))
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


func apply_globals() -> void:
	var fc: Array = env.fogColor
	RenderingServer.global_shader_parameter_set("world_fog", Vector4(fc[0], fc[1], fc[2], env.fogDensity))
	var look: Dictionary = Gfx.look_for(self)
	RenderingServer.global_shader_parameter_set("indirect_k", float(look.indirect_k))
	RenderingServer.global_shader_parameter_set("refl_k", float(look.refl_k))


func unload() -> void:
	cw.free_all()
	if root:
		root.queue_free()
		root = null


## Trilinear probe lookup -> Color(r, g, b, a = sun visibility).
func probe(p: Vector3) -> Color:
	var fx := clampf((p.x - pr_o.x) / pr_step, 0.0, pr_n.x - 1.001)
	var fy := clampf((p.y - pr_o.y) / pr_step, 0.0, pr_n.y - 1.001)
	var fz := clampf((p.z - pr_o.z) / pr_step, 0.0, pr_n.z - 1.001)
	var ix := int(fx); var iy := int(fy); var iz := int(fz)
	var tx := fx - ix; var ty := fy - iy; var tz := fz - iz
	var r := 0.0; var g := 0.0; var b := 0.0; var s := 0.0; var ws := 0.0
	for c in 8:
		var dx := c & 1; var dy := (c >> 1) & 1; var dz := (c >> 2) & 1
		var idx := ((iz + dz) * pr_n.y + (iy + dy)) * pr_n.x + (ix + dx)
		if idx < 0 or idx >= pr_valid.size() or pr_valid[idx] == 0:
			continue
		var w := (tx if dx else 1.0 - tx) * (ty if dy else 1.0 - ty) * (tz if dz else 1.0 - tz) + 1e-4
		var q := idx * pr_stride
		r += pr_data[q] * w; g += pr_data[q + 1] * w; b += pr_data[q + 2] * w; s += pr_data[q + 3] * w
		ws += w
	if ws > 0.0:
		return Color(r / ws, g / ws, b / ws, s / ws)
	return Color(0.3, 0.3, 0.3, 0.0)


## Indirect light (rgb) and sky visibility (a) at a point, for lit models.
func probe_sky(p: Vector3) -> Color:
	var c := probe(p)
	if pr_stride < 5:
		return Color(c.r, c.g, c.b, c.a)
	var fx := clampf((p.x - pr_o.x) / pr_step, 0.0, pr_n.x - 1.001)
	var fy := clampf((p.y - pr_o.y) / pr_step, 0.0, pr_n.y - 1.001)
	var fz := clampf((p.z - pr_o.z) / pr_step, 0.0, pr_n.z - 1.001)
	var ix := int(fx); var iy := int(fy); var iz := int(fz)
	var tx := fx - ix; var ty := fy - iy; var tz := fz - iz
	var s := 0.0; var ws := 0.0
	for k in 8:
		var dx := k & 1; var dy := (k >> 1) & 1; var dz := (k >> 2) & 1
		var idx := ((iz + dz) * pr_n.y + (iy + dy)) * pr_n.x + (ix + dx)
		if idx < 0 or idx >= pr_valid.size() or pr_valid[idx] == 0:
			continue
		var w := (tx if dx else 1.0 - tx) * (ty if dy else 1.0 - ty) * (tz if dz else 1.0 - tz) + 1e-4
		s += pr_data[idx * pr_stride + 4] * w
		ws += w
	return Color(c.r, c.g, c.b, s / ws if ws > 0.0 else 0.5)


func team_spawn(team: int, i: int) -> Dictionary:
	var list: Array = team_spawns[team] if team < team_spawns.size() and team_spawns[team] != null else spawns
	return list[i % list.size()]


func area_at(p: Vector3) -> String:
	for a: Dictionary in areas:
		if p.x >= a.x0 and p.x <= a.x1 and p.z >= a.z0 and p.z <= a.z1:
			return a.name
	return ""
