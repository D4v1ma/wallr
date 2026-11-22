// Admin x-ray: the body in a flat team colour wherever a wall is in front of it.
shader_type spatial;
render_mode unshaded, fog_disabled, cull_back, blend_mix, depth_draw_never, depth_test_inverted;

uniform vec3 color = vec3(1.0, 0.54, 0.24);

void fragment() {
	ALBEDO = color;
	ALPHA = 0.6;
}
