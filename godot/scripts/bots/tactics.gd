extends Node
## Team play for bots in defuse mode: buying by economy, a Raider plan per round (target site,
## route, the carrier plants while the rest escort), Wardens split between the sites, then
## retake and defuse after a plant. Orders are re-evaluated twice a second.
## Per-map data (L.tactics): routes {name: {stack, yaw, via}}, siteRoutes {A: [main, flank]},
## sites {A: {hold, plant, smoke}} with hold spots as [x, y, z, yawDeg].

const PUSH_BY := 22.0    ## seconds into the round when the Raiders go even if not everyone has gathered

var rnd := U.Rng.new(2718)
var plan: Dictionary = {}
var assign_t := 0.0


func r() -> float:
	return rnd.next()


func on_round_start() -> void:
	var sites := Bomb.sites()
	var site: Variant = sites[int(r() * sites.size()) % sites.size()] if not sites.is_empty() else null
	var T := Game.L.tactics
	var routes: Array = []
	if site != null and not T.is_empty() and (T.siteRoutes as Dictionary).has(site.name):
		routes = T.siteRoutes[site.name]
	plan = {"site": site, "route": routes[0] if not routes.is_empty() else "", "flank": routes[1] if routes.size() > 1 else (routes[0] if not routes.is_empty() else ""), "go": false}
	var i := 0
	for a: Actor in Actors.list:
		if a.brain == null:
			continue
		var b: BotBrain = a.brain
		b.order = {}
		b.buy_at = 0.6 + r() * 2.6
		b.bought = false
		if a.team == 1:
			b.post = i % 2      # wardens alternate A / B
			i += 1
		else:
			b.post = 0
	assign_t = 0.0


func on_plant(_site: Variant) -> void:
	assign_t = 0.0


func tick(dt: float) -> void:
	if not Match.active:
		return
	for a: Actor in Actors.list:
		var b: BotBrain = a.brain
		if b == null or not a.alive or b.bought or not Match.buy_time():
			continue
		b.buy_at -= dt
		if b.buy_at <= 0.0:
			buy(a)
			b.bought = true
	assign_t -= dt
	if assign_t <= 0.0:
		assign_t = 0.5
		assign()


## Economy: pistol rounds buy armor or a smoke; otherwise full buy, force buy, or save.
func buy(a: Actor) -> void:
	var pistol_round: bool = Match.round == 1 or Match.round == int(Match.len.half) + 1
	var get := func(id: String) -> bool: return Match.buy(a, id).ok
	if pistol_round:
		if a.money >= 650 and r() < 0.6:
			get.call("vest")
		elif a.money >= 300 and r() < 0.5:
			get.call("smoke")
		return
	if a.loadout.primary() == null:
		var sniper_taken := false
		for o: Actor in Actors.list:
			if o.team == a.team and o != a and o.loadout.by_id("sniper"):
				sniper_taken = true
		var loss_streak: int = Match.streak[a.squad]
		if a.money >= 6200 and not sniper_taken and r() < 0.3:
			get.call("sniper")
		elif a.money >= 3350:
			get.call("rifle")
		elif a.money >= 1900 and (loss_streak >= 2 or r() < 0.3):
			get.call("smg" if r() < 0.55 else "shotgun")
	if a.money >= 1000 and not (a.armor >= 100 and a.helmet):
		get.call("vesthelm")
	elif a.money >= 650 and a.armor < 100:
		get.call("vest")
	if a.team == 1 and a.money >= 400 and not a.kit and r() < 0.7:
		get.call("kit")
	if a.money >= 300 and r() < 0.45:
		get.call("smoke")


static func spot(list: Array, k: int) -> Dictionary:
	var s: Array = list[k % list.size()]
	return {"pos": Vector3(s[0], s[1], s[2]), "yaw": deg_to_rad(float(s[3])) if s.size() > 3 else null}


func _route(name: String) -> Dictionary:
	return Game.L.tactics.routes[name]


func assign() -> void:
	var T := Game.L.tactics
	if plan.is_empty() or plan.site == null or T.is_empty():
		return
	var SPOTS: Dictionary = T.sites
	var st := Bomb.state
	var bpos: Variant = Bomb.where()
	var raiders: Array = Actors.list.filter(func(a: Actor) -> bool: return a.alive and a.team == 0 and a.brain != null)
	var wardens: Array = Actors.list.filter(func(a: Actor) -> bool: return a.alive and a.team == 1 and a.brain != null)
	# closest raider bot fetches a dropped charge
	var fetcher: Actor = null
	if st == "dropped" and bpos != null:
		var best := INF
		for a: Actor in raiders:
			var d := BotBrain.flat_dist(a.player.pos, bpos)
			if d < best:
				best = d
				fetcher = a
	var route_of := func(i: int) -> String: return plan.flank if i % 3 == 2 else plan.route    # one in three flanks
	var spots: Dictionary = SPOTS[plan.site.name]
	# gather out of sight, then go together (with smoke cover when someone carries one)
	if not plan.go and st != "planted":
		var gathered := 0
		for i in raiders.size():
			var stack: Array = _route(route_of.call(i)).stack
			if BotBrain.flat_dist((raiders[i] as Actor).player.pos, Vector3(stack[0], stack[1], stack[2])) < 260.0:
				gathered += 1
		if gathered >= ceili(raiders.size() * 0.6) or Match.live_t > PUSH_BY or st == "dropped":
			plan.go = true
			var k := 0
			for a: Actor in raiders:
				if a.loadout.by_id("smoke"):
					var sm: Array = spots.smoke[k % 2]
					a.brain.smoke_at = Vector3(sm[0], sm[1], sm[2])
					k += 1
	for i in raiders.size():
		var a: Actor = raiders[i]
		var b: BotBrain = a.brain
		var rt := _route(route_of.call(i))
		var via := Vector3(rt.via[0], rt.via[1], rt.via[2])
		if not plan.go and st != "planted":
			b.set_order({"kind": "stack", "pos": Vector3(rt.stack[0], rt.stack[1], rt.stack[2]), "yaw": rt.yaw, "spread": 28.0})
		elif st == "planted":
			var ang := (float(i) / maxi(1, raiders.size())) * TAU + 0.7
			var rr := 220.0 + (i % 2) * 120.0
			var bp: Vector3 = Bomb.pos
			b.set_order({"kind": "guard", "pos": Vector3(bp.x + cos(ang) * rr, bp.y, bp.z + sin(ang) * rr), "face": bp})
		elif Bomb.carrier == a:
			b.set_order({"kind": "plant", "pos": spot(spots.plant, i).pos, "via": via, "site": plan.site})
		elif a == fetcher:
			b.set_order({"kind": "pickup", "pos": bpos})
		else:
			b.set_order({"kind": "goto", "pos": spot(spots.plant, i + 1).pos, "via": via, "spread": 90.0})
	if st == "planted":
		var defuser: Actor = null
		var best2 := INF
		var bp2: Vector3 = Bomb.pos
		for a: Actor in wardens:
			var d := BotBrain.flat_dist(a.player.pos, bp2)
			if d < best2:
				best2 = d
				defuser = a
		for i in wardens.size():
			var a: Actor = wardens[i]
			if a == defuser:
				a.brain.set_order({"kind": "defuse", "pos": bp2})
			else:
				var ang2 := i * 2.1
				a.brain.set_order({"kind": "goto", "pos": Vector3(bp2.x + cos(ang2) * 160.0, bp2.y, bp2.z + sin(ang2) * 160.0), "spread": 60.0})
	else:
		var sites := Bomb.sites()
		for i in wardens.size():
			var a: Actor = wardens[i]
			var site: Dictionary = sites[a.brain.post % sites.size()]
			var s := spot(SPOTS[site.name].hold, i)
			a.brain.set_order({"kind": "hold", "pos": s.pos, "yaw": s.yaw})
