// Procedural sky (linear HDR): zenith/horizon gradient with a sunward haze, two layers of
// value-noise clouds lit from the sun side, a distant mountain ridge, ground below the horizon and
// a bright sun disc that blooms. Colours come in as sRGB from the map and are linearised here.
shader_type sky;
render_mode use_quarter_res_pass;

uniform vec3 sun_dir = vec3(0.0, 1.0, 0.0);
uniform vec3 zen = vec3(0.33, 0.5, 0.78);
uniform vec3 hor = vec3(0.86, 0.8, 0.7);
uniform vec3 sun_col = vec3(1.0, 0.86, 0.62);
uniform vec3 ground = vec3(0.62, 0.55, 0.45);
uniform vec3 mtn = vec3(0.6, 0.53, 0.44);
uniform float cover = 0.5;
uniform float cloud_dark = 0.35;
uniform float energy = 1.0;
uniform float sun_energy = 40.0;

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

float fbm3(vec3 p, int oct) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < oct; i++) {
		s += a * n3(p);
		p = p * 2.03 + vec3(1.7, 9.2, 3.1);
		a *= 0.5;
	}
	return s;
}

vec3 lin(vec3 c) {
	c = max(c, vec3(0.0));
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

void sky() {
	vec3 d = normalize(EYEDIR);
	float h = d.y;
	vec3 S = normalize(sun_dir);
	float sd = max(dot(d, S), 0.0);
	vec3 z = lin(zen), hz = lin(hor), sc = lin(sun_col);
	vec3 col = mix(hz, z, pow(clamp(h, 0.0, 1.0), 0.5));
	col = mix(col, hz * 1.08, exp(-abs(h) * 14.0) * 0.6);
	col += sc * (pow(sd, 8.0) * 0.35 + pow(sd, 3.0) * 0.12) * (1.0 - clamp(h, 0.0, 1.0) * 0.5);
	if (h > -0.04) {
		vec2 uv = d.xz / (h + 0.12);
		float c1 = fbm3(vec3(uv * 0.9, 0.5), 6);
		float c2 = fbm3(vec3(uv * 2.6 + 4.0, 1.5), 4);
		float dens = c1 * 0.75 + c2 * 0.25;
		float cv = smoothstep(1.0 - cover * 0.62 - 0.1, 1.0 - cover * 0.62 + 0.16, dens);
		float sh = fbm3(vec3(uv * 0.9 + S.xz * 0.09, 0.5), 6) * 0.75 + c2 * 0.25;
		float lit = 1.0 - smoothstep(0.42, 0.82, sh) * cloud_dark * 1.6;
		vec3 cl = mix(z * 0.55 + hz * 0.45, vec3(1.0), 0.55) * lit;
		cl += sc * (0.25 * pow(sd, 6.0) + 0.08) * (1.0 - cv * 0.5);
		float fade = smoothstep(-0.02, 0.25, h);
		col = mix(col, cl, cv * fade * 0.95);
	}
	float az = atan(d.z, d.x);
	vec3 q = vec3(cos(az) * 2.4, sin(az) * 2.4, 7.0);
	float ridge = 0.012 + 0.05 * fbm3(q, 6) + 0.018 * fbm3(q * 3.1, 4);
	float m = 1.0 - smoothstep(ridge - 0.002, ridge + 0.002, h);
	vec3 mc = mix(lin(mtn), hz, 0.45 + 0.3 * smoothstep(ridge - 0.06, ridge, h));
	col = mix(col, mc, m);
	col = mix(col, lin(ground) * 0.8, 1.0 - smoothstep(-0.12, -0.004, h));
	col *= energy;
	col += sc * (smoothstep(0.99955, 0.99975, sd) * sun_energy + pow(sd, 400.0) * 2.0);
	COLOR = col;
}
