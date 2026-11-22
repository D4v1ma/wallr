class_name Actor
extends RefCounted
## A player in the match, you or a bot: movement, loadout, model, health/armor, money, scoring.

const GROUP_MUL := {"head": 4.0, "chest": 1.0, "stomach": 1.25, "arm": 1.0, "leg": 0.75}

var team := 0
var name := ""
var is_bot := false
var is_me := false
var id := 0
var player: Player
var loadout: Loadout
var model: PlayerModel
var health := 100
var armor := 100
var helmet := true
var alive := false
var dead_t := 0.0
var kills := 0
var deaths := 0
var hurt_t := 0.0
var hurt_from: Variant = null
var killer: Actor = null
var money := 800
var kit := false
var squad := 0
var dmg := 0
var hs := 0
var plants := 0
var defuses := 0
var wb_charges := 3
var wb_armed := false
var wb_used := 0
var alive_t := 0.0
var last_shot_t := -9.0
var admin := false
var last_hit_wb := false
var kill_info: Dictionary = {}
var brain: BotBrain = null
var prev_pos := Vector3.ZERO


func _init(t: int, n: String, bot: bool, me: bool) -> void:
	team = t
	name = n
	is_bot = bot
	is_me = me
	id = Actors.next_id
	Actors.next_id += 1
	player = Game.player if me else Player.new(Game.L.cw)
	loadout = Game.loadout if me else Loadout.new(Actors.BOT_KIT)
	model = PlayerModel.new(team, Actors.models_root)
	model.root.visible = not me
	if bot:
		brain = BotBrain.new(self)


func spawn() -> void:
	var sp := Actors.spawn_point(self)
	player.spawn(U.v3(sp.pos), float(sp.yaw))
	health = 100
	armor = 100
	helmet = true
	alive = true
	dead_t = 0.0
	killer = null
	loadout.refill()
	model.dead = 0.0
	alive_t = 0.0
	Wallbang.reset(self)
	if brain:
		brain.reset()


func damage(amount: float, group: String, attacker: Actor, def: Dictionary, from: Variant, wallbang: bool = false) -> int:
	if not alive:
		return 0
	last_hit_wb = wallbang
	var d: float = amount * float(GROUP_MUL.get(group, 1.0))
	if armor > 0 and group != "leg" and (group != "head" or helmet):
		var to_health := d * float(def.get("armorPen", 0.5))
		var to_armor := (d - to_health) * 0.5
		if to_armor > armor:
			to_health += (to_armor - armor) * 2.0
			to_armor = armor
		armor = maxi(0, int(round(armor - to_armor)))
		d = to_health
	var dealt := maxi(1, int(round(d)))
	if attacker and attacker != self and attacker.team != team:
		attacker.dmg += mini(dealt, health)
	health -= dealt
	hurt_t = 1.0
	hurt_from = from
	if brain:
		brain.on_hurt(attacker, from)
	if is_me:
		HUD.hurt(dealt)
	if health <= 0:
		health = 0
		die(attacker, def, group == "head")
	return dealt


func die(attacker: Actor, def: Dictionary, headshot: bool) -> void:
	alive = false
	dead_t = 0.0
	deaths += 1
	killer = attacker
	wb_armed = false
	kill_info = {"weapon": def.get("name", ""), "headshot": headshot}
	if attacker and attacker != self:
		if attacker.team != team:
			attacker.kills += 1
			if headshot:
				attacker.hs += 1
			Actors.score[attacker.team] += 1
		else:
			attacker.kills -= 1
	Actors.feed.append({"killer": attacker.name if attacker else "", "kTeam": attacker.team if attacker else team, "victim": name, "vTeam": team,
		"weapon": def.get("name", ""), "wid": def.get("id", ""), "hs": headshot, "wb": last_hit_wb, "age": 0.0,
		"me": (attacker != null and attacker.is_me) or is_me})
	if Actors.feed.size() > 6:
		Actors.feed.pop_front()
	model.death_dir = 1.0 if headshot else (1.0 if randf() < 0.5 else -1.0)
	Snd.death(player.pos)
	Match.on_death(self, attacker, def)


## Eye position on the simulation tick (no render smoothing).
func eye() -> Vector3:
	return player.pos + Vector3(0, lerpf(Player.STAND_EYE, Player.DUCK_EYE, U.smooth(0.0, 1.0, player.duck_amt)), 0)


func view_dir() -> Vector3:
	return U.view_dir(player.yaw, player.pitch)
