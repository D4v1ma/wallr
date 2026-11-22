// Lit models (viewmodels, characters, items). Godot shades them with the real-time sun (shadow
// maps) and dynamic lights; `irr` (the baked probe light where the model is) and `sky_vis` add the
// indirect light and a reflection as emission, matching the world shader.

uniform sampler2D map : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D camo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D normal_map : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform bool has_map = true;
uniform bool has_normal = false;
uniform bool use_camo = false;
uniform bool use_vcolor = false;
uniform bool unlit = false;
uniform vec3 color : source_color = vec3(1.0);
uniform float rough = 0.6;
uniform float metal = 0.0;
uniform float opacity = 1.0;
uniform float emit = 0.0;
uniform vec3 irr = vec3(0.45);
uniform float sky_vis = 0.5;
uniform mat3 to_world = mat3(1.0);

global uniform sampler2D sky_pano : source_color, filter_linear_mipmap, repeat_enable;
global uniform float refl_k;
global uniform float indirect_k;

vec3 m_sky(vec3 rw, float r) {
	float u = atan(rw.x, -rw.z) / 6.2831853 + 0.5;
	float v = acos(clamp(rw.y, -1.0, 1.0)) / 3.14159265;
	return textureLod(sky_pano, vec2(u, v), r * 6.0).rgb;
}

vec3 m_albedo(vec2 uv, vec2 uv2, vec3 vcol) {
	vec3 tex = vec3(1.0);
	if (use_camo) tex = texture(camo_tex, uv2).rgb;
	else if (has_map) tex = texture(map, uv).rgb;
	vec3 base = tex * color;
	if (use_vcolor) base *= vcol;
	return base;
}

// n: view-space normal (after normal mapping), view: VIEW.
vec3 m_indirect(vec3 alb, vec3 n, vec3 view, mat4 inv_view) {
	float ndv = clamp(dot(n, view), 0.0, 1.0);
	vec3 f0 = mix(vec3(0.04), alb, metal);
	vec3 F = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - ndv, 5.0);
	vec3 rw = to_world * (inv_view * vec4(reflect(-view, n), 0.0)).xyz;
	vec3 ind = irr * indirect_k;
	vec3 env = mix(ind * 0.55, m_sky(rw, rough) * refl_k, sky_vis * smoothstep(-0.25, 0.15, rw.y));
	return alb * (1.0 - metal) * ind + env * F * (1.0 - rough * 0.55) + alb * emit;
}
