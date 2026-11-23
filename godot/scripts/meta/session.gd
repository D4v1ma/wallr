extends Node
## One match as set up in Create Game: roster, side, rules; rewards at the end (or when you leave).

var active := false
var cfg: Dictionary = {}
var done := false
var results: Dictionary = {}
var match_id := ""
var admin_used := false
var _results_timer: SceneTreeTimer = null


func stats(me: Actor) -> Dictionary:
	var M := Match
	return {"kills": me.kills, "deaths": me.deaths, "hs": me.hs, "dmg": me.dmg, "plants": me.plants, "defuses": me.defuses,
		"rounds": M.history.size() if M.active else 0, "roundsWon": M.score[me.squad] if M.active else 0,
		"score": [M.score[me.squad], M.score[1 - me.squad]] if M.active else null}


## Map already loaded: sets everything up.
func begin(c: Dictionary) -> void:
	cfg = c.duplicate(true)
	var team: int = (0 if randf() < 0.5 else 1) if String(cfg.team) == "r" else int(cfg.team)
	Settings.v.botSkill = String(cfg.diff)
	Settings.v.mode = String(cfg.mode)
	Settings.v.matchLen = String(cfg.get("len", "standard"))
	Settings.v.ff = bool(cfg.get("ff", false))
	Settings.v.team = float(team)
	Settings.v.map = String(cfg.map)
	Settings.save()
	HUD.toggle_buy(false)
	Actors.remove_bots()
	Actors.ff = bool(cfg.get("ff", false))
	var me := Actors.me
	if me.team != team:
		Actors.set_side(me, team)
	for i in int(cfg.get("enemies", 0)):
		Actors.add_bot(1 - team)
	for i in int(cfg.get("allies", 0)):
		Actors.add_bot(team)
	for a: Actor in Actors.list:
		a.kills = 0; a.deaths = 0; a.dmg = 0; a.hs = 0; a.plants = 0; a.defuses = 0
	Game.freeze = false
	Game.bots_frozen = false
	Game.spec_target = null
	Match.set_mode(String(cfg.mode))
	if cfg.mode != "defuse":
		Actors.feed.clear()
		Actors.score = [0, 0]
	me.name = Accounts.display_name()
	active = true
	done = false
	results = {}
	match_id = Accounts.random_id(6) + str(Time.get_ticks_msec())
	admin_used = false
	Admin.apply()


## Joined someone's game: the host runs the match; we keep our own score of it for the profile.
func begin_client(c: Dictionary, host: String) -> void:
	cfg = c.duplicate(true)
	cfg.mp = true
	cfg.ranked = false
	cfg.host = host
	HUD.toggle_buy(false)
	Actors.ff = bool(cfg.get("ff", false))
	Match.active = String(cfg.get("mode", "defuse")) == "defuse"
	Match.len = Match.LENGTHS.get(String(cfg.get("len", "standard")), Match.LENGTHS.standard)
	Match.phase = "idle"
	Match.history = []
	Game.freeze = false
	Game.bots_frozen = false
	Game.spec_target = null
	Actors.me.name = Accounts.display_name()
	Actors.me.admin = false
	active = true
	done = false
	results = {}
	match_id = Accounts.random_id(6) + str(Time.get_ticks_msec())
	admin_used = false


## The host started a new match (after the last one ended): count it afresh.
func client_new_match() -> void:
	done = false
	results = {}
	match_id = Accounts.random_id(6) + str(Time.get_ticks_msec())


## The connection to the host dropped (or we were turned away): record what we had, back to the menu.
func network_lost(reason: String) -> void:
	if active and not done and Match.round > 1:
		record(exit_outcome(stats(Actors.me)))
	active = false
	HUD.toggle_buy(false)
	Menus.mp_message = reason
	if Game.main:
		Controls.active = false
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		HUD.set_active(false)
	Game.state = "menu"
	Menus.home()


## What leaving now would record: practice XP in skirmish; in defuse a loss once the match has
## started (nothing if you leave during the first buy time without a kill).
func exit_outcome(st: Dictionary) -> String:
	if cfg.mode != "defuse":
		return "practice"
	return "left" if Match.round > 1 or Match.phase != "freeze" or int(st.kills) > 0 else "none"


## Fold the match into the profile (saved to the signed-in account) exactly once.
func record(outcome: String) -> Dictionary:
	done = true
	if admin_used:
		results = Profile.admin_results(cfg, stats(Actors.me), outcome)
	else:
		results = Profile.apply_match(cfg, stats(Actors.me), outcome, match_id)
	Accounts.clear_checkpoint()
	return results


## Kept up to date every round, so an exit still counts if the game dies.
func checkpoint() -> void:
	if not active or done or Accounts.is_guest() or admin_used:
		return
	var st := stats(Actors.me)
	Accounts.checkpoint({"matchId": match_id, "cfg": cfg, "st": st, "outcome": exit_outcome(st), "at": Time.get_unix_time_from_system()})


## The game is closing mid-match: that is an exit, save it now.
func exit_now() -> void:
	if active and not done:
		record(exit_outcome(stats(Actors.me)))


func match_over(outcome: String) -> void:
	if not active or done:
		return
	Match.hold = not Net.active()       # a network match goes on to the next one for everyone
	record(outcome)
	_results_timer = get_tree().create_timer(5.5)
	_results_timer.timeout.connect(show_results)


func show_results() -> void:
	if results.is_empty():
		return
	if Game.state == "play" and Game.main:
		Game.main.pause()
	Game.state = "results"
	Menus.show_results(results)


## Leaving from the pause menu: a match that has started counts as a loss. In a network game this
## also closes the connection (the host leaving ends it for everyone).
func leave() -> void:
	var was_net := Net.active()
	if active and not done:
		var outcome := exit_outcome(stats(Actors.me))
		record(outcome)
		if was_net:
			Net.leave()
		if outcome != "none" or int(results.xp.total) > 0:
			show_results()
			return
	if was_net:
		Net.leave()
	active = false
	Game.state = "menu"
	Menus.home()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		exit_now()
