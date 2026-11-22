class_name Wallbang
extends RefCounted
## Wallbang rounds, the heart of wallr. Press X to load one: your next gun shot goes through every
## wall in its way, at full damage, and hits the first enemy along the line. Everyone gets a few per
## round; they unlock 10 s after the round goes live (10 s after spawning in skirmish), and the HUD
## shows how many are left. Bots use them too, but only where they last saw someone. Admins have no
## limit and no wait.

const PER_ROUND := 3
const UNLOCK := 10.0


static func reset(a: Actor) -> void:
	a.wb_charges = PER_ROUND
	a.wb_armed = false


static func charges(a: Actor) -> float:
	return INF if a.admin else float(a.wb_charges)


## Seconds until wallbang rounds unlock for this actor (0: now; INF: not until next round).
static func unlock_in(a: Actor) -> float:
	if a.admin:
		return 0.0
	if Match.active:
		if Match.phase == "freeze":
			return Match.t + UNLOCK
		if Match.phase == "live" or Match.phase == "planted":
			return maxf(0.0, UNLOCK - Match.live_t)
		return INF
	return maxf(0.0, UNLOCK - a.alive_t)


static func ready(a: Actor) -> bool:
	return a.alive and unlock_in(a) <= 0.0 and charges(a) > 0.0


static func armed(a: Actor) -> bool:
	return a.wb_armed


## X: load a wallbang round for the next shot, or take it out again. Returns what happened.
static func toggle(a: Actor) -> String:
	if a.wb_armed:
		a.wb_armed = false
		return "off"
	if not a.alive:
		return "dead"
	if unlock_in(a) > 0.0:
		return "locked"
	if charges(a) <= 0.0:
		return "empty"
	var w := a.loadout.active
	if w == null or not (w is Gun):
		return "nogun"
	a.wb_armed = true
	return "armed"


## A gun fires: a loaded round is used up (one per trigger pull; every shotgun pellet pierces).
static func take(a: Actor, w: Weapon) -> bool:
	if not a.wb_armed or w == null or not (w is Gun):
		return false
	a.wb_armed = false
	if not a.admin:
		a.wb_charges = maxi(0, a.wb_charges - 1)
	a.wb_used += 1
	return true
