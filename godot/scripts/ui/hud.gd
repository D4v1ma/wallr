extends CanvasLayer
## The in-game HUD, drawn every frame: crosshair (gap follows the real cone of fire), hit markers,
## health/armor/money, ammo and the wallbang panel, the score bar and clock, alive pips, the radar,
## kill feed, round banners, plant/defuse progress, damage direction, scoreboard (Tab), buy menu (B),
## weapon list, notes, hints, the scope, the hurt vignette and the smoke wash.

const HUD_COL := Color("#f3ecd6")
const DIM := Color(0.953, 0.925, 0.839, 0.62)
const ACCENT := Color("#f0a53a")
const DANGER := Color("#e5573f")
const OK := Color("#95d470")
const T_COL := [Color("#eba264"), Color("#86bcef")]
const SHADOW := Color(0, 0, 0, 0.7)
const PANEL := Color(0.031, 0.039, 0.035, 0.6)
const GAP := 18.0
const RADAR_PX := 168.0

var canvas: Control
var radar_rect: ColorRect
var radar_mat: ShaderMaterial
var scope_rect: ColorRect
var hurt_rect: ColorRect
var smoke_rect: ColorRect
var fd: Font
var fb: Font
var icons: Dictionary = {}
var note_text := ""
var note_t := 0.0
var hit_t := 0.0
var hit_head := false
var hurt_flash := 0.0
var xh_gap := 0.0
var ads_k := 0.0
var cash_last := -1
var cash_d := 0
var cash_t := 0.0
var debug := false
var hint_age := 0.0
var hint_pinned := false
var fps := 0.0
var _fps_acc := 0.0
var _fps_n := 0
var spotted: Dictionary = {}
var _spot_t := 0.0
var buy_open := false
var buy_msg := ""
var buy_msg_t := 0.0
var scope_on := false
var main_cam: Camera3D = null
var active := false


func _ready() -> void:
	layer = 5
	var d := SystemFont.new()
	d.font_names = PackedStringArray(["Chakra Petch", "Bahnschrift", "DIN Alternate", "Segoe UI Semibold", "Segoe UI", "DejaVu Sans", "Sans-Serif"])
	d.font_weight = 600
	fd = d
	var b := SystemFont.new()
	b.font_names = PackedStringArray(["Barlow Semi Condensed", "Barlow", "Arial Narrow", "Segoe UI", "DejaVu Sans Condensed", "Sans-Serif"])
	fb = b
	scope_rect = _overlay(preload("res://shaders/scope.gdshader"))
	hurt_rect = _overlay(preload("res://shaders/vignette.gdshader"))
	smoke_rect = ColorRect.new()
	smoke_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	smoke_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	smoke_rect.color = Color(0.6, 0.6, 0.6, 0)
	add_child(smoke_rect)
	radar_rect = ColorRect.new()
	radar_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	radar_rect.position = Vector2(GAP, GAP)
	radar_rect.size = Vector2(RADAR_PX, RADAR_PX)
	radar_mat = ShaderMaterial.new()
	radar_mat.shader = preload("res://shaders/radar.gdshader")
	radar_rect.material = radar_mat
	add_child(radar_rect)
	canvas = Control.new()
	canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas.draw.connect(_draw_hud)
	add_child(canvas)
	for id in ["rifle", "pistol", "knife", "smoke", "smg", "shotgun", "sniper", "charge"]:
		var p := "res://assets/ui/icon_%s.png" % id
		if ResourceLoader.exists(p):
			icons[id] = load(p)
	icons["blast"] = icons.get("charge")
	set_active(false)


func _overlay(sh: Shader) -> ColorRect:
	var r := ColorRect.new()
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.set_anchors_preset(Control.PRESET_FULL_RECT)
	var m := ShaderMaterial.new()
	m.shader = sh
	r.material = m
	r.visible = false
	add_child(r)
	return r


func set_active(on: bool) -> void:
	active = on
	visible = on
	if not on:
		buy_open = false
		Controls.ui_capture = false


func level_changed(L: Level) -> void:
	radar_mat.set_shader_parameter("radar", L.radar)
	radar_mat.set_shader_parameter("tex_size", Vector2(L.radar.get_width(), L.radar.get_height()))
	spotted.clear()


# --- events from the game ----------------------------------------------------------------------

func note(text: String) -> void:
	note_text = text
	note_t = 2.2


func hitmarker(head: bool = false) -> void:
	hit_t = 0.16 if head else 0.1
	hit_head = head


func hurt(dmg: int) -> void:
	hurt_flash = minf(1.0, hurt_flash + 0.25 + dmg / 80.0)
	Snd.hurt()


func wallbang_note(r: String) -> void:
	var me := Actors.me
	match r:
		"armed":
			Snd.sfx("wbArm")
			note("Wallbang round loaded: your next shot goes through every wall")
		"off":
			Snd.sfx("wbOff")
			note("Wallbang round unloaded")
		"locked":
			var u := Wallbang.unlock_in(me)
			note("Wallbang rounds come back next round" if u == INF else "Wallbang rounds unlock in %d s" % ceili(u))
		"empty":
			note("No wallbang rounds left this round")
		"nogun":
			note("Hold a gun to load a wallbang round")


static func clock(t: float) -> String:
	var s := maxi(0, ceili(t))
	return "%d:%02d" % [s / 60, s % 60]


static func money(v: int) -> String:
	var s := str(absi(v))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if v < 0 else "") + s + out


# --- buy menu ----------------------------------------------------------------------------------

func toggle_buy(force: Variant = null) -> void:
	var want: bool = (not buy_open) if force == null else force
	var me := Actors.me
	if want and not Match.active:
		note("Buying is part of defuse mode")
		return
	if want and not Match.can_buy(me):
		note("You can buy again next round" if not me.alive else ("Buy time is over" if not Match.buy_time() else "Too far from your buy zone"))
		return
	buy_open = want
	Controls.ui_capture = want
	buy_msg = ""


func buy_press(n: int) -> void:
	for e: Dictionary in Match.SHOP:
		if int(e.key) == n:
			var r := Match.buy(Actors.me, e.id)
			buy_msg = r.msg
			buy_msg_t = 2.5
			if not r.ok:
				Snd.dry()


# --- per frame ---------------------------------------------------------------------------------

func update(dt: float, cam: Camera3D) -> void:
	main_cam = cam
	if not active:
		return
	note_t = maxf(0.0, note_t - dt)
	hit_t = maxf(0.0, hit_t - dt)
	hurt_flash = maxf(0.0, hurt_flash - dt * 1.4)
	buy_msg_t = maxf(0.0, buy_msg_t - dt)
	if buy_msg_t <= 0.0:
		buy_msg = ""
	cash_t = maxf(0.0, cash_t - dt)
	if Game.state == "play":
		hint_age += dt
	_fps_acc += dt
	_fps_n += 1
	if _fps_acc >= 0.5:
		fps = _fps_n / _fps_acc
		_fps_acc = 0.0
		_fps_n = 0
	var me := Actors.me
	if me == null:
		return
	if buy_open and (not Match.active or not me.alive or not Match.buy_time() or Game.state != "play"):
		toggle_buy(false)
	if cash_last >= 0 and me.money != cash_last:
		cash_d = me.money - cash_last
		cash_t = 2.4
	cash_last = me.money
	_update_spotted(me, dt)
	# radar window
	var who := me
	if not me.alive and Game.spec_target and Game.spec_target.alive:
		who = Game.spec_target
	var L := Game.L
	var s := float(L.meta.radar.s)
	var lo: Array = L.meta.radar.lo
	var zoom := 0.8
	radar_mat.set_shader_parameter("view_px", Vector2((who.player.pos.x - float(lo[0])) * s, (who.player.pos.z - float(lo[1])) * s))
	radar_mat.set_shader_parameter("yaw", who.player.yaw)
	radar_mat.set_shader_parameter("k", zoom)
	radar_mat.set_shader_parameter("size_px", RADAR_PX)
	# overlays
	var w := me.loadout.active
	var zf := (w as Gun).scope_fov() if w is Gun and me.alive else 0.0
	scope_on = zf > 0.0
	scope_rect.visible = scope_on
	if scope_on:
		(scope_rect.material as ShaderMaterial).set_shader_parameter("screen", canvas.size)
	hurt_rect.visible = hurt_flash > 0.01
	(hurt_rect.material as ShaderMaterial).set_shader_parameter("amount", hurt_flash)
	var sm: Array = Grenades.inside_at(cam.global_position) if cam else [0.0, Color.GRAY]
	var sc: Color = sm[1]
	smoke_rect.color = Color(clampf(sc.r, 0, 1), clampf(sc.g, 0, 1), clampf(sc.b, 0, 1), roundf(float(sm[0]) * 0.94 * 100.0) / 100.0)
	ads_k = (w as Gun).ads if w is Gun else 0.0
	canvas.queue_redraw()


## Enemies count as spotted while you (in your view cone) or a teammate's bot can see them.
func _update_spotted(me: Actor, dt: float) -> void:
	for a: Actor in spotted.keys():
		var t: float = spotted[a] - dt
		if not a.alive or t <= 0.0:
			spotted.erase(a)
		else:
			spotted[a] = t
	_spot_t -= dt
	if _spot_t > 0.0:
		return
	_spot_t = 0.15
	var eye := me.eye()
	var f := me.view_dir()
	for e: Actor in Actors.list:
		if not e.alive or e.team == me.team:
			continue
		if me.admin:
			spotted[e] = 1.0
			continue
		var seen := false
		for t: Actor in Actors.list:
			if t.alive and t.team == me.team and t.brain and t.brain.target == e and t.brain.visible:
				seen = true
				break
		if not seen and me.alive:
			var c := e.player.pos + Vector3(0, 46, 0)
			var to := c - eye
			var d := maxf(to.length(), 1.0)
			if to.dot(f) / d > 0.62:
				seen = Game.L.cw.ray(eye, to / d, d, CollisionWorld.MASK_SHOT) < 0.0 and not Grenades.blocks(eye, c)
		if seen:
			spotted[e] = 1.0


# --- drawing helpers -----------------------------------------------------------------------------

func _str(pos: Vector2, text: String, size: int, col: Color, font: Font = null, align: int = HORIZONTAL_ALIGNMENT_LEFT, width: float = -1.0) -> float:
	var f := font if font else fd
	if align != HORIZONTAL_ALIGNMENT_LEFT and width < 0.0:
		var tw := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
		pos.x -= tw if align == HORIZONTAL_ALIGNMENT_RIGHT else tw * 0.5
		align = HORIZONTAL_ALIGNMENT_LEFT
	canvas.draw_string(f, pos + Vector2(0, 1.5), text, align, width, size, Color(0, 0, 0, col.a * 0.7))
	canvas.draw_string(f, pos, text, align, width, size, col)
	return f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x


func _w(text: String, size: int, font: Font = null) -> float:
	return (font if font else fd).get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x


## Coloured runs on one line: [[text, colour], ...]; returns the width.
func _runs(pos: Vector2, runs: Array, size: int, font: Font = null) -> float:
	var x := pos.x
	for r: Array in runs:
		x += _str(Vector2(x, pos.y), String(r[0]), size, r[1], font)
	return x - pos.x


func _runs_w(runs: Array, size: int, font: Font = null) -> float:
	var x := 0.0
	for r: Array in runs:
		x += _w(String(r[0]), size, font)
	return x


func deg_to_px(deg: float) -> float:
	if main_cam == null:
		return 0.0
	return tan(deg_to_rad(deg)) / tan(deg_to_rad(main_cam.fov) / 2.0) * (canvas.size.y / 2.0)


# --- the HUD -------------------------------------------------------------------------------------

func _draw_hud() -> void:
	var me := Actors.me
	if me == null or Game.L == null:
		return
	var W := canvas.size.x
	var H := canvas.size.y
	var lo := me.loadout
	var w := lo.active
	var pl := Game.player
	var M := Match
	_draw_radar(me)
	# place + tag under the radar
	var place := Game.L.area_at((Game.spec_target if not me.alive and Game.spec_target else me).player.pos)
	_str(Vector2(GAP, GAP + RADAR_PX + 18), place.to_upper(), 13, HUD_COL)
	var tag := ("ADMIN · " if me.admin else "") + ("%s · Round %d" % [Game.L.name, M.round] if M.active else "%s · Skirmish" % Game.L.name)
	_str(Vector2(GAP, GAP + RADAR_PX + 36), tag.to_upper(), 11, DIM)
	# score bar + clock
	var sc := [M.side_score(0), M.side_score(1)] if M.active else Actors.score
	var clk := ":"
	var clk_col := DIM
	if M.active:
		if M.phase == "planted":
			clk = "CHARGE"
			clk_col = DANGER
		elif M.phase == "freeze" or M.phase == "live":
			clk = clock(M.t)
			clk_col = ACCENT if M.phase == "freeze" else (DANGER if M.t < 10.0 else HUD_COL)
		else:
			clk = "0:00"
	var runs := [["RAIDERS  ", T_COL[0]], ["%d  " % sc[0], HUD_COL], [clk, clk_col], ["  %d" % sc[1], HUD_COL], ["  WARDENS", T_COL[1]]]
	var rw := _runs_w(runs, 15)
	canvas.draw_rect(Rect2(W / 2 - rw / 2 - 14, 8, rw + 28, 26), PANEL)
	_runs(Vector2(W / 2 - rw / 2, 27), runs, 15)
	if M.active:
		_draw_alive(W / 2, 44)
	else:
		var rng := "PLATES %d/%d · HITS %d · SHOTS %d" % [Ents.plate_count() - Ents.plates_up(), Ents.plate_count(), Ents.stats.hits, Ents.stats.shots]
		if Ents.plate_count() > 0:
			_str(Vector2(W / 2, 52), rng, 11, DIM, null, HORIZONTAL_ALIGNMENT_CENTER)
	_draw_feed(W)
	# health / armor / money
	if me.alive:
		var low := me.health <= 25
		_draw_cross(Vector2(GAP + 2, H - GAP - 26))
		_str(Vector2(GAP + 30, H - GAP), str(me.health), 34, DANGER if low else HUD_COL)
		_draw_shield(Vector2(GAP + 110, H - GAP - 26))
		var aw := _str(Vector2(GAP + 136, H - GAP), str(me.armor), 34, HUD_COL)
		if me.helmet and me.armor > 0:
			_str(Vector2(GAP + 142 + aw, H - GAP - 4), "+HELMET", 10, DIM)
	if M.active:
		var cash := "$ ∞" if me.admin else "$ " + money(me.money)
		_str(Vector2(GAP, H - GAP - 52), cash, 22, OK if M.can_buy(me) else HUD_COL)
		if cash_t > 0.0 and cash_d != 0:
			_str(Vector2(GAP + _w(cash, 22) + 10, H - GAP - 52), ("+$" if cash_d > 0 else "−$") + money(absi(cash_d)), 15, OK if cash_d > 0 else DANGER)
		if M.can_buy(me):
			_str(Vector2(GAP, H - GAP - 80), "BUY ZONE · B", 11, DIM)
		if lo.by_id("charge"):
			var in_site := Bomb.site_at(pl.pos) != null
			_str(Vector2(GAP, H - GAP - (98 if M.can_buy(me) else 80)), "CHARGE · IN SITE: HOLD FIRE TO PLANT" if in_site else "YOU CARRY THE CHARGE", 11, ACCENT if in_site else DIM)
	# ammo + weapon + wallbang panel
	if me.alive:
		_draw_ammo(W, H, w)
		_draw_wallbang(W, H, me)
	# speed + fps
	if Settings.get_value("showSpeed"):
		_str(Vector2(W / 2, H - 14), "%d u/s%s" % [roundi(pl.speed()), " · noclip" if pl.noclip else ""], 14, DIM, null, HORIZONTAL_ALIGNMENT_CENTER)
	if Settings.get_value("showFps"):
		_str(Vector2(W - GAP, H - 8), "%d FPS" % roundi(fps), 11, DIM, null, HORIZONTAL_ALIGNMENT_RIGHT)
	_draw_crosshair(W, H, me, w, pl)
	_draw_center_text(W, H, me, w)
	if lo.list_show_t > 0.0:
		_draw_wlist(W, H, lo)
	if buy_open:
		_draw_buy(H, me)
	if Controls.down("scores") and Game.state == "play":
		_draw_board(W, H, me)
	_draw_hints(H)
	if debug:
		_draw_debug(w, pl)


func _draw_radar(me: Actor) -> void:
	var R := RADAR_PX / 2.0
	var c := Vector2(GAP + R, GAP + R)
	var who := me
	if not me.alive and Game.spec_target and Game.spec_target.alive:
		who = Game.spec_target
	var view := who.player.pos
	var yaw := who.player.yaw
	var s := float(Game.L.meta.radar.s)
	var k := 0.8
	var cs := cos(yaw)
	var sn := sin(yaw)
	var lim := R - 7.0
	var at := func(x: float, z: float, clamp_it: bool) -> Array:
		var dx := (x - view.x) * s * k
		var dz := (z - view.z) * s * k
		var X := dx * cs - dz * sn
		var Y := dx * sn + dz * cs
		var d := Vector2(X, Y).length()
		if clamp_it and d > lim:
			X *= lim / d
			Y *= lim / d
		return [Vector2(X, Y) + c, d <= lim]
	for st: Dictionary in Game.L.sites:
		var p: Array = at.call(float(st.center[0]), float(st.center[2]), true)
		_str(p[0] + Vector2(0, 5), String(st.name), 14, Color(ACCENT, 0.92), null, HORIZONTAL_ALIGNMENT_CENTER)
	var bomb: Variant = Bomb.where()
	if bomb != null and Match.active:
		var vis: bool = Bomb.state == "planted" or (me.team == 0 and Bomb.state == "dropped")
		if vis and (Bomb.state != "planted" or int(floor(Game.time * 3.0)) % 2 == 0):
			var bp: Array = at.call(bomb.x, bomb.z, true)
			var r := Rect2(bp[0] - Vector2(4, 3), Vector2(8, 6))
			canvas.draw_rect(r, Color("#ff4a32") if Bomb.state == "planted" else ACCENT)
			canvas.draw_rect(r, Color(0, 0, 0, 0.8), false, 1.0)
	for a: Actor in Actors.list:
		if a == who or not a.alive:
			continue
		var mate := a.team == me.team
		if not mate and not spotted.has(a):
			continue
		var p2: Array = at.call(a.player.pos.x, a.player.pos.z, mate)
		if not mate and not p2[1]:
			continue
		var col: Color = T_COL[a.team] if mate else Color("#ff3b2f")
		var pos: Vector2 = p2[0]
		if mate:
			var h := a.player.yaw - yaw
			canvas.draw_line(pos, pos + Vector2(-sin(h), -cos(h)) * 7.0, col, 1.6)
		canvas.draw_circle(pos, 3.6, col)
		canvas.draw_arc(pos, 3.6, 0, TAU, 12, Color(0, 0, 0, 0.85), 1.0)
		if mate and Bomb.carrier == a:
			canvas.draw_arc(pos, 6.2, 0, TAU, 16, ACCENT, 1.4)
	if who.alive:
		canvas.draw_colored_polygon(PackedVector2Array([c + Vector2(0, -7), c + Vector2(5, 5), c + Vector2(0, 2.5), c + Vector2(-5, 5)]), HUD_COL)
	canvas.draw_arc(c, R - 1.0, 0, TAU, 64, Color(HUD_COL, 0.35), 1.5)


func _draw_alive(cx: float, y: float) -> void:
	for t in 2:
		var list := Actors.list.filter(func(a: Actor) -> bool: return a.team == t)
		var n := list.size()
		for i in n:
			var a: Actor = list[i]
			var x: float = (cx - 18.0 - i * 10.0) if t == 0 else (cx + 12.0 + i * 10.0)
			var col: Color = T_COL[t] if a.alive else Color(0.3, 0.3, 0.3, 0.6)
			canvas.draw_rect(Rect2(x, y, 6, 10), col)


func _draw_feed(W: float) -> void:
	var y := 26.0
	for f: Dictionary in Actors.feed:
		var alpha: float = clampf((7.0 - float(f.age)) / 1.5, 0.0, 1.0) if float(f.age) > 5.5 else 1.0
		var kc: Color = T_COL[int(f.kTeam)]
		var vc: Color = T_COL[int(f.vTeam)]
		kc.a = alpha
		vc.a = alpha
		var icon: Texture2D = icons.get(String(f.wid))
		var extra := (" ◉" if f.hs else "") + (" WB" if f.wb else "")
		var kw := _w(String(f.killer), 14)
		var vw := _w(String(f.victim), 14)
		var iw := 48.0 if icon else _w(String(f.weapon), 12, fb)
		var ew := _w(extra, 12)
		var total := kw + iw + ew + vw + 24.0
		var x := W - GAP - total
		canvas.draw_rect(Rect2(x - 8, y - 16, total + 16, 22), Color(0.03, 0.04, 0.035, 0.55 * alpha))
		if f.me:
			canvas.draw_rect(Rect2(x - 8, y - 16, total + 16, 22), Color(ACCENT, 0.7 * alpha), false, 1.0)
		x += _str(Vector2(x, y), String(f.killer), 14, kc) + 8.0
		if icon:
			canvas.draw_texture_rect(icon, Rect2(x, y - 14, 48, 16), false, Color(1, 1, 1, 0.85 * alpha))
			x += 48.0
		else:
			x += _str(Vector2(x, y), String(f.weapon), 12, Color(DIM, alpha), fb)
		if extra != "":
			x += _str(Vector2(x, y), extra, 12, Color(ACCENT, alpha) if f.wb else Color(DANGER, alpha))
		x += 8.0
		_str(Vector2(x, y), String(f.victim), 14, vc)
		y += 26.0


func _draw_cross(p: Vector2) -> void:
	canvas.draw_rect(Rect2(p + Vector2(7, 0), Vector2(8, 22)), HUD_COL)
	canvas.draw_rect(Rect2(p + Vector2(0, 7), Vector2(22, 8)), HUD_COL)


func _draw_shield(p: Vector2) -> void:
	var pts := PackedVector2Array([Vector2(9, 0), Vector2(18, 3.4), Vector2(18, 11), Vector2(9, 21), Vector2(0, 11), Vector2(0, 3.4)])
	for i in pts.size():
		pts[i] += p
	canvas.draw_colored_polygon(pts, HUD_COL)


func _draw_ammo(W: float, H: float, w: Weapon) -> void:
	var mag := "—"
	var res := ""
	var low := false
	if w is Gun:
		var g := w as Gun
		mag = str(g.ammo)
		res = "/ %d" % g.reserve
		low = g.ammo <= ceili(float(g.def.mag) * 0.25)
	elif w is Grenade:
		mag = str((w as Grenade).count)
		res = "" if (w as Grenade).count > 0 else "restocking"
	var rw := _w(res, 22)
	_str(Vector2(W - GAP - rw, H - GAP), res, 22, DIM)
	_str(Vector2(W - GAP - rw - 10, H - GAP), mag, 34, DANGER if low else HUD_COL, null, HORIZONTAL_ALIGNMENT_RIGHT)
	var name := String(w.def.name)
	_str(Vector2(W - GAP, H - GAP - 40), name, 12, DIM, null, HORIZONTAL_ALIGNMENT_RIGHT)
	if w is Gun and w.state == "reload":
		var g2 := w as Gun
		var f := clampf(g2.t / maxf(g2.reload_dur, 0.001), 0.0, 1.0)
		canvas.draw_rect(Rect2(W - GAP - 140, H - GAP - 36, 140, 3), Color(1, 1, 1, 0.15))
		canvas.draw_rect(Rect2(W - GAP - 140, H - GAP - 36, 140 * f, 3), ACCENT)


func _draw_wallbang(W: float, H: float, me: Actor) -> void:
	var inf := me.admin
	var left := Wallbang.charges(me)
	var unlock := Wallbang.unlock_in(me)
	var armed := Wallbang.armed(me)
	var state := "ARMED · next shot pierces every wall" if armed else ("round over" if unlock == INF else ("unlocks in %d s" % ceili(unlock) if unlock > 0.0 else ("none left this round" if left <= 0.0 else "X to load")))
	var y := H - GAP - 64
	var x := W - GAP
	var col := ACCENT if armed else (DIM if unlock > 0.0 else HUD_COL)
	x -= _w(state, 11, fb)
	_str(Vector2(x, y), state, 11, col, fb)
	x -= 10.0
	if inf:
		x -= _w("∞", 16)
		_str(Vector2(x, y + 1), "∞", 16, ACCENT)
	else:
		for i in range(Wallbang.PER_ROUND - 1, -1, -1):
			x -= 11.0
			var on := float(i) < left
			var dia := PackedVector2Array([Vector2(x + 4, y - 11), Vector2(x + 8, y - 6), Vector2(x + 4, y - 1), Vector2(x, y - 6)])
			if on:
				canvas.draw_colored_polygon(dia, ACCENT if armed else HUD_COL)
			else:
				dia.append(dia[0])
				canvas.draw_polyline(dia, DIM, 1.0)
	x -= 8.0
	_str(Vector2(x - _w("WALLBANG", 11), y), "WALLBANG", 11, ACCENT if armed else DIM)


func _draw_crosshair(W: float, H: float, me: Actor, w: Weapon, pl: Player) -> void:
	if not me.alive or scope_on:
		return
	var c := Vector2(W / 2.0, H / 2.0)
	var gap: float = float(Settings.get_value("xhGap"))
	if w is Gun and String(Settings.get_value("xhStyle")) == "dynamic":
		var g := w as Gun
		gap += minf(deg_to_px(rad_to_deg(atan((g.inaccuracy(pl) + g.spread_base()) * 0.001))), 140.0)
	xh_gap = U.damp(xh_gap, gap, 28.0, get_process_delta_time())
	var armed := Wallbang.armed(me)
	var col := Color(String(Settings.get_value("xhColor")))
	if armed:
		col = ACCENT
	col.a = 1.0 - ads_k
	if col.a > 0.02:
		var L := float(Settings.get_value("xhSize"))
		var T := float(Settings.get_value("xhThick"))
		var gp := roundf(xh_gap * 2.0) / 2.0
		var off := Vector2.ZERO
		if w is Gun and Settings.get_value("xhRecoil"):
			var g := w as Gun
			var vf := float(g.def.recoil.viewFrac)
			off = Vector2(-deg_to_px(g.recoil.y - g.recoil_view.y * vf), -deg_to_px(g.recoil.x - g.recoil_view.x * vf - g.view_kick))
		var cc := c + off
		var rects := [Rect2(cc.x - T / 2, cc.y - gp - L, T, L), Rect2(cc.x - T / 2, cc.y + gp, T, L), Rect2(cc.x - gp - L, cc.y - T / 2, L, T), Rect2(cc.x + gp, cc.y - T / 2, L, T)]
		for r: Rect2 in rects:
			if Settings.get_value("xhOutline"):
				canvas.draw_rect(r.grow(1.0), Color(0, 0, 0, col.a * 0.8))
			canvas.draw_rect(r, col)
		if Settings.get_value("xhDot"):
			canvas.draw_rect(Rect2(cc - Vector2(T, T) / 2, Vector2(T, T)), col)
		if armed:
			canvas.draw_arc(cc, gp + L + 5.0, 0, TAU, 32, Color(ACCENT, col.a * 0.8), 1.5)
	if hit_t > 0.0:
		var hc := DANGER if hit_head else HUD_COL
		for s in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
			canvas.draw_line(c + s * 6.0, c + s * 13.0, hc, 2.0)


func _draw_center_text(W: float, H: float, me: Actor, w: Weapon) -> void:
	var M := Match
	# round banner
	if M.active and not M.banner.is_empty():
		var b := M.banner
		var sub := String(b.sub)
		if b.get("final", false):
			sub += " · new match in %d s" % ceili(M.t)
		var title := String(b.title).to_upper()
		var tw := maxf(_w(title, 30), _w(sub, 14, fb)) + 56.0
		tw = maxf(tw, 280.0)
		var y := H * 0.2
		canvas.draw_rect(Rect2(W / 2 - tw / 2, y, tw, 68), Color(0.031, 0.039, 0.035, 0.64))
		var kind := String(b.kind)
		var edge := OK if kind == "win" else (DANGER if kind == "lose" or kind == "plant" else (ACCENT if kind == "go" or kind == "round" else DIM))
		canvas.draw_rect(Rect2(W / 2 - tw / 2, y, tw, 2), edge)
		var tcol: Color = T_COL[int(b.side)] if b.has("side") else HUD_COL
		_str(Vector2(W / 2, y + 38), title, 30, tcol, null, HORIZONTAL_ALIGNMENT_CENTER)
		_str(Vector2(W / 2, y + 59), sub, 14, DIM, fb, HORIZONTAL_ALIGNMENT_CENTER)
	# note
	if note_t > 0.0 and note_text != "":
		var nw := _w(note_text, 14) + 28.0
		var a := clampf(note_t / 0.4, 0.0, 1.0)
		canvas.draw_rect(Rect2(W / 2 - nw / 2, H * 0.26 - 20, nw, 30), Color(0, 0, 0, 0.5 * a))
		canvas.draw_rect(Rect2(W / 2 - nw / 2, H * 0.26 - 20, nw, 30), Color(ACCENT, 0.5 * a), false, 1.0)
		_str(Vector2(W / 2, H * 0.26), note_text, 14, Color(HUD_COL, a), null, HORIZONTAL_ALIGNMENT_CENTER)
	# planting / defusing progress
	var prog: Array = []
	if me.alive and w is Charge and w.state == "plant":
		prog = ["Planting the charge", (w as Charge).progress, ACCENT]
	elif Bomb.defuser == me:
		prog = ["Defusing · kit" if me.kit else "Defusing", Bomb.defuse_t / Bomb.defuse_dur, Color("#7cb2e6")]
	if not prog.is_empty():
		var pw := 260.0
		var py := H * 0.62
		_str(Vector2(W / 2, py - 8), String(prog[0]).to_upper(), 13, HUD_COL, null, HORIZONTAL_ALIGNMENT_CENTER)
		canvas.draw_rect(Rect2(W / 2 - pw / 2, py, pw, 8), Color(0, 0, 0, 0.55))
		canvas.draw_rect(Rect2(W / 2 - pw / 2, py, pw * clampf(float(prog[1]), 0, 1), 8), prog[2])
	# damage direction
	if me.hurt_t > 0.0 and me.hurt_from != null and me.alive:
		var pl := me.player
		var hf: Vector3 = me.hurt_from
		var ang := U.wrap_angle(atan2(-(hf.x - pl.pos.x), -(hf.z - pl.pos.z)) - pl.yaw)
		var dir := -ang - PI / 2.0
		canvas.draw_arc(Vector2(W / 2, H / 2), 90.0, dir - 0.35, dir + 0.35, 16, Color(DANGER, me.hurt_t * 0.9), 5.0)
	# target name under the crosshair
	if me.alive and main_cam:
		var label := _target_label(me)
		if not label.is_empty():
			_runs(Vector2(W / 2 - _runs_w(label, 14) / 2, H / 2 + 46), label, 14)
	# dead
	if not me.alive and not (M.active and M.phase == "over"):
		var by := "You died"
		if me.killer and me.killer != me:
			by = "Killed by %s · %s%s" % [me.killer.name, me.kill_info.get("weapon", ""), " · headshot" if me.kill_info.get("headshot", false) else ""]
		elif String(me.kill_info.get("weapon", "")) == Bomb.BLAST.name:
			by = "Caught in the blast"
		var after := "Back in %d" % maxi(0, ceili(Actors.RESPAWN_TIME - me.dead_t))
		if M.active:
			var sp := Game.spec_target
			after = "Spectating %s · %d HP · Mouse 1: next" % [sp.name, sp.health] if sp and sp.alive else "Waiting for the next round"
		if me.dead_t < 2.2 or not M.active:
			_str(Vector2(W / 2, H * 0.7), by, 20, HUD_COL, null, HORIZONTAL_ALIGNMENT_CENTER)
		_str(Vector2(W / 2, H * 0.7 + 24), after.to_upper(), 13, DIM, null, HORIZONTAL_ALIGNMENT_CENTER)


func _target_label(me: Actor) -> Array:
	var o := main_cam.global_position
	var d := me.view_dir()
	var h := Actors.hitscan(o, d, 2600.0, me)
	if not h.is_empty():
		if Game.L.cw.ray(o, d, float(h.t), CollisionWorld.MASK_SHOT) < 0.0:
			var a: Actor = h.actor
			return [[a.name, T_COL[a.team]]]
	for a: Actor in Actors.list:
		if a == me or not a.alive or a.team != me.team:
			continue
		var ah := a.model.hit_test(o, d, 1800.0)
		if not ah.is_empty() and Game.L.cw.ray(o, d, float(ah.t), CollisionWorld.MASK_SHOT) < 0.0:
			return [[a.name, T_COL[a.team]], [" · %d HP" % a.health, DIM]]
	return []


func _draw_wlist(W: float, H: float, lo: Loadout) -> void:
	var y := H * 0.38
	for x: Weapon in lo.list:
		var on := x == lo.active
		var usable := lo.usable(x)
		var r := Rect2(W - GAP - 220, y, 220, 30)
		canvas.draw_rect(r, Color(0.031, 0.039, 0.035, 0.72 if on else 0.5))
		if on:
			canvas.draw_rect(Rect2(r.position, Vector2(2, 30)), ACCENT)
		var col := HUD_COL if on else (Color(DIM, 0.35) if not usable else DIM)
		_str(Vector2(r.position.x + 10, y + 20), str(x.def.slot), 13, col)
		_str(Vector2(r.position.x + 28, y + 20), String(x.def.name), 13, col)
		var icon: Texture2D = icons.get(x.id)
		if icon:
			canvas.draw_texture_rect(icon, Rect2(r.end.x - 72, y + 7, 60, 20), false, Color(1, 1, 1, 0.8 if on else 0.45))
		y += 34.0


func _draw_buy(H: float, me: Actor) -> void:
	var M := Match
	var can := M.can_buy(me)
	var status := "%d s left" % ceili(M.buy_time_left()) if can else ("Buy time is over" if not M.buy_time() else "Outside your buy zone")
	var x := GAP
	var y := 230.0
	var w := 330.0
	var rows := M.SHOP.size()
	var h := 86.0 + rows * 26.0 + 4 * 20.0
	canvas.draw_rect(Rect2(x, y, w, h), Color(0.05, 0.063, 0.059, 0.9))
	canvas.draw_rect(Rect2(x, y, w, 2), ACCENT)
	_str(Vector2(x + 12, y + 24), "BUY", 15, HUD_COL)
	_str(Vector2(x + 60, y + 24), "$" + money(me.money), 15, OK)
	_str(Vector2(x + w - 12, y + 24), status, 11, DIM, fb, HORIZONTAL_ALIGNMENT_RIGHT)
	var yy := y + 40.0
	var group := ""
	for e: Dictionary in M.SHOP:
		if e.group != group:
			group = e.group
			yy += 16.0
			_str(Vector2(x + 12, yy), group.to_upper(), 10, ACCENT)
			yy += 6.0
		var q := M.quote(me, e)
		var off: bool = not can or q.has("no") or me.money < int(q.get("price", e.price))
		var col := DIM if off else HUD_COL
		_str(Vector2(x + 14, yy + 17), str(e.key), 13, ACCENT if not off else DIM)
		var icon: Texture2D = icons.get(String(e.id)) if e.kind == "weapon" else null
		if icon:
			canvas.draw_texture_rect(icon, Rect2(x + 32, yy + 4, 42, 15), false, Color(1, 1, 1, 0.4 if off else 0.85))
		var nm := String(e.name)
		var note_s := String(q.no) if q.has("no") else ("helmet only" if q.get("note", "") == "helmet" else "")
		_str(Vector2(x + 82, yy + 17), nm + ("  · " + note_s if note_s != "" else ""), 13, col, fb)
		_str(Vector2(x + w - 12, yy + 17), "$" + money(int(q.get("price", e.price))), 13, col, null, HORIZONTAL_ALIGNMENT_RIGHT)
		yy += 26.0
	_str(Vector2(x + 12, y + h - 10), buy_msg if buy_msg != "" else "1–9 to buy · B to close", 11, ACCENT if buy_msg != "" else DIM, fb)


func _draw_board(W: float, H: float, me: Actor) -> void:
	var M := Match
	var bw := 640.0
	var x := W / 2 - bw / 2
	var y := H * 0.18
	var h := 60.0 + 26.0 * maxf(Actors.count(0) + (1 if me.team == 0 else 0), Actors.count(1) + (1 if me.team == 1 else 0)) + 40.0
	canvas.draw_rect(Rect2(x, y, bw, h), Color(0.031, 0.039, 0.035, 0.82))
	for t in 2:
		var cx := x + 16.0 + t * bw / 2.0
		var score: int = M.side_score(t) if M.active else Actors.score[t]
		_str(Vector2(cx, y + 26), "%s · %d" % [Actors.TEAMS[t].name.to_upper(), score], 14, T_COL[t])
		var hy := y + 48.0
		for i in 5:
			var hdr: String = ["NAME", "K", "D", "HP", "MONEY"][i]
			if i == 4 and not M.active:
				continue
			_str(Vector2(cx + [0.0, 130.0, 160.0, 190.0, 228.0][i], hy), hdr, 10, DIM)
		var list := Actors.list.filter(func(a: Actor) -> bool: return a.team == t)
		list.sort_custom(func(a: Actor, b: Actor) -> bool: return a.kills > b.kills)
		var ry := hy + 22.0
		for a: Actor in list:
			var col := HUD_COL if a.alive else DIM
			if a.is_me:
				canvas.draw_rect(Rect2(cx - 6, ry - 16, bw / 2.0 - 20.0, 22), Color(ACCENT, 0.16))
			var nm := a.name + ("  BOT" if a.is_bot else "") + ("  CHARGE" if Bomb.carrier == a and a.team == me.team else "")
			_str(Vector2(cx, ry), nm, 13, col, fb)
			_str(Vector2(cx + 130, ry), str(a.kills), 13, col)
			_str(Vector2(cx + 160, ry), str(a.deaths), 13, col)
			_str(Vector2(cx + 190, ry), str(a.health) if a.alive else "—", 13, col)
			if M.active:
				_str(Vector2(cx + 228, ry), "$" + money(a.money) if a.team == me.team else "—", 13, col)
			ry += 26.0
	if M.active and not M.history.is_empty():
		var hx := x + 16.0
		for hh: Dictionary in M.history:
			var sym: String = {"elim": "✕", "bomb": "✹", "defuse": "✓", "time": "◷"}.get(String(hh.reason), "·")
			_str(Vector2(hx, y + h - 12), sym, 13, T_COL[int(hh.side)])
			hx += 16.0


func _draw_hints(H: float) -> void:
	var show_h: bool = Settings.get_value("showHints") and (hint_age < 30.0 or hint_pinned)
	if not show_h:
		return
	var lines := ["WASD move · Space jump · Ctrl crouch · Shift walk", "Mouse 1 fire · Mouse 2 scope in · R reload · E use", "X wallbang round · 1–5 weapons · Q last · G drop",
		"B buy · Tab scores · F inspect · H hide hints · Esc menu"]
	var y := H * 0.5 - 40.0
	canvas.draw_rect(Rect2(GAP, y - 18, 340, lines.size() * 20 + 12), Color(0.031, 0.039, 0.035, 0.48))
	for l: String in lines:
		_str(Vector2(GAP + 9, y), l, 13, HUD_COL, fb)
		y += 20.0


func _draw_debug(w: Weapon, pl: Player) -> void:
	var p := pl.pos
	var v := pl.vel
	var lines := [
		"pos   %.1f %.1f %.1f" % [p.x, p.y, p.z],
		"vel   %.0f %.0f %.0f  (%.0f u/s)" % [v.x, v.y, v.z, pl.speed()],
		"state %s%s · %s" % ["noclip" if pl.noclip else ("ground" if pl.on_ground else "air"), " · ducked" if pl.ducked else "", U.surf_name(pl.ground_surf)],
		"weap  %s · %s · %s" % [w.id, w.state, w.anim],
	]
	if w is Gun:
		var g := w as Gun
		lines.append("      inacc %.1f mrad · spray #%.1f · recoil %.2f°, %.2f°" % [g.inaccuracy(pl), g.spray_idx, g.recoil.x, g.recoil.y])
	var h: Dictionary = Game.last_hit
	lines.append("hit   %s" % ("%s · %.1f dmg · %d walls · %.0fu" % [h.what, h.damage, h.pens, h.dist] if not h.is_empty() else "—"))
	lines.append("fx    %d tracers · %d casings · %d particles" % [FX.tracers.list.size(), FX.shells.list.size(), FX.dust.n + FX.sparks.n])
	lines.append("draw  %d calls · %d fps" % [RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME), roundi(fps)])
	var y := 260.0
	canvas.draw_rect(Rect2(GAP, y - 16, 460, lines.size() * 17 + 12), Color(0, 0, 0, 0.55))
	for l: String in lines:
		canvas.draw_string(fb, Vector2(GAP + 8, y), l, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, HUD_COL)
		y += 17.0
