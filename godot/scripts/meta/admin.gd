extends Node
## The admin passcode: whoever enters it gets noclip, unlimited wallbang rounds with no wait,
## unlimited money, and sees enemies through walls (x-ray and radar). Admin matches don't count.
## Only salted hashes of the passcode are stored here (tools/admin-hash.mjs makes new ones).

const HASHES := ["s256:ac0db9cb7158353579373ff6cca2aa6aa4285ca3cbff519540ba730de0f43725"]

var unlocked := false
var on := false


func load_state() -> void:
	var a: Variant = Accounts.cur
	unlocked = a != null and a.get("admin", false)
	on = unlocked and not a.get("adminOff", false)
	apply()


func try_code(code: String) -> Dictionary:
	var c := code.strip_edges().to_lower()
	if c == "":
		return {"ok": false, "msg": "Enter the passcode"}
	if not HASHES.has(Accounts.pin_hash("admin", c)):
		return {"ok": false, "msg": "Wrong passcode"}
	unlocked = true
	on = true
	save()
	apply()
	var a: Variant = Accounts.cur
	return {"ok": true, "msg": "%s is now an admin" % a.name if a != null else "You are an admin for this session (guest)"}


func set_on(v: bool) -> void:
	on = v and unlocked
	save()
	apply()


func remove() -> void:
	unlocked = false
	on = false
	save()
	apply()


func save() -> void:
	var a: Variant = Accounts.cur
	if a == null:
		return
	if unlocked:
		a.admin = true
	else:
		a.erase("admin")
	if unlocked and not on:
		a.adminOff = true
	else:
		a.erase("adminOff")
	Accounts.save_index()


func apply() -> void:
	var me := Actors.me
	var powers := on and not Net.active()       # no admin powers in network games
	if me:
		me.admin = powers
		if not powers and me.player.noclip:
			me.player.noclip = false
			me.player.vel = Vector3.ZERO
		if powers and Match.active:
			me.money = Match.MAX_MONEY
	if powers and Session.active and not Session.done:
		Session.admin_used = true
