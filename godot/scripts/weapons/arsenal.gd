extends Node
## Attachments and camos. The profile's per-gun choices turn into modified weapon defs for the local
## player (bots carry stock guns). Attachments are bought per gun; camos unlock for every gun.
## Names, prices and descriptions come from assets/data/arsenal.json; the stat changes are here.

const ARMORY_GUNS := ["pistol", "smg", "shotgun", "rifle", "sniper"]
const GUN_PRICE_K := {"pistol": 0.7, "smg": 0.9, "shotgun": 0.9, "rifle": 1.0, "sniper": 1.1}
const SLOTS := ["muzzle", "optic", "mag", "grip"]

var ATTACHMENTS: Dictionary = {}
var CAMOS: Dictionary = {}
var _cache: Dictionary = {}


func _ready() -> void:
	ATTACHMENTS = Data.ARSENAL.get("attachments", {})
	CAMOS = Data.ARSENAL.get("camos", {})


func att_name(att: String, gun: String) -> String:
	var a: Dictionary = ATTACHMENTS.get(att, {})
	if a.is_empty():
		return ""
	var names: Variant = a.get("names")
	return String(names[gun]) if names is Dictionary and names.has(gun) else String(a.name)


func att_price(att: String, gun: String) -> int:
	return int(round(float(ATTACHMENTS[att].price) * float(GUN_PRICE_K.get(gun, 1.0)) / 10.0) * 10)


func att_fits(att: String, gun: String) -> bool:
	return ATTACHMENTS.has(att) and (ATTACHMENTS[att].guns as Array).has(gun)


func att_pros(att: String, gun: String) -> Array:
	var a: Dictionary = ATTACHMENTS[att]
	var by: Variant = a.get("prosBy")
	return by[gun] if by is Dictionary and by.has(gun) else a.pros


func att_cons(att: String, gun: String) -> Array:
	var a: Dictionary = ATTACHMENTS[att]
	var by: Variant = a.get("consBy")
	return by[gun] if by is Dictionary and by.has(gun) else a.cons


static func _scale_recoil(d: Dictionary, v: float, h: float) -> void:
	var rc: Dictionary = (d.recoil as Dictionary).duplicate()
	var pat: Array = []
	for p: Array in rc.pattern:
		pat.append([float(p[0]) * v, float(p[1]) * h])
	rc.pattern = pat
	d.recoil = rc


## Reload k times as long; the viewmodel plays its reload clips 1/k as fast to match.
static func _scale_reload(d: Dictionary, k: float) -> void:
	var sc := func(m: Array) -> Array:
		var out: Array = []
		for e: Array in m:
			out.append([float(e[0]) * k, e[1]])
		return out
	if d.has("shellReload"):
		var sr: Dictionary = (d.shellReload as Dictionary).duplicate()
		sr.start = float(sr.start) * k
		sr.each = float(sr.each) * k
		sr.shellMarks = sc.call(sr.shellMarks)
		d.shellReload = sr
	else:
		var r: Dictionary = (d.reload as Dictionary).duplicate()
		r.time = float(r.time) * k
		r.empty = float(r.empty) * k
		r.marks = sc.call(r.marks)
		r.emptyMarks = sc.call(r.emptyMarks)
		d.reload = r
	d.reloadRate = float(d.get("reloadRate", 1.0)) / k


static func apply(att: String, d: Dictionary) -> void:
	match att:
		"hush":
			d.suppressed = true; d.noise = 600.0; d.flash = float(d.flash) * 0.22
			d.damage = float(d.damage) * 0.94; d.rangeMod = maxf(0.5, float(d.rangeMod) - 0.02)
		"brake":
			_scale_recoil(d, 0.82, 1.0); d.kick = float(d.kick) * 0.85; d.flash = float(d.flash) * 1.35
			d.noise = float(d.get("noise", 1700.0)) * 1.2
		"choke":
			d.pelletSpread = float(d.pelletSpread) * 0.72; d.drawTime = float(d.drawTime) + 0.15
		"pip":
			d.inStand = float(d.inStand) * 0.85; d.inCrouch = float(d.inCrouch) * 0.85; d.drawTime = float(d.drawTime) + 0.08
		"halo":
			d.inStand = float(d.inStand) * 0.9; d.inCrouch = float(d.inCrouch) * 0.9; d.inMove = float(d.inMove) * 0.9
			d.drawTime = float(d.drawTime) + 0.12
		"glass":
			d.scope = [55.0, 28.0]; d.scopedSpeed = float(d.scopedSpeed) + 15.0
			d.inScoped = float(d.inScoped) * 1.3; d.inScopedCrouch = float(d.inScopedCrouch) * 1.3
		"extmag":
			d.mag = int(d.mag) + 2 if d.has("shellReload") else int(round(float(d.mag) * 1.34))
			d.maxSpeed = float(d.maxSpeed) - 5.0
			_scale_reload(d, 1.12)
		"quick":
			_scale_reload(d, 0.78)
			d.mag = int(d.mag) - 1 if d.has("shellReload") else int(d.mag) - maxi(1, int(round(float(d.mag) * 0.1)))
		"hollow":
			d.damage = float(d.damage) * 1.1; d.armorPen = float(d.armorPen) * 0.85; d.penetration = float(d.penetration) * 0.8
		"grip":
			_scale_recoil(d, 1.0, 0.7)
			var rc: Dictionary = d.recoil
			rc.recover = float(rc.recover) * 1.15; rc.jitter = float(rc.jitter) * 0.85
			d.maxSpeed = float(d.maxSpeed) - 5.0
		"laser":
			d.inMove = float(d.inMove) * 0.8; d.inAir = float(d.inAir) * 0.8; d.inLand = float(d.inLand) * 0.8
			d.drawTime = float(d.drawTime) + 0.05
		"skeleton":
			d.maxSpeed = float(d.maxSpeed) + 10.0
			if d.has("scopedSpeed"):
				d.scopedSpeed = float(d.scopedSpeed) + 5.0
			d.drawTime = float(d.drawTime) * 0.8
			_scale_recoil(d, 1.1, 1.0)
			d.kick = float(d.kick) * 1.1
		"stipple":
			_scale_recoil(d, 0.88, 0.88); d.inFire = float(d.inFire) * 0.9; d.drawTime = float(d.drawTime) + 0.05


## The profile's choice for one gun: {muzzle, optic, mag, grip, camo} ("" = none).
func kit_for(gun: String) -> Dictionary:
	var k: Dictionary = {}
	if Engine.get_main_loop() and (Engine.get_main_loop() as SceneTree).root.has_node("Profile"):
		k = Profile.kit_of(gun)
	return {"muzzle": k.get("muzzle", ""), "optic": k.get("optic", ""), "mag": k.get("mag", ""), "grip": k.get("grip", ""), "camo": k.get("camo", "")}


## Weapon def for the local player: the stock def with the equipped attachments applied.
func def_for(wid: String, kit: Dictionary = {}) -> Dictionary:
	var base := Data.weapon(wid)
	if base.is_empty() or base.kind != "gun" or not ARMORY_GUNS.has(wid):
		return base
	if kit.is_empty():
		kit = kit_for(wid)
	var sig := "|".join([wid, kit.muzzle, kit.optic, kit.mag, kit.grip, kit.camo])
	if sig == wid + "||||":
		return base
	if _cache.has(sig):
		return _cache[sig]
	var d: Dictionary = base.duplicate(true)
	var base_draw := float(d.drawTime)
	for slot: String in SLOTS:
		var att: String = kit.get(slot, "")
		if att != "" and ATTACHMENTS.has(att) and ATTACHMENTS[att].slot == slot and (ATTACHMENTS[att].guns as Array).has(wid):
			apply(att, d)
	d.drawRate = base_draw / float(d.drawTime)
	d.kit = kit
	d.kitSig = sig
	_cache[sig] = d
	return d


## Numbers for the loadout screen (bigger is better except reload).
func stats(d: Dictionary) -> Array:
	var p10 := Weapon.pattern_at(d.recoil.pattern, 9)
	var rec := p10.length() + float(d.recoil.jitter) * 4.0 + float(d.kick) * 1.5
	var rel := float(d.shellReload.start) + float(d.shellReload.each) * float(d.mag) if d.has("shellReload") else float(d.reload.time)
	return [
		{"id": "dmg", "name": "Damage", "v": float(d.damage) * float(d.get("pellets", 1)), "max": 240.0, "fmt": "%d"},
		{"id": "rpm", "name": "Fire rate", "v": float(d.rpm), "max": 900.0, "fmt": "%d rpm"},
		{"id": "acc", "name": "Accuracy", "v": clampf(1.0 - (float(d.spread) + float(d.inStand)) / 12.0, 0.0, 1.0) * 100.0, "max": 100.0, "fmt": "%d"},
		{"id": "move", "name": "Moving accuracy", "v": clampf(1.0 - float(d.inMove) / 280.0, 0.0, 1.0) * 100.0, "max": 100.0, "fmt": "%d"},
		{"id": "rec", "name": "Recoil control", "v": clampf(1.0 - rec / 14.0, 0.0, 1.0) * 100.0, "max": 100.0, "fmt": "%d"},
		{"id": "mob", "name": "Mobility", "v": float(d.maxSpeed), "max": 260.0, "fmt": "%d u/s"},
		{"id": "rel", "name": "Reload", "v": rel, "max": 5.0, "fmt": "%.2f s", "lower": true},
		{"id": "mag", "name": "Magazine", "v": float(d.mag), "max": 45.0, "fmt": "%d"},
	]
