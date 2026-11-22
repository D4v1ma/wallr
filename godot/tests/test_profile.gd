extends RefCounted
## Progression maths: levels and points, rank thresholds, XP and Elo rules, recording matches
## (the same rules as tools/node-profile-check.mjs).


func run(r: Node) -> void:
	Accounts.play_as_guest()
	var P := Profile
	r.check("level 1 needs 800 XP; every 10th level pays a 500-point bonus", P.level_of(0).level == 1 and P.level_need(1) == 800 and P.level_points(10) == P.level_points(9) + 10 + 500)
	r.check("XP rolls over into levels", P.level_of(800).level == 2 and P.level_of(800 + 950).level == 3)
	var top: Dictionary = P.RANKS[-1]
	r.check("ranks run from Spark I to Wallbreaker at 2400", P.RANKS[P.rank_for(0)].name == "Spark I" and P.RANKS[P.rank_for(700)].name == "Spark II" and P.RANKS[P.rank_for(2400)].name == "Wallbreaker" and top.name == "Wallbreaker",
		"%d ranks" % P.RANKS.size())
	var st := {"kills": 18, "deaths": 12, "hs": 6, "dmg": 2200, "rounds": 24, "roundsWon": 16, "plants": 2, "defuses": 1}
	var ranked := {"map": "depot", "mode": "defuse", "ranked": true, "diff": "normal", "enemies": 5, "allies": 4, "len": "standard"}
	var casual := ranked.duplicate()
	casual.ranked = false
	var ew := P.elo_for(ranked, st, "win", 1000.0, 5)
	var ec := P.elo_for(casual, st, "win", 1000.0, 5)
	var el := P.elo_for(ranked, {"kills": 6, "deaths": 18, "hs": 1, "dmg": 900, "rounds": 24, "plants": 0, "defuses": 0}, "loss", 1000.0, 5)
	r.check("a ranked win gains far more Elo than a casual one; a poor ranked loss costs", int(ew.delta) > int(ec.delta) * 2 and int(ec.delta) > 0 and int(el.delta) < 0,
		"ranked +%d casual +%d loss %d" % [ew.delta, ec.delta, el.delta])
	var placement := P.elo_for(ranked, st, "win", 1000.0, 0)
	r.check("placement matches count double", int(placement.delta) > int(ew.delta), "placement +%d" % placement.delta)
	var xw := P.xp_for(ranked, st, "win")
	var hard := ranked.duplicate()
	hard.diff = "hard"
	var xh := P.xp_for(hard, st, "win")
	r.check("XP: wins and completed matches pay, harder bots and ranked pay more", int(xw.total) > 2500 and int(xh.total) > int(xw.total), "normal %d hard %d" % [xw.total, xh.total])
	P.v = P.blank()
	var res := P.apply_match(ranked, st, "win", "m1")
	r.check("recording a ranked win: XP, a level-up with points, Elo, a placement, history",
		float(P.v.xp) > 0.0 and not (res.ups as Array).is_empty() and int(P.v.points) > P.WELCOME_POINTS and float(P.v.elo) > 1000.0 and int(P.v.placed) == 1 and (P.v.history as Array).size() == 1,
		"xp %d level %d points %d elo %d" % [P.v.xp, P.level().level, P.v.points, P.v.elo])
	var skirm := {"map": "range", "mode": "skirmish", "ranked": false, "diff": "normal"}
	P.apply_match(skirm, {"kills": 5, "deaths": 2, "hs": 1, "dmg": 500, "rounds": 0, "roundsWon": 0, "plants": 0, "defuses": 0}, "practice", "m2")
	r.check("skirmish pays practice XP but adds no history and no Elo", (P.v.history as Array).size() == 1 and int(P.v.placed) == 1)
	r.check("the admin passcode hash matches the original game's", Admin.HASHES.has(Accounts.pin_hash("admin", "breach-every-wall")))
	r.check("shop prices scale per gun (pistol attachments cost less)", Arsenal.att_price("brake", "pistol") < Arsenal.att_price("brake", "rifle"))
	P.v = P.blank()
