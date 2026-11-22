class_name Level
extends RefCounted
## A compiled map: lightmapped render geometry, brush collision, doors and plates, light probes,
## spawns, bomb sites, named areas, bot tactics and the nav graph (all exported from the original
## map compiler, see tools/godot-export.mjs).

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
var lightmap: Texture2D
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
	pr_data = Assets.blob(bin, meta.probeData).to_float32_array()
	pr_valid = Assets.blob(bin, meta.probeValid)
	lightmap = load(dir + "lightmap.png")
	radar = load(dir + "radar.png")
	nav = Assets.read_json(dir + "nav.json")

	root = Node3D.new()
	root.name = "Level_" + key
	parent.add_child(root)
	cw.build(Assets.read_json(dir + "brushes.json"), root.get_world_3d().space)

	# static world: one mesh, one surface per material
	var mesh := ArrayMesh.new()
	for g: Dictionary in meta.groups:
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, _arrays(g, Vector3.ZERO))
		mesh.surface_set_material(mesh.get_surface_count() - 1, mat(g.mat))
	var mi := MeshInstance3D.new()
	mi.name = "World"
	mi.mesh = mesh
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(mi)
	for e: Dictionary in meta.ents:
		ent_groups[int(e.brush)] = e.groups
	_build_sky()
	apply_globals()


func mat(m: String) -> ShaderMaterial:
	if not materials.has(m):
		materials[m] = Assets.world_material(m, lightmap)
	return materials[m]


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
			mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, _arrays(g, pivot))
			mesh.surface_set_material(mesh.get_surface_count() - 1, mat(g.mat))
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		n.add_child(mi)
	root.add_child(n)
	return n


func _build_sky() -> void:
	var sm := ShaderMaterial.new()
	sm.shader = Assets.sky_shader
	sm.set_shader_parameter("sun_dir", U.v3(env.sunDir))
	sm.set_shader_parameter("zen", U.v3(env.skyZenith))
	sm.set_shader_parameter("hor", U.v3(env.skyHorizon))
	sm.set_shader_parameter("sun_col", U.v3(env.get("skySun", [1.0, 0.86, 0.62])))
	sm.set_shader_parameter("ground", U.v3(env.get("skyGround", [0.62, 0.55, 0.45])))
	sm.set_shader_parameter("mtn", U.v3(env.get("skyMountains", [0.6, 0.53, 0.44])))
	var sky := Sky.new()
	sky.sky_material = sm
	sky.radiance_size = Sky.RADIANCE_SIZE_32
	sky.process_mode = Sky.PROCESS_MODE_QUALITY
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	e.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	e.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	world_env = WorldEnvironment.new()
	world_env.environment = e
	root.add_child(world_env)


func apply_globals() -> void:
	var fc: Array = env.fogColor
	RenderingServer.global_shader_parameter_set("world_fog", Vector4(fc[0], fc[1], fc[2], env.fogDensity))
	for i in 4:
		RenderingServer.global_shader_parameter_set("dl_pos_%d" % i, Vector4.ZERO)
		RenderingServer.global_shader_parameter_set("dl_col_%d" % i, Vector4.ZERO)


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
		var q := idx * 4
		r += pr_data[q] * w; g += pr_data[q + 1] * w; b += pr_data[q + 2] * w; s += pr_data[q + 3] * w
		ws += w
	if ws > 0.0:
		return Color(r / ws, g / ws, b / ws, s / ws)
	return Color(0.3, 0.3, 0.3, 0.0)


func team_spawn(team: int, i: int) -> Dictionary:
	var list: Array = team_spawns[team] if team < team_spawns.size() and team_spawns[team] != null else spawns
	return list[i % list.size()]


func area_at(p: Vector3) -> String:
	for a: Dictionary in areas:
		if p.x >= a.x0 and p.x <= a.x1 and p.z >= a.z0 and p.z <= a.z1:
			return a.name
	return ""
