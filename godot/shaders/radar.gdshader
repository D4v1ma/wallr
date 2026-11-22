// Rotating circular radar window over the map overview (you face up).
shader_type canvas_item;

uniform sampler2D radar : filter_linear, repeat_disable;
uniform vec2 view_px;      // your position in radar-image pixels
uniform vec2 tex_size;
uniform float yaw;
uniform float k;           // screen pixels per radar-image pixel
uniform float size_px;

void fragment() {
	vec2 P = (UV - 0.5) * size_px;
	float r = length(P);
	if (r > size_px * 0.5 - 1.0) discard;
	float c = cos(yaw);
	float s = sin(yaw);
	vec2 Q = vec2(P.x * c + P.y * s, -P.x * s + P.y * c) / k;
	vec2 uv = (view_px + Q) / tex_size;
	vec4 bg = vec4(10.0, 12.0, 11.0, 0.78 * 255.0) / 255.0;
	vec4 col = bg;
	if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0) {
		vec4 t = texture(radar, uv);
		col.rgb = mix(bg.rgb, t.rgb, t.a * 0.92);
		col.a = max(bg.a, t.a * 0.92);
	}
	COLOR = col;
}
