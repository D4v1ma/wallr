extends Node
## Registry of the exported assets: texture table, world materials, shaders, binary data helpers.

const TEX_DIR := "res://assets/textures/"

var tex_defs: Dictionary = {}
var world_shader: Shader = preload("res://shaders/world.gdshader")
var world_fit_shader: Shader = preload("res://shaders/world_fit.gdshader")
var fullbright_shader: Shader = preload("res://shaders/fullbright.gdshader")
var sky_shader: Shader = preload("res://shaders/sky.gdshader")
var _tex: Dictionary = {}


func _ready() -> void:
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(TEX_DIR + "textures.json"))
	tex_defs = d if typeof(d) == TYPE_DICTIONARY else {}
	RenderingServer.global_shader_parameter_set("macro_tex", _macro_noise())


## Soft tiling noise the world shader samples in world space to break up texture repetition.
static func _macro_noise() -> ImageTexture:
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.seed = 7
	n.frequency = 0.012
	n.fractal_octaves = 4
	var img := n.get_seamless_image(256, 256)
	img.convert(Image.FORMAT_L8)
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


func tex(name: String) -> Texture2D:
	if _tex.has(name):
		return _tex[name]
	var path := TEX_DIR + name + ".png"
	var t: Texture2D = load(path) if ResourceLoader.exists(path) else null
	_tex[name] = t
	return t


func def(mat: String) -> Dictionary:
	return tex_defs.get(mat, {})


## Surface id (concrete, metal, ...) of a world material.
func surf_of(mat: String) -> int:
	return U.surf_id(String(def(mat).get("surf", "concrete")))


## Average colour of a texture (lighting probes, particles).
func avg(mat: String) -> Color:
	var a: Array = def(mat).get("avg", [0.5, 0.5, 0.5])
	return Color(a[0], a[1], a[2])


func world_material(mat: String, lightmap: Texture2D) -> ShaderMaterial:
	var d := def(mat)
	var m := ShaderMaterial.new()
	if d.get("fullbright") != null:
		var fb: Array = d.fullbright
		m.shader = fullbright_shader
		m.set_shader_parameter("color", Color(fb[0], fb[1], fb[2]))
		m.set_shader_parameter("energy", 3.5)
		return m
	m.shader = world_fit_shader if d.get("fit", false) else world_shader
	m.set_shader_parameter("albedo_tex", tex(mat))
	var nrm: Texture2D = tex(mat + "_n") if d.get("normal") != null else null
	var orm: Texture2D = tex(mat + "_orm") if d.get("orm") != null else null
	m.set_shader_parameter("has_pbr", nrm != null and orm != null)
	if nrm and orm:
		m.set_shader_parameter("normal_tex", nrm)
		m.set_shader_parameter("orm_tex", orm)
	m.set_shader_parameter("lightmap", lightmap)
	return m


## Slice [offset, length] of a binary blob.
static func blob(bin: PackedByteArray, span: Array) -> PackedByteArray:
	return bin.slice(int(span[0]), int(span[0]) + int(span[1]))


static func read_json(path: String) -> Variant:
	return JSON.parse_string(FileAccess.get_file_as_string(path))
