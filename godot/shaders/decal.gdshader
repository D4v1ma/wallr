// Bullet holes: 2x modulate over the wall (grey = no change), pulled a hair toward the camera.
shader_type spatial;
render_mode unshaded, fog_disabled, cull_back, depth_draw_never, blend_mul, shadows_disabled;

uniform sampler2D atlas : filter_linear_mipmap, repeat_disable;
global uniform vec4 world_fog;

varying float v_depth;

void vertex() {
	vec4 mv = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	v_depth = -mv.z;
	mv.xyz *= 0.9993;
	POSITION = PROJECTION_MATRIX * mv;
}

void fragment() {
	vec3 c = texture(atlas, UV).rgb;
	float f = 1.0 - exp(-world_fog.a * world_fog.a * v_depth * v_depth);
	c = mix(c, vec3(0.5), clamp(f, 0.0, 1.0));
	ALBEDO = clamp(c * 2.0, vec3(0.0), vec3(1.0));
}
