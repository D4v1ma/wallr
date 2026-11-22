// Lighting for models (viewmodels, characters, items): the same terms as the original three.js
// materials. Lambert diffuse from an ambient term, a sun, a fill light and a point light (muzzle
// flash), plus Blinn-Phong specular for shiny materials. Light colours carry intensity; the
// character and item colour carries the baked probe light at their position.

uniform sampler2D map : filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D camo_tex : filter_linear_mipmap_anisotropic, repeat_enable;
uniform bool has_map = true;
uniform bool use_camo = false;
uniform bool use_vcolor = false;
uniform bool unlit = false;
uniform bool use_fog = true;
uniform vec3 color = vec3(1.0);
uniform float shininess = 0.0;
uniform vec3 specular = vec3(0.0);
uniform vec3 amb = vec3(0.85);
uniform vec3 sun_dir = vec3(0.0, 1.0, 0.0);
uniform vec3 sun_col = vec3(0.3);
uniform vec3 fill_dir = vec3(0.0, 0.0, 1.0);
uniform vec3 fill_col = vec3(0.0);
uniform vec3 flash_pos = vec3(0.0);
uniform vec3 flash_col = vec3(0.0);
uniform float flash_range = 60.0;
uniform float opacity = 1.0;

global uniform vec4 world_fog;

varying vec3 v_wpos;
varying vec3 v_wnrm;
varying vec3 v_col;

vec3 m_srgb_to_lin(vec3 c) {
	c = max(c, vec3(0.0));
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

vec3 m_output(vec3 c) {
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	return max(c, vec3(0.0));
#else
	return m_srgb_to_lin(c);
#endif
}

vec3 blinn(vec3 N, vec3 L, vec3 V, vec3 lc, float ndl) {
	vec3 H = normalize(L + V);
	float dnh = clamp(dot(N, H), 0.0, 1.0);
	float dlh = clamp(dot(L, H), 0.0, 1.0);
	vec3 F = specular + (vec3(1.0) - specular) * pow(1.0 - dlh, 5.0);
	return lc * ndl * F * (0.25 * (shininess * 0.5 + 1.0) * pow(dnh, shininess));
}

vec3 model_shade(vec2 uv, vec2 uv2, bool front, vec3 cam_pos, float depth) {
	vec3 tex = vec3(1.0);
	if (use_camo) tex = texture(camo_tex, uv2).rgb;
	else if (has_map) tex = texture(map, uv).rgb;
	vec3 base = tex * color;
	if (use_vcolor) base *= v_col;
	vec3 col;
	if (unlit) {
		col = base;
	} else {
		vec3 N = normalize(v_wnrm);
		if (!front) N = -N;
		vec3 V = normalize(cam_pos - v_wpos);
		vec3 diff = amb;
		vec3 spec = vec3(0.0);
		vec3 Ls = normalize(sun_dir);
		float ns = max(dot(N, Ls), 0.0);
		diff += sun_col * ns;
		vec3 Lf = normalize(fill_dir);
		float nf = max(dot(N, Lf), 0.0);
		diff += fill_col * nf;
		vec3 Lp = flash_pos - v_wpos;
		float dp = length(Lp);
		Lp /= max(dp, 0.001);
		float att = pow(clamp(1.0 - dp / flash_range, 0.0, 1.0), 1.5);
		float np = max(dot(N, Lp), 0.0);
		diff += flash_col * att * np;
		if (shininess > 0.0) {
			spec += blinn(N, Ls, V, sun_col, ns) + blinn(N, Lf, V, fill_col, nf) + blinn(N, Lp, V, flash_col * att, np);
		}
		col = base * diff + spec;
	}
	if (use_fog) {
		float f = 1.0 - exp(-world_fog.a * world_fog.a * depth * depth);
		col = mix(col, world_fog.rgb, clamp(f, 0.0, 1.0));
	}
	return col;
}
