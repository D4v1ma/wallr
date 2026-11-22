extends RefCounted
## Actors, damage, hitboxes and bot behaviour (same cases as tools/node-bot-check.mjs).

const DT := 1.0 / 64.0
var shots: Array = []
var me: Actor


func place(a: Actor, x: float, y: float, z: float, yaw: float) -> void:
	a.player.spawn(Vector3(x, y, z), yaw)
	a.player.pitch = 0.0
	a.alive = true
	a.health = 100
	a.armor = 100
	a.helmet = true


func pose() -> void:
	Actors.render(DT, 1.0)


func step(n: int, opts: Dictionary = {}) -> void:
	for i in n:
		Game.time += DT
		for a: Actor in Actors.list:
			if not a.alive:
				continue
			var cmd: Dictionary = a.brain.think(DT) if a.brain else Controls.IDLE.duplicate()
			if (a.brain and not opts.get("botStatic", false)) or opts.get("meMoves", false):
				a.player.tick(cmd, DT)
			if a.brain or opts.get("meMoves", false):
				a.loadout.tick(cmd, a.player, Game.time, DT)
			for w: Weapon in a.loadout.list:
				for e: Dictionary in w.events:
					if e.type == "shot":
						shots.append({"t": Game.time, "who": a.name})
						Combat.shot(a, w, e)
				w.events.clear()
			a.player.events.clear()
		if not opts.get("noRespawn", false):
			Actors.tick(DT)
		else:
			for a: Actor in Actors.list:
				a.hurt_t = 0.0
		pose()


func first_shot_by(name: String) -> Variant:
	for s: Dictionary in shots:
		if s.who == name:
			return s
	return null


func run(r: Node) -> void:
	var main: Node = await r.boot_game({"map": "range", "mode": "skirmish", "bots": "0", "team": "1", "diff": "normal"})
	Game.state = "menu"     # the runner drives the ticks here
	var L := Game.L
	for b in L.cw.dynamic:
		L.cw.set_active(b, false)      # doors open for these tests
	me = Actors.me
	# 1) damage model
	place(me, 600, 0, 0, 0)
	var bot := Actors.add_bot(0)
	var rifle := Data.weapon("rifle")
	var d := me.damage(33, "chest", bot, rifle, Vector3.ZERO)
	r.check("rifle chest hit vs armor: ~26 to health, armor dents", d == 26 and me.armor == 96, "dealt=%d hp=%d armor=%d" % [d, me.health, me.armor])
	place(me, 600, 0, 0, 0)
	d = me.damage(33, "head", bot, rifle, Vector3.ZERO)
	r.check("rifle headshot kills through a helmet", not me.alive and d >= 100, "dealt=%d" % d)
	place(me, 600, 0, 0, 0)
	d = me.damage(35, "head", bot, Data.weapon("pistol"), Vector3.ZERO)
	r.check("pistol headshot vs helmet does not one-shot", me.alive and d > 60 and d < 100, "dealt=%d hp=%d" % [d, me.health])
	place(me, 600, 0, 0, 0)
	d = me.damage(33, "leg", bot, rifle, Vector3.ZERO)
	r.check("legs ignore armor and take 0.75x", d == 25 and me.armor == 100, "dealt=%d" % d)
	# 2) hitboxes on a posed model (shots from behind so the arms holding the rifle are not in the way)
	place(me, 600, 0, 0, PI / 2)
	pose()
	var hit := func(y: float, z: float = 0.0) -> String:
		var h := me.model.hit_test(Vector3(900, y, z), Vector3(-1, 0, 0), 2000.0)
		return "miss" if h.is_empty() else String(h.group)
	r.check("hitboxes: head / chest / stomach / leg / miss", hit.call(66.0) == "head" and hit.call(52.0) == "chest" and hit.call(40.0) == "stomach" and hit.call(28.0, 4.0) == "leg" and hit.call(80.0) == "miss",
		"66:%s 52:%s 40:%s 28:%s 80:%s" % [hit.call(66.0), hit.call(52.0), hit.call(40.0), hit.call(28.0, 4.0), hit.call(80.0)])
	var front := me.model.hit_test(Vector3(300, 52, 0), Vector3(1, 0, 0), 2000.0)
	r.check("from the front, the arms holding the rifle cover the chest", not front.is_empty() and front.group == "arm", "miss" if front.is_empty() else String(front.group))
	# 3) bot finds and kills a target standing in the open
	place(me, 700, 0, 100, PI / 2)
	place(bot, 300, 0, 100, -PI / 2)
	bot.brain.reset()
	shots.clear()
	var t0 := Game.time
	step(64 * 6, {"noRespawn": true})
	var first: Variant = first_shot_by(bot.name)
	r.check("bot reacts after a human-like delay, then kills", first != null and float(first.t) - t0 > 0.2 and not me.alive,
		"first shot +%s s, target alive=%s, shots=%d" % ["%.2f" % (float(first.t) - t0) if first != null else "-", me.alive, shots.size()])
	# 4) walls block sight
	place(me, -200, 0, 300, -PI / 2)
	place(bot, 300, 0, 300, PI / 2)
	bot.brain.reset()
	shots.clear()
	step(64 * 3, {"noRespawn": true, "botStatic": true})
	r.check("no sight or shots through the hall wall (bot held in place)", shots.is_empty() and me.alive and bot.brain.target == null, "shots=%d" % shots.size())
	# 5) smoke blocks sight
	place(me, 900, 0, 100, PI / 2)
	place(bot, 300, 0, 100, -PI / 2)
	bot.brain.reset()
	shots.clear()
	var cloud := SmokeCloud.new(L, Vector3(600, 0, 100), 77)
	cloud.t = 4.0
	Grenades.clouds.append(cloud)
	step(64 * 3, {"noRespawn": true, "botStatic": true})
	r.check("no sight or shots through a smoke cloud (bot held in place)", shots.is_empty() and me.alive and bot.brain.target == null, "shots=%d" % shots.size())
	Grenades.clouds.clear()
	# 6) roaming without enemies around
	me.alive = false
	me.dead_t = -1e9
	place(bot, -600, 0, 100, 0)
	bot.brain.reset()
	var travelled := 0.0
	var prev := bot.player.pos
	var stuck_max := 0.0
	var s := 0
	while s < 64 * 20:
		step(32, {"noRespawn": true})
		travelled += Vector2(bot.player.pos.x - prev.x, bot.player.pos.z - prev.z).length()
		prev = bot.player.pos
		stuck_max = maxf(stuck_max, bot.brain.stuck_t)
		s += 32
	r.check("a bot roams the level on its own (20 s)", travelled > 1500.0, "travelled %.0f u, worst stuck %.1f" % [travelled, stuck_max])
	# 7) what a bot does NOT know
	me.alive = true
	me.health = 100
	place(me, 300, 0, 100, -PI / 2)
	place(bot, 700, 0, 100, -PI / 2)     # you stand behind it, still and silent
	bot.brain.reset()
	bot.brain.set_order({"kind": "hold", "pos": Vector3(700, 0, 100), "yaw": -PI / 2})
	shots.clear()
	step(64 * 2, {"noRespawn": true, "botStatic": true})
	r.check("a bot doesn’t see you standing behind it", bot.brain.target == null and me.alive and shots.is_empty(), "target=%s" % (bot.brain.target != null))
	place(bot, 300, 0, 100, PI / 2)
	bot.brain.reset()
	Bots.noise(Vector3(-200, 64, 300), null, 1700.0)
	var inv: Variant = bot.brain.investigate
	var off := Vector2(inv.x + 200.0, inv.z - 300.0).length() if inv != null else -1.0
	r.check("hearing a shot through a wall gives only a rough position", inv != null and off > 1.0 and off < 0.5 * Vector2(500, 200).length(), "off by %.0f u" % off)
	place(bot, 700, 0, 100, PI / 2)
	bot.brain.reset()
	place(me, 300, 0, 100, -PI / 2)
	bot.player.yaw = PI / 2
	bot.brain.on_hurt(me, Vector3(300, 64, 100))
	var g: Variant = bot.brain.investigate
	var dir_err := 9.0
	if g != null:
		dir_err = absf(U.wrap_angle(atan2(-(g.x - 700.0), -(g.z - 100.0)) - atan2(-(300.0 - 700.0), 0.0)))
	r.check("getting shot only gives the rough direction it came from", g != null and dir_err < 0.3 and bot.brain.target == null, "direction off by %d°" % roundi(rad_to_deg(dir_err)))
	var mate := Actors.add_bot(0)
	place(mate, -600, 0, 100, 0)
	mate.brain.reset()
	bot.brain.reset()
	Bots.callout(bot, me)
	var heard_early: bool = mate.brain.investigate != null
	step(64 * 2, {"noRespawn": true, "botStatic": true})
	var told: Variant = mate.brain.investigate if mate.brain.investigate != null else mate.brain.goal
	r.check("a callout reaches teammates a moment later, with where you were", not heard_early and told != null and Vector2(told.x - 300.0, told.z - 100.0).length() < 60.0, str(told))
	mate.model.free_nodes()
	Actors.list.erase(mate)
	# 8) bot vs bot duel in the open
	var w := Actors.add_bot(1)
	place(bot, 300, 0, 100, -PI / 2)
	place(w, 700, 0, 100, PI / 2)
	bot.brain.reset()
	w.brain.reset()
	shots.clear()
	me.alive = false
	me.dead_t = -1e9
	step(64 * 8, {"noRespawn": true})
	r.check("two bots duel until one goes down", not bot.alive or not w.alive, "hp %d vs %d, shots %d" % [bot.health, w.health, shots.size()])
	var t1 := Time.get_ticks_usec()
	for a: Actor in Actors.list:
		place(a, 300 + randi() % 400, 0, randi() % 400 - 200, 0)
	step(64 * 4)
	var ms := (Time.get_ticks_usec() - t1) / 1000.0
	r.check("bot thinking + movement cost per tick is small", ms / (64.0 * 4.0) < 4.0, "%.2f ms per tick (%d actors)" % [ms / 256.0, Actors.list.size()])
	main.queue_free()
