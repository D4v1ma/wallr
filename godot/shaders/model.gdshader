// Opaque model surface (see model.gdshaderinc).
shader_type spatial;
render_mode cull_back;

#include "res://shaders/model.gdshaderinc"

void fragment() {
	vec3 alb = m_albedo(UV, UV2, COLOR.rgb);
	if (unlit) {
		ALBEDO = vec3(0.0);
		EMISSION = alb;
	} else {
		ALBEDO = alb;
		ROUGHNESS = rough;
		METALLIC = metal;
		vec3 n = NORMAL;
		if (has_normal) {
			vec3 nm = texture(normal_map, UV).rgb;
			NORMAL_MAP = nm;
			vec2 xy = nm.xy * 2.0 - 1.0;
			n = normalize(TANGENT * xy.x + BINORMAL * xy.y + NORMAL * sqrt(max(0.0, 1.0 - dot(xy, xy))));
		}
		EMISSION = m_indirect(alb, n, VIEW, INV_VIEW_MATRIX);
	}
}
