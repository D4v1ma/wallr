extends RefCounted
## Layout checks on the defuse maps, with rays at eye height against the brushes (smoke and fog
## ignored): neither team's spawn points can see the other's, nobody standing in mid (the map's
## tactics.mid rectangle) can see into a spawn, and the bots' graph reaches every spawn point,
## plant spot and hold spot from both spawns.

const EYE := 64.0


func run(r: Node) -> void:
	var maps: PackedStringArray = String(Game.args.get("maps", "depot,kiln,frost")).split(",")
	var dump_dir := String(Game.args.get("dump", ""))      # --dump=dir: the clear lines as JSON, per map
	for key in maps:
		var main: Node = await r.boot_game({"map": key, "mode": "defuse", "bots": "0", "allies": "0", "team": "1"})
		var L := Game.L
		var eyes: Array = []
		for t in 2:
			var pts: Array[Vector3] = []
			for s: Dictionary in L.team_spawns[t]:
				pts.append(Vector3(s.pos[0], float(s.pos[1]) + EYE, s.pos[2]))
			eyes.append(pts)
		# the two spawns
		var seen := 0
		for a: Vector3 in eyes[0]:
			for b: Vector3 in eyes[1]:
				if _clear(L, a, b):
					seen += 1
		r.check("%s: the spawns can't see each other" % key, seen == 0, "%d of %d lines clear" % [seen, eyes[0].size() * eyes[1].size()])
		# mid into the spawns: every graph node in the mid rectangle, at eye height
		var m: Array = L.tactics.get("mid", [])
		var mids: Array[Vector3] = []
		for n: Vector3 in Nav.nodes:
			if m.size() == 4 and n.x >= float(m[0]) and n.x <= float(m[2]) and n.z >= float(m[1]) and n.z <= float(m[3]):
				mids.append(n + Vector3(0, EYE, 0))
		var dump := {}
		for t in 2:
			var hits := 0
			var where := []
			var lines := []
			for p: Vector3 in mids:
				for e: Vector3 in eyes[t]:
					if _clear(L, p, e):
						hits += 1
						lines.append([p.x, p.z, e.x, e.z])
						if where.size() < 3:
							where.append("%d,%d" % [roundi(p.x), roundi(p.z)])
						break
			dump[str(t)] = lines
			r.check("%s: mid can't see into the %s spawn" % [key, Actors.TEAMS[t].name], hits == 0 and not mids.is_empty(),
				"%d of %d mid points see it %s" % [hits, mids.size(), str(where) if hits else ""])
		if dump_dir != "":
			DirAccess.make_dir_recursive_absolute(dump_dir)
			var f := FileAccess.open(dump_dir.path_join("%s.json" % key), FileAccess.WRITE)
			f.store_string(JSON.stringify({"mid": m, "lines": dump, "lo": [L.lo.x, L.lo.z], "hi": [L.hi.x, L.hi.z]}))
			f.close()
		# the graph: every spot the bots use has a node next to it with a path from both spawns
		var spots: Array = []
		for t in 2:
			for e: Vector3 in eyes[t]:
				spots.append(["spawn", e - Vector3(0, EYE, 0)])
		for site: String in L.tactics.sites:
			var S: Dictionary = L.tactics.sites[site]
			for k: String in ["plant", "hold"]:
				for s: Array in S[k]:
					spots.append(["%s %s" % [site, k], Vector3(s[0], s[1], s[2])])
		var bad := []
		for s: Array in spots:
			for t in 2:
				var from: Vector3 = eyes[t][0] - Vector3(0, EYE, 0)
				var p := Nav.path(from, s[1])
				var end: Vector3 = p[p.size() - 1].p if not p.is_empty() else Vector3.INF
				if p.is_empty() or Vector2(end.x - s[1].x, end.z - s[1].z).length() > Nav.STEP * 2.0 or absf(end.y - s[1].y) > 40.0:
					bad.append("%s %s" % [s[0], str(Vector3(s[1]).round())])
					break
		r.check("%s: bots can walk to every spawn, plant and hold spot" % key, bad.is_empty(), "%d spots%s" % [spots.size(), (", unreachable: " + str(bad)) if bad else ""])
		Game.state = "menu"
		main.queue_free()
		await r.get_tree().process_frame


func _clear(L: Level, a: Vector3, b: Vector3) -> bool:
	var d := a.distance_to(b)
	return d > 1.0 and L.cw.ray(a, (b - a) / d, d, CollisionWorld.MASK_SHOT) < 0.0
