extends Node
## Keyboard and mouse: held keys, press edges (consumed once per tick, so a tap between two ticks
## still counts), mouse look in degrees, the wheel. Physical key codes, so layouts don't matter.

const KEYS := {
	"fwd": [KEY_W, KEY_UP], "back": [KEY_S, KEY_DOWN], "left": [KEY_A, KEY_LEFT], "right": [KEY_D, KEY_RIGHT],
	"jump": [KEY_SPACE], "duck": [KEY_CTRL, KEY_C], "walk": [KEY_SHIFT],
	"reload": [KEY_R], "use": [KEY_E], "drop": [KEY_G], "inspect": [KEY_F], "last": [KEY_Q], "wallbang": [KEY_X],
	"slot1": [KEY_1], "slot2": [KEY_2], "slot3": [KEY_3], "slot4": [KEY_4], "slot5": [KEY_5],
	"slot6": [KEY_6], "slot7": [KEY_7], "slot8": [KEY_8], "slot9": [KEY_9],
	"buy": [KEY_B], "scores": [KEY_TAB], "noclip": [KEY_V], "debug": [KEY_F1, KEY_QUOTELEFT], "hints": [KEY_H],
	"pause": [KEY_ESCAPE], "chat": [KEY_Y],
}
const IDLE := {
	"fwd": 0.0, "side": 0.0, "jump": false, "jumpHeld": false, "duck": false, "walk": false, "fire": false, "alt": false,
	"reload": false, "use": false, "useHeld": false, "drop": false, "inspect": false, "slot": 0, "last": false, "cycle": 0,
	"wallbang": false,
}

var _by_key: Dictionary = {}
var held: Dictionary = {}
var edges: Dictionary = {}
var mouse := [false, false, false]
var mouse_edge := [false, false, false]
var mdx := 0.0
var mdy := 0.0
var wheel := 0
var ui_capture := false      ## a menu (buy menu) owns number keys and the mouse buttons
var active := false          ## gameplay input on (mouse captured or free-look mode)
var test_hold: Dictionary = {}   ## tests: command fields forced on every tick


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for action: String in KEYS:
		for k: int in KEYS[action]:
			_by_key[k] = action


func _input(e: InputEvent) -> void:
	if e is InputEventKey:
		var k := e as InputEventKey
		if k.echo:
			return
		var code := k.physical_keycode if k.physical_keycode != 0 else k.keycode
		var a: String = _by_key.get(code, "")
		if a == "":
			return
		if k.pressed:
			if not held.get(a, false):
				edges[a] = true
			held[a] = true
		else:
			held[a] = false
	elif e is InputEventMouseButton:
		var m := e as InputEventMouseButton
		if m.button_index == MOUSE_BUTTON_WHEEL_UP and m.pressed:
			wheel -= 1
		elif m.button_index == MOUSE_BUTTON_WHEEL_DOWN and m.pressed:
			wheel += 1
		elif m.button_index >= 1 and m.button_index <= 3:
			var i: int = [0, 0, 2, 1][m.button_index]
			if m.pressed and not mouse[i]:
				mouse_edge[i] = true
			mouse[i] = m.pressed
	elif e is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var mm := e as InputEventMouseMotion
		mdx += mm.screen_relative.x
		mdy += mm.screen_relative.y


func down(a: String) -> bool:
	return held.get(a, false)


## True once per press.
func pressed(a: String) -> bool:
	if edges.get(a, false):
		edges[a] = false
		return true
	return false


func take_mouse_edge(i: int) -> bool:
	var v: bool = mouse_edge[i]
	mouse_edge[i] = false
	return v


func release_all() -> void:
	held.clear()
	edges.clear()
	mouse = [false, false, false]


func build_cmd() -> Dictionary:
	var c := IDLE.duplicate()
	c.fwd = (1.0 if down("fwd") else 0.0) - (1.0 if down("back") else 0.0)
	c.side = (1.0 if down("right") else 0.0) - (1.0 if down("left") else 0.0)
	c.jump = pressed("jump")
	c.jumpHeld = down("jump")
	c.duck = down("duck")
	c.walk = down("walk")
	c.fire = not ui_capture and mouse[0]
	c.alt = not ui_capture and mouse[2]
	c.reload = pressed("reload")
	c.use = pressed("use")
	c.useHeld = down("use")
	c.drop = pressed("drop")
	c.inspect = pressed("inspect")
	c.wallbang = not ui_capture and pressed("wallbang")
	c.slot = 0
	if not ui_capture:
		for i in range(1, 6):
			if pressed("slot%d" % i):
				c.slot = i
				break
	c.last = pressed("last")
	c.cycle = 1 if wheel > 0 else (-1 if wheel < 0 else 0)
	wheel = 0
	for k: String in test_hold:
		c[k] = test_hold[k]
	return c


## Mouse look since the last frame, in degrees (Quake's 0.022 per count times sensitivity).
func take_look() -> Vector2:
	var k: float = float(Settings.get_value("sensitivity")) * 0.022
	var inv := -1.0 if Settings.get_value("invertY") else 1.0
	var out := Vector2(mdx * k, mdy * k * inv)
	mdx = 0.0
	mdy = 0.0
	return out
