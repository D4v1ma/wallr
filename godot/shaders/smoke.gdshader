// Smoke grenade clouds: big lit billboards (CUSTOM = size, rotation, alpha, atlas cell; COLOR = light),
// sorted back to front on the CPU, faded near the camera.
shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, depth_draw_never, blend_mix, shadows_disabled;

uniform sampler2D atlas : filter_linear_mipmap, repeat_disable;
global uniform vec4 world_fog;

varying vec2 v_uv;
varying vec3 v_col;
varying float v_a;
varying float v_fog;

void vertex() {
	vec4 mv = VIEW_MATRIX * vec4(MODEL_MATRIX[3].xyz, 1.0);
	vec4 misc = INSTANCE_CUSTOM;
	float c = cos(misc.y);
	float s = sin(misc.y);
	vec2 corner = VERTEX.xy;
	mv.xy += vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * misc.x * 0.5;
	POSITION = PROJECTION_MATRIX * mv;
	float cu = mod(misc.w, 2.0);
	float cv = 1.0 - floor(misc.w / 2.0);
	vec2 uv3 = vec2(cu + (corner.x * 0.49 + 0.5), cv + (corner.y * 0.49 + 0.5)) * 0.5;
	v_uv = vec2(uv3.x, 1.0 - uv3.y);
	v_col = COLOR.rgb;
	float dist = -mv.z;
	v_a = misc.z * smoothstep(14.0, 75.0, dist);
	v_fog = clamp(1.0 - exp(-world_fog.a * world_fog.a * dist * dist), 0.0, 1.0);
}

void fragment() {
	vec4 t = texture(atlas, v_uv);
	float a = t.a * v_a;
	if (a < 0.004) discard;
	vec3 col = mix(v_col * t.rgb, world_fog.rgb, v_fog * 0.6);
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	ALBEDO = col;
#else
	ALBEDO = pow(max(col, vec3(0.0)), vec3(2.2));
#endif
	ALPHA = a;
}
