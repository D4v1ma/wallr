// Lit world surfaces. Godot shades albedo / normal map / roughness / metal with the real-time sun
// (shadow maps) and the dynamic lights; the baked lightmap supplies everything else (sky light,
// bounced light, lamps) as emission, plus a cheap image-based reflection: the sky panorama where
// the surface sees the sky, the surrounding light where it doesn't.

uniform sampler2D lightmap : filter_linear, repeat_disable;
uniform float lm_range = 4.0;
uniform float normal_depth = 1.0;

global uniform sampler2D sky_pano : source_color, filter_linear_mipmap, repeat_enable;
global uniform float indirect_k;
global uniform float refl_k;

vec3 sky_refl(vec3 rw, float rough) {
	float u = atan(rw.x, -rw.z) / 6.2831853 + 0.5;
	float v = acos(clamp(rw.y, -1.0, 1.0)) / 3.14159265;
	return textureLod(sky_pano, vec2(u, v), rough * 6.0).rgb;
}

// n, t, b: view-space normal frame; view: VIEW; nm: normal-map texel (OpenGL convention).
vec3 world_indirect(vec3 alb, vec3 orm, vec3 nm, vec2 uv2, vec3 n, vec3 t, vec3 b, vec3 view, mat4 inv_view) {
	vec4 lm = texture(lightmap, uv2);
	vec3 irr = lm.rgb * lm.rgb * lm_range * indirect_k;
	float skyv = lm.a;
	vec2 xy = (nm.xy * 2.0 - 1.0) * normal_depth;
	vec3 N = normalize(t * xy.x + b * xy.y + n * sqrt(max(0.0, 1.0 - dot(xy, xy))));
	vec3 nw = (inv_view * vec4(N, 0.0)).xyz;
	vec3 gw = (inv_view * vec4(n, 0.0)).xyz;
	// bumps that face up see more sky; bumps that tilt away from the face see less
	float bump = clamp(1.0 + 0.5 * (nw.y - gw.y) - 0.6 * (1.0 - dot(N, n)), 0.5, 1.35);
	float ao = orm.r, rough = orm.g, metal = orm.b;
	float ndv = clamp(dot(N, view), 0.0, 1.0);
	vec3 f0 = mix(vec3(0.04), alb, metal);
	vec3 F = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - ndv, 5.0);
	vec3 rw = (inv_view * vec4(reflect(-view, N), 0.0)).xyz;
	vec3 env = mix(irr * 0.55, sky_refl(rw, rough) * refl_k, skyv * smoothstep(-0.25, 0.15, rw.y));
	vec3 spec = env * F * ao * (1.0 - rough * 0.55);
	vec3 diff = alb * (1.0 - metal) * irr * bump * ao;
	return diff + spec;
}
