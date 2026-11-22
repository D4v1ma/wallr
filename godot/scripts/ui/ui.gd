class_name UI
extends RefCounted
## Small UI toolkit for the menus: the theme (colours and fonts of the original), panels, buttons,
## segmented choices, steppers, fields, tiles and bars, all built in code.

const INK := Color("#0b0d0c")
const PANEL := Color(0.051, 0.063, 0.059, 0.94)
const EDGE := Color("#2a312d")
const TEXT := Color("#ece6d4")
const MUTED := Color("#a1a79b")
const ACCENT := Color("#f0a53a")
const ACCENT_INK := Color("#1b1306")
const DANGER := Color("#e5573f")
const OK := Color("#95d470")
const FIELD := Color("#1b201d")
const T_COL := [Color("#eba264"), Color("#86bcef")]

static var _theme: Theme = null
static var display: Font = null
static var body: Font = null


static func fonts() -> void:
	if display != null:
		return
	var d := SystemFont.new()
	d.font_names = PackedStringArray(["Chakra Petch", "Bahnschrift", "DIN Alternate", "Segoe UI Semibold", "Segoe UI", "DejaVu Sans", "Sans-Serif"])
	d.font_weight = 600
	display = d
	var b := SystemFont.new()
	b.font_names = PackedStringArray(["Barlow Semi Condensed", "Barlow", "Arial Narrow", "Segoe UI", "DejaVu Sans Condensed", "Sans-Serif"])
	body = b


static func box(bg: Color, border: Color = Color(0, 0, 0, 0), bw: int = 0, radius: int = 3, pad: float = 8.0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(bw)
	s.set_corner_radius_all(radius)
	s.content_margin_left = pad * 1.4
	s.content_margin_right = pad * 1.4
	s.content_margin_top = pad
	s.content_margin_bottom = pad
	return s


static func theme() -> Theme:
	if _theme != null:
		return _theme
	fonts()
	var t := Theme.new()
	t.default_font = body
	t.default_font_size = 15
	t.set_color("font_color", "Label", TEXT)
	t.set_stylebox("normal", "Button", box(FIELD, EDGE, 1))
	t.set_stylebox("hover", "Button", box(Color("#252c28"), Color("#4a544d"), 1))
	t.set_stylebox("pressed", "Button", box(Color("#2c241a"), ACCENT, 1))
	t.set_stylebox("disabled", "Button", box(Color(0.1, 0.12, 0.11, 0.6), EDGE, 1))
	t.set_stylebox("focus", "Button", box(Color(0, 0, 0, 0), Color(ACCENT, 0.6), 1))
	t.set_color("font_color", "Button", TEXT)
	t.set_color("font_hover_color", "Button", Color.WHITE)
	t.set_color("font_pressed_color", "Button", ACCENT)
	t.set_color("font_disabled_color", "Button", Color(MUTED, 0.5))
	t.set_font("font", "Button", display)
	t.set_font_size("font_size", "Button", 14)
	t.set_stylebox("panel", "PanelContainer", box(PANEL, EDGE, 1, 4, 0))
	t.set_stylebox("normal", "LineEdit", box(FIELD, EDGE, 1))
	t.set_stylebox("focus", "LineEdit", box(FIELD, ACCENT, 1))
	t.set_color("font_color", "LineEdit", TEXT)
	t.set_color("font_placeholder_color", "LineEdit", Color(MUTED, 0.6))
	t.set_color("font_color", "CheckBox", TEXT)
	t.set_color("font_color", "RichTextLabel", TEXT)
	t.set_color("default_color", "RichTextLabel", TEXT)
	t.set_font("normal_font", "RichTextLabel", body)
	t.set_font("bold_font", "RichTextLabel", display)
	t.set_font_size("normal_font_size", "RichTextLabel", 15)
	t.set_font_size("bold_font_size", "RichTextLabel", 15)
	t.set_stylebox("slider", "HSlider", box(Color("#2a312d"), Color(0, 0, 0, 0), 0, 2, 2))
	t.set_stylebox("grabber_area", "HSlider", box(ACCENT, Color(0, 0, 0, 0), 0, 2, 2))
	t.set_stylebox("grabber_area_highlight", "HSlider", box(ACCENT, Color(0, 0, 0, 0), 0, 2, 2))
	t.set_stylebox("panel", "TooltipPanel", box(PANEL, EDGE, 1))
	t.set_stylebox("scroll", "VScrollBar", box(Color(1, 1, 1, 0.04), Color(0, 0, 0, 0), 0, 3, 2))
	t.set_stylebox("grabber", "VScrollBar", box(Color(1, 1, 1, 0.2), Color(0, 0, 0, 0), 0, 3, 2))
	_theme = t
	return t


static func label(text: String, size: int = 15, color: Color = TEXT, font: Font = null, wrap: bool = false) -> Label:
	fonts()
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if font:
		l.add_theme_font_override("font", font)
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l


static func rich(bbcode: String, size: int = 15) -> RichTextLabel:
	var r := RichTextLabel.new()
	r.bbcode_enabled = true
	r.fit_content = true
	r.scroll_active = false
	r.text = bbcode
	r.add_theme_font_size_override("normal_font_size", size)
	r.add_theme_font_size_override("bold_font_size", size)
	r.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return r


static func sect(text: String) -> Label:
	fonts()
	return label(text.to_upper(), 12, ACCENT, display)


static func note(text: String, color: Color = MUTED) -> Label:
	return label(text, 13, color, null, true)


static func vbox(sep: int = 8) -> VBoxContainer:
	var b := VBoxContainer.new()
	b.add_theme_constant_override("separation", sep)
	return b


static func hbox(sep: int = 8) -> HBoxContainer:
	var b := HBoxContainer.new()
	b.add_theme_constant_override("separation", sep)
	return b


static func grid(cols: int, sep: int = 10) -> GridContainer:
	var g := GridContainer.new()
	g.columns = cols
	g.add_theme_constant_override("h_separation", sep)
	g.add_theme_constant_override("v_separation", sep)
	return g


static func spacer() -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c


static func button(text: String, cb: Callable, kind: String = "", min_w: float = 0.0) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	if min_w > 0.0:
		b.custom_minimum_size.x = min_w
	if kind == "primary":
		b.add_theme_stylebox_override("normal", box(ACCENT, ACCENT, 1))
		b.add_theme_stylebox_override("hover", box(Color("#f6b860"), Color("#f6b860"), 1))
		b.add_theme_stylebox_override("pressed", box(Color("#d48f2c"), ACCENT, 1))
		b.add_theme_color_override("font_color", ACCENT_INK)
		b.add_theme_color_override("font_hover_color", ACCENT_INK)
		b.add_theme_color_override("font_pressed_color", ACCENT_INK)
	elif kind == "danger":
		b.add_theme_stylebox_override("normal", box(Color(0.3, 0.08, 0.05, 0.8), DANGER, 1))
		b.add_theme_color_override("font_color", Color("#ffd2c8"))
	elif kind == "ghost" or kind == "link":
		b.add_theme_stylebox_override("normal", box(Color(0, 0, 0, 0)))
		b.add_theme_stylebox_override("hover", box(Color(1, 1, 1, 0.06)))
		b.add_theme_color_override("font_color", ACCENT if kind == "link" else MUTED)
	b.pressed.connect(func() -> void:
		Snd.ui()
		cb.call())
	return b


## A two-line button (title + small line), e.g. map cards and option chips.
static func card(title: String, sub: String, cb: Callable, on: bool = false, disabled: bool = false, icon: Texture2D = null, min_size: Vector2 = Vector2.ZERO) -> Button:
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.toggle_mode = false
	b.disabled = disabled
	b.custom_minimum_size = min_size
	if on:
		b.add_theme_stylebox_override("normal", box(Color("#2c241a"), ACCENT, 1))
		b.add_theme_stylebox_override("hover", box(Color("#352b1e"), ACCENT, 1))
	var v := vbox(2)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.set_anchors_preset(Control.PRESET_FULL_RECT)
	v.offset_left = 10
	v.offset_right = -10
	v.offset_top = 6
	v.offset_bottom = -6
	if icon:
		var tr := TextureRect.new()
		tr.texture = icon
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		tr.custom_minimum_size = Vector2(0, maxf(24.0, min_size.y - (84.0 if sub != "" else 54.0)))
		tr.size_flags_vertical = Control.SIZE_EXPAND_FILL
		tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
		v.add_child(tr)
	var t := label(title, 14, ACCENT if on else (Color(TEXT, 0.4) if disabled else TEXT), display)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(t)
	if sub != "":
		var s := label(sub, 12, MUTED, null, true)
		s.mouse_filter = Control.MOUSE_FILTER_IGNORE
		v.add_child(s)
	b.add_child(v)
	b.pressed.connect(func() -> void:
		Snd.ui()
		cb.call())
	return b


## Segmented choice: opts = [[value, title, sub], ...].
static func seg(opts: Array, value: Variant, cb: Callable, disabled: bool = false) -> HBoxContainer:
	var h := hbox(4)
	for o: Array in opts:
		var v: Variant = o[0]
		var c := card(String(o[1]), String(o[2]) if o.size() > 2 else "", func() -> void: cb.call(v), str(value) == str(v), disabled, null, Vector2(0, 50))
		c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		h.add_child(c)
	return h


static func stepper(text: String, value: int, lo: int, hi: int, cb: Callable, disabled: bool = false) -> HBoxContainer:
	var h := hbox(8)
	var l := label(text, 14, TEXT)
	l.custom_minimum_size.x = 130
	h.add_child(l)
	var minus := button("−", func() -> void: cb.call(-1), "", 34)
	minus.disabled = disabled or value <= lo
	h.add_child(minus)
	var n := label(str(value), 16, ACCENT, display)
	n.custom_minimum_size.x = 26
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	h.add_child(n)
	var plus := button("+", func() -> void: cb.call(1), "", 34)
	plus.disabled = disabled or value >= hi
	h.add_child(plus)
	return h


static func field(caption: String, secret: bool = false, value: String = "", max_len: int = 16, placeholder: String = "") -> Array:
	var v := vbox(3)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_child(label(caption, 12, MUTED))
	var e := LineEdit.new()
	e.secret = secret
	e.text = value
	e.max_length = max_len
	e.placeholder_text = placeholder
	e.custom_minimum_size = Vector2(160, 34)
	v.add_child(e)
	return [v, e]


static func tile(caption: String, value: String) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", box(Color(1, 1, 1, 0.03), EDGE, 1, 3, 8))
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var v := vbox(2)
	v.add_child(label(caption.to_upper(), 11, MUTED))
	v.add_child(label(value, 22, TEXT, display))
	p.add_child(v)
	return p


static func bar(frac: float, color: Color = ACCENT, h: float = 6.0) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(80, h)
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	c.draw.connect(func() -> void:
		c.draw_rect(Rect2(Vector2.ZERO, c.size), Color(1, 1, 1, 0.08))
		c.draw_rect(Rect2(Vector2.ZERO, Vector2(c.size.x * clampf(frac, 0.0, 1.0), c.size.y)), color))
	return c


static func level_badge(lv: int, size: float = 34.0) -> Control:
	fonts()
	var c := Control.new()
	c.custom_minimum_size = Vector2(size, size)
	c.draw.connect(func() -> void:
		var r := size / 2.0
		var pts := PackedVector2Array()
		for i in 6:
			var a := PI / 6.0 + i * PI / 3.0
			pts.append(Vector2(r, r) + Vector2(cos(a), sin(a)) * r)
		c.draw_colored_polygon(pts, Color("#2c241a"))
		pts.append(pts[0])
		c.draw_polyline(pts, ACCENT, 1.5)
		var s := str(lv)
		var fs := int(size * 0.42)
		var w := display.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		c.draw_string(display, Vector2(r - w / 2.0, r + fs * 0.36), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, ACCENT))
	return c


static func fmt_n(n: float) -> String:
	return HUD.money(roundi(n))


static func signed(n: float, d: int = 0) -> String:
	var s := "+" if n > 0.0 else ("−" if n < 0.0 else "±")
	return s + (("%." + str(d) + "f") % absf(n))


static func pts(n: int) -> String:
	return "%s pts" % fmt_n(n)
