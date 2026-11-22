// Glowing surfaces (lamps, screens): emissive colour, bright enough to bloom.
shader_type spatial;
render_mode cull_back;

uniform vec3 color : source_color = vec3(1.0);
uniform float energy = 3.0;

void fragment() {
	ALBEDO = vec3(0.0);
	ROUGHNESS = 0.4;
	EMISSION = color * energy;
}
