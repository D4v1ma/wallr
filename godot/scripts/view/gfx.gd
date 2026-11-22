extends Node
## Graphics: the look of each map (sun strength, sky, fog, exposure) and the quality presets
## (shadows, ambient occlusion, volumetric fog, reflections, anti-aliasing), applied to the level's
## environment and sun and to the main viewport. Settings → Graphics.

const PRESETS := {
	"low": {"shadow": 2048, "dist": 2400.0, "soft": RenderingServer.SHADOW_QUALITY_SOFT_VERY_LOW, "pcss": 0.0,
		"ssao": false, "ssil": false, "ssr": false, "vfog": false, "glow": true, "msaa": Viewport.MSAA_DISABLED,
		"aa": Viewport.SCREEN_SPACE_AA_FXAA, "aniso": Viewport.ANISOTROPY_4X, "vm_msaa": Viewport.MSAA_2X},
	"medium": {"shadow": 4096, "dist": 3400.0, "soft": RenderingServer.SHADOW_QUALITY_SOFT_LOW, "pcss": 0.0,
		"ssao": true, "ssao_q": RenderingServer.ENV_SSAO_QUALITY_LOW, "ssil": false, "ssr": false, "vfog": false, "glow": true,
		"msaa": Viewport.MSAA_2X, "aa": Viewport.SCREEN_SPACE_AA_DISABLED, "aniso": Viewport.ANISOTROPY_8X, "vm_msaa": Viewport.MSAA_2X},
	"high": {"shadow": 4096, "dist": 4400.0, "soft": RenderingServer.SHADOW_QUALITY_SOFT_MEDIUM, "pcss": 0.35,
		"ssao": true, "ssao_q": RenderingServer.ENV_SSAO_QUALITY_MEDIUM, "ssil": false, "ssr": false, "vfog": true, "vfog_size": 64, "glow": true,
		"msaa": Viewport.MSAA_4X, "aa": Viewport.SCREEN_SPACE_AA_DISABLED, "aniso": Viewport.ANISOTROPY_16X, "vm_msaa": Viewport.MSAA_4X},
	"ultra": {"shadow": 8192, "dist": 6000.0, "soft": RenderingServer.SHADOW_QUALITY_SOFT_HIGH, "pcss": 0.5,
		"ssao": true, "ssao_q": RenderingServer.ENV_SSAO_QUALITY_HIGH, "ssil": true, "ssr": true, "vfog": true, "vfog_size": 128, "glow": true,
		"msaa": Viewport.MSAA_4X, "aa": Viewport.SCREEN_SPACE_AA_DISABLED, "aniso": Viewport.ANISOTROPY_16X, "vm_msaa": Viewport.MSAA_4X},
}
const QUALITIES := ["low", "medium", "high", "ultra"]

## Per-map look; anything missing comes from DEFAULT_LOOK.
const DEFAULT_LOOK := {
	"sun_k": 2.6, "indirect_k": 1.0, "refl_k": 1.0, "sky_energy": 1.0, "exposure": 0.95,
	"cloud_cover": 0.45, "cloud_dark": 0.35, "fog": 0.000035, "aerial": 0.3, "sun_scatter": 0.12,
	"vfog": 0.00006, "vfog_aniso": 0.65, "saturation": 1.08, "contrast": 1.06, "glow": 0.55, "tonemap": "aces",
}
const LOOKS := {
	"depot": {"cloud_cover": 0.42, "fog": 0.00003, "vfog": 0.00005},
	"kiln": {"sun_k": 2.8, "cloud_cover": 0.3, "fog": 0.00004, "vfog": 0.00009, "saturation": 1.1, "sun_scatter": 0.2},
	"frost": {"sun_k": 2.1, "indirect_k": 1.1, "cloud_cover": 0.72, "cloud_dark": 0.45, "fog": 0.00005, "vfog": 0.00007, "saturation": 0.98, "exposure": 0.82, "contrast": 1.1},
	"range": {"cloud_cover": 0.5, "fog": 0.00002, "vfog": 0.00004},
}


func _ready() -> void:
	Settings.changed.connect(_on_setting)
	apply_viewport.call_deferred()


func quality() -> String:
	var q := String(Settings.get_value("gfx"))
	return q if PRESETS.has(q) else "high"


func look_for(L: Level) -> Dictionary:
	var look := DEFAULT_LOOK.duplicate()
	look.merge(LOOKS.get(L.key, {}), true)
	# tuning from the command line: --look=exposure:0.9,tonemap:aces
	for kv in String(Game.args.get("look", "")).split(",", false):
		var p := kv.split(":")
		if p.size() == 2:
			look[p[0]] = p[1] if not p[1].is_valid_float() else float(p[1])
	return look


func _on_setting(k: String, _v: Variant) -> void:
	if k == "gfx" or k == "brightness":
		if Game.L:
			apply_level(Game.L)
		apply_viewport()


## Environment, sun and global shadow settings for the current level and preset.
func apply_level(L: Level) -> void:
	if L == null or L.world_env == null:
		return
	var look := look_for(L)
	var q: Dictionary = PRESETS[quality()]
	var e: Environment = L.world_env.environment
	e.tonemap_mode = {"agx": Environment.TONE_MAPPER_AGX, "aces": Environment.TONE_MAPPER_ACES, "filmic": Environment.TONE_MAPPER_FILMIC}.get(String(look.tonemap), Environment.TONE_MAPPER_AGX)
	e.tonemap_exposure = float(look.exposure) * float(Settings.get_value("brightness"))
	e.glow_enabled = q.glow
	e.glow_intensity = float(look.glow)
	e.glow_strength = 1.0
	e.glow_bloom = 0.03
	e.glow_hdr_threshold = 1.1
	e.glow_hdr_scale = 2.0
	e.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
	for i in 7:
		e.set_glow_level(i, 1.0 if i >= 2 and i <= 5 else 0.0)
	var fc: Array = L.env.fogColor
	var fog_col := U.lin(Color(fc[0], fc[1], fc[2]))
	e.fog_enabled = true
	e.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	e.fog_light_color = fog_col
	e.fog_light_energy = 1.0
	e.fog_density = float(look.fog)
	e.fog_aerial_perspective = float(look.aerial)
	e.fog_sun_scatter = float(look.sun_scatter)
	e.fog_sky_affect = 0.0
	e.ssao_enabled = q.ssao
	if q.ssao:
		e.ssao_radius = 40.0
		e.ssao_intensity = 2.2
		e.ssao_power = 1.6
		e.ssao_detail = 0.6
		e.ssao_horizon = 0.06
		e.ssao_sharpness = 0.98
		e.ssao_light_affect = 0.35
		RenderingServer.environment_set_ssao_quality(q.ssao_q, true, 0.5, 2, 3000.0, 6000.0)
	e.ssil_enabled = q.ssil
	if q.ssil:
		e.ssil_radius = 240.0
		e.ssil_intensity = 0.8
	e.ssr_enabled = q.ssr
	if q.ssr:
		e.ssr_max_steps = 64
		e.ssr_fade_in = 0.15
		e.ssr_fade_out = 2.0
		e.ssr_depth_tolerance = 12.0
	e.volumetric_fog_enabled = q.vfog
	if q.vfog:
		e.volumetric_fog_density = float(look.vfog)
		e.volumetric_fog_albedo = fog_col.lerp(Color.WHITE, 0.4)
		e.volumetric_fog_emission = Color.BLACK
		e.volumetric_fog_anisotropy = float(look.vfog_aniso)
		e.volumetric_fog_length = 3200.0
		e.volumetric_fog_detail_spread = 2.0
		e.volumetric_fog_ambient_inject = 0.0
		e.volumetric_fog_sky_affect = 0.0
		RenderingServer.environment_set_volumetric_fog_volume_size(int(q.vfog_size), 64)
	e.adjustment_enabled = true
	e.adjustment_saturation = float(look.saturation)
	e.adjustment_contrast = float(look.contrast)
	if L.sun:
		L.sun.directional_shadow_max_distance = float(q.dist)
		L.sun.light_angular_distance = float(q.pcss)
		L.sun.shadow_blur = 1.0
	RenderingServer.directional_shadow_atlas_set_size(int(q.shadow), true)
	RenderingServer.directional_soft_shadow_filter_set_quality(q.soft)
	RenderingServer.positional_soft_shadow_filter_set_quality(q.soft)


## Anti-aliasing and texture filtering of the main viewport.
func apply_viewport() -> void:
	var vp := get_tree().root
	if vp == null:
		return
	var q: Dictionary = PRESETS[quality()]
	vp.msaa_3d = q.msaa
	vp.screen_space_aa = q.aa
	vp.anisotropic_filtering_level = q.aniso
	vp.use_debanding = true
	if Viewmodel.vp:
		Viewmodel.vp.msaa_3d = q.vm_msaa
