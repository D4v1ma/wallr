// Procedural sky: zenith/horizon gradient, value-noise clouds lit from the sun side,
// a distant mountain ridge, ground below the horizon and the sun disc with its glow.
shader_type sky;

uniform vec3 sun_dir = vec3(0.0, 1.0, 0.0);
uniform vec3 zen = vec3(0.33, 0.5, 0.78);
uniform vec3 hor = vec3(0.86, 0.8, 0.7);
uniform vec3 sun_col = vec3(1.0, 0.86, 0.62);
uniform vec3 ground = vec3(0.62, 0.55, 0.45);
uniform vec3 mtn = vec3(0.6, 0.53, 0.44);

float h3(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float n3(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
		mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

float fbm3(vec3 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 6; i++) {
		s += a * n3(p);
		p = p * 2.03 + vec3(1.7, 9.2, 3.1);
		a *= 0.5;
	}
	return s;
}

vec3 srgb_to_lin(vec3 c) {
	c = max(c, vec3(0.0));
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

void sky() {
	vec3 d = normalize(EYEDIR);
	float h = d.y;
	vec3 col = mix(hor, zen, pow(clamp(h, 0.0, 1.0), 0.55));
	col = mix(col, hor * 1.04, exp(-abs(h) * 16.0) * 0.55);
	if (h > -0.05) {
		vec2 uv = d.xz / (h + 0.16);
		float c = fbm3(vec3(uv * 1.25, 0.5));
		float cov = smoothstep(0.52, 0.8, c);
		float sh = fbm3(vec3(uv * 1.25 + sun_dir.xz * 0.07, 0.5));
		vec3 cl = mix(vec3(1.0, 0.985, 0.95), vec3(0.6, 0.64, 0.72), smoothstep(0.45, 0.86, sh));
		cl += sun_col * 0.18 * pow(max(dot(d, sun_dir), 0.0), 5.0);
		col = mix(col, cl, cov * smoothstep(-0.02, 0.2, h) * 0.92);
	}
	float az = atan(d.z, d.x);
	vec3 q = vec3(cos(az) * 2.4, sin(az) * 2.4, 7.0);
	float ridge = 0.01 + 0.05 * fbm3(q) + 0.018 * fbm3(q * 3.1);
	float m = 1.0 - smoothstep(ridge - 0.0025, ridge + 0.0025, h);
	vec3 mc = mix(mtn, hor, 0.42 + 0.3 * smoothstep(ridge - 0.06, ridge, h));
	col = mix(col, mc, m);
	col = mix(col, ground, 1.0 - smoothstep(-0.12, -0.005, h));
	float sd = max(dot(d, sun_dir), 0.0);
	col += sun_col * (pow(sd, 1100.0) * 9.0 + pow(sd, 70.0) * 0.32 + pow(sd, 6.0) * 0.08);
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	COLOR = max(col, vec3(0.0));
#else
	COLOR = srgb_to_lin(col);
#endif
}
