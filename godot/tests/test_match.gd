extends RefCounted
## Bots play defuse rounds on a map (you play as a bot on the Wardens): rounds finish, the charge
## gets planted, money and scores move, nobody stays stuck (like tools/node-map-check.mjs).

const DT := 1.0 / 64.0


func run(r: Node) -> void:
	var maps: PackedStringArray = String(Game.args.get("maps", "depot")).split(",")
	var rounds := int(Game.args.get("rounds", "6"))
	for key in maps:
		var main: Node = await r.boot_game({"map": key, "mode": "defuse", "bots": "5", "allies": "4", "team": "1", "diff": "normal"})
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
		while Match.history.size() < rounds and ticks < 64 * 150 * rounds:
			main.sim_tick(DT)
			ticks += 1
			if Match.planted and not was_planted:
				plants += 1
			was_planted = Match.planted
			if Match.round != last_round:
				last_round = Match.round
			if ticks % 64 == 0:
				Actors.render(DT, 1.0)
			if Match.phase == "over":
				break
		for h: Dictionary in Match.history:
			outcomes[h.reason] = int(outcomes.get(h.reason, 0)) + 1
		for a: Actor in Actors.list:
			kills += a.kills
			if a.loadout.primary():
				buys += 1
		var secs := (Time.get_ticks_usec() - t0) / 1e6
		var game_secs := ticks * DT
		r.check("%s: bots finish %d defuse rounds" % [key, rounds], Match.history.size() >= rounds, "%d rounds in %.0f s of play (%s), %.1f s real" % [Match.history.size(), game_secs, str(outcomes), secs])
		r.check("%s: the charge gets planted" % key, plants >= 1, "%d plants" % plants)
		r.check("%s: fights happen (kills)" % key, kills >= rounds * 3, "%d kills" % kills)
		r.check("%s: bots buy guns as money comes in" % key, buys >= 4, "%d with a primary" % buys)
		r.check("%s: simulation stays fast (10 actors)" % key, secs / game_secs < 0.5, "%.2f ms per tick" % (secs * 1000.0 / ticks))
		Game.state = "menu"
		main.queue_free()
		await r.get_tree().process_frame
