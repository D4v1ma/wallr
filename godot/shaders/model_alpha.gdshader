// See-through model surface (sight lenses).
shader_type spatial;
render_mode cull_back, blend_mix, depth_draw_never;

#include "res://shaders/model.gdshaderinc"

void fragment() {
	vec3 alb = m_albedo(UV, UV2, COLOR.rgb);
	ALBEDO = alb;
	ROUGHNESS = rough;
	METALLIC = metal;
	EMISSION = m_indirect(alb, NORMAL, VIEW, INV_VIEW_MATRIX);
	ALPHA = opacity;
}
