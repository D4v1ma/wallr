// Additive glow sprites on models (muzzle flash stars).
shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, blend_add, depth_draw_never;

uniform sampler2D map : filter_linear_mipmap, repeat_disable;
uniform vec3 color = vec3(1.0);

void fragment() {
	vec4 t = texture(map, UV);
	vec3 c = t.rgb * color * t.a;
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	ALBEDO = c;
#else
	ALBEDO = pow(max(c, vec3(0.0)), vec3(2.2));
#endif
}
