extends Node
## Accounts on this device: callsigns, optional PINs (salted SHA-256), one saved profile each, and an
## exit checkpoint so leaving a match (or closing the game) still records it. Files live in
## user://accounts/ (see U.data_dir).

signal changed

var dir := U.data_dir() + "accounts/"
var index_path := dir + "accounts.json"

var list: Array = []
var cur: Variant = null           ## the signed-in account (Dictionary) or null = guest
var remembered: Variant = null
var last_saved := 0.0
var notice: Variant = null         ## a match recovered from a checkpoint at sign-in
var _name_re := RegEx.new()


func _ready() -> void:
	_name_re.compile("[^\\p{L}\\p{N} _.\\-']")
	DirAccess.make_dir_recursive_absolute(dir)


static func random_id(n: int = 8) -> String:
	return Crypto.new().generate_random_bytes(n).hex_encode()


static func sha256(text: String) -> String:
	var h := HashingContext.new()
	h.start(HashingContext.HASH_SHA256)
	h.update(text.to_utf8_buffer())
	return h.finish().hex_encode()


static func pin_hash(salt: String, pin: String) -> String:
	return "s256:" + sha256("shortfuse:%s:%s" % [salt, pin])


static func _read(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		return null
	return JSON.parse_string(FileAccess.get_file_as_string(path))


static func _write(path: String, value: Variant) -> bool:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify(value))
	return true


func is_guest() -> bool:
	return cur == null


func display_name() -> String:
	return String(cur.name) if cur != null else "You"


func init() -> void:
	var idx: Variant = _read(index_path)
	list = []
	if idx is Dictionary and idx.get("accounts") is Array:
		for a: Variant in idx.accounts:
			if a is Dictionary and a.get("id") is String and a.get("name") is String:
				a.name = clean_name(a.name) if clean_name(a.name) != "" else "Player"
				if not (a.get("pin") is Dictionary):
					a.pin = null
				list.append(a)
	remembered = null
	if idx is Dictionary:
		for a: Dictionary in list:
			if a.id == idx.get("current"):
				remembered = a
	cur = null
	Profile.v = Profile.blank()


func save_index() -> bool:
	return _write(index_path, {"ver": 1, "current": cur.id if cur != null else null, "accounts": list})


func clean_name(s: String) -> String:
	var n := _name_re.sub(s, "", true)
	while n.contains("  "):
		n = n.replace("  ", " ")
	return n.strip_edges().substr(0, 16)


func check_name(name: String, except: Variant = null) -> Dictionary:
	var n := clean_name(name)
	if n.length() < 2:
		return {"ok": false, "msg": "Use 2 to 16 letters, digits, spaces, _ . - or '"}
	for a: Dictionary in list:
		if a != except and String(a.name).to_lower() == n.to_lower():
			return {"ok": false, "msg": "“%s” is already an account on this device" % n}
	return {"ok": true, "name": n}


func check_pin(pin: String, pin2: String) -> Dictionary:
	if pin == "" and pin2 == "":
		return {"ok": true, "pin": ""}
	var re := RegEx.new()
	re.compile("^\\d{4,8}$")
	if re.search(pin) == null:
		return {"ok": false, "msg": "A PIN is 4 to 8 digits"}
	if pin != pin2:
		return {"ok": false, "msg": "The two PINs don’t match"}
	return {"ok": true, "pin": pin}


func has_progress(p: Dictionary) -> bool:
	return float(p.xp) > 0.0 or not (p.history as Array).is_empty() or not (p.owned.att as Array).is_empty() or not (p.owned.camo as Array).is_empty() or int(p.points) != Profile.WELCOME_POINTS


func profile_of(a: Dictionary) -> Dictionary:
	return Profile.sanitize(_read(dir + "profile_%s.json" % a.id))


func create(name: String, pin: String, from_guest: bool = false) -> Dictionary:
	var n := check_name(name)
	if not n.ok:
		return n
	var a := {"id": random_id(8), "name": n.name, "created": Time.get_unix_time_from_system(), "lastPlayed": 0.0, "pin": null}
	if pin != "":
		var salt := random_id(8)
		a.pin = {"salt": salt, "hash": pin_hash(salt, pin)}
	var profile := Profile.blank()
	var from := "new"
	if from_guest and has_progress(Profile.v):
		profile = Profile.sanitize(Profile.v.duplicate(true))
		from = "guest"
	if not _write(dir + "profile_%s.json" % a.id, profile):
		return {"ok": false, "msg": "Couldn’t save on this device"}
	list.append(a)
	sign_in(a)
	return {"ok": true, "account": a, "from": from}


func verify(a: Dictionary, pin: String) -> bool:
	if a.get("pin") == null:
		return true
	return pin_hash(String(a.pin.salt), pin) == String(a.pin.hash)


func _find(a: Dictionary) -> Dictionary:
	for x: Dictionary in list:
		if x.id == a.id:
			return x
	return a


func sign_in(a: Dictionary) -> void:
	a = _find(a)
	cur = a
	remembered = a
	Profile.v = profile_of(a)
	Arsenal._cache.clear()
	save_index()
	apply_pending()
	if Actors.me:
		Actors.me.name = a.name
	Admin.load_state()
	changed.emit()
	Profile.changed.emit()


func sign_out() -> void:
	if cur != null:
		save_profile()
	cur = null
	save_index()
	Profile.v = Profile.blank()
	Arsenal._cache.clear()
	if Actors.me:
		Actors.me.name = "You"
	Admin.load_state()
	changed.emit()
	Profile.changed.emit()


func play_as_guest() -> void:
	if cur != null:
		sign_out()
	else:
		Profile.v = Profile.blank()
		changed.emit()
		Profile.changed.emit()


func save_profile() -> bool:
	if cur == null:
		return false
	var ok := _write(dir + "profile_%s.json" % cur.id, Profile.v)
	if ok:
		last_saved = Time.get_unix_time_from_system()
	return ok


func touch() -> void:
	if cur != null:
		cur.lastPlayed = Time.get_unix_time_from_system()
		save_index()


func rename(name: String) -> Dictionary:
	if cur == null:
		return {"ok": false, "msg": "Sign in first"}
	var n := check_name(name, cur)
	if not n.ok:
		return n
	cur.name = n.name
	save_index()
	if Actors.me:
		Actors.me.name = n.name
	changed.emit()
	return {"ok": true, "msg": "Callsign changed to %s" % n.name}


func set_pin(old_pin: String, pin: String, pin2: String) -> Dictionary:
	if cur == null:
		return {"ok": false, "msg": "Sign in first"}
	if cur.get("pin") != null and not verify(cur, old_pin):
		return {"ok": false, "msg": "The current PIN is wrong"}
	var p := check_pin(pin, pin2)
	if not p.ok:
		return p
	if p.pin == "":
		cur.pin = null
		save_index()
		changed.emit()
		return {"ok": true, "msg": "PIN removed: anyone on this device can sign in to this account"}
	var salt := random_id(8)
	cur.pin = {"salt": salt, "hash": pin_hash(salt, p.pin)}
	save_index()
	changed.emit()
	return {"ok": true, "msg": "PIN saved"}


func remove(a: Dictionary, pin: String) -> Dictionary:
	a = _find(a)
	if a.get("pin") != null and not verify(a, pin):
		return {"ok": false, "msg": "The PIN is wrong"}
	DirAccess.remove_absolute(dir + "profile_%s.json" % a.id)
	DirAccess.remove_absolute(dir + "pending_%s.json" % a.id)
	list.erase(a)
	if remembered == a:
		remembered = null
	if cur == a:
		cur = null
		Profile.v = Profile.blank()
		if Actors.me:
			Actors.me.name = "You"
	save_index()
	changed.emit()
	Profile.changed.emit()
	return {"ok": true, "msg": "%s was deleted from this device" % a.name}


func checkpoint(rec: Dictionary) -> void:
	if cur != null:
		_write(dir + "pending_%s.json" % cur.id, rec)


func clear_checkpoint() -> void:
	if cur != null:
		DirAccess.remove_absolute(dir + "pending_%s.json" % cur.id)


## A match left unrecorded (the game closed mid-match): fold it in at sign-in.
func apply_pending() -> Variant:
	if cur == null:
		return null
	var path := dir + "pending_%s.json" % cur.id
	var rec: Variant = _read(path)
	DirAccess.remove_absolute(path)
	if not (rec is Dictionary) or not (rec.get("cfg") is Dictionary) or not (rec.get("st") is Dictionary) or not (rec.get("matchId") is String) or rec.matchId == Profile.v.lastMatchId:
		return null
	var res := Profile.apply_match(rec.cfg, rec.st, String(rec.get("outcome", "left")), rec.matchId)
	notice = {"res": res, "at": rec.get("at", Time.get_unix_time_from_system())}
	return res
