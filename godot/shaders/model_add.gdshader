// Additive glow sprites on models (muzzle flash stars), bright enough to bloom.
shader_type spatial;
render_mode unshaded, cull_disabled, blend_add, depth_draw_never, fog_disabled;

uniform sampler2D map : source_color, filter_linear_mipmap, repeat_disable;
uniform vec3 color = vec3(1.0);
uniform float energy = 2.5;

void fragment() {
	vec4 t = texture(map, UV);
	ALBEDO = t.rgb * color * t.a * energy;
}
