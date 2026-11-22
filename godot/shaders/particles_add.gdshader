// Camera-facing particles (dust, chips, smoke puffs) from one MultiMesh: instance origin = position,
// basis x = velocity (for stretched sparks), CUSTOM = (size, rotation, atlas cell, stretch),
// COLOR = tint and alpha. Alpha-blended, fogged.
shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, depth_draw_never, blend_add, shadows_disabled;

uniform sampler2D atlas : filter_linear_mipmap, repeat_disable;
global uniform vec4 world_fog;

varying vec2 v_uv;
varying vec4 v_col;
varying float v_fog;

void vertex() {
	vec3 ipos = MODEL_MATRIX[3].xyz;
	vec3 ivel = MODEL_MATRIX[0].xyz;
	vec4 misc = INSTANCE_CUSTOM;
	vec4 mv = VIEW_MATRIX * vec4(ipos, 1.0);
	vec2 corner = VERTEX.xy;
	float size = misc.x;
	vec2 off;
	if (misc.w > 0.0) {
		vec2 d = (mat3(VIEW_MATRIX) * ivel).xy;
		float len = length(d);
		vec2 dir = len > 0.001 ? d / len : vec2(1.0, 0.0);
		vec2 perp = vec2(-dir.y, dir.x);
		off = dir * corner.x * (size + len * misc.w) + perp * corner.y * size;
	} else {
		float c = cos(misc.y);
		float s = sin(misc.y);
		off = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * size;
	}
	mv.xy += off;
	POSITION = PROJECTION_MATRIX * mv;
	float cu = mod(misc.z, 2.0);
	float cv = 1.0 - floor(misc.z / 2.0);
	vec2 uv3 = vec2(cu + (corner.x * 0.49 + 0.5), cv + (corner.y * 0.49 + 0.5)) * 0.5;
	v_uv = vec2(uv3.x, 1.0 - uv3.y);
	v_col = COLOR;
	float dist = -mv.z;
	v_fog = clamp(1.0 - exp(-world_fog.a * world_fog.a * dist * dist), 0.0, 1.0);
}

void fragment() {
	vec4 t = texture(atlas, v_uv);
	float a = t.a * v_col.a;
	if (a < 0.004) discard;
	vec3 c = t.rgb * v_col.rgb * (1.0 - v_fog);
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	ALBEDO = c;
#else
	ALBEDO = pow(max(c, vec3(0.0)), vec3(2.2));
#endif
	ALPHA = a;
}
