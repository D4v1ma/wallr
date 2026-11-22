// Lightmapped PBR world surface whose texture is stretched over the face (crates, signs, doors).
shader_type spatial;
render_mode cull_back, depth_draw_opaque;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap_anisotropic, repeat_disable;
uniform sampler2D orm_tex : hint_default_white, filter_linear_mipmap_anisotropic, repeat_disable;
uniform bool has_pbr = false;
uniform float rough_default = 0.8;

#include "res://shaders/world.gdshaderinc"

void fragment() {
	vec3 alb = texture(albedo_tex, UV).rgb;
	vec3 nm = has_pbr ? texture(normal_tex, UV).rgb : vec3(0.5, 0.5, 1.0);
	vec3 orm = has_pbr ? texture(orm_tex, UV).rgb : vec3(1.0, rough_default, 0.0);
	ALBEDO = alb;
	ROUGHNESS = orm.g;
	METALLIC = orm.b;
	NORMAL_MAP = nm;
	NORMAL_MAP_DEPTH = normal_depth;
	EMISSION = world_indirect(alb, orm, nm, UV2, NORMAL, TANGENT, BINORMAL, VIEW, INV_VIEW_MATRIX);
}
