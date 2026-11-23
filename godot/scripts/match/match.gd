extends Node
## Defuse mode: rounds, money and buying. Raiders attack with the charge, Wardens defend A and B.
## Squads keep their score when everyone swaps sides at halftime. Skirmish = respawning practice.

const FREEZE := 10.0
const ROUND := 115.0
const POST := 5.0
const HALFTIME := 8.0
const OVER := 25.0
const BUY_WINDOW := 20.0
const BUY_RADIUS := 520.0
const START_MONEY := 800
const MAX_MONEY := 16000
const WIN_PAY := {"elim": 3250, "bomb": 3500, "defuse": 3500, "time": 3250}
const LOSS_PAY := [1400, 1900, 2400, 2900, 3400]
const PLANT_BONUS := 800
const PLANT_REWARD := 300
const DEFUSE_REWARD := 300
const TEAM_KILL := -300
const LENGTHS := {"standard": {"win": 16, "half": 15, "max": 30}, "short": {"win": 9, "half": 8, "max": 16}}

## Buy menu: one key per item, CS 1.6 style.
const SHOP := [
	{"key": 1, "id": "pistol", "name": "Wasp 9", "price": 200, "kind": "weapon", "group": "Pistol"},
	{"key": 2, "id": "smg", "name": "Swift SMG", "price": 1250, "kind": "weapon", "group": "Close range"},
	{"key": 3, "id": "shotgun", "name": "Bison 12", "price": 1100, "kind": "weapon", "group": "Close range"},
	{"key": 4, "id": "rifle", "name": "Kestrel AR", "price": 2700, "kind": "weapon", "group": "Rifles"},
	{"key": 5, "id": "sniper", "name": "Osprey LR", "price": 4750, "kind": "weapon", "group": "Rifles"},
	{"key": 6, "id": "vest", "name": "Vest", "price": 650, "kind": "gear", "group": "Gear"},
	{"key": 7, "id": "vesthelm", "name": "Vest + helmet", "price": 1000, "kind": "gear", "group": "Gear"},
	{"key": 8, "id": "smoke", "name": "Veil smoke", "price": 300, "kind": "weapon", "group": "Gear"},
	{"key": 9, "id": "kit", "name": "Defuse kit", "price": 400, "kind": "gear", "group": "Gear", "team": 1},
]

var active := false
var phase := "idle"
var t := 0.0
var live_t := 0.0
var round := 0
var score := [0, 0]
var streak := [0, 0]
var half := 1
var len: Dictionary = LENGTHS.standard
var history: Array = []
var planted := false
var halftime_next := false
var result: Dictionary = {}
var banner: Dictionary = {}
var draw := false
var hold := false


static func end_text(reason: String, side: int) -> String:
	match reason:
		"elim": return "all %s down" % Actors.TEAMS[1 - side].name
		"bomb": return "the charge detonated"
		"defuse": return "the charge was defused"
	return "time ran out"


## squad 0 started the match on your side, squad 1 on the other
func squad_on_side(side: int) -> int:
	var me := Actors.me
	if me == null:
		return side
	return me.squad if side == me.team else 1 - me.squad


func side_score(side: int) -> int:
	return score[squad_on_side(side)]


func set_mode(mode: String) -> void:
	if mode == "defuse":
		start_match()
	else:
		active = false
		phase = "idle"
		banner = {}
		Items.clear()
		Bomb.reset()
		Grenades.clear()
		for a: Actor in Actors.list:
			a.loadout.restock = true
			a.loadout.set_kit(["rifle", "pistol", "knife", "smoke"] if a.is_me else Actors.BOT_KIT)
			a.spawn()


func start_match() -> void:
	active = true
	len = LENGTHS.get(String(Settings.get_value("matchLen")), LENGTHS.standard)
	score = [0, 0]
	streak = [0, 0]
	history = []
	round = 1
	half = 1
	halftime_next = false
	draw = false
	Actors.feed.clear()
	Actors.score = [0, 0]
	for a: Actor in Actors.list:
		a.squad = 0 if a.team == Actors.me.team else 1
		a.money = START_MONEY
		a.kills = 0; a.deaths = 0; a.kit = false; a.dmg = 0; a.hs = 0; a.plants = 0; a.defuses = 0
		a.alive = false                       # everyone starts the first round fresh
	if Actors.me:
		Actors.me.squad = 0
	hold = false
	if Net.is_host():
		Net.server.roster_dirty = true      # squads were dealt again
	start_round()


## New round: survivors keep their gear, the dead start again with a pistol and knife.
func start_round() -> void:
	Items.clear()
	Bomb.reset()
	Grenades.clear()
	for d in Ents.doors:
		if d.is_open():
			d.target = 0.0
	for a: Actor in Actors.list:
		var lo := a.loadout
		lo.restock = false
		if a.alive:
			lo.refill(false)
			var ch := lo.by_id("charge")
			if ch:
				lo.remove(ch, false)
		else:
			lo.set_kit(["pistol", "knife"])
			a.armor = 0
			a.helmet = false
			a.kit = false
		var sp := Actors.spawn_point(a)
		a.player.spawn(U.v3(sp.pos), float(sp.yaw))
		a.health = 100; a.alive = true; a.dead_t = 0.0; a.killer = null; a.hurt_t = 0.0; a.model.dead = 0.0; a.alive_t = 0.0
		Wallbang.reset(a)
		if a.admin:
			a.money = MAX_MONEY
		if lo.active.state == "holstered":
			lo.active.draw()
		lo.select(lo.best())
		if a.brain:
			a.brain.reset()
	var raiders := Actors.list.filter(func(a: Actor) -> bool: return a.team == 0)
	if not raiders.is_empty():
		Bomb.assign(raiders[randi() % raiders.size()])
	planted = false
	result = {}
	phase = "freeze"
	t = FREEZE
	live_t = 0.0
	_round_banner()
	if Net.is_host():
		Net.server.ev(["round", round, half])
	Tactics.on_round_start()


func _round_banner() -> void:
	var sub := "Buy time · B to open the buy menu"
	if round == 1:
		sub = "First half" if half == 1 else "Second half"
	elif round == int(len.half) + 1:
		sub = "Second half · sides swapped"
	banner = {"title": "Round %d" % round, "sub": sub, "t": 3.2, "kind": "round"}


func _go_banner() -> void:
	banner = {"title": "Go", "sub": "Plant the charge at A or B" if Actors.me.team == 0 else "Defend A and B", "t": 1.8, "kind": "go"}


func _plant_banner(site_name: String) -> void:
	banner = {"title": "Charge planted at %s" % site_name, "sub": "Get there and defuse it (hold E)" if Actors.me.team == 1 else "Guard it until it blows", "t": 3.0, "kind": "plant"}


## over: "" (the match goes on), "win" (someone reached the target) or "draw".
func _end_banner(side: int, reason: String, over: String, halftime: bool) -> void:
	var mine: bool = Actors.me != null and Actors.me.team == side
	banner = {"title": "%s win" % Actors.TEAMS[side].name, "sub": end_text(reason, side), "t": POST, "kind": "win" if mine else "lose", "side": side}
	if over == "win":
		var win := squad_on_side(side)
		banner = {"title": "%s win the match" % Actors.TEAMS[side].name, "sub": "%d – %d" % [score[win], score[1 - win]], "t": OVER, "kind": "win" if mine else "lose", "side": side, "final": true}
	elif over == "draw":
		banner = {"title": "Draw", "sub": "%d – %d" % [score[0], score[1]], "t": OVER, "kind": "draw", "final": true}
	elif halftime:
		banner.sub += " · Halftime: sides swap"
		banner.t = HALFTIME


## A client follows the host's round from its events (the snapshots carry the clock and score).
func client_event(e: Array) -> void:
	match String(e[0]):
		"round":
			round = int(e[1])
			half = int(e[2])
			planted = false
			result = {}
			Grenades.clear()        # no smoke or guns carried over (the snapshots bring the new ones)
			Items.clear()
			phase = "freeze"
			t = FREEZE
			live_t = 0.0
			if round == 1 and half == 1:
				history = []
				score = [0, 0]
				Actors.feed.clear()
				Session.client_new_match()
			_round_banner()
		"go":
			phase = "live"
			t = round_time()
			live_t = 0.0
			Snd.round_go()
			_go_banner()
		"end":
			var side := int(e[1])
			var over := String(e[3])
			score = e[5]
			history.append(e[6])
			halftime_next = bool(e[4])
			phase = "over" if over != "" else "post"
			var mine: bool = Actors.me.team == side
			result = {"side": side, "reason": String(e[2]), "mine": mine}
			_end_banner(side, String(e[2]), over, bool(e[4]))
			Snd.round_end(mine)
			if over != "":
				draw = over == "draw"
				Session.match_over(("win" if mine else "loss") if over == "win" else "draw")
		"plant":
			planted = true
			phase = "planted"
			_plant_banner(String(e[3]))


func frozen() -> bool:
	return active and phase == "freeze"


## Round length for the current map (the big maps take longer to cross).
func round_time() -> float:
	return float(Game.L.env.get("roundTime", ROUND)) if Game.L else ROUND


func buy_time() -> bool:
	return active and (phase == "freeze" or (phase == "live" and live_t < BUY_WINDOW))


func buy_time_left() -> float:
	return t + BUY_WINDOW if phase == "freeze" else maxf(0.0, BUY_WINDOW - live_t)


func in_buy_zone(a: Actor) -> bool:
	var spots: Array = Game.L.team_spawns[a.team] if a.team < Game.L.team_spawns.size() and Game.L.team_spawns[a.team] != null else []
	var p := a.player.pos
	for s: Dictionary in spots:
		if Vector2(s.pos[0] - p.x, s.pos[2] - p.z).length() < float(Game.L.env.get("buyRadius", BUY_RADIUS)):
			return true
	return false


func can_buy(a: Actor) -> bool:
	return active and a.alive and buy_time() and in_buy_zone(a)


## Price for this actor right now, or a reason it can't be bought.
func quote(a: Actor, e: Dictionary) -> Dictionary:
	if e.has("team") and a.team != int(e.team):
		return {"no": "Wardens only"}
	if e.id == "vest" and a.armor >= 100:
		return {"no": "Already have one"}
	if e.id == "vesthelm":
		if a.armor >= 100 and a.helmet:
			return {"no": "Already have both"}
		if a.armor >= 100:
			return {"price": 350, "note": "helmet"}
	if e.id == "kit" and a.kit:
		return {"no": "Already have one"}
	if e.kind == "weapon":
		var has := a.loadout.by_id(e.id)
		if has and (e.id != "smoke" or (has as Grenade).count > 0):
			return {"no": "Already have one"}
	return {"price": int(e.price)}


func buy(a: Actor, id: String) -> Dictionary:
	var e: Dictionary = {}
	for x: Dictionary in SHOP:
		if x.id == id:
			e = x
	if e.is_empty():
		return {"ok": false, "msg": "Unknown item"}
	if not can_buy(a):
		return {"ok": false, "msg": "Buy time is over" if not buy_time() else "Too far from your buy zone"}
	var q := quote(a, e)
	if q.has("no"):
		return {"ok": false, "msg": q.no}
	if a.money < int(q.price):
		return {"ok": false, "msg": "Not enough money"}
	if not a.admin:
		a.money -= int(q.price)
	if e.kind == "weapon":
		var old: Variant = a.loadout.give(e.id, true)
		if old is Weapon:
			Items.drop(a, old, false)
	elif e.id == "vest":
		a.armor = 100
	elif e.id == "vesthelm":
		a.armor = 100
		a.helmet = true
	elif e.id == "kit":
		a.kit = true
	if a.is_me:
		Snd.buy()
	return {"ok": true, "msg": "Bought %s" % e.name}


func tick(dt: float) -> void:
	if not active:
		return
	if not banner.is_empty():
		banner.t -= dt
		if banner.t <= 0.0:
			banner = {}
	if phase != "planted":
		t -= dt
	match phase:
		"freeze":
			if t <= 0.0:
				phase = "live"
				t = round_time()
				live_t = 0.0
				Snd.round_go()
				_go_banner()
				if Net.is_host():
					Net.server.ev(["go"])
		"live":
			live_t += dt
			check_win()
			if phase == "live" and t <= 0.0:
				end_round(1, "time")
		"planted":
			live_t += dt
			check_win()
		"post":
			if t <= 0.0:
				next_round()
		"over":
			if t <= 0.0 and not hold:
				start_match()


func alive_on(side: int) -> int:
	var n := 0
	for a: Actor in Actors.list:
		if a.team == side and a.alive:
			n += 1
	return n


func total(side: int) -> int:
	var n := 0
	for a: Actor in Actors.list:
		if a.team == side:
			n += 1
	return n


func check_win() -> void:
	if total(1) > 0 and alive_on(1) == 0:
		end_round(0, "elim")
	elif phase == "live" and total(0) > 0 and alive_on(0) == 0:
		end_round(1, "elim")


func on_plant(actor: Actor, s: Variant) -> void:
	if not active or phase != "live":
		return
	planted = true
	phase = "planted"
	actor.plants += 1
	actor.money = mini(MAX_MONEY, actor.money + PLANT_REWARD)
	_plant_banner(String(s.name))
	Tactics.on_plant(s)


func on_defuse(a: Actor) -> void:
	if not active:
		return
	a.defuses += 1
	a.money = mini(MAX_MONEY, a.money + DEFUSE_REWARD)
	end_round(1, "defuse")


func on_explode() -> void:
	if active and phase != "post":
		end_round(0, "bomb")


## Called from Actor.die: drops, kill rewards.
func on_death(victim: Actor, attacker: Actor, def: Dictionary) -> void:
	if not active:
		return
	var lo := victim.loadout
	var gun := lo.primary()
	if gun == null:
		gun = lo.by_slot(2)
	var ch := lo.by_id("charge")
	if gun:
		Items.drop(victim, gun, false)
	if ch:
		Items.drop(victim, ch, false)
	victim.kit = false
	if attacker and attacker != victim:
		if attacker.team != victim.team:
			attacker.money = mini(MAX_MONEY, attacker.money + int(def.get("killReward", 300)))
		else:
			attacker.money = maxi(0, attacker.money + TEAM_KILL)


func end_round(side: int, reason: String) -> void:
	if phase == "post" or phase == "over":
		return
	var win := squad_on_side(side)
	var lose := 1 - win
	score[win] += 1
	history.append({"round": round, "side": side, "squad": win, "reason": reason})
	for a: Actor in Actors.list:
		var pay: int
		if a.team == side:
			pay = WIN_PAY[reason]
		else:
			pay = LOSS_PAY[mini(streak[lose], LOSS_PAY.size() - 1)]
			if reason == "time" and a.team == 0 and a.alive:
				pay = 0      # hid instead of attacking
			if a.team == 0 and planted:
				pay += PLANT_BONUS
		a.money = mini(MAX_MONEY, a.money + pay)
	streak[win] = 0
	streak[lose] += 1
	var mine: bool = Actors.me != null and Actors.me.team == side
	result = {"side": side, "reason": reason, "mine": mine}
	phase = "post"
	t = POST
	var over := ""
	if score[win] >= int(len.win):
		phase = "over"
		t = OVER
		draw = false
		over = "win"
	elif round >= int(len.max):
		phase = "over"
		t = OVER
		draw = true
		over = "draw"
	elif round == int(len.half):
		halftime_next = true
		t = HALFTIME
	_end_banner(side, reason, over, halftime_next)
	Snd.round_end(mine)
	if Net.is_host():
		Net.server.ev(["end", side, reason, over, halftime_next, score.duplicate(), history[-1]])
	if over != "":
		Session.match_over(("win" if mine else "loss") if over == "win" else "draw")
	Session.checkpoint()


func next_round() -> void:
	round += 1
	if halftime_next:
		halftime_next = false
		half = 2
		streak = [0, 0]
		for a: Actor in Actors.list:
			Actors.set_side(a, 1 - a.team)
			a.money = START_MONEY
			a.alive = false
			a.kit = false
		if Game.dedicated and Actors.me:
			Actors.me.team = 1 - Actors.me.team     # the server's viewpoint follows squad 0, so scores stay with their squads
		if Net.is_host():
			Net.server.roster_dirty = true
	start_round()
