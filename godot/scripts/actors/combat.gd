class_name Combat
extends RefCounted
## Hit resolution shared by the local player and bots (no rendering, so it runs headless too).


## One trace per pellet (1 for bullets). Every pellet is its own hit, like separate bullets.
## preview: a client drawing its own shot ahead of the host (no damage, nobody hears it).
static func shot(actor: Actor, w: Weapon, e: Dictionary, preview: bool = false) -> Dictionary:
	var pl := actor.player
	var eye := actor.eye()
	var def := w.def
	var n := int(e.get("pellets", 1))
	var wb := Wallbang.take(actor, w)
	var seed := int(e.get("seed", 0))
	var rng: U.Rng = U.Rng.new(seed) if seed != 0 else null
	var base := Ballistics.aim_dir(pl, e.off, float(e.inacc), w.spread_base(), rng)
	var results: Array = []
	var dealt := 0
	for i in n:
		var dir := Ballistics.pellet(base, i, float(def.pelletSpread), rng) if n > 1 else base
		var res := Ballistics.wallbang(Game.L, eye, dir, def, actor) if wb else Ballistics.bullet(Game.L, eye, dir, def, actor)
		if res.actor != null and not preview:
			var h: Dictionary = res.actor
			dealt += (h.target as Actor).damage(h.damage, h.group, actor, def, eye, wb)
		results.append({"res": res, "dir": dir})
	actor.last_shot_t = Game.time
	if not preview:
		Bots.noise(eye, actor, float(def.get("noise", 1700.0)) * (1.25 if wb else 1.0))
	return {"res": results[0].res, "dir": base, "results": results, "eye": eye, "dealt": dealt, "wallbang": wb}


static func knife(actor: Actor, e: Dictionary) -> Dictionary:
	var eye := actor.eye()
	var dir := actor.view_dir()
	var hit := Ballistics.knife(Game.L, eye, dir, float(e.range), actor)
	var dealt := 0
	if not hit.is_empty() and hit.kind == "actor":
		dealt = (hit.target as Actor).damage(float(e.damage), "chest" if hit.group == "head" else String(hit.group), actor, Data.weapon("knife"), eye)
	return {"hit": hit, "eye": eye, "dir": dir, "dealt": dealt}
