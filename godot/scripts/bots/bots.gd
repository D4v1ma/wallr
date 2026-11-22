extends Node
## Bots share what they hear and see. A bot only knows what it has seen, heard or been told:
##  - sight: a view cone and line of sight (walls, doors and smoke block it); an enemy has to be in
##    view long enough to be noticed, then the reaction delay runs before the first shot;
##  - hearing: gunfire and running footsteps give a rough position (muffled and vaguer through walls);
##  - getting shot: only the rough direction it came from;
##  - teammates: a callout of where an enemy was seen, a second or so later.

## spot: how fast an enemy in view gets noticed; wallbang: chance to put a wall-piercing shot
## through cover where an enemy was just seen
const SKILL := {
	"easy": {"react": 0.62, "aimErr": 4.5, "turn": 210.0, "recoil": 0.25, "head": 0.08, "burst": [2, 4], "fov": 100.0, "settle": 1.2, "spot": 2.6, "wallbang": 0.0},
	"normal": {"react": 0.36, "aimErr": 2.4, "turn": 330.0, "recoil": 0.55, "head": 0.25, "burst": [3, 6], "fov": 110.0, "settle": 1.9, "spot": 4.0, "wallbang": 0.3},
	"hard": {"react": 0.2, "aimErr": 1.1, "turn": 520.0, "recoil": 0.85, "head": 0.55, "burst": [4, 8], "fov": 120.0, "settle": 2.8, "spot": 5.6, "wallbang": 0.5},
	"expert": {"react": 0.13, "aimErr": 0.7, "turn": 700.0, "recoil": 0.95, "head": 0.7, "burst": [5, 10], "fov": 126.0, "settle": 3.5, "spot": 7.5, "wallbang": 0.7},
}

var rnd := U.Rng.new(4242)


func skill() -> Dictionary:
	return SKILL.get(String(Settings.get_value("botSkill")), SKILL.normal)


func r() -> float:
	return rnd.next()


## A loud event (a shot, a running footstep): enemies of `src` within `radius` hear it, half as far
## through walls, and only roughly where it came from (worse with distance and through walls).
func noise(pos: Vector3, src: Actor, radius: float) -> void:
	for a: Actor in Actors.list:
		if a.brain == null or not a.alive or (src != null and a.team == src.team):
			continue
		var ear := a.eye()
		var d := Vector2(ear.x - pos.x, ear.z - pos.z).length()
		if d >= radius:
			continue
		var walls := not clear(ear, pos)
		var eff := radius * (0.5 if walls else 1.0)
		if d >= eff:
			continue
		var err := 40.0 + d * (0.3 if walls else 0.14)
		a.brain.hear(Vector3(pos.x + (r() - 0.5) * 2.0 * err, pos.y, pos.z + (r() - 0.5) * 2.0 * err), d / eff)


## Plain line of sight through the level (no smoke): used for hearing.
func clear(a: Vector3, b: Vector3) -> bool:
	var d := a.distance_to(b)
	if d < 1e-3:
		return true
	return Game.L.cw.ray(a, (b - a) / d, d, CollisionWorld.MASK_SHOT) < 0.0


## A bot that spots an enemy tells its teammates where, a moment later (where it was then).
func callout(from: Actor, enemy: Actor) -> void:
	var pos := enemy.player.pos
	for m: Actor in Actors.list:
		if m == from or m.brain == null or not m.alive or m.team != from.team:
			continue
		m.brain.inbox.append({"pos": pos, "at": m.brain.clock + 0.8 + r() * 0.8, "who": enemy})
