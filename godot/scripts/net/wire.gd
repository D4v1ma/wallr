class_name Wire
extends RefCounted
## Binary pieces of the network protocol. Commands (client -> host, every tick) and snapshots
## (host -> clients) are packed by hand with StreamPeerBuffer; everything else is a Variant array
## (var_to_bytes) on the reliable channel. Weapon ids, round phases and charge states travel as
## small codes.

const WEAPONS := ["", "knife", "pistol", "smg", "shotgun", "rifle", "sniper", "smoke", "charge"]
const PHASES := ["idle", "freeze", "live", "planted", "post", "over"]
const BOMB := ["none", "carried", "dropped", "planted", "defused", "exploded"]
## command buttons, one bit each
const BUTTONS := ["jump", "jumpHeld", "duck", "walk", "fire", "alt", "reload", "use", "useHeld", "drop", "inspect", "last", "wallbang"]
## buttons that act once per press (merged, never dropped, when the host has to catch up)
const EDGES := ["jump", "reload", "use", "drop", "inspect", "last", "wallbang"]

# actor flags in a snapshot
const F_ALIVE := 1
const F_DUCKED := 2
const F_GROUND := 4
const F_NOCLIP := 8
const F_HELMET := 16
const F_KIT := 32
const F_WB := 64
const F_BOT := 128
const F_CHARGE := 256


static func wcode(id: String) -> int:
	return maxi(0, WEAPONS.find(id))


static func wid(code: int) -> String:
	return WEAPONS[code] if code >= 0 and code < WEAPONS.size() else ""


static func put_yaw(b: StreamPeerBuffer, a: float) -> void:
	b.put_u16(int(wrapf(a, 0.0, TAU) / TAU * 65536.0) & 0xffff)


static func get_yaw(b: StreamPeerBuffer) -> float:
	return b.get_u16() / 65536.0 * TAU


static func put_pitch(b: StreamPeerBuffer, a: float) -> void:
	b.put_16(clampi(roundi(a / 1.6 * 32767.0), -32767, 32767))


static func get_pitch(b: StreamPeerBuffer) -> float:
	return b.get_16() / 32767.0 * 1.6


static func put_v3(b: StreamPeerBuffer, v: Vector3) -> void:
	b.put_float(v.x)
	b.put_float(v.y)
	b.put_float(v.z)


static func get_v3(b: StreamPeerBuffer) -> Vector3:
	var x := b.get_float()
	var y := b.get_float()
	return Vector3(x, y, b.get_float())


static func put_h3(b: StreamPeerBuffer, v: Vector3) -> void:
	b.put_half(v.x)
	b.put_half(v.y)
	b.put_half(v.z)


static func get_h3(b: StreamPeerBuffer) -> Vector3:
	var x := b.get_half()
	var y := b.get_half()
	return Vector3(x, y, b.get_half())


## One command: 24 bytes. `vt` is the server tick the client was drawing the others at.
static func put_cmd(b: StreamPeerBuffer, c: Dictionary) -> void:
	b.put_u32(int(c.seq))
	var bits := 0
	for i in BUTTONS.size():
		if c.get(BUTTONS[i], false):
			bits |= 1 << i
	b.put_u16(bits)
	b.put_8(clampi(roundi(float(c.fwd) * 127.0), -127, 127))
	b.put_8(clampi(roundi(float(c.side) * 127.0), -127, 127))
	b.put_u8(int(c.slot))
	b.put_8(int(c.cycle))
	b.put_float(float(c.yaw))
	b.put_float(float(c.pitch))
	b.put_u32(int(c.get("vt", 0)))


static func get_cmd(b: StreamPeerBuffer) -> Dictionary:
	var c := Controls.IDLE.duplicate()
	c.seq = b.get_u32()
	var bits := b.get_u16()
	for i in BUTTONS.size():
		c[BUTTONS[i]] = (bits & (1 << i)) != 0
	c.fwd = b.get_8() / 127.0
	c.side = b.get_8() / 127.0
	c.slot = b.get_u8()
	c.cycle = b.get_8()
	c.yaw = b.get_float()
	c.pitch = b.get_float()
	c.vt = b.get_u32()
	return c


## A command with its one-shot buttons cleared (repeated when the next one hasn't arrived).
static func held_only(c: Dictionary) -> Dictionary:
	var o := c.duplicate()
	for k: String in EDGES:
		o[k] = false
	o.slot = 0
	o.cycle = 0
	return o


## Fold the one-shot buttons of a skipped command into the next one.
static func merge_edges(into: Dictionary, from: Dictionary) -> void:
	for k: String in EDGES:
		if from.get(k, false):
			into[k] = true
	if int(into.slot) == 0 and int(from.slot) > 0:
		into.slot = from.slot
	if int(into.cycle) == 0 and int(from.cycle) != 0:
		into.cycle = from.cycle


## Seed for one shot's spread and recoil jitter, the same on the host and on the shooter's client.
static func shot_seed(shooter: int, seq: int) -> int:
	return (shooter * 0x9E3779B1 + seq * 0x85EBCA6B + 0x27D4EB2F) & 0x7fffffff
