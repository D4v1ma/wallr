// See-through model surface (sight lenses).
shader_type spatial;
render_mode unshaded, fog_disabled, cull_back, blend_mix, depth_draw_never;

#include "res://shaders/model.gdshaderinc"

void vertex() {
	v_wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_wnrm = (MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz;
	v_col = COLOR.rgb;
}

void fragment() {
	ALBEDO = m_output(model_shade(UV, UV2, FRONT_FACING, CAMERA_POSITION_WORLD, -VERTEX.z));
	ALPHA = opacity;
}
