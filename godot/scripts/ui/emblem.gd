class_name Emblem
extends Control
## Rank emblem: a hexagonal badge in the family colour, a glyph per family, chevrons for tiers I–III
## (drawn in code from the same 64x64 design as the original SVG).

var rank := -1


static func make(rk: int, px: float = 56.0) -> Emblem:
	var e := Emblem.new()
	e.rank = rk
	e.custom_minimum_size = Vector2(px, px)
	e.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return e


func _p(x: float, y: float) -> Vector2:
	return Vector2(x, y) * (size.x / 64.0)


func _poly(pts: Array, col: Color, dy: float = 0.0) -> void:
	var out := PackedVector2Array()
	for q: Vector2 in pts:
		out.append(_p(q.x, q.y + dy))
	draw_colored_polygon(out, col)


func _hex(r: float, cy: float = 32.0) -> Array:
	return [Vector2(32, cy - r), Vector2(32 + r * 0.866, cy - r * 0.5), Vector2(32 + r * 0.866, cy + r * 0.5), Vector2(32, cy + r), Vector2(32 - r * 0.866, cy + r * 0.5), Vector2(32 - r * 0.866, cy - r * 0.5)]


func _draw() -> void:
	var outer := [Vector2(32, 3), Vector2(57, 17), Vector2(57, 47), Vector2(32, 61), Vector2(7, 47), Vector2(7, 17)]
	if rank < 0:
		_poly(outer, Color("#1d2120"))
		var o := PackedVector2Array()
		for q: Vector2 in outer:
			o.append(_p(q.x, q.y))
		o.append(o[0])
		draw_polyline(o, Color("#59605a"), 2.0 * size.x / 64.0)
		UI.fonts()
		var fs := int(24.0 * size.x / 64.0)
		var w := UI.display.get_string_size("?", HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string(UI.display, _p(32, 41) - Vector2(w / 2.0, 0), "?", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#8a918a"))
		return
	var r: Dictionary = Profile.RANKS[rank]
	var f: Dictionary = Profile.RANK_FAMILIES[int(r.fam)]
	var c1 := Color(String(f.col))
	var c2 := Color(String(f.col2))
	# vertical gradient: horizontal bands from the top colour to the bottom one
	var o2 := PackedVector2Array()
	for q: Vector2 in outer:
		o2.append(_p(q.x, q.y))
	var cols := PackedColorArray()
	for q: Vector2 in outer:
		cols.append(c1.lerp(c2, (q.y - 3.0) / 58.0))
	draw_polygon(o2, cols)
	o2.append(o2[0])
	draw_polyline(o2, Color(0, 0, 0, 0.6), 2.0 * size.x / 64.0)
	var inner := [Vector2(32, 8), Vector2(52.5, 19.5), Vector2(52.5, 44.5), Vector2(32, 56), Vector2(11.5, 44.5), Vector2(11.5, 19.5)]
	var i2 := PackedVector2Array()
	for q: Vector2 in inner:
		i2.append(_p(q.x, q.y))
	i2.append(i2[0])
	draw_polyline(i2, Color(1, 1, 1, 0.38), 1.2 * size.x / 64.0)
	var dy := -4.0 if int(r.tier) > 0 else 0.0
	match int(r.fam):
		0:   # spark: a four-point star
			_poly([Vector2(32, 18), Vector2(35, 29), Vector2(46, 32), Vector2(35, 35), Vector2(32, 46), Vector2(29, 35), Vector2(18, 32), Vector2(29, 29)], Color("#fff8e8"), dy)
		1:   # flint: a cut stone
			_poly([Vector2(32, 16), Vector2(43, 30), Vector2(32, 48), Vector2(21, 30)], Color("#f4f7f8"), dy)
			draw_line(_p(32, 16 + dy), _p(32, 48 + dy), Color(0, 0, 0, 0.25), 1.0)
			draw_line(_p(21, 30 + dy), _p(43, 30 + dy), Color(0, 0, 0, 0.25), 1.0)
		2:   # fuse: a burning cord
			var pts := PackedVector2Array()
			for i in 13:
				var t := i / 12.0
				var x := lerpf(22.0, 30.0, t) + sin(t * PI * 1.2) * 8.0
				var y := lerpf(44.0, 18.0, t)
				pts.append(_p(x, y + dy))
			draw_polyline(pts, Color("#fff3da"), 3.0 * size.x / 64.0)
			draw_circle(_p(30, 16 + dy), 4.2 * size.x / 64.0, Color.WHITE)
			draw_arc(_p(30, 16 + dy), 7.0 * size.x / 64.0, 0, TAU, 24, Color(1, 0.95, 0.85, 0.7), 1.2 * size.x / 64.0)
		3:   # charge: a lightning bolt
			_poly([Vector2(35, 14), Vector2(23, 34), Vector2(31, 34), Vector2(28, 50), Vector2(42, 28), Vector2(34, 28)], Color("#f2fffc"), dy)
		4:   # blast: a starburst
			_poly([Vector2(32, 13), Vector2(35.5, 25), Vector2(47, 19), Vector2(40, 30), Vector2(51, 34), Vector2(39, 37), Vector2(44, 49), Vector2(33, 41), Vector2(27, 51), Vector2(26, 39), Vector2(14, 41), Vector2(23, 32), Vector2(14, 23), Vector2(27, 26)], Color("#fff1ea"), dy)
		5:   # shockwave: rings
			draw_circle(_p(32, 32 + dy), 5.0 * size.x / 64.0, Color.WHITE)
			draw_arc(_p(32, 32 + dy), 11.0 * size.x / 64.0, 0, TAU, 32, Color("#f3eeff"), 2.4 * size.x / 64.0)
			draw_arc(_p(32, 32 + dy), 17.0 * size.x / 64.0, 0, TAU, 40, Color(0.95, 0.93, 1, 0.7), 1.6 * size.x / 64.0)
		6:   # wallbreaker: a brick wall with a hole blown through it
			for rr in [[16, 19, 14, 6], [33, 19, 15, 6], [16, 28, 7, 6], [41, 28, 7, 6], [16, 37, 14, 6], [33, 37, 15, 6]]:
				draw_rect(Rect2(_p(rr[0], rr[1] + dy), _p(rr[2], rr[3])), Color("#fff6d8"))
			_poly([Vector2(25, 27), Vector2(31, 24), Vector2(35, 28), Vector2(40, 26), Vector2(38, 32), Vector2(42, 37), Vector2(35, 37), Vector2(31, 42), Vector2(28, 36), Vector2(22, 36), Vector2(26, 31)], Color("#e5573f"), dy)
	for i in int(r.tier):
		var y := 50.0 - i * 5.0
		draw_polyline(PackedVector2Array([_p(24, y), _p(32, y + 4), _p(40, y)]), Color(1, 1, 1, 0.9), 2.2 * size.x / 64.0)
