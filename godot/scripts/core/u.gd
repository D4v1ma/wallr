class_name U
extends RefCounted
## Small math helpers shared by every module (same formulas as the browser version).

const DEG := PI / 180.0
const SURF_NAMES := ["concrete", "brick", "plaster", "wood", "metal", "sand", "tile", "cloth", "paper"]


static func surf_id(name: String) -> int:
	var i := SURF_NAMES.find(name)
	return maxi(i, 0)


static func surf_name(id: int) -> String:
	return SURF_NAMES[clampi(id, 0, SURF_NAMES.size() - 1)]


## Hermite step between edges a and b (b may be below a).
static func smooth(a: float, b: float, x: float) -> float:
	if a == b:
		return 0.0 if x < a else 1.0
	var t := clampf((x - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


## Frame-rate independent approach of a toward b.
static func damp(a: float, b: float, rate: float, dt: float) -> float:
	return a + (b - a) * (1.0 - exp(-rate * dt))


static func wrap_angle(a: float) -> float:
	while a > PI:
		a -= TAU
	while a < -PI:
		a += TAU
	return a


## Horizontal field of view given at 4:3 (classic convention) -> vertical fov in degrees.
static func vfov_from(fov43: float) -> float:
	return 2.0 * rad_to_deg(atan(tan(deg_to_rad(fov43) * 0.5) * 0.75))


## View direction for a yaw/pitch pair (yaw 0 looks toward -Z, +yaw turns left).
static func view_dir(yaw: float, pitch: float) -> Vector3:
	var cp := cos(pitch)
	return Vector3(-sin(yaw) * cp, sin(pitch), -cos(yaw) * cp)


static func v3(a: Array) -> Vector3:
	return Vector3(float(a[0]), float(a[1]), float(a[2]))


static func col3(a: Array) -> Color:
	return Color(float(a[0]), float(a[1]), float(a[2]))


static func srgb_to_linear(c: float) -> float:
	return c / 12.92 if c <= 0.04045 else pow((c + 0.055) / 1.055, 2.4)


static func lin(c: Color) -> Color:
	return Color(srgb_to_linear(c.r), srgb_to_linear(c.g), srgb_to_linear(c.b), c.a)


## Deterministic small PRNG (mulberry32), returns floats in [0, 1).
class Rng:
	var s: int

	func _init(seed: int = 1) -> void:
		s = seed & 0xffffffff

	func next() -> float:
		s = (s + 0x6D2B79F5) & 0xffffffff
		var t := s
		t = _imul(t ^ (t >> 15), t | 1)
		t ^= (t + _imul(t ^ (t >> 7), t | 61)) & 0xffffffff
		t = (t ^ (t >> 14)) & 0xffffffff
		return float(t) / 4294967296.0

	func range(a: float, b: float) -> float:
		return a + (b - a) * next()

	static func _imul(a: int, b: int) -> int:
		return (a * b) & 0xffffffff
