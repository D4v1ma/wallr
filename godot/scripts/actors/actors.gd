extends Node
## Every actor in the level (the local player and bots): spawning, respawns, the kill feed, scoring,
## hitscan against hitboxes, and posing/lighting the models each frame.

const BOT_NAMES := [["Vex", "Kade", "Rook", "Sable", "Dune", "Fennec", "Jinx", "Mako"], ["Halden", "Brisk", "Corvin", "Lark", "Marsh", "Quill", "Tamsin", "Wren"]]
const BOT_KIT := ["rifle", "pistol", "knife"]
const RESPAWN_TIME := 3.0
const TEAMS := [
	{"id": 0, "name": "Raiders", "short": "RAI", "color": Color("#e39a52")},
	{"id": 1, "name": "Wardens", "short": "WAR", "color": Color("#7cb2e6")},
]

var list: Array[Actor] = []
var me: Actor = null
var next_id := 1
var feed: Array = []
var score := [0, 0]
var spawn_rot := [0, 0]
var ff := false
var hidden := false
var models_root: Node3D = null


func init() -> void:
	clear_models()
	list.clear()
	feed.clear()
	score = [0, 0]
	ff = bool(Settings.get_value("ff"))
	if models_root == null or not is_instance_valid(models_root) or models_root.get_parent() != Game.world_root:
		models_root = Node3D.new()
		models_root.name = "Actors"
		Game.world_root.add_child(models_root)
	var a := Actor.new(int(Settings.get_value("team")), "You", false, true)
	me = a
	list.append(a)
	Viewmodel.set_team(a.team)
	a.spawn()


func clear_models() -> void:
	for a in list:
		a.model.free_nodes()


func add_bot(team: int) -> Actor:
	var used := {}
	for a in list:
		used[a.name] = true
	var n := ""
	for cand: String in BOT_NAMES[team]:
		if not used.has(cand):
			n = cand
			break
	if n == "":
		for group: Array in BOT_NAMES:
			for cand: String in group:
				if n == "" and not used.has(cand):
					n = cand
	if n == "":
		n = "Bot-%d" % next_id
	var a := Actor.new(team, n, true, false)
	list.append(a)
	a.spawn()
	if Match.active:
		a.squad = Match.squad_on_side(team)
		a.money = Match.START_MONEY
		a.loadout.restock = false
	return a


func remove_bots() -> void:
	for a in list:
		if a.is_bot:
			a.model.free_nodes()
	list = list.filter(func(a: Actor) -> bool: return not a.is_bot)


## Swap an actor to the other faction (halftime, or your team choice): new model, same person.
func set_side(a: Actor, team: int) -> void:
	if a.team == team:
		return
	a.model.free_nodes()
	a.team = team
	a.model = PlayerModel.new(team, models_root)
	a.model.root.visible = not a.is_me
	if a.is_me:
		Viewmodel.set_team(team)


func set_team(team: int) -> void:
	if me.team == team:
		return
	set_side(me, team)
	if Match.active:
		Match.start_match()
	else:
		me.spawn()


func count(team: int) -> int:
	var n := 0
	for a in list:
		if a.is_bot and a.team == team:
			n += 1
	return n


## Rotate through team spawns, skipping occupied ones.
func spawn_point(actor: Actor) -> Dictionary:
	var L := Game.L
	var spots: Array = L.team_spawns[actor.team] if actor.team < L.team_spawns.size() and L.team_spawns[actor.team] != null else L.spawns
	for k in spots.size():
		var sp: Dictionary = spots[(spawn_rot[actor.team] + k) % spots.size()]
		var busy := false
		for o in list:
			if o != actor and o.alive and Vector2(o.player.pos.x - sp.pos[0], o.player.pos.z - sp.pos[2]).length() < 48.0:
				busy = true
				break
		if not busy:
			spawn_rot[actor.team] = (spawn_rot[actor.team] + k + 1) % spots.size()
			return sp
	return spots[0]


## Nearest actor hitbox along a ray (skipping the shooter and, without friendly fire, teammates).
func hitscan(o: Vector3, d: Vector3, max_t: float, shooter: Actor) -> Dictionary:
	var best := {}
	for a in list:
		if not a.alive or a == shooter or (not ff and shooter and a.team == shooter.team):
			continue
		var lim: float = best.t if not best.is_empty() else max_t
		var h := a.model.hit_test(o, d, lim)
		if not h.is_empty() and h.t <= lim:
			best = {"actor": a, "t": h.t, "group": h.group}
	return best


func tick(dt: float) -> void:
	for a in list:
		a.hurt_t = maxf(0.0, a.hurt_t - dt * 1.6)
		if a.alive:
			a.alive_t += dt
		else:
			a.dead_t += dt
			if a.dead_t >= RESPAWN_TIME and not Match.active:
				a.spawn()
	for f: Dictionary in feed:
		f.age += dt
	feed = feed.filter(func(f: Dictionary) -> bool: return f.age < 7.0)


## Pose every model from its (interpolated) movement state; light from the probes.
func render(dt: float, alpha: float) -> void:
	for a in list:
		var p := a.player
		var m := a.model
		m.set_weapon(a.loadout.active.id, a.loadout.by_id("charge") != null)
		m.root.visible = not a.is_me and not hidden
		m.set_xray(me != null and me.admin and not a.is_me and a.team != me.team and a.alive and not hidden)
		var pos := p.prev.lerp(p.pos, alpha)
		m.update(dt, {"x": pos.x, "y": pos.y, "z": pos.z, "yaw": p.yaw, "pitch": p.pitch, "vx": p.vel.x, "vz": p.vel.z,
			"ducked": p.ducked, "onGround": p.on_ground or p.noclip, "alive": a.alive})
		if Game.L:
			m.set_light(Game.L.probe_sky(p.pos + Vector3(0, 40, 0)))
