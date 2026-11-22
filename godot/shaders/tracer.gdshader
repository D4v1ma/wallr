// Tracers: screen-aligned glowing streaks between two points (instance origin = tail,
// basis x = head), additive, thinner up close and never under 0.75 units wide.
shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, depth_draw_never, blend_add, shadows_disabled;

uniform vec3 color = vec3(1.0, 0.8, 0.48);
global uniform vec4 world_fog;

varying float v_u;
varying float v_v;
varying float v_a;

void vertex() {
	vec4 va = VIEW_MATRIX * vec4(MODEL_MATRIX[3].xyz, 1.0);
	vec4 vb = VIEW_MATRIX * vec4(MODEL_MATRIX[0].xyz, 1.0);
	vec2 d = vb.xy / max(-vb.z, 1.0) - va.xy / max(-va.z, 1.0);
	float l = length(d);
	vec2 dir = l > 1e-5 ? d / l : vec2(1.0, 0.0);
	vec2 perp = vec2(-dir.y, dir.x);
	vec4 p = mix(va, vb, VERTEX.x);
	float w = max(0.75, -p.z * 0.0032);
	p.xy += perp * VERTEX.y * w;
	POSITION = PROJECTION_MATRIX * p;
	v_u = VERTEX.x;
	v_v = VERTEX.y;
	v_a = COLOR.a * (1.0 - clamp(1.0 - exp(-world_fog.a * world_fog.a * p.z * p.z), 0.0, 1.0));
}

void fragment() {
	float core = 1.0 - abs(v_v);
	float a = v_a * (0.2 + 0.8 * v_u) * core;
	if (a < 0.003) discard;
	vec3 c = color * (1.0 + core);
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	ALBEDO = c;
#else
	ALBEDO = pow(c, vec3(2.2));
#endif
	ALPHA = a;
}
