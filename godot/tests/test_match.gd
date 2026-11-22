extends RefCounted
## Bots play defuse rounds on a map (you play as a bot on the Wardens): rounds finish, the charge
## gets planted, money and scores move, nobody stays stuck (like tools/node-map-check.mjs).

const DT := 1.0 / 64.0


func run(r: Node) -> void:
	var maps: PackedStringArray = String(Game.args.get("maps", "depot")).split(",")
	var rounds := int(Game.args.get("rounds", "6"))
	var nb := String(Game.args.get("bots", "8"))           # 8v8 by default, as on the big maps
	var na := String(Game.args.get("allies", "7"))
	for key in maps:
		var main: Node = await r.boot_game({"map": key, "mode": "defuse", "bots": nb, "allies": na, "team": "1", "diff": "normal"})
		Game.state = "menu"
		var me := Actors.me
		me.brain = BotBrain.new(me)
		Match.start_match()
		var t0 := Time.get_ticks_usec()
		var plants := 0
		var outcomes := {}
		var kills := 0
		var ticks := 0
		var last_round := Match.round
		var was_planted := false
		var buys := 0
		# a round can last freeze time + 175 s + a 45 s fuse + the pause after it
		while Match.history.size() < rounds and ticks < 64 * 260 * rounds:
			main.sim_tick(DT)
			ticks += 1
			if Match.planted and not was_planted:
				plants += 1
			was_planted = Match.planted
			if Match.round != last_round:
				last_round = Match.round
			if ticks % 64 == 0:
				Actors.render(DT, 1.0)
				# the most players holding a bought primary at once (the dead drop theirs, so the
				# count after the last round says little)
				buys = maxi(buys, Actors.list.filter(func(a: Actor) -> bool: return a.alive and a.loadout.primary() != null).size())
			if Match.phase == "over":
				break
		for h: Dictionary in Match.history:
			outcomes[h.reason] = int(outcomes.get(h.reason, 0)) + 1
		for a: Actor in Actors.list:
			kills += a.kills
		var secs := (Time.get_ticks_usec() - t0) / 1e6
		var game_secs := ticks * DT
		r.check("%s: bots finish %d defuse rounds" % [key, rounds], Match.history.size() >= rounds, "%d rounds in %.0f s of play (%s), %.1f s real" % [Match.history.size(), game_secs, str(outcomes), secs])
		r.check("%s: the charge gets planted" % key, plants >= 1, "%d plants" % plants)
		r.check("%s: fights happen (kills)" % key, kills >= rounds * 3, "%d kills" % kills)
		r.check("%s: bots buy guns as money comes in" % key, buys >= 4, "up to %d holding a primary at once" % buys)
		r.check("%s: simulation stays fast (%d actors)" % [key, Actors.list.size()], secs / game_secs < 0.5, "%.2f ms per tick" % (secs * 1000.0 / ticks))
		Game.state = "menu"
		main.queue_free()
		await r.get_tree().process_frame
