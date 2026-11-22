extends RefCounted
## Wallbang rounds (the lock, X, the count, through a real wall), scoping in, the admin passcode and
## its powers, an admin match recording nothing (same cases as tools/gameplay7-check.mjs).

const DT := 1.0 / 64.0


func place(a: Actor, x: float, y: float, z: float, yaw_deg: float) -> void:
	a.player.spawn(Vector3(x, y, z), deg_to_rad(yaw_deg))
	a.player.pitch = 0.0
	a.alive = true
	a.health = 100
	a.armor = 100
	if a.brain:
		a.brain.reset()


## Fire the gun in hand once, straight through the real shot pipeline.
func fire(main: Node, a: Actor) -> void:
	var g := a.loadout.active as Gun
	g.state = "idle"
	g.next_fire = 0.0
	g.fire(a.player, Game.time, 60.0 / float(g.def.rpm))
	for e: Dictionary in g.events:
		if e.type == "shot":
			main.fire_shot(a, g, e)
	g.events.clear()


func run(r: Node) -> void:
	var main: Node = await r.boot_game({"map": "range", "mode": "skirmish", "bots": "1", "team": "1"})
	Game.bots_frozen = true
	var me := Actors.me
	var enemy: Actor = null
	for a: Actor in Actors.list:
		if a.is_bot:
			enemy = a
	r.check("the game boots into the practice hall with an enemy bot", Game.L.key == "range" and enemy != null and me.alive)
	# 1) the wait, then loading a round
	me.alive_t = 0.0
	var res := Wallbang.toggle(me)
	r.check("wallbang rounds stay locked for the first 10 s", res == "locked" and Wallbang.unlock_in(me) > 0.0, res)
	me.alive_t = 10.5
	res = Wallbang.toggle(me)
	r.check("after 10 s, X loads a round (3 left)", res == "armed" and Wallbang.armed(me) and Wallbang.charges(me) == 3.0, res)
	r.check("X again unloads it", Wallbang.toggle(me) == "off" and not Wallbang.armed(me))
	# 2) through the hall wall: a normal shot stops, a wallbang round goes through and kills
	me.loadout.select(me.loadout.by_id("rifle"))
	me.loadout.active.state = "idle"
	place(me, 300, 0, 300, 90)
	place(enemy, -200, 0, 300, -90)
	enemy.armor = 0
	enemy.helmet = false
	Actors.render(DT, 1.0)
	me.player.pitch = atan2(enemy.player.pos.y + 50.0 - (me.player.pos.y + 64.0), 500.0)
	fire(main, me)
	r.check("a normal rifle shot stops in the hall wall", enemy.health == 100, "hp=%d hit=%s" % [enemy.health, Game.last_hit.get("what", "-")])
	me.player.pitch = atan2(enemy.player.pos.y + 66.0 - (me.player.pos.y + 64.0), 500.0)
	r.check("loading a round", Wallbang.toggle(me) == "armed")
	fire(main, me)
	var fed := false
	for f: Dictionary in Actors.feed:
		if f.wb:
			fed = true
	r.check("the wallbang round goes through the wall and drops the enemy; one round used",
		not enemy.alive and Wallbang.charges(me) == 2.0 and int(Game.last_hit.get("pens", 0)) >= 1 and not Wallbang.armed(me) and fed,
		"alive=%s left=%s walls=%s feed=%s" % [enemy.alive, Wallbang.charges(me), Game.last_hit.get("pens"), Actors.feed.size()])
	me.wb_charges = 0
	r.check("with none left, X won’t load another", Wallbang.toggle(me) == "empty")
	# 3) scoping in (Mouse 2 held)
	place(me, 300, 0, 100, 90)
	place(enemy, -200, 0, 100, -90)
	var g := me.loadout.active as Gun
	var in0 := g.inaccuracy(me.player)
	Game.state = "play"
	Controls.test_hold = {"alt": true}
	r.ticks(main, 40)
	var in1 := g.inaccuracy(me.player)
	r.check("holding Mouse 2 scopes in: a slight zoom, a little more accurate, slower",
		g.ads == 1.0 and g.ads_fov() < float(Settings.get_value("fov")) * 0.85 and in1 < in0 * 0.85 and g.speed() < float(g.def.maxSpeed),
		"ads=%.2f fov=%.1f inacc %.1f -> %.1f speed=%.0f" % [g.ads, g.ads_fov(), in0, in1, g.speed()])
	Controls.test_hold = {}
	r.ticks(main, 30)
	r.check("letting go scopes out", g.ads == 0.0 and g.ads_fov() == 0.0)
	# 4) admin: noclip refused first, a wrong code, the right code, then the powers
	Controls.edges["noclip"] = true
	main.handle_hotkeys()
	r.check("without admin, V doesn’t give noclip", not me.player.noclip)
	var a1 := Admin.try_code("let me in")
	r.check("a wrong admin passcode is refused", not a1.ok and not Admin.on, a1.msg)
	var a2 := Admin.try_code("Breach-Every-Wall")
	r.check("the right passcode makes you an admin (any letter case)", a2.ok and Admin.on and me.admin, a2.msg)
	Controls.edges["noclip"] = true
	main.handle_hotkeys()
	me.alive_t = 0.0
	r.check("admin: V flies, wallbang rounds unlimited with no wait",
		me.player.noclip and Wallbang.charges(me) == INF and Wallbang.unlock_in(me) == 0.0 and Wallbang.toggle(me) == "armed")
	Controls.edges["noclip"] = true
	main.handle_hotkeys()
	Wallbang.toggle(me)
	place(me, 300, 0, 300, 90)
	place(enemy, -200, 0, 300, -90)
	Actors.render(DT, 1.0)
	HUD._update_spotted(me, 1.0)
	r.check("admin sees enemies through walls (x-ray) and on the radar",
		enemy.model.xray != null and enemy.model.xray.visible and HUD.spotted.has(enemy))
	# 5) unlimited money in a defuse match, and the match records nothing
	Session.begin({"map": "range", "mode": "defuse", "ranked": false, "diff": "normal", "team": "1", "allies": 0, "enemies": 1, "len": "short", "ff": false})
	Game.bots_frozen = true
	var b := Match.buy(me, "sniper")
	r.check("admin: unlimited money (buying costs nothing)", b.ok and me.money == Match.MAX_MONEY, "%s money=%d" % [b.msg, me.money])
	var xp0: float = Profile.v.xp
	me.kills = 9
	var guard := 0
	while Match.phase != "over" and guard < 30:
		Match.end_round(me.team, "elim")
		if Match.phase != "over":
			Match.next_round()
		guard += 1
	r.check("a match with admin powers on records nothing", Session.done and Session.results.get("admin", false) and Profile.v.xp == xp0 and (Profile.v.history as Array).is_empty(),
		"xp %s -> %s" % [xp0, Profile.v.xp])
	Admin.remove()
	Game.state = "menu"
	main.queue_free()
