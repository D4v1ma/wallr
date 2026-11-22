// Unlit glowing surfaces (lamps, screens): flat colour with fog.
shader_type spatial;
render_mode unshaded, fog_disabled, cull_back;

uniform vec3 color = vec3(1.0);

#include "res://shaders/world.gdshaderinc"

void fragment() {
	ALBEDO = to_output(world_fogged(color, -VERTEX.z));
}
