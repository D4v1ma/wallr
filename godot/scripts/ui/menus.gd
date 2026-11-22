extends CanvasLayer
## Front end: accounts on this device, the main menu over a slow fly-through of the loaded map,
## Create Game, the armory (Loadout and Shop share it, with a 3D gun preview), Career, Settings
## (with Controls and the admin passcode), the pause menu, a ready card after a map load, results.

const MAP_LIST := ["depot", "kiln", "frost", "range"]
const BACKABLE := ["create", "armory", "career", "settings", "acctset"]

var root: Control
var shade: ColorRect
var fade: ColorRect
var holder: Control
var current := ""
var stack: Array = []
var cfg: Dictionary = {}
var arm := {"mode": "loadout", "gun": "rifle", "sel": {}, "from_create": false, "msg": ""}
var acct_sel := ""
var acct_err := ""
var acct_draft := ""
var acct_convert := false
var acct_return := ""
var acct_msg := ""
var acct_del := false
var welcome := ""
var admin_msg := ""
var admin_ok := false
var preview: Dictionary = {}
var _fs_check: CheckBox          ## Settings → Fullscreen, kept in step with F11
var _t := 0.0


func _ready() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.theme = UI.theme()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	shade = ColorRect.new()
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(0.02, 0.025, 0.022, 0.55)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(shade)
	Settings.changed.connect(func(k: String, val: Variant) -> void:
		if k == "fullscreen" and is_instance_valid(_fs_check):
			_fs_check.set_pressed_no_signal(bool(val)))
	fade = ColorRect.new()
	fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	fade.color = Color(0, 0, 0, 0)
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(fade)
	holder = Control.new()
	holder.set_anchors_preset(Control.PRESET_FULL_RECT)
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(holder)
	visible = false
	Profile.changed.connect(_rerender)
	Accounts.changed.connect(_rerender)


func _rerender() -> void:
	if current in ["home", "armory", "career"]:
		_render()


func _process(dt: float) -> void:
	_t += dt
	if visible and (Game.state == "menu" or Game.state == "results"):
		fade.color.a = MenuCam.fade if current == "home" else 0.0
	else:
		fade.color.a = 0.0
	if not preview.is_empty() and current == "armory":
		_preview_tick(dt)


func _unhandled_input(e: InputEvent) -> void:
	if not visible or Game.state == "play":
		return
	if e is InputEventKey and e.pressed and not e.echo and e.physical_keycode == KEY_ESCAPE:
		if current in BACKABLE or (current == "newacct" and not Accounts.list.is_empty()):
			back()
			get_viewport().set_input_as_handled()
		elif current == "pause":
			Game.main.play()
			get_viewport().set_input_as_handled()


# --- flow --------------------------------------------------------------------------------------

func boot() -> void:
	Accounts.init()
	if Accounts.remembered != null and Accounts.remembered.get("pin") == null:
		Accounts.sign_in(Accounts.remembered)
	show_screen("loading", false)
	await get_tree().process_frame
	await get_tree().process_frame
	Game.main.load_map(String(Settings.get_value("map")))
	Game.state = "menu"
	first_screen()


## Straight in for the account that signed in last (if it has no PIN), the account picker, or the
## create-account form on a device with no accounts yet.
func first_screen() -> void:
	if Accounts.cur != null:
		home()
	elif not Accounts.list.is_empty():
		acct_sel = String(Accounts.remembered.id) if Accounts.remembered != null else ""
		show_screen("account", false)
	else:
		show_screen("newacct", false)


func show_screen(name: String, push: bool = true) -> void:
	if push and current != "" and current != name and not (current in ["loading", "ready", "results"]):
		stack.append(current)
	current = name
	visible = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	shade.color.a = 0.25 if name == "home" else 0.62
	_render()


func back() -> void:
	var prev: String = stack.pop_back() if not stack.is_empty() else ("pause" if Game.state == "paused" else "home")
	show_screen(prev, false)


func home() -> void:
	stack.clear()
	Game.state = "menu"
	show_screen("home", false)


func hide_all() -> void:
	visible = false
	current = ""
	stack.clear()
	_clear_preview()


func show_results(_res: Dictionary) -> void:
	stack.clear()
	show_screen("results", false)


func launch(c: Dictionary) -> void:
	Session.active = false
	if Game.L and Game.L.key == c.map:
		Session.begin(c)
		Game.main.play()
		return
	show_screen("loading", false)
	await get_tree().process_frame
	await get_tree().process_frame
	Game.main.load_map(String(c.map))
	Session.begin(c)
	Game.state = "menu"
	show_screen("ready", false)


func _render() -> void:
	for c in holder.get_children():
		holder.remove_child(c)
		c.queue_free()
	if current != "armory":
		_clear_preview()
	match current:
		"loading": _render_loading()
		"account": _render_account()
		"newacct": _render_newacct()
		"acctset": _render_acctset()
		"home": _render_home()
		"create": _render_create()
		"armory": _render_armory()
		"career": _render_career()
		"settings": _render_settings()
		"pause": _render_pause()
		"ready": _render_ready()
		"results": _render_results()


## A centred sheet: {panel, body, foot}.
func _sheet(title: String, aside: Control = null, width: float = 980.0, back_btn: bool = true, height: float = 0.0) -> Dictionary:
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(center)
	var panel := PanelContainer.new()
	var vp := root.get_viewport_rect().size
	panel.custom_minimum_size = Vector2(minf(width, vp.x - 32.0), height if height > 0.0 else minf(640.0, vp.y - 40.0))
	center.add_child(panel)
	var v := UI.vbox(0)
	panel.add_child(v)
	var head := UI.hbox(12)
	var hm := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		hm.add_theme_constant_override("margin_" + side, 14 if side != "bottom" else 10)
	hm.add_child(head)
	v.add_child(hm)
	if back_btn:
		head.add_child(UI.button("‹ Back", back, "ghost"))
	head.add_child(UI.label(title.to_upper(), 20, UI.TEXT, UI.display))
	head.add_child(UI.spacer())
	if aside:
		head.add_child(aside)
	var line := ColorRect.new()
	line.color = UI.EDGE
	line.custom_minimum_size.y = 1
	v.add_child(line)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	v.add_child(scroll)
	var bm := MarginContainer.new()
	bm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for side in ["left", "right", "top", "bottom"]:
		bm.add_theme_constant_override("margin_" + side, 16)
	scroll.add_child(bm)
	var body := UI.vbox(12)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bm.add_child(body)
	var line2 := ColorRect.new()
	line2.color = UI.EDGE
	line2.custom_minimum_size.y = 1
	v.add_child(line2)
	var fm := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		fm.add_theme_constant_override("margin_" + side, 12)
	var foot := UI.hbox(10)
	fm.add_child(foot)
	v.add_child(fm)
	return {"panel": panel, "body": body, "foot": foot}


func _pts_label(n: int) -> Label:
	return UI.label("◆ " + UI.pts(n), 14, UI.ACCENT, UI.display)


static func ago(t: float) -> String:
	var s := Time.get_unix_time_from_system() - t
	if s < 90.0:
		return "just now"
	if s < 3600.0:
		return "%d minutes ago" % roundi(s / 60.0)
	if s < 86400.0 * 1.5:
		var h := roundi(s / 3600.0)
		return "%d hour%s ago" % [h, "" if h == 1 else "s"]
	if s < 86400.0 * 30.0:
		return "%d days ago" % roundi(s / 86400.0)
	var d := Time.get_datetime_dict_from_unix_time(int(t))
	return "%d-%02d-%02d" % [d.year, d.month, d.day]


func rank_name(rk: int, placed: int) -> String:
	return "Unranked · %d/%d placements" % [mini(placed, Profile.PLACEMENTS), Profile.PLACEMENTS] if rk < 0 else String(Profile.RANKS[rk].name)


# --- loading / ready / pause ---------------------------------------------------------------------

func _render_loading() -> void:
	var c := CenterContainer.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	holder.add_child(c)
	var v := UI.vbox(10)
	c.add_child(v)
	v.add_child(_brand(46))
	v.add_child(UI.label("LOADING…", 14, UI.MUTED, UI.display))
	shade.color.a = 1.0


func _brand(size: int) -> HBoxContainer:
	var h := UI.hbox(0)
	h.add_child(UI.label("WALL", size, UI.TEXT, UI.display))
	h.add_child(UI.label("R", size, UI.DANGER, UI.display))
	return h


func _render_ready() -> void:
	var s := _sheet("Ready", null, 520.0, false, 300.0)
	var c := Session.cfg
	s.body.add_child(UI.label(Game.L.name if Game.L else "", 30, UI.TEXT, UI.display))
	var info := "%s · %s bots" % ["Ranked" if c.get("ranked", false) else ("Casual" if c.mode == "defuse" else "Skirmish"), Profile.DIFFS[c.diff].name] if not c.is_empty() else ""
	s.body.add_child(UI.label(info, 15, UI.MUTED))
	s.body.add_child(UI.note("Mouse to look, WASD to move. X loads a wallbang round once they unlock. Esc pauses."))
	s.foot.add_child(UI.spacer())
	s.foot.add_child(UI.button("Main menu", func() -> void: Session.active = false; home()))
	s.foot.add_child(UI.button("Deploy ›", func() -> void: Game.main.play(), "primary", 140))


func _render_pause() -> void:
	var s := _sheet("Paused", null, 560.0, false, 380.0)
	var c := Session.cfg
	var info := "Practice"
	if Session.active and not c.is_empty():
		info = "%s · %s · %s bots" % ["Ranked" if c.get("ranked", false) else ("Casual" if c.mode == "defuse" else "Skirmish"), Game.L.name, Profile.DIFFS[c.diff].name]
		if Match.active:
			var me := Actors.me
			info += " · round %d · %d–%d" % [Match.round, Match.score[me.squad], Match.score[1 - me.squad]]
	s.body.add_child(UI.label(info, 15, UI.TEXT))
	if Session.active and c.get("ranked", false) and not Session.done:
		s.body.add_child(UI.note("Leaving a ranked match that has started counts as a loss.", UI.DANGER))
	s.body.add_child(UI.note("Playing as a guest: this match won’t be saved." if Accounts.is_guest() else "Progress saves to %s on this device when the match ends or you leave it." % Accounts.cur.name))
	var col := UI.vbox(8)
	col.add_child(UI.button("Resume", func() -> void: Game.main.play(), "primary"))
	col.add_child(UI.button("Settings", func() -> void: show_screen("settings")))
	col.add_child(UI.button("Leave match" if Session.active and not Session.done else "Main menu", func() -> void: Session.leave()))
	s.body.add_child(col)


# --- accounts ----------------------------------------------------------------------------------

func _render_account() -> void:
	var s := _sheet("Who’s playing?", UI.label("ACCOUNTS ON THIS DEVICE", 12, UI.MUTED, UI.display), 820.0, false)
	if welcome != "":
		s.body.add_child(UI.note(welcome, UI.OK))
		welcome = ""
	var g := UI.grid(2, 10)
	g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	s.body.add_child(g)
	var accs := Accounts.list.duplicate()
	accs.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return maxf(a.lastPlayed, a.created) > maxf(b.lastPlayed, b.created))
	for a: Dictionary in accs:
		var p := Accounts.profile_of(a)
		var lv := Profile.level_of(float(p.xp))
		var rk := Profile.rank_for(float(p.elo)) if int(p.placed) >= Profile.PLACEMENTS else -1
		var when := "Last played " + ago(float(a.lastPlayed)) if float(a.lastPlayed) > 0.0 else "Created " + ago(float(a.created))
		var cardv := UI.vbox(6)
		cardv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var row := UI.hbox(10)
		row.add_child(Emblem.make(rk, 48))
		var tv := UI.vbox(2)
		tv.add_child(UI.label(String(a.name) + ("   🔒 PIN" if a.get("pin") != null else ""), 16, UI.TEXT, UI.display))
		tv.add_child(UI.label("Level %d · %s · %s" % [lv.level, "Unranked" if rk < 0 else Profile.RANKS[rk].name, UI.pts(int(p.points))], 12, UI.MUTED))
		tv.add_child(UI.label(when, 12, UI.MUTED))
		row.add_child(tv)
		var btn := Button.new()
		btn.custom_minimum_size = Vector2(340, 74)
		btn.focus_mode = Control.FOCUS_NONE
		row.set_anchors_preset(Control.PRESET_FULL_RECT)
		row.offset_left = 10
		row.offset_top = 8
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		for ch in [row, tv]:
			ch.mouse_filter = Control.MOUSE_FILTER_IGNORE
		btn.add_child(row)
		var acc := a
		btn.pressed.connect(func() -> void:
			Snd.ui()
			if acc.get("pin") == null:
				Accounts.sign_in(acc)
				after_sign_in()
			else:
				acct_sel = acc.id
				acct_err = ""
				_render())
		cardv.add_child(btn)
		if acct_sel == a.id and a.get("pin") != null:
			var pr := UI.hbox(6)
			var f := UI.field("PIN for " + String(a.name), true, "", 8)
			pr.add_child(f[0])
			var e: LineEdit = f[1]
			var sign := func() -> void:
				if Accounts.verify(acc, e.text):
					Accounts.sign_in(acc)
					after_sign_in()
				else:
					Snd.dry()
					acct_err = "Wrong PIN"
					_render()
			e.text_submitted.connect(func(_t: String) -> void: sign.call())
			var sb := UI.button("Sign in", sign, "primary")
			sb.size_flags_vertical = Control.SIZE_SHRINK_END
			pr.add_child(sb)
			cardv.add_child(pr)
			if acct_err != "":
				cardv.add_child(UI.note(acct_err, UI.DANGER))
			e.call_deferred("grab_focus")
		g.add_child(cardv)
	g.add_child(UI.card("+ New account", "Your own callsign and progress", func() -> void: new_account(false), false, false, null, Vector2(340, 74)))
	s.body.add_child(UI.note("Accounts and their progress (levels, points, purchases, loadouts, rank and match history) are stored on this device. Progress saves when a match ends or you leave it."))
	s.foot.add_child(UI.note("A guest can play everything but nothing is saved."))
	s.foot.add_child(UI.button("Play as guest", func() -> void: Accounts.play_as_guest(); after_sign_in()))


func new_account(convert: bool) -> void:
	acct_convert = convert
	acct_return = current if convert else ""
	acct_err = ""
	acct_draft = ""
	show_screen("newacct")


func after_sign_in() -> void:
	if Actors.me:
		Actors.me.name = Accounts.display_name()
	acct_sel = ""
	acct_err = ""
	home()


func _render_newacct() -> void:
	var first := Accounts.list.is_empty()
	var s := _sheet("Create your account" if first else "New account", UI.label("SAVED ON THIS DEVICE", 12, UI.MUTED, UI.display), 620.0, not first or acct_return != "", 470.0)
	var nf := UI.field("Callsign", false, acct_draft, 16, "e.g. Ember")
	s.body.add_child(nf[0])
	var row := UI.hbox(10)
	var p1 := UI.field("PIN (optional · 4–8 digits)", true, "", 8)
	var p2 := UI.field("Repeat PIN", true, "", 8)
	row.add_child(p1[0])
	row.add_child(p2[0])
	s.body.add_child(row)
	if acct_convert and Accounts.has_progress(Profile.v):
		s.body.add_child(UI.note("This guest session’s progress (level %d, %s) moves into the new account." % [Profile.level().level, UI.pts(int(Profile.v.points))], UI.OK))
	s.body.add_child(UI.note("Your levels, points, purchases, loadouts, rank and match history save on this device when a match ends or you leave it. A PIN stops other people on this device from playing as you; it isn’t encryption."))
	if acct_err != "":
		s.body.add_child(UI.note(acct_err, UI.DANGER))
	var create := func() -> void:
		var name: String = (nf[1] as LineEdit).text
		var pc := Accounts.check_pin((p1[1] as LineEdit).text, (p2[1] as LineEdit).text)
		var nc := Accounts.check_name(name)
		acct_draft = name
		if not nc.ok or not pc.ok:
			Snd.dry()
			acct_err = (nc if not nc.ok else pc).msg
			_render()
			return
		var r := Accounts.create(name, pc.pin, acct_convert)
		if not r.ok:
			Snd.dry()
			acct_err = r.msg
			_render()
			return
		Snd.buy()
		welcome = "Account created: this session’s progress is saved to it." if r.from == "guest" else "Welcome, %s. Your progress saves on this device." % r.account.name
		var back_to := acct_return
		acct_convert = false
		acct_return = ""
		if back_to == "results":
			stack.clear()
			show_screen("results", false)
		else:
			after_sign_in()
	(nf[1] as LineEdit).text_submitted.connect(func(_t: String) -> void: create.call())
	(nf[1] as LineEdit).call_deferred("grab_focus")
	s.foot.add_child(UI.spacer())
	if first and acct_return == "":
		s.foot.add_child(UI.button("Play as guest", func() -> void: Accounts.play_as_guest(); after_sign_in()))
	s.foot.add_child(UI.button("Create account", create, "primary"))


func _render_acctset() -> void:
	var a: Variant = Accounts.cur
	if a == null:
		home()
		return
	var s := _sheet("Account", UI.label(String(a.name), 14, UI.MUTED, UI.display), 640.0)
	var d := Time.get_datetime_dict_from_unix_time(int(a.created))
	s.body.add_child(UI.note("Created %d-%02d-%02d · %s · %s" % [d.year, d.month, d.day, "protected by a PIN" if a.get("pin") != null else "no PIN", Profile.save_label()]))
	if acct_msg != "":
		s.body.add_child(UI.note(acct_msg, UI.OK))
	var rn := UI.hbox(8)
	var nf := UI.field("Callsign", false, String(a.name), 16)
	rn.add_child(nf[0])
	var rb := UI.button("Rename", func() -> void:
		var r := Accounts.rename((nf[1] as LineEdit).text)
		acct_msg = r.msg
		if not r.ok:
			Snd.dry()
		_render())
	rb.size_flags_vertical = Control.SIZE_SHRINK_END
	rn.add_child(rb)
	s.body.add_child(rn)
	s.body.add_child(UI.sect("Change or remove the PIN" if a.get("pin") != null else "Add a PIN"))
	var pr := UI.hbox(8)
	var p0: Array = UI.field("Current PIN", true, "", 8) if a.get("pin") != null else []
	if not p0.is_empty():
		pr.add_child(p0[0])
	var p1 := UI.field("New PIN (empty removes it)" if a.get("pin") != null else "New PIN (4–8 digits)", true, "", 8)
	var p2 := UI.field("Repeat", true, "", 8)
	pr.add_child(p1[0])
	pr.add_child(p2[0])
	s.body.add_child(pr)
	s.body.add_child(UI.button("Save PIN" if a.get("pin") != null else "Add PIN", func() -> void:
		var r := Accounts.set_pin((p0[1] as LineEdit).text if not p0.is_empty() else "", (p1[1] as LineEdit).text, (p2[1] as LineEdit).text)
		acct_msg = r.msg
		if not r.ok:
			Snd.dry()
		_render()))
	s.body.add_child(UI.sect("Delete"))
	if acct_del:
		s.body.add_child(UI.note("This deletes %s and all of its progress from this device. It can’t be undone." % a.name, UI.DANGER))
		var dr := UI.hbox(8)
		var dn := UI.field("Type the callsign", false, "", 16)
		dr.add_child(dn[0])
		var dp: Array = UI.field("PIN", true, "", 8) if a.get("pin") != null else []
		if not dp.is_empty():
			dr.add_child(dp[0])
		s.body.add_child(dr)
		var del_now := func() -> void:
			if Accounts.clean_name((dn[1] as LineEdit).text).to_lower() != String(a.name).to_lower():
				Snd.dry()
				acct_msg = "Type the callsign exactly to confirm"
				_render()
				return
			var r := Accounts.remove(a, (dp[1] as LineEdit).text if not dp.is_empty() else "")
			if not r.ok:
				Snd.dry()
				acct_msg = r.msg
				_render()
				return
			acct_sel = ""
			stack.clear()
			welcome = r.msg
			show_screen("newacct" if Accounts.list.is_empty() else "account", false)
		s.body.add_child(UI.button("Delete forever", del_now, "danger"))
	else:
		s.body.add_child(UI.button("Delete this account…", func() -> void: acct_del = true; acct_msg = ""; _render(), "danger"))
	s.foot.add_child(UI.note("Progress saves on this device when a match ends or you leave it, and whenever you buy or equip something."))
	s.foot.add_child(UI.button("Switch account", switch_account))
	s.foot.add_child(UI.button("Sign out", switch_account))


func switch_account() -> void:
	acct_convert = false
	acct_return = ""
	Accounts.sign_out()
	acct_sel = String(Accounts.remembered.id) if Accounts.remembered != null else ""
	acct_err = ""
	stack.clear()
	show_screen("newacct" if Accounts.list.is_empty() else "account", false)


# --- home --------------------------------------------------------------------------------------

func _render_home() -> void:
	var m := MarginContainer.new()
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 40)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(m)
	var row := UI.hbox(30)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.add_child(row)
	var left := UI.vbox(10)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(left)
	left.add_child(_brand(64))
	left.add_child(UI.label("THE WALLBANG SHOOTER · 5V5 WITH BOTS", 13, UI.MUTED, UI.display))
	var gap := Control.new()
	gap.custom_minimum_size.y = 18
	left.add_child(gap)
	var items := [["Play", func() -> void: open_create(), "Create a match: map, bots, rules"], ["Loadout", func() -> void: open_armory("loadout", false), "Attachments and camos per gun"],
		["Shop", func() -> void: open_armory("shop", false), "%s points to spend" % UI.fmt_n(float(Profile.v.points))], ["Career", func() -> void: show_screen("career"), "Rank, level, stats, matches"],
		["Settings", func() -> void: show_screen("settings"), "Mouse, view, crosshair, sound, admin"], ["Quit", func() -> void: get_tree().quit(), ""]]
	for it: Array in items:
		var b := UI.card(String(it[0]).to_upper(), String(it[2]), it[1], it[0] == "Play", false, null, Vector2(300, 52))
		b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		left.add_child(b)
	left.add_child(UI.spacer())
	left.add_child(UI.label(("Background: " + Game.L.name) if Game.L else "", 12, UI.MUTED))
	# the player card
	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(340, 0)
	card.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(card)
	var cv := UI.vbox(12)
	var cm := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		cm.add_theme_constant_override("margin_" + side, 16)
	cm.add_child(cv)
	card.add_child(cm)
	var acct := UI.hbox(8)
	acct.add_child(UI.label("Guest" if Accounts.is_guest() else String(Accounts.cur.name), 18, UI.TEXT, UI.display))
	if Admin.on:
		acct.add_child(UI.label("ADMIN", 11, UI.DANGER, UI.display))
	acct.add_child(UI.spacer())
	if Accounts.is_guest():
		acct.add_child(UI.button("Create account", func() -> void: new_account(true), "link"))
	else:
		acct.add_child(UI.button("Account", func() -> void: acct_msg = ""; acct_del = false; show_screen("acctset"), "link"))
	acct.add_child(UI.button("Switch", switch_account, "link"))
	cv.add_child(acct)
	var v := Profile.v
	var rk := Profile.rank()
	var top := UI.hbox(12)
	top.add_child(Emblem.make(rk, 64))
	var tv := UI.vbox(2)
	tv.add_child(UI.label(rank_name(rk, int(v.placed)), 17, UI.TEXT, UI.display))
	tv.add_child(UI.label("Play ranked matches to place" if rk < 0 else "%s Elo · peak %s" % [UI.fmt_n(v.elo), UI.fmt_n(v.peak)], 13, UI.MUTED))
	top.add_child(tv)
	cv.add_child(top)
	var lv := Profile.level()
	var lrow := UI.hbox(10)
	lrow.add_child(UI.level_badge(int(lv.level)))
	var lx := UI.vbox(4)
	lx.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var ll := UI.hbox(4)
	ll.add_child(UI.label("Level %d" % lv.level, 13, UI.TEXT))
	ll.add_child(UI.spacer())
	ll.add_child(UI.label("%s / %s XP" % [UI.fmt_n(lv.into), UI.fmt_n(lv.need)], 12, UI.MUTED))
	lx.add_child(ll)
	lx.add_child(UI.bar(float(lv.into) / float(lv.need)))
	lrow.add_child(lx)
	cv.add_child(lrow)
	var foot := UI.hbox(8)
	foot.add_child(_pts_label(int(v.points)))
	foot.add_child(UI.spacer())
	foot.add_child(UI.label(Profile.save_label(), 11, UI.MUTED))
	cv.add_child(foot)
	var n: Variant = Accounts.notice
	var msg := ""
	if n is Dictionary and n.get("res") != null:
		var rr: Dictionary = n.res
		var c: Dictionary = rr.cfg
		var what: String = {"left": "left early", "none": "left before it started", "practice": "practice"}.get(String(rr.outcome), String(rr.outcome))
		msg = "Saved when the game closed: %s · %s · %s · +%s XP%s" % [Level.MAPS.get(c.map, {"name": c.map}).name, ("ranked" if c.get("ranked", false) else "casual") if c.mode == "defuse" else "skirmish", what, UI.fmt_n(rr.xp.total), (" · Elo " + UI.signed(rr.elo.delta)) if rr.elo != null else ""]
	elif welcome != "":
		msg = welcome
	if msg != "":
		var nb := UI.hbox(6)
		var nl := UI.note(msg, UI.OK)
		nb.add_child(nl)
		nb.add_child(UI.button("✕", func() -> void: Accounts.notice = null; welcome = ""; _render(), "ghost"))
		cv.add_child(nb)


# --- create game -------------------------------------------------------------------------------

## The big maps play 8v8: ranked fixes it, casual allows up to 7 bot teammates and 8 opponents.
const RANKED_ALLIES := 7
const RANKED_ENEMIES := 8
const MAX_ALLIES := 7
const MAX_ENEMIES := 8


static func default_cfg() -> Dictionary:
	return {"map": "depot", "mode": "defuse", "ranked": false, "diff": "normal", "team": "1", "allies": RANKED_ALLIES, "enemies": RANKED_ENEMIES, "len": "standard", "ff": false}


func open_create() -> void:
	var last: Variant = Profile.v.lastCfg
	cfg = default_cfg()
	if last is Dictionary:
		cfg.merge(last, true)
	norm_cfg(cfg)
	show_screen("create")


static func norm_cfg(c: Dictionary) -> Dictionary:
	if not Level.MAPS.has(c.map):
		c.map = "depot"
	if not Profile.DIFFS.has(c.diff):
		c.diff = "normal"
	if c.mode != "defuse" and c.mode != "skirmish":
		c.mode = "defuse"
	if c.mode != "defuse":
		c.ranked = false
	c.ranked = bool(c.ranked)
	if c.ranked:
		c.allies = RANKED_ALLIES
		c.enemies = RANKED_ENEMIES
		c.ff = false
		if Level.MAPS[c.map].get("practice", false):
			c.map = "depot"
	c.allies = clampi(int(c.allies), 0, MAX_ALLIES)
	c.enemies = clampi(int(c.enemies), 1, MAX_ENEMIES)
	c.team = str(c.team).replace(".0", "")
	if not ["0", "1", "r"].has(c.team):
		c.team = "1"
	if c.len != "short":
		c.len = "standard"
	c.ff = bool(c.ff)
	return c


func _set_cfg(k: String, v: Variant) -> void:
	cfg[k] = v
	norm_cfg(cfg)
	_render()


func _render_create() -> void:
	var c := norm_cfg(cfg)
	var defuse: bool = c.mode == "defuse"
	var s := _sheet("Create game", _pts_label(int(Profile.v.points)), 1040.0)
	s.body.add_child(UI.sect("Map"))
	var maps := UI.hbox(8)
	for k: String in MAP_LIST:
		var m: Dictionary = Level.MAPS[k]
		var dis: bool = c.ranked and m.get("practice", false)
		var thumb: Texture2D = load("res://assets/ui/thumb_%s.png" % k)
		var b := UI.card(String(m.name), String(m.blurb), func() -> void: _set_cfg("map", k), c.map == k, dis, thumb, Vector2(230, 214))
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		maps.add_child(b)
	s.body.add_child(maps)
	var g := UI.grid(2, 14)
	g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	s.body.add_child(g)
	var cell := func(title: String, ctl: Control) -> VBoxContainer:
		var v := UI.vbox(6)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_child(UI.sect(title))
		v.add_child(ctl)
		return v
	g.add_child(cell.call("Mode", UI.seg([["defuse", "Defuse", "Rounds · money · the charge"], ["skirmish", "Skirmish", "Respawns · practice"]], c.mode, func(v: Variant) -> void: _set_cfg("mode", v))))
	g.add_child(cell.call("Match type", UI.seg([[false, "Casual", "Your rules · Elo ×¼"], [true, "Ranked", "8v8 · full Elo"]], c.ranked, func(v: Variant) -> void: _set_cfg("ranked", v), not defuse)))
	var diffs: Array = []
	for k: String in Profile.DIFF_ORDER:
		diffs.append([k, Profile.DIFFS[k].name, "Rating %d" % Profile.DIFFS[k].elo])
	var dv := UI.vbox(4)
	dv.add_child(UI.seg(diffs, c.diff, func(v: Variant) -> void: _set_cfg("diff", v)))
	dv.add_child(UI.note("%s. Harder bots pay more XP and are worth more Elo." % Profile.DIFFS[c.diff].blurb))
	g.add_child(cell.call("Bot difficulty", dv))
	g.add_child(cell.call("Length", UI.seg([["short", "Short", "First to 9"], ["standard", "Standard", "First to 16"]], c.len, func(v: Variant) -> void: _set_cfg("len", v), not defuse)))
	g.add_child(cell.call("Your side", UI.seg([["1", "Wardens", "Defend"], ["0", "Raiders", "Attack"], ["r", "Random", "Either"]], c.team, func(v: Variant) -> void: _set_cfg("team", v))))
	var pv := UI.vbox(6)
	pv.add_child(UI.stepper("Bot teammates", int(c.allies), 0, MAX_ALLIES, func(d: int) -> void: _set_cfg("allies", int(c.allies) + d), c.ranked))
	pv.add_child(UI.stepper("Bot opponents", int(c.enemies), 1, MAX_ENEMIES, func(d: int) -> void: _set_cfg("enemies", int(c.enemies) + d), c.ranked))
	g.add_child(cell.call("Players" + (" (ranked: 8v8)" if c.ranked else ""), pv))
	var ff := CheckBox.new()
	ff.text = "Friendly fire" + (" (off in ranked)" if c.ranked else "")
	ff.button_pressed = c.ff
	ff.disabled = c.ranked
	ff.toggled.connect(func(on: bool) -> void: _set_cfg("ff", on))
	g.add_child(cell.call("Rules", ff))
	var summary := ""
	if defuse:
		var p := Profile.elo_preview(c, float(Profile.v.elo), int(Profile.v.placed))
		var placing: bool = c.ranked and int(Profile.v.placed) < Profile.PLACEMENTS
		var team_name: String = "a random side" if c.team == "r" else "the " + String(Actors.TEAMS[int(c.team)].name)
		summary = "[b]%s[/b] · %s · %dv%d · %s bots · %s · you play %s\nTypical result: win [color=#95d470]%s[/color] · loss [color=#e5573f]%s[/color] Elo%s%s" % [
			"Ranked" if c.ranked else "Casual", Level.MAPS[c.map].name, 1 + int(c.allies), int(c.enemies), Profile.DIFFS[c.diff].name,
			"first to 9" if c.len == "short" else "first to 16", team_name, UI.signed(p.win), UI.signed(p.loss),
			(" · placement match %d of %d" % [int(Profile.v.placed) + 1, Profile.PLACEMENTS]) if placing else "", "" if c.ranked else " · casual matches count a quarter"]
	else:
		summary = "[b]Skirmish[/b] · %s · respawns, no rounds · %s bots · practice XP only, no Elo" % [Level.MAPS[c.map].name, Profile.DIFFS[c.diff].name]
	s.foot.add_child(UI.rich(summary, 13))
	s.foot.add_child(UI.button("Back", back))
	var next := func() -> void:
		Profile.v.lastCfg = norm_cfg(cfg.duplicate())
		Profile.save()
		open_armory("loadout", true)
	s.foot.add_child(UI.button("Next: loadout ›", next, "primary"))


# --- armory: loadout + shop -----------------------------------------------------------------------

func open_armory(mode: String, from_create: bool) -> void:
	arm.mode = mode
	arm.from_create = from_create
	arm.sel = {}
	arm.msg = ""
	show_screen("armory")


func _owned(gun: String, sel: Dictionary) -> bool:
	var id := String(sel.get("id", ""))
	if id == "":
		return true
	return Profile.owns("camo", id) if sel.slot == "camo" else Profile.owns("att", "%s:%s" % [gun, id])


func _options(gun: String, slot: String) -> Array:
	var out := [""]
	if slot == "camo":
		out.append_array(Arsenal.CAMOS.keys())
	else:
		for id: String in Arsenal.ATTACHMENTS:
			var a: Dictionary = Arsenal.ATTACHMENTS[id]
			if a.slot == slot and (a.guns as Array).has(gun):
				out.append(id)
	return out


func _opt_pressed(gun: String, slot: String, id: String) -> void:
	var sel := {"slot": slot, "id": id}
	var same: bool = not arm.sel.is_empty() and arm.sel.slot == slot and arm.sel.id == id
	arm.sel = sel
	arm.msg = ""
	# in the loadout an owned option equips straight away; a locked one shows its Buy button
	if arm.mode == "loadout" and (id == "" or _owned(gun, sel)) and not same:
		Profile.equip(gun, slot, id)
	_render()


func _render_armory() -> void:
	var gun: String = arm.gun
	var shop: bool = arm.mode == "shop"
	var kit := Arsenal.kit_for(gun)
	var v := Profile.v
	var sel: Dictionary = arm.sel
	var pkit := kit.duplicate()
	if not sel.is_empty():
		pkit[sel.slot] = sel.id
	var base := Data.weapon(gun)
	var cur := Arsenal.def_for(gun, kit)
	var prev := Arsenal.def_for(gun, pkit)
	var title := "Shop" if shop else ("Loadout for this match" if arm.from_create else "Loadout")
	var s := _sheet(title, _pts_label(int(v.points)), 1160.0, true, 660.0)
	var row := UI.hbox(14)
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	s.body.add_child(row)
	# guns
	var gl := UI.vbox(6)
	gl.custom_minimum_size.x = 210
	for g: String in Arsenal.ARMORY_GUNS:
		var k := Arsenal.kit_for(g)
		var n := 0
		for slot: String in Arsenal.SLOTS:
			if String(k[slot]) != "":
				n += 1
		var sub := ("%d attachment%s" % [n, "s" if n > 1 else ""]) if n > 0 else "Stock"
		if String(k.camo) != "":
			sub += " · " + String(Arsenal.CAMOS[k.camo].name)
		gl.add_child(UI.card(String(Data.weapon(g).name), sub, func() -> void: arm.gun = g; arm.sel = {}; arm.msg = ""; _render(), g == gun, false, HUD.icons.get(g), Vector2(200, 86)))
	row.add_child(gl)
	# slots
	var mid := UI.vbox(10)
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(mid)
	var slots := [["muzzle", "Muzzle"], ["optic", "Optic"], ["mag", "Magazine"], ["grip", "Grip / stock"], ["camo", "Camo"]]
	for sl: Array in slots:
		var slot: String = sl[0]
		var opts := _options(gun, slot)
		mid.add_child(UI.sect(String(sl[1]) + ("  · unlocks for every gun" if slot == "camo" else "")))
		if opts.size() <= 1:
			mid.add_child(UI.note("No %s options for this gun." % String(sl[1]).to_lower()))
			continue
		var flow := HFlowContainer.new()
		flow.add_theme_constant_override("h_separation", 6)
		flow.add_theme_constant_override("v_separation", 6)
		for id: String in opts:
			var eq := String(kit.get(slot, "")) == id
			var own := _owned(gun, {"slot": slot, "id": id})
			var nm := (String(Arsenal.CAMOS[id].name) if slot == "camo" else Arsenal.att_name(id, gun)) if id != "" else ("Factory finish" if slot == "camo" else "None")
			var price := (int(Arsenal.CAMOS[id].price) if slot == "camo" else Arsenal.att_price(id, gun)) if id != "" else 0
			var tag := "Equipped" if eq else (("Owned" if shop and id != "" else "Equip") if own else "%s pts" % UI.fmt_n(price))
			var selc: bool = not sel.is_empty() and sel.slot == slot and sel.id == id
			var icon: Texture2D = Assets.tex("camo_" + id) if slot == "camo" and id != "" else null
			var b := UI.card(nm, tag, func() -> void: _opt_pressed(gun, slot, id), eq or selc, false, icon, Vector2(124, 74 if icon else 50))
			if not own:
				b.modulate = Color(1, 1, 1, 0.75)
			flow.add_child(b)
		mid.add_child(flow)
	# detail, stats, preview
	var right := UI.vbox(10)
	right.custom_minimum_size.x = 330
	row.add_child(right)
	var pv := _make_preview(gun, prev)
	right.add_child(pv)
	var kit_names: Array = []
	for slot: String in Arsenal.SLOTS:
		if String(pkit[slot]) != "":
			kit_names.append(Arsenal.att_name(pkit[slot], gun))
	right.add_child(UI.label(String(base.name), 18, UI.TEXT, UI.display))
	right.add_child(UI.note((" · ".join(kit_names) if not kit_names.is_empty() else "Stock") + ((" · " + String(Arsenal.CAMOS[pkit.camo].name)) if String(pkit.camo) != "" else "")))
	if not sel.is_empty() and String(sel.id) != "":
		var own2 := _owned(gun, sel)
		var eq2 := String(kit.get(sel.slot, "")) == String(sel.id)
		var price2 := int(Arsenal.CAMOS[sel.id].price) if sel.slot == "camo" else Arsenal.att_price(sel.id, gun)
		var t2 := ""
		var sub2 := ""
		var pros: Array = []
		var cons: Array = []
		if sel.slot == "camo":
			var cm: Dictionary = Arsenal.CAMOS[sel.id]
			t2 = cm.name
			sub2 = "%s camo · cosmetic" % Data.ARSENAL.tiers.get(cm.tier, cm.tier)
		else:
			var at: Dictionary = Arsenal.ATTACHMENTS[sel.id]
			t2 = Arsenal.att_name(sel.id, gun)
			sub2 = "%s · %s" % [at.kind, String(at.slot).capitalize()]
			pros = Arsenal.att_pros(sel.id, gun)
			cons = Arsenal.att_cons(sel.id, gun)
		var dh := UI.hbox(8)
		var dv := UI.vbox(2)
		dv.add_child(UI.label(t2, 15, UI.TEXT, UI.display))
		dv.add_child(UI.label(sub2, 12, UI.MUTED))
		dh.add_child(dv)
		dh.add_child(UI.spacer())
		if eq2:
			dh.add_child(UI.button("Remove", func() -> void: Profile.equip(gun, sel.slot, ""); arm.sel = {"slot": sel.slot, "id": ""}; _render()))
		elif own2:
			dh.add_child(UI.button("Equip", func() -> void: Profile.equip(gun, sel.slot, sel.id); _render(), "primary"))
		else:
			var buy_now := func() -> void:
				var r := Profile.buy("camo", sel.id) if sel.slot == "camo" else Profile.buy("att", sel.id, gun)
				arm.msg = r.msg
				if r.ok:
					Snd.buy()
					Profile.equip(gun, sel.slot, sel.id)
				else:
					Snd.dry()
				_render()
			var buy := UI.button("Buy · %s pts" % UI.fmt_n(price2), buy_now, "primary")
			buy.disabled = int(v.points) < price2
			dh.add_child(buy)
		right.add_child(dh)
		for p: String in pros:
			right.add_child(UI.label("+ " + p, 13, UI.OK, null, true))
		for p: String in cons:
			right.add_child(UI.label("− " + p, 13, UI.DANGER, null, true))
		if not own2 and int(v.points) < price2:
			right.add_child(UI.note("You need %s more points. Every level-up pays points; play matches to level up." % UI.fmt_n(price2 - int(v.points))))
	else:
		right.add_child(UI.note("Pick an attachment or camo to see what it does, then buy it with points. Attachments are bought per gun; camos unlock for every gun." if shop else "Choose what this gun carries. Owned options equip on click; locked ones show their price. Your loadout is used whenever you buy this gun."))
	if String(arm.msg) != "":
		right.add_child(UI.note(arm.msg, UI.OK))
	# stats
	var s0 := Arsenal.stats(base)
	var s1 := Arsenal.stats(cur)
	var s2 := Arsenal.stats(prev)
	var sg := UI.grid(3, 6)
	for i in s0.size():
		var st: Dictionary = s0[i]
		var a := float(s1[i].v)
		var b2 := float(s2[i].v)
		var dlt := b2 - a
		var better := dlt < 0.0 if st.get("lower", false) else dlt > 0.0
		var nl := UI.label(String(st.name), 12, UI.MUTED)
		nl.custom_minimum_size.x = 110
		sg.add_child(nl)
		sg.add_child(UI.bar(b2 / float(st.max), UI.OK if absf(dlt) > 1e-6 and better else (UI.DANGER if absf(dlt) > 1e-6 else UI.ACCENT), 5.0))
		var txt := String(st.fmt) % (roundi(b2) if not String(st.fmt).contains(".2f") else b2)
		if absf(dlt) > 1e-6:
			txt += "  " + ("+" if dlt > 0.0 else "−") + (("%.2f" % absf(dlt)) if String(st.fmt).contains(".2f") else str(roundi(absf(dlt))))
		sg.add_child(UI.label(txt, 12, UI.TEXT))
	right.add_child(sg)
	if arm.from_create:
		s.foot.add_child(UI.note("Attachments apply to the guns you buy during the match. Bots carry stock guns."))
		s.foot.add_child(UI.button("Back", back))
		s.foot.add_child(UI.button("Start match ›", func() -> void: launch(norm_cfg(cfg.duplicate() if not cfg.is_empty() else default_cfg())), "primary"))
	else:
		s.foot.add_child(UI.note("Earn points by levelling up: XP comes from eliminations, damage, rounds and wins." if shop else "Locked options can be bought here too."))
		s.foot.add_child(UI.button("Open loadout" if shop else "Open shop", func() -> void: open_armory("loadout" if shop else "shop", false)))
		s.foot.add_child(UI.button("Done", back, "primary"))


## A small 3D view of the gun with its attachments and camo, turning slowly.
func _make_preview(gun: String, def: Dictionary) -> Control:
	_clear_preview()
	var c := SubViewportContainer.new()
	c.stretch = true
	c.custom_minimum_size = Vector2(330, 160)
	var vp := SubViewport.new()
	vp.own_world_3d = true
	vp.transparent_bg = true
	vp.msaa_3d = Viewport.MSAA_4X
	c.add_child(vp)
	var cam := Camera3D.new()
	cam.fov = 24.0
	vp.add_child(cam)
	var pivot := Node3D.new()
	vp.add_child(pivot)
	var shared := {}
	var m := Models.build_vm(gun, shared)
	var root: Node3D = m.root
	root.visible = true
	pivot.add_child(root)
	for k: String in ["left", "right", "finger", "shell"]:
		if (m.parts as Dictionary).has(k):
			(m.parts[k] as Node3D).visible = false
	if m.flash:
		(m.flash as Node3D).visible = false
	for mn: String in ["glove", "sleeve"]:
		if shared.has(mn):
			_hide_with_material(root, shared[mn])
	Viewmodel.apply_kit(m, def)
	# studio lighting: a warm key, a cool rim, soft fill from the probe term
	var we := WorldEnvironment.new()
	we.environment = Environment.new()
	we.environment.background_mode = Environment.BG_CLEAR_COLOR
	we.environment.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	we.environment.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	we.environment.tonemap_mode = Environment.TONE_MAPPER_AGX
	vp.add_child(we)
	var key := DirectionalLight3D.new()
	key.basis = Basis.looking_at(-Vector3(1, 1.4, 0.8).normalized())
	key.light_color = Color(1.0, 0.95, 0.88)
	key.light_energy = 2.6
	key.shadow_enabled = true
	vp.add_child(key)
	var rim := DirectionalLight3D.new()
	rim.basis = Basis.looking_at(-Vector3(-1, 0.6, -1.2).normalized())
	rim.light_color = Color(0.6, 0.72, 1.0)
	rim.light_energy = 1.4
	vp.add_child(rim)
	var mats: Array = shared.values() + (m.mats as Dictionary).values()
	for mat: ShaderMaterial in mats:
		Models.light(mat, Color(0.42, 0.44, 0.48, 0.6))
	# frame the gun: its bounding box from the visible meshes
	var box := AABB()
	var first := true
	for mi: MeshInstance3D in root.find_children("*", "MeshInstance3D", true, false):
		if not mi.is_visible_in_tree():
			continue
		var bb := _to_root(mi, root) * mi.get_aabb()
		box = bb if first else box.merge(bb)
		first = false
	root.position = -box.get_center()
	preview = {"cam": cam, "pivot": pivot, "len": maxf(box.size.z, 1.0), "h": maxf(box.size.y, 1.0), "t": 0.0, "c": c}
	_preview_tick(0.0)
	return c


func _hide_with_material(n: Node, mat: Material) -> void:
	for mi: MeshInstance3D in n.find_children("*", "MeshInstance3D", true, false):
		if mi.mesh and mi.mesh.surface_get_material(0) == mat:
			mi.visible = false


func _to_root(n: Node3D, root: Node3D) -> Transform3D:
	var t := n.transform
	var p := n.get_parent()
	while p != null and p != root:
		t = (p as Node3D).transform * t
		p = p.get_parent()
	return t


func _preview_tick(dt: float) -> void:
	if preview.is_empty() or not is_instance_valid(preview.cam):
		return
	preview.t += dt
	var t: float = preview.t
	var cam: Camera3D = preview.cam
	var c: Control = preview.c
	var aspect := c.size.x / maxf(c.size.y, 1.0)
	var tv := tan(deg_to_rad(cam.fov) / 2.0)
	var dist := maxf(float(preview.len) / 2.0 / (tv * aspect) * 1.12, float(preview.h) / 2.0 / tv * 1.5)
	(preview.pivot as Node3D).rotation = Vector3(0.12 + sin(t * 0.31) * 0.04, sin(t * 0.45) * 0.38, 0)
	cam.transform = Transform3D(Basis.looking_at(Vector3(-1, 0, 0)), Vector3(dist, 0, 0))


func _clear_preview() -> void:
	preview = {}


# --- career ------------------------------------------------------------------------------------

func _render_career() -> void:
	var v := Profile.v
	var st: Dictionary = v.stats
	var lv := Profile.level()
	var rk := Profile.rank()
	var s := _sheet("Career", _pts_label(int(v.points)), 1100.0)
	var acct := UI.hbox(8)
	acct.add_child(UI.rich("Playing as a [b]guest[/b]: nothing here is saved." if Accounts.is_guest() else "Account [b]%s[/b] · %s" % [Accounts.cur.name, Profile.save_label()], 14))
	acct.add_child(UI.button("Create account" if Accounts.is_guest() else "Account settings", func() -> void:
		if Accounts.is_guest():
			new_account(true)
		else:
			acct_msg = ""
			acct_del = false
			show_screen("acctset")))
	s.body.add_child(acct)
	var top := UI.hbox(30)
	var r1 := UI.hbox(14)
	r1.add_child(Emblem.make(rk, 96))
	var rv := UI.vbox(3)
	rv.add_child(UI.label("RANK", 11, UI.MUTED))
	rv.add_child(UI.label(rank_name(rk, int(v.placed)), 20, UI.TEXT, UI.display))
	rv.add_child(UI.label("Elo %s (hidden until placed)" % UI.fmt_n(v.elo) if rk < 0 else "%s Elo · peak %s" % [UI.fmt_n(v.elo), UI.fmt_n(v.peak)], 13, UI.MUTED))
	if rk >= 0 and rk < Profile.RANKS.size() - 1:
		var nx: Dictionary = Profile.RANKS[rk + 1]
		var cur_min := float(Profile.RANKS[rk].min)
		rv.add_child(UI.bar(clampf((float(v.elo) - cur_min) / (float(nx.min) - cur_min), 0, 1)))
		rv.add_child(UI.label("%s to %s" % [UI.fmt_n(maxf(0.0, float(nx.min) - float(v.elo))), nx.name], 12, UI.MUTED))
	r1.add_child(rv)
	top.add_child(r1)
	var l1 := UI.hbox(14)
	l1.add_child(UI.level_badge(int(lv.level), 56))
	var lvv := UI.vbox(3)
	lvv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lvv.add_child(UI.label("LEVEL", 11, UI.MUTED))
	lvv.add_child(UI.label("Level %d" % lv.level, 20, UI.TEXT, UI.display))
	lvv.add_child(UI.label("%s / %s XP · next level pays %s points" % [UI.fmt_n(lv.into), UI.fmt_n(lv.need), UI.fmt_n(Profile.level_points(int(lv.level) + 1))], 13, UI.MUTED))
	lvv.add_child(UI.bar(float(lv.into) / float(lv.need)))
	l1.add_child(lvv)
	l1.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(l1)
	s.body.add_child(top)
	var kd := ("%.2f" % (float(st.kills) / float(st.deaths))) if int(st.deaths) > 0 else ("∞" if int(st.kills) > 0 else "—")
	var adr := roundi(float(st.damage) / float(st.rounds)) if int(st.rounds) > 0 else 0
	var hsp := roundi(100.0 * float(st.hs) / float(st.kills)) if int(st.kills) > 0 else 0
	var wr := roundi(100.0 * float(st.wins) / float(st.matches)) if int(st.matches) > 0 else 0
	var tiles := UI.grid(5, 8)
	for t: Array in [["Matches", UI.fmt_n(st.matches)], ["Win rate", "%d%%" % wr], ["W–L–D", "%d–%d–%d" % [st.wins, int(st.losses) + int(st.left), st.draws]], ["Ranked played", UI.fmt_n(st.ranked)],
			["Eliminations", UI.fmt_n(st.kills)], ["K/D", kd], ["Damage / round", str(adr)], ["Headshot %", "%d%%" % hsp], ["Charges planted", UI.fmt_n(st.plants)], ["Charges defused", UI.fmt_n(st.defuses)]]:
		tiles.add_child(UI.tile(t[0], t[1]))
	s.body.add_child(tiles)
	var cols := UI.hbox(24)
	var hist := UI.vbox(4)
	hist.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hist.add_child(UI.sect("Recent matches"))
	if (v.history as Array).is_empty():
		hist.add_child(UI.note("No matches yet. Defuse matches show up here with their XP and Elo."))
	else:
		var hg := UI.grid(8, 10)
		for h in ["RESULT", "MAP", "TYPE", "SCORE", "K–D", "ADR", "XP", "ELO"]:
			hg.add_child(UI.label(h, 11, UI.MUTED))
		for h: Dictionary in v.history:
			var res: String = {"win": "Win", "loss": "Loss", "draw": "Draw", "left": "Left"}.get(String(h.outcome), String(h.outcome))
			var col := UI.OK if h.outcome == "win" else (UI.DANGER if h.outcome == "loss" or h.outcome == "left" else UI.TEXT)
			hg.add_child(UI.label(res, 13, col, UI.display))
			hg.add_child(UI.label(String(Level.MAPS.get(h.map, {"name": h.map}).name), 13))
			hg.add_child(UI.label("%s · %s" % ["Ranked" if h.get("ranked", false) else "Casual", Profile.DIFFS.get(h.diff, Profile.DIFFS.normal).name], 13))
			hg.add_child(UI.label("%d–%d" % [h.score[0], h.score[1]] if h.get("score") is Array else "—", 13))
			hg.add_child(UI.label("%d–%d" % [h.k, h.d], 13))
			hg.add_child(UI.label(str(h.adr), 13))
			hg.add_child(UI.label("+" + UI.fmt_n(h.xp), 13))
			var e: Variant = h.get("elo")
			hg.add_child(UI.label("—" if e == null else UI.signed(float(e)), 13, UI.OK if e != null and float(e) > 0.0 else (UI.DANGER if e != null and float(e) < 0.0 else UI.TEXT)))
		hist.add_child(hg)
	cols.add_child(hist)
	var lad := UI.vbox(3)
	lad.custom_minimum_size.x = 260
	lad.add_child(UI.sect("Ranks"))
	for i in range(Profile.RANKS.size() - 1, -1, -1):
		var rr: Dictionary = Profile.RANKS[i]
		var rrow := UI.hbox(8)
		rrow.add_child(Emblem.make(i, 30))
		rrow.add_child(UI.label(String(rr.name), 13, UI.ACCENT if i == rk else UI.TEXT, UI.display if i == rk else null))
		rrow.add_child(UI.spacer())
		rrow.add_child(UI.label("%s+" % UI.fmt_n(rr.min), 12, UI.MUTED))
		lad.add_child(rrow)
	lad.add_child(UI.note("Elo moves with every defuse match: winning against higher-rated bots moves it most, and your eliminations, damage and objectives add to it. Ranked matches count fully, casual ones a quarter. The first %d ranked matches are placements and count double." % Profile.PLACEMENTS))
	cols.add_child(lad)
	s.body.add_child(cols)


# --- settings ----------------------------------------------------------------------------------

func _slider(title: String, key: String, lo: float, hi: float, step: float, fmt: String) -> HBoxContainer:
	var h := UI.hbox(10)
	var l := UI.label(title, 14)
	l.custom_minimum_size.x = 190
	h.add_child(l)
	var s := HSlider.new()
	s.min_value = lo
	s.max_value = hi
	s.step = step
	s.value = float(Settings.get_value(key))
	s.custom_minimum_size = Vector2(220, 20)
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(s)
	var out := UI.label(fmt % s.value, 14, UI.ACCENT, UI.display)
	out.custom_minimum_size.x = 60
	h.add_child(out)
	s.value_changed.connect(func(val: float) -> void:
		Settings.set_value(key, val)
		out.text = fmt % val)
	return h


func _check(title: String, key: String) -> CheckBox:
	var c := CheckBox.new()
	c.text = title
	c.button_pressed = bool(Settings.get_value(key))
	c.toggled.connect(func(on: bool) -> void: Settings.set_value(key, on))
	return c


func _render_settings() -> void:
	var s := _sheet("Settings", null, 900.0)
	var cols := UI.hbox(30)
	s.body.add_child(cols)
	var a := UI.vbox(10)
	a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cols.add_child(a)
	a.add_child(UI.sect("Mouse"))
	a.add_child(_slider("Sensitivity", "sensitivity", 0.2, 8.0, 0.05, "%.2f"))
	a.add_child(_check("Invert mouse Y", "invertY"))
	a.add_child(UI.sect("View"))
	a.add_child(_slider("Field of view (4:3)", "fov", 70.0, 110.0, 1.0, "%d°"))
	a.add_child(_slider("Weapon field of view", "vmFov", 50.0, 80.0, 1.0, "%d°"))
	_fs_check = _check("Fullscreen (F11)", "fullscreen")
	a.add_child(_fs_check)
	a.add_child(UI.sect("Graphics"))
	a.add_child(UI.seg([["low", "Low", "Fast"], ["medium", "Medium", "Shadows+AO"], ["high", "High", "+Fog light"], ["ultra", "Ultra", "+GI, reflections"]],
		Settings.get_value("gfx"), func(v: Variant) -> void: Settings.set_value("gfx", v); _render()))
	a.add_child(_slider("Brightness", "brightness", 0.6, 1.6, 0.05, "%.2f"))
	a.add_child(UI.sect("Sound"))
	a.add_child(_slider("Volume", "volume", 0.0, 100.0, 1.0, "%d%%"))
	a.add_child(UI.sect("HUD"))
	a.add_child(_check("Show FPS", "showFps"))
	a.add_child(_check("Show speed", "showSpeed"))
	a.add_child(_check("Show control hints", "showHints"))
	var b := UI.vbox(10)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cols.add_child(b)
	b.add_child(UI.sect("Crosshair"))
	b.add_child(UI.seg([["dynamic", "Dynamic", "Gap shows the cone of fire"], ["static", "Static", "Fixed gap"]], Settings.get_value("xhStyle"), func(v: Variant) -> void: Settings.set_value("xhStyle", v); _render()))
	var colors := [["#4cff6a", "Green", ""], ["#f3ecd6", "White", ""], ["#ffd23a", "Yellow", ""], ["#3ad8ff", "Cyan", ""], ["#ff5ad1", "Pink", ""]]
	b.add_child(UI.seg(colors, Settings.get_value("xhColor"), func(v: Variant) -> void: Settings.set_value("xhColor", v); _render()))
	b.add_child(_slider("Length", "xhSize", 2.0, 16.0, 1.0, "%dpx"))
	b.add_child(_slider("Gap", "xhGap", 0.0, 12.0, 1.0, "%dpx"))
	b.add_child(_slider("Thickness", "xhThick", 1.0, 5.0, 1.0, "%dpx"))
	b.add_child(_check("Centre dot", "xhDot"))
	b.add_child(_check("Outline", "xhOutline"))
	b.add_child(_check("Follow recoil", "xhRecoil"))
	b.add_child(UI.sect("Controls"))
	var cg := UI.grid(2, 6)
	for kv: Array in [["Move · jump · crouch · walk", "WASD · Space · Ctrl/C · Shift"], ["Fire · scope in", "Mouse 1 · Mouse 2"], ["Load a wallbang round", "X"], ["Reload · use · drop · inspect", "R · E · G · F"],
			["Weapons · last · next", "1–5 · Q · wheel"], ["Buy menu · scores", "B · Tab"], ["Noclip (admins) · debug · hints", "V · F1 · H"], ["Pause · fullscreen", "Esc · F11"]]:
		cg.add_child(UI.label(kv[0], 13, UI.MUTED))
		cg.add_child(UI.label(kv[1], 13, UI.TEXT, UI.display))
	b.add_child(cg)
	_render_admin(s.body)
	s.foot.add_child(UI.spacer())
	s.foot.add_child(UI.button("Done", back, "primary"))


## Admin (bottom of Settings).
func _render_admin(parent: Control) -> void:
	var box := UI.vbox(8)
	box.name = "AdminBox"
	parent.add_child(box)
	var rules := "Matches played with admin powers on don’t count toward XP, points, rank or match history."
	if not Admin.unlocked:
		box.add_child(UI.sect("Admin"))
		var row := UI.hbox(8)
		var f := UI.field("Admin passcode", true, "", 64)
		row.add_child(f[0])
		var e: LineEdit = f[1]
		e.name = "AdminCode"
		var unlock := func() -> void:
			var r := Admin.try_code(e.text)
			admin_msg = r.msg
			admin_ok = r.ok
			if r.ok:
				Snd.buy()
			else:
				Snd.dry()
			_render()
		e.text_submitted.connect(func(_t: String) -> void: unlock.call())
		var ub := UI.button("Unlock admin", unlock)
		ub.size_flags_vertical = Control.SIZE_SHRINK_END
		row.add_child(ub)
		box.add_child(row)
		if admin_msg != "":
			box.add_child(UI.note(admin_msg, UI.OK if admin_ok else UI.DANGER))
		box.add_child(UI.note("An admin can fly through walls (noclip), has unlimited wallbang rounds with no wait, unlimited money, and sees enemies through walls. " + rules))
	else:
		box.add_child(UI.sect("Admin · " + ("ON" if Admin.on else "OFF")))
		var c := CheckBox.new()
		c.text = "Admin powers on"
		c.button_pressed = Admin.on
		c.toggled.connect(func(on: bool) -> void:
			Admin.set_on(on)
			admin_msg = "Admin powers on" if Admin.on else "Admin powers off: this account plays normally"
			admin_ok = true
			_render())
		box.add_child(c)
		for li in ["Noclip: V to fly through walls", "Unlimited wallbang rounds, no 10 s wait", "Unlimited money", "Enemies shown through walls and on the radar"]:
			box.add_child(UI.label("· " + li, 13))
		if admin_msg != "":
			box.add_child(UI.note(admin_msg, UI.OK if admin_ok else UI.DANGER))
		box.add_child(UI.note(("As a guest, admin lasts until you sign in or quit. " if Accounts.is_guest() else "Saved for %s on this device. " % Accounts.cur.name) + rules))
		box.add_child(UI.button("Remove admin", func() -> void: Admin.remove(); admin_msg = "Admin removed"; admin_ok = true; _render(), "danger"))
	admin_msg = ""


# --- results -----------------------------------------------------------------------------------

func _render_results() -> void:
	var R0 := Session.results
	if R0.is_empty():
		home()
		return
	var outcome := String(R0.outcome)
	var c: Dictionary = R0.cfg
	var st: Dictionary = R0.st
	var xp: Dictionary = R0.xp
	var lv0: Dictionary = R0.lv0
	var lv1: Dictionary = R0.lv1
	var title: String = {"win": "Victory", "loss": "Defeat", "draw": "Draw", "left": "Match left", "none": "Match left", "practice": "Practice over"}.get(outcome, "Match over")
	var aside := UI.label("%d – %d" % [st.score[0], st.score[1]] if st.get("score") is Array else "", 30, UI.TEXT, UI.display)
	var s := _sheet(title, aside, 1080.0, false)
	s.body.add_child(UI.label("%s · %s · %s bots" % [Level.MAPS.get(c.map, {"name": ""}).name, ("Ranked" if c.get("ranked", false) else "Casual") if c.mode == "defuse" else "Skirmish", Profile.DIFFS[c.diff].name], 13, UI.MUTED))
	var adr := roundi(float(st.dmg) / float(st.rounds)) if int(st.rounds) > 0 else 0
	var hsp := roundi(100.0 * float(st.hs) / float(st.kills)) if int(st.kills) > 0 else 0
	var tiles := UI.hbox(8)
	var tl := [["Eliminations", str(st.kills)], ["Deaths", str(st.deaths)], ["Damage / round", str(adr)], ["Headshot %", "%d%%" % hsp]]
	if c.mode == "defuse":
		tl.append_array([["Rounds won", str(st.roundsWon)], ["Planted", str(st.plants)], ["Defused", str(st.defuses)]])
	for t: Array in tl:
		tiles.add_child(UI.tile(t[0], t[1]))
	s.body.add_child(tiles)
	var cols := UI.hbox(24)
	s.body.add_child(cols)
	var xb := UI.vbox(5)
	xb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	xb.add_child(UI.sect("Experience · " + " · ".join(xp.mults)))
	var lines: Array = xp.lines
	if lines.is_empty():
		lines = [{"label": "Nothing earned", "v": 0}]
	for l: Dictionary in lines:
		var h := UI.hbox(6)
		h.add_child(UI.label(String(l.label), 14))
		h.add_child(UI.spacer())
		h.add_child(UI.label("+" + UI.fmt_n(l.v), 14, UI.TEXT, UI.display))
		xb.add_child(h)
	var th := UI.hbox(6)
	th.add_child(UI.label("Total XP" + ((" (×%.2f)" % float(xp.k)) if float(xp.k) != 1.0 else ""), 15, UI.ACCENT, UI.display))
	th.add_child(UI.spacer())
	th.add_child(UI.label("+" + UI.fmt_n(xp.total), 15, UI.ACCENT, UI.display))
	xb.add_child(th)
	var lrow := UI.hbox(10)
	lrow.add_child(UI.level_badge(int(lv1.level)))
	var lx := UI.vbox(3)
	lx.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lx.add_child(UI.label("Level %d · %s / %s XP" % [lv1.level, UI.fmt_n(lv1.into), UI.fmt_n(lv1.need)], 13))
	lx.add_child(UI.bar(float(lv1.into) / float(lv1.need)))
	lrow.add_child(lx)
	xb.add_child(lrow)
	for u: Dictionary in R0.ups:
		var ur := UI.hbox(8)
		ur.add_child(UI.level_badge(int(u.level), 28))
		ur.add_child(UI.label("Level %d" % u.level, 14, UI.TEXT, UI.display))
		ur.add_child(UI.spacer())
		ur.add_child(_pts_label(int(u.points)))
		xb.add_child(ur)
	xb.add_child(UI.note("Points: %s · spend them in the shop." % UI.pts(int(R0.pointsNow))))
	cols.add_child(xb)
	var eb := UI.vbox(5)
	eb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cols.add_child(eb)
	if R0.get("admin", false):
		eb.add_child(UI.sect("Admin match"))
		eb.add_child(UI.note("Admin powers were on during this match, so it doesn’t change XP, points, rank or match history."))
	elif R0.elo != null:
		var elo: Dictionary = R0.elo
		eb.add_child(UI.sect("Rank · " + String(elo.modeLabel)))
		var rr := UI.hbox(10)
		rr.add_child(Emblem.make(int(R0.rank0), 56))
		rr.add_child(UI.label("›", 24, UI.MUTED, UI.display))
		rr.add_child(Emblem.make(int(R0.rank1), 72))
		var rv := UI.vbox(2)
		rv.add_child(UI.label(rank_name(int(R0.rank1), int(R0.placed1)), 17, UI.TEXT, UI.display))
		rv.add_child(UI.rich("%s → %s Elo [color=%s]%s[/color]" % [UI.fmt_n(R0.elo0), UI.fmt_n(R0.elo1), "#95d470" if int(elo.delta) >= 0 else "#e5573f", UI.signed(float(elo.delta))], 14))
		var r0 := int(R0.rank0)
		var r1 := int(R0.rank1)
		if r1 > r0 and r0 >= 0:
			rv.add_child(UI.label("PROMOTED", 12, UI.OK, UI.display))
		elif r1 < r0 and r1 >= 0:
			rv.add_child(UI.label("DEMOTED", 12, UI.DANGER, UI.display))
		elif r0 < 0 and r1 >= 0:
			rv.add_child(UI.label("PLACED", 12, UI.OK, UI.display))
		rr.add_child(rv)
		eb.add_child(rr)
		for l: Dictionary in elo.lines:
			var h2 := UI.hbox(6)
			h2.add_child(UI.label(String(l.label), 13))
			h2.add_child(UI.spacer())
			h2.add_child(UI.label(UI.signed(float(l.v), 1), 13, UI.TEXT, UI.display))
			eb.add_child(h2)
		for p: Dictionary in elo.parts:
			if absf(float(p.v)) <= 0.05:
				continue
			var h3 := UI.hbox(6)
			h3.add_child(UI.label("   " + String(p.label), 12, UI.MUTED, null, true))
			h3.add_child(UI.label(UI.signed(float(p.v), 1), 12, UI.MUTED))
			eb.add_child(h3)
		var h4 := UI.hbox(6)
		h4.add_child(UI.label("Elo change", 15, UI.ACCENT, UI.display))
		h4.add_child(UI.spacer())
		h4.add_child(UI.label(UI.signed(float(elo.delta)), 15, UI.ACCENT, UI.display))
		eb.add_child(h4)
	else:
		eb.add_child(UI.sect("Rank"))
		eb.add_child(UI.note("This match ended before it started, so your rating did not change." if c.mode == "defuse" else "Skirmish is practice: it pays some XP but never changes your Elo. Play a defuse match to move your rank."))
	if R0.get("admin", false):
		s.foot.add_child(UI.note("Admin match: nothing recorded."))
	elif Accounts.is_guest():
		s.foot.add_child(UI.note("Guest: this progress isn’t saved."))
		s.foot.add_child(UI.button("Create an account to keep it", func() -> void: new_account(true)))
	else:
		s.foot.add_child(UI.note("✓ %s (%s)%s" % [Profile.save_label(), Accounts.cur.name, " · Leaving a ranked match counts as a loss." if outcome == "left" and c.get("ranked", false) else ""], UI.OK))
	s.foot.add_child(UI.button("Shop", func() -> void: open_armory("shop", false)))
	s.foot.add_child(UI.button("Main menu", home))
	s.foot.add_child(UI.button("Play again", func() -> void: launch(Session.cfg), "primary"))
