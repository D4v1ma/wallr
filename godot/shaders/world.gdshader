// Lightmapped PBR world surface with a tiling texture set (albedo, normal, AO/roughness/metal).
shader_type spatial;
render_mode cull_back, depth_draw_opaque;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D orm_tex : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform bool has_pbr = false;
uniform float rough_default = 0.85;
uniform float macro_k = 0.2;

global uniform sampler2D macro_tex : filter_linear_mipmap, repeat_enable;

#include "res://shaders/world.gdshaderinc"

void fragment() {
	vec3 wp = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	// large-scale tone variation in world space hides the tiling of big walls and floors
	float macro = texture(macro_tex, wp.xz * 0.0006 + wp.y * 0.0002).r * 0.55 + texture(macro_tex, wp.xz * 0.0031 + wp.zy * 0.0013).r * 0.45;
	float up = max((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).y, 0.0);
	vec3 alb = texture(albedo_tex, UV).rgb * (1.0 + (macro - 0.5) * macro_k * (2.0 + up * 1.6));
	vec3 nm = has_pbr ? texture(normal_tex, UV).rgb : vec3(0.5, 0.5, 1.0);
	vec3 orm = has_pbr ? texture(orm_tex, UV).rgb : vec3(1.0, rough_default, 0.0);
	orm.g = clamp(orm.g + (macro - 0.5) * macro_k * 0.6, 0.03, 1.0);
	ALBEDO = alb;
	ROUGHNESS = orm.g;
	METALLIC = orm.b;
	NORMAL_MAP = nm;
	NORMAL_MAP_DEPTH = normal_depth;
	EMISSION = world_indirect(alb, orm, nm, UV2, NORMAL, TANGENT, BINORMAL, VIEW, INV_VIEW_MATRIX);
}
