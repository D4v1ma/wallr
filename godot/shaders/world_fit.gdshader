// Lightmapped world surface whose texture is stretched over the face (crates, signs, doors).
shader_type spatial;
render_mode unshaded, fog_disabled, cull_back, depth_draw_opaque;

uniform sampler2D albedo_tex : filter_linear_mipmap_anisotropic, repeat_disable;

#include "res://shaders/world.gdshaderinc"

void vertex() {
	v_wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_wnrm = (MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz;
}

void fragment() {
	ALBEDO = to_output(world_shade(texture(albedo_tex, UV).rgb, UV2, -VERTEX.z));
}
