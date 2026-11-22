class_name Loadout
extends RefCounted
## Slots: 1 primary, 2 pistol, 3 knife, 4 grenade, 5 charge. One weapon per slot.

var list: Array[Weapon] = []
var active: Weapon = null
var prev: Weapon = null
var list_show_t := 0.0
var restock := true
var def_of: Callable


func _init(ids: Array = ["rifle", "pistol", "knife", "smoke"], defs: Callable = Callable()) -> void:
	def_of = defs if defs.is_valid() else func(wid: String) -> Dictionary: return Data.weapon(wid)
	set_kit(ids)


func set_kit(ids: Array) -> void:
	if active:
		active.holster()
	list.clear()
	for wid: String in ids:
		list.append(Weapon.make(wid, def_of.call(wid)))
	sort()
	active = list[0]
	prev = list[1] if list.size() > 1 else list[0]
	active.draw()


func sort() -> void:
	list.sort_custom(func(a: Weapon, b: Weapon) -> bool: return int(a.def.slot) < int(b.def.slot))


func ids() -> Array:
	return list.map(func(w: Weapon) -> String: return w.id)


## Full ammo and grenades again; back to the first weapon (respawns, new rounds).
func refill(redraw: bool = true) -> void:
	for w in list:
		if w is Gun:
			var g := w as Gun
			g.ammo = int(g.def.mag); g.reserve = int(g.def.reserve); g.state = "idle"; g.slide_locked = false
			g.spray_idx = 0.0; g.fire_inacc = 0.0; g.zoom = 0; g.zoom_resume = 0; g.reload_phase = ""
		elif w is Grenade:
			(w as Grenade).count = 1
			(w as Grenade).restock_t = 0.0
		elif w is Charge:
			w.state = "idle"
			(w as Charge).progress = 0.0
	if redraw:
		active.holster()
		active = best()
		prev = active
		for w in list:
			if w != active and usable(w):
				prev = w
				break
		active.draw()


func by_slot(s: int) -> Weapon:
	for w in list:
		if int(w.def.slot) == s:
			return w
	return null


func by_id(wid: String) -> Weapon:
	for w in list:
		if w.id == wid:
			return w
	return null


func usable(w: Weapon) -> bool:
	return w != null and (not (w is Grenade) or (w as Grenade).count > 0)


func best() -> Weapon:
	for w in list:
		if usable(w) and not (w is Charge):
			return w
	return list[0]


func primary() -> Weapon:
	return by_slot(1)


func select(w: Weapon) -> bool:
	if not usable(w) or w == active:
		return false
	if active:
		active.holster()
		prev = active
	active = w
	w.draw()
	list_show_t = 1.6
	return true


## Adds a weapon (an id or a weapon, e.g. picked up with its ammo). Returns the weapon it pushed
## out of the same slot so the caller can drop it, null if none, or false if refused.
func give(item: Variant, auto_switch: bool = true) -> Variant:
	var w: Weapon = Weapon.make(item, def_of.call(item)) if item is String else item
	if w is Grenade:
		var g := by_id(w.id) as Grenade
		if g:
			if g.count > 0:
				return false
			g.count = 1
			return null
	var old := by_slot(int(w.def.slot))
	if old:
		remove(old, false)
	list.append(w)
	sort()
	w.state = "holstered"
	# switch to a better gun (primary over pistol over knife); never to grenades or the charge
	var better := not (w is Grenade) and not (w is Charge) and (active == null or int(w.def.slot) < int(active.def.slot) or active is Grenade)
	if active == null or (auto_switch and better):
		select(w)
	return old


## Removes a weapon (dropped, thrown out, planted); switches away if it was in hand.
func remove(w: Weapon, switch_away: bool = true) -> void:
	var i := list.find(w)
	if i < 0:
		return
	list.remove_at(i)
	if prev == w:
		prev = best()
	if active == w:
		w.holster()
		active = null
		var next: Weapon = prev if switch_away and usable(prev) and prev != w else best()
		active = next
		next.draw()
		list_show_t = 1.6


func cycle(dir: int) -> void:
	var n := list.size()
	var i := list.find(active)
	for k in n:
		i = (i + dir + n) % n
		if usable(list[i]) and list[i] != active:
			select(list[i])
			return


func tick(cmd: Dictionary, pl: Player, time: float, dt: float) -> void:
	if int(cmd.slot) > 0:
		select(by_slot(int(cmd.slot)))
	elif cmd.last:
		select(prev if usable(prev) else best())
	elif int(cmd.cycle) != 0:
		cycle(int(cmd.cycle))
	var w := active
	w.tick(cmd, pl, time, dt)
	for g in list.duplicate():
		if not (g is Grenade) or (g as Grenade).count > 0:
			continue
		if restock:
			# practice convenience: an empty grenade slot restocks after a short delay
			(g as Grenade).restock_t += dt
			if (g as Grenade).restock_t >= float(g.def.restock):
				(g as Grenade).count = 1
				(g as Grenade).restock_t = 0.0
		elif g != active:
			remove(g)
	for e: Dictionary in w.events:
		if e.type == "switchAway":
			if not restock and w is Grenade and (w as Grenade).count <= 0:
				remove(w)
			else:
				select(prev if usable(prev) else best())
			break
	list_show_t = maxf(0.0, list_show_t - dt)
	pl.max_speed = active.speed()
