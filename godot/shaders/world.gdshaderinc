// Shared by the world shaders: baked lightmap (stored at half range, overbright to 2x),
// four dynamic point lights (muzzle flashes, explosions), squared-exponential fog.
// The maths runs on the texture values directly (gamma space), like the original renderer;
// Compatibility writes ALBEDO straight to the screen; Forward+ and Mobile treat it as linear and
// convert to sRGB on output, so there the result is linearised first (same pixels either way).

uniform sampler2D lightmap : filter_linear, repeat_disable;

global uniform vec4 dl_pos_0;
global uniform vec4 dl_pos_1;
global uniform vec4 dl_pos_2;
global uniform vec4 dl_pos_3;
global uniform vec4 dl_col_0;
global uniform vec4 dl_col_1;
global uniform vec4 dl_col_2;
global uniform vec4 dl_col_3;
global uniform vec4 world_fog;

varying vec3 v_wpos;
varying vec3 v_wnrm;

vec3 srgb_to_lin(vec3 c) {
	c = max(c, vec3(0.0));
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

vec3 to_output(vec3 c) {
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	return max(c, vec3(0.0));
#else
	return srgb_to_lin(c);
#endif
}

vec3 dlight(vec4 p, vec4 c, vec3 pos, vec3 N) {
	if (p.w <= 0.0) return vec3(0.0);
	vec3 L = p.xyz - pos;
	float d = length(L);
	float a = clamp(1.0 - d / p.w, 0.0, 1.0);
	return c.rgb * (a * a) * clamp(dot(N, L / max(d, 0.001)) * 0.85 + 0.15, 0.0, 1.0);
}

vec3 world_fogged(vec3 col, float depth) {
	float dens = world_fog.a;
	float f = 1.0 - exp(-dens * dens * depth * depth);
	return mix(col, world_fog.rgb, clamp(f, 0.0, 1.0));
}

vec3 world_shade(vec3 albedo, vec2 uv2, float depth) {
	vec3 light = texture(lightmap, uv2).rgb * 2.0;
	vec3 N = normalize(v_wnrm);
	light += dlight(dl_pos_0, dl_col_0, v_wpos, N);
	light += dlight(dl_pos_1, dl_col_1, v_wpos, N);
	light += dlight(dl_pos_2, dl_col_2, v_wpos, N);
	light += dlight(dl_pos_3, dl_col_3, v_wpos, N);
	return world_fogged(albedo * light, depth);
}
