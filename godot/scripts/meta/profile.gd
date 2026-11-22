extends Node
## Career profile: XP and levels (each level pays shop points), owned attachments and camos, the
## per-gun kit, Elo rating and rank, lifetime stats and recent matches. One profile per account on
## this device (see accounts.gd); a guest's profile isn't saved.

signal changed

const DIFFS := {
	"easy": {"name": "Easy", "elo": 750, "xp": 0.8, "blurb": "Slow to react, loose aim"},
	"normal": {"name": "Normal", "elo": 1050, "xp": 1.0, "blurb": "Fair fights"},
	"hard": {"name": "Hard", "elo": 1350, "xp": 1.25, "blurb": "Quick, accurate, punishes peeks"},
	"expert": {"name": "Expert", "elo": 1650, "xp": 1.5, "blurb": "Near-instant reactions, headshot aim"},
}
const DIFF_ORDER := ["easy", "normal", "hard", "expert"]
## Ranks by rating. The family sets the emblem colour; tiers are I–III.
const RANK_FAMILIES := [
	{"name": "Spark", "col": "#c07a4a", "col2": "#6e3d22"}, {"name": "Flint", "col": "#aeb6bb", "col2": "#535b61"},
	{"name": "Fuse", "col": "#f0a53a", "col2": "#8a5310"}, {"name": "Charge", "col": "#4fc6b8", "col2": "#1b5f58"},
	{"name": "Blast", "col": "#e5573f", "col2": "#7a1f13"}, {"name": "Shockwave", "col": "#a688f0", "col2": "#4b3290"},
	{"name": "Wallbreaker", "col": "#ffd76a", "col2": "#9a6a00"},
]
const PLACEMENTS := 3
const WELCOME_POINTS := 600

var RANKS: Array = []
var v: Dictionary = {}


func _ready() -> void:
	var roman := ["I", "II", "III"]
	var r := 0
	for f in 5:
		for t in 3:
			RANKS.append({"name": "%s %s" % [RANK_FAMILIES[f].name, roman[t]], "fam": f, "tier": t + 1, "min": r})
			r = 700 if r == 0 else r + 100
	RANKS.append({"name": "Shockwave", "fam": 5, "tier": 0, "min": 2200})
	RANKS.append({"name": "Wallbreaker", "fam": 6, "tier": 0, "min": 2400})
	v = blank()


func rank_for(elo: float) -> int:
	var k := 0
	for i in RANKS.size():
		if elo >= float(RANKS[i].min):
			k = i
	return k


## Levels: XP needed for the next level grows, and every level-up pays shop points.
static func level_need(L: int) -> int:
	return mini(800 + 150 * (L - 1), 6000)


static func level_points(L: int) -> int:
	return mini(150 + 10 * (L - 1), 600) + (500 if L % 10 == 0 else 0)


static func level_of(xp: float) -> Dictionary:
	var L := 1
	var rest := maxf(0.0, xp)
	while L < 200 and rest >= level_need(L):
		rest -= level_need(L)
		L += 1
	return {"level": L, "into": rest, "need": level_need(L)}


func blank() -> Dictionary:
	var kit := {}
	for g: String in Arsenal.ARMORY_GUNS:
		kit[g] = {"muzzle": "", "optic": "", "mag": "", "grip": "", "camo": ""}
	return {
		"ver": 1, "created": Time.get_unix_time_from_system(), "updated": 0.0, "xp": 0.0, "points": WELCOME_POINTS, "owned": {"att": [], "camo": []}, "kit": kit,
		"elo": 1000.0, "peak": 1000.0, "placed": 0, "lastCfg": null, "lastMatchId": "",
		"stats": {"matches": 0, "wins": 0, "losses": 0, "draws": 0, "left": 0, "ranked": 0, "kills": 0, "deaths": 0, "hs": 0, "damage": 0, "rounds": 0, "plants": 0, "defuses": 0},
		"history": [],
	}


## Accept anything shaped roughly right; drop what isn't.
func sanitize(o: Variant) -> Dictionary:
	var b := blank()
	if typeof(o) != TYPE_DICTIONARY:
		return b
	var num := func(x: Variant, d: float, lo: float = 0.0, hi: float = 1e9) -> float:
		return clampf(float(x), lo, hi) if (typeof(x) == TYPE_FLOAT or typeof(x) == TYPE_INT) else d
	b.created = num.call(o.get("created"), b.created)
	b.updated = num.call(o.get("updated"), 0.0)
	b.xp = num.call(o.get("xp"), 0.0)
	b.points = int(num.call(o.get("points"), WELCOME_POINTS))
	b.elo = num.call(o.get("elo"), 1000.0, 0.0, 5000.0)
	b.peak = num.call(o.get("peak"), b.elo, 0.0, 5000.0)
	b.placed = int(num.call(o.get("placed"), 0.0, 0.0, 1e6))
	var owned: Variant = o.get("owned")
	if owned is Dictionary:
		if owned.get("att") is Array:
			for s in owned.att:
				if s is String and s.contains(":"):
					var parts: PackedStringArray = s.split(":")
					if Arsenal.att_fits(parts[1], parts[0]):
						b.owned.att.append(s)
		if owned.get("camo") is Array:
			for s in owned.camo:
				if s is String and Arsenal.CAMOS.has(s):
					b.owned.camo.append(s)
	var kit: Variant = o.get("kit")
	if kit is Dictionary:
		for g: String in Arsenal.ARMORY_GUNS:
			var k: Variant = kit.get(g)
			if not (k is Dictionary):
				continue
			for slot: String in Arsenal.SLOTS:
				var a: Variant = k.get(slot)
				if a is String and a != "" and Arsenal.att_fits(a, g) and Arsenal.ATTACHMENTS[a].slot == slot and (b.owned.att as Array).has("%s:%s" % [g, a]):
					b.kit[g][slot] = a
			var c: Variant = k.get("camo")
			if c is String and (b.owned.camo as Array).has(c):
				b.kit[g].camo = c
	var st: Variant = o.get("stats")
	if st is Dictionary:
		for key: String in b.stats:
			b.stats[key] = int(num.call(st.get(key), 0.0))
	if o.get("history") is Array:
		var h: Array = (o.history as Array).filter(func(x: Variant) -> bool: return x is Dictionary)
		b.history = h.slice(0, 15)
	if o.get("lastCfg") is Dictionary:
		b.lastCfg = o.lastCfg
	if o.get("lastMatchId") is String:
		b.lastMatchId = String(o.lastMatchId).substr(0, 40)
	return b


## Every real change goes through here: the signed-in account's profile is written to this device.
func save() -> void:
	v.updated = Time.get_unix_time_from_system()
	Accounts.save_profile()
	changed.emit()


func save_label() -> String:
	if Accounts.is_guest():
		return "Guest · progress isn’t saved"
	if Accounts.last_saved > 0.0:
		var t := Time.get_datetime_dict_from_unix_time(int(Accounts.last_saved))
		return "Saved on this device · %02d:%02d" % [t.hour, t.minute]
	return "Saved on this device"


func level() -> Dictionary:
	return level_of(float(v.xp))


func rank() -> int:
	return rank_for(float(v.elo)) if int(v.placed) >= PLACEMENTS else -1


func owns(kind: String, id: String) -> bool:
	return (v.owned[kind] as Array).has(id)


func kit_of(gun: String) -> Dictionary:
	return v.kit.get(gun, {})


## Shop: attachments are per gun ("rifle:hush"), camos are for every gun.
func buy(kind: String, id: String, gun: String = "") -> Dictionary:
	var key := "%s:%s" % [gun, id] if kind == "att" else id
	if owns(kind, key):
		return {"ok": false, "msg": "Already owned"}
	if kind == "att" and not Arsenal.att_fits(id, gun):
		return {"ok": false, "msg": "Does not fit this gun"}
	var price: int = Arsenal.att_price(id, gun) if kind == "att" else (int(Arsenal.CAMOS[id].price) if Arsenal.CAMOS.has(id) else 1 << 30)
	if int(v.points) < price:
		return {"ok": false, "msg": "Need %d more points" % (price - int(v.points))}
	v.points = int(v.points) - price
	(v.owned[kind] as Array).append(key)
	save()
	var msg := "%s unlocked for the %s" % [Arsenal.att_name(id, gun), Data.weapon(gun).name] if kind == "att" else "%s unlocked for every gun" % Arsenal.CAMOS[id].name
	return {"ok": true, "msg": msg, "price": price}


func equip(gun: String, slot: String, id: String) -> bool:
	if not v.kit.has(gun):
		return false
	var k: Dictionary = v.kit[gun]
	if slot == "camo":
		if id != "" and not owns("camo", id):
			return false
		k.camo = id
	else:
		if id != "" and (not owns("att", "%s:%s" % [gun, id]) or Arsenal.ATTACHMENTS[id].slot != slot):
			return false
		k[slot] = id
	Arsenal._cache.clear()
	save()
	return true


## An admin match: what the results screen shows, with nothing earned and nothing recorded.
func admin_results(cfg: Dictionary, st: Dictionary, outcome: String) -> Dictionary:
	var lv := level()
	var rk := rank()
	return {"outcome": outcome, "cfg": cfg, "st": st, "xp": {"lines": [], "base": 0, "k": 1.0, "mults": ["Admin match"], "total": 0}, "ups": [], "lv0": lv, "lv1": lv,
		"elo": null, "elo0": v.elo, "elo1": v.elo, "rank0": rk, "rank1": rk, "placed0": v.placed, "placed1": v.placed, "pointsNow": v.points, "admin": true}


## Fold a finished (or abandoned) match into the career; returns everything the results screen shows.
func apply_match(cfg: Dictionary, st: Dictionary, outcome: String, match_id: String) -> Dictionary:
	var lv0 := level()
	var rank0 := rank()
	var elo0: float = v.elo
	var placed0: int = v.placed
	var xp := xp_for(cfg, st, outcome)
	var elo: Variant = elo_for(cfg, st, outcome, float(v.elo), int(v.placed)) if cfg.mode == "defuse" and outcome != "none" else null
	v.xp = float(v.xp) + float(xp.total)
	var lv1 := level()
	var ups: Array = []
	for L in range(int(lv0.level) + 1, int(lv1.level) + 1):
		var p := level_points(L)
		ups.append({"level": L, "points": p})
		v.points = int(v.points) + p
	if elo != null:
		v.elo = maxf(0.0, float(v.elo) + float(elo.delta))
		if cfg.get("ranked", false):
			v.placed = int(v.placed) + 1
		if int(v.placed) >= PLACEMENTS:
			v.peak = maxf(float(v.peak), float(v.elo))
	var s: Dictionary = v.stats
	if cfg.mode == "defuse" and outcome != "none":
		s.matches += 1
		if cfg.get("ranked", false):
			s.ranked += 1
		match outcome:
			"win": s.wins += 1
			"draw": s.draws += 1
			"left": s.left += 1
			_: s.losses += 1
		s.rounds += int(st.rounds)
		s.plants += int(st.plants)
		s.defuses += int(st.defuses)
	s.kills += int(st.kills)
	s.deaths += int(st.deaths)
	s.hs += int(st.hs)
	s.damage += roundi(float(st.dmg))
	var rec := {"t": Time.get_unix_time_from_system(), "map": cfg.map, "mode": cfg.mode, "ranked": cfg.get("ranked", false), "diff": cfg.diff, "outcome": outcome,
		"score": st.get("score"), "k": st.kills, "d": st.deaths, "adr": roundi(float(st.dmg) / float(st.rounds)) if int(st.rounds) > 0 else 0,
		"xp": xp.total, "elo": elo.delta if elo != null else null}
	if cfg.mode == "defuse" and outcome != "none":
		(v.history as Array).push_front(rec)
		v.history = (v.history as Array).slice(0, 15)
	if match_id != "":
		v.lastMatchId = match_id
	Accounts.touch()
	save()
	return {"outcome": outcome, "cfg": cfg, "st": st, "xp": xp, "ups": ups, "lv0": lv0, "lv1": lv1, "elo": elo, "elo0": elo0, "elo1": v.elo,
		"rank0": rank0, "rank1": rank(), "placed0": placed0, "placed1": v.placed, "pointsNow": v.points}


## XP for one match. st: {kills, deaths, hs, dmg, rounds, roundsWon, plants, defuses}.
func xp_for(cfg: Dictionary, st: Dictionary, outcome: String) -> Dictionary:
	var lines: Array = []
	var add := func(label: String, x: float) -> void:
		if roundi(x) != 0:
			lines.append({"label": label, "v": roundi(x)})
	if cfg.mode == "defuse":
		add.call("Eliminations %d × 100" % st.kills, float(st.kills) * 100.0)
		add.call("Headshots %d × 30" % st.hs, float(st.hs) * 30.0)
		add.call("Damage %d × 0.5" % roundi(float(st.dmg)), float(st.dmg) * 0.5)
		add.call("Rounds won %d × 60" % st.roundsWon, float(st.roundsWon) * 60.0)
		add.call("Charges planted %d × 80" % st.plants, float(st.plants) * 80.0)
		add.call("Charges defused %d × 120" % st.defuses, float(st.defuses) * 120.0)
		if outcome == "win":
			add.call("Match win", 600.0)
		elif outcome == "draw":
			add.call("Match draw", 300.0)
		if outcome != "left" and outcome != "none":
			add.call("Match completed", 400.0)
	else:
		add.call("Practice eliminations %d × 40" % st.kills, float(st.kills) * 40.0)
		add.call("Practice damage %d × 0.2" % roundi(float(st.dmg)), float(st.dmg) * 0.2)
	var base := 0
	for l: Dictionary in lines:
		base += int(l.v)
	var d: Dictionary = DIFFS.get(String(cfg.diff), DIFFS.normal)
	var k := float(d.xp)
	var mults := ["%s bots ×%s" % [d.name, str(d.xp)]]
	if cfg.get("ranked", false):
		k *= 1.25
		mults.append("Ranked ×1.25")
	return {"lines": lines, "base": base, "k": k, "mults": mults, "total": roundi(base * k)}


## Bot sides have a rating set by difficulty (and how many of them you face); the result moves
## you toward it Elo-style, and your own eliminations and damage add on top. Ranked matches count
## fully; casual ones a quarter. Placement matches move twice as far.
static func opp_rating(cfg: Dictionary) -> float:
	var d: Dictionary = DIFFS.get(String(cfg.get("diff", "normal")), DIFFS.normal)
	return float(d.elo) + 40.0 * (float(cfg.get("enemies", 8)) - 1.0 - float(cfg.get("allies", 7)))


func elo_for(cfg: Dictionary, st: Dictionary, outcome: String, rating: float, placed: int) -> Dictionary:
	var ropp := opp_rating(cfg)
	var E := 1.0 / (1.0 + pow(10.0, (ropp - rating) / 400.0))
	var S := 1.0 if outcome == "win" else (0.5 if outcome == "draw" else 0.0)
	var len_k := 0.7 if cfg.get("len", "standard") == "short" else 1.0
	var ranked: bool = cfg.get("ranked", false)
	var placing := ranked and placed < PLACEMENTS
	var K := (64.0 if placing else 32.0) if ranked else 8.0
	K *= len_k
	var result := K * (S - E)
	var rounds := float(st.rounds)
	var adr := float(st.dmg) / rounds if rounds > 0.0 else 0.0
	var parts: Array = [
		{"label": "Eliminations %d × 0.9" % st.kills, "v": float(st.kills) * 0.9}, {"label": "Headshots %d × 0.15" % st.hs, "v": float(st.hs) * 0.15},
		{"label": "Damage per round %d vs 75" % roundi(adr), "v": (adr - 75.0) * 0.12 if rounds > 0.0 else 0.0}, {"label": "Deaths %d × −0.6" % st.deaths, "v": -float(st.deaths) * 0.6},
		{"label": "Objectives", "v": float(st.plants) * 0.5 + float(st.defuses) * 1.0},
	]
	var raw_sum := 0.0
	for p: Dictionary in parts:
		raw_sum += float(p.v)
	var fav := 2.0 * (1.0 - E) if raw_sum > 0.0 else 2.0 * E     # favourites gain less and lose more
	var mode_k := (2.0 if placing else 1.0) if ranked else 0.25
	var cap := 24.0 if ranked else 6.0
	var perf := clampf(raw_sum * len_k * fav * mode_k, -cap, cap)
	var why := ["%s ×%.2f at %d%% expected" % ["gains" if raw_sum > 0.0 else "losses", fav, roundi(E * 100.0)]]
	if len_k != 1.0:
		why.append("short ×%s" % str(len_k))
	why.append(("placement ×2" if placing else "ranked ×1") if ranked else "casual ×0.25")
	if absf(raw_sum * len_k * fav * mode_k) > cap:
		why.append("capped at ±%d" % cap)
	if raw_sum != 0.0:
		parts.append({"label": "Weighting: " + ", ".join(why), "v": perf - raw_sum})
	var delta := roundi(result + perf)
	var res := "Win" if outcome == "win" else ("Draw" if outcome == "draw" else ("Left early (counts as a loss)" if outcome == "left" else "Loss"))
	var dname: String = DIFFS.get(String(cfg.get("diff", "normal")), DIFFS.normal).name
	return {"delta": delta, "E": E, "ropp": ropp, "result": result, "perf": perf, "placing": placing,
		"lines": [{"label": "%s vs %s bots (%d) · expected %d%%" % [res, dname, roundi(ropp), roundi(E * 100.0)], "v": result}, {"label": "Performance", "v": perf}],
		"parts": parts, "modeLabel": (("Ranked placement %d/%d · ×2" % [placed + 1, PLACEMENTS]) if placing else "Ranked · full weight") if ranked else "Casual · ×0.25 weight"}


## What a win and a loss would roughly be worth with an average game (Create Game summary).
func elo_preview(cfg: Dictionary, rating: float, placed: int) -> Dictionary:
	var rounds := 14 if cfg.get("len", "standard") == "short" else 24
	var st := {"kills": 14, "deaths": 14, "hs": 4, "dmg": rounds * 78, "rounds": rounds, "plants": 1, "defuses": 0}
	return {"win": elo_for(cfg, st, "win", rating, placed).delta, "loss": elo_for(cfg, st, "loss", rating, placed).delta}
