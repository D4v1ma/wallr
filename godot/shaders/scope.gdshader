// Sniper scope: black outside a circle, thin cross hairs, a soft edge.
shader_type canvas_item;

uniform vec2 screen;

void fragment() {
	vec2 p = UV * screen;
	vec2 c = screen * 0.5;
	float R = min(screen.x, screen.y) * 0.47;
	float d = length(p - c);
	float a = smoothstep(R - 3.0, R + 1.0, d);
	float line = 0.0;
	if (abs(p.x - c.x) < 0.75 || abs(p.y - c.y) < 0.75) line = 1.0;
	if (abs(p.x - c.x) < 2.0 && abs(p.y - c.y) > R * 0.55) line = 1.0;
	if (abs(p.y - c.y) < 2.0 && abs(p.x - c.x) > R * 0.55) line = 1.0;
	COLOR = vec4(0.0, 0.0, 0.0, max(a, line * 0.95));
}
