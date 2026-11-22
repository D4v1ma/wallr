// Getting hurt: a red vignette pulsing in from the edges.
shader_type canvas_item;

uniform float amount = 0.0;

void fragment() {
	vec2 p = UV - 0.5;
	float v = smoothstep(0.25, 0.75, length(p * vec2(1.0, 0.8)) * 1.4);
	COLOR = vec4(0.55, 0.02, 0.0, v * amount * 0.85);
}
