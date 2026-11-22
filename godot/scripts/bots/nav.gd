extends Node
## Waypoint graph from the map compiler: one node per 40-unit column on every walkable surface,
## linked where the floor can be walked (steps <= 18), hopped (<= 50, jump links) or dropped from
## (one-way). Paths come from Godot's AStar3D; bots string-pull them with walk tests.

const STEP := 40.0

var nodes := PackedVector3Array()
var cells: Dictionary = {}
var astar := AStar3D.new()
var jumps: Dictionary = {}
var tr := Trace.new()
var L: Level = null


func build(level: Level) -> void:
	L = level
	nodes.clear()
	cells.clear()
	jumps.clear()
	astar.clear()
	var raw: Array = level.nav.nodes
	var links: Array = level.nav.links
	astar.reserve_space(raw.size())
	for i in raw.size():
		var n: Array = raw[i]
		var p := Vector3(n[0], n[1], n[2])
		nodes.append(p)
		astar.add_point(i, p)
		var k := _key(int(n[3]), int(n[4]))
		if not cells.has(k):
			cells[k] = []
		(cells[k] as Array).append(i)
	for i in links.size():
		for l: Array in links[i]:
			var to := int(l[0])
			astar.connect_points(i, to, false)
			if int(l[2]) == 1:
				jumps[i * 65536 + to] = true


func _key(cx: int, cz: int) -> int:
	return cx * 4096 + cz


## Nearest node a player at p can see and roughly stand level with (-1 if none).
func nearest(p: Vector3) -> int:
	var cx := roundi(p.x / STEP)
	var cz := roundi(p.z / STEP)
	var cand: Array = []
	for r in 4:
		if cand.size() >= 4:
			break
		for i in range(-r, r + 1):
			for j in range(-r, r + 1):
				if maxi(absi(i), absi(j)) != r:
					continue
				var ids: Variant = cells.get(_key(cx + i, cz + j))
				if ids == null:
					continue
				for id: int in ids:
					var n := nodes[id]
					var dy := n.y - p.y
					if dy > 40.0 or dy < -80.0:
						continue
					cand.append([Vector3(n.x - p.x, (n.y - p.y) * 2.0, n.z - p.z).length(), id])
	cand.sort_custom(func(a: Array, b: Array) -> bool: return a[0] < b[0])
	var cw := L.cw
	for c: Array in cand:
		var n := nodes[c[1]]
		var a := p + Vector3(0, 40, 0)
		var b := n + Vector3(0, 40, 0)
		var d := a.distance_to(b)
		if d < 1e-3 or cw.ray(a, (b - a) / d, d, CollisionWorld.MASK_PLAYER) < 0.0:
			return c[1]
	return cand[0][1] if not cand.is_empty() else -1


## A* over the graph -> [{p: Vector3, jump}] (excluding the start node), or [] when unreachable.
func path(a: Vector3, b: Vector3) -> Array:
	var s := nearest(a)
	var g := nearest(b)
	if s < 0 or g < 0:
		return []
	if s == g:
		return [{"p": nodes[g], "jump": false}]
	var ids := astar.get_id_path(s, g)
	if ids.is_empty():
		return []
	var out: Array = []
	for k in range(1, ids.size()):
		out.append({"p": nodes[ids[k]], "jump": jumps.has(ids[k - 1] * 65536 + ids[k])})
	return out


## Can a player get from a to b in a straight line? -> {jump, drop} or {} (no).
func walk(a: Vector3, b: Vector3) -> Dictionary:
	var cw := L.cw
	var dist := Vector2(b.x - a.x, b.z - a.z).length()
	var n := maxi(1, ceili(dist / 10.0))
	var prev := a.y
	var jump := false
	var drop := false
	var half := Vector3(14, 36, 14)
	for i in range(1, n + 1):
		var t := float(i) / n
		var x := a.x + (b.x - a.x) * t
		var z := a.z + (b.z - a.z) * t
		var top := maxf(prev, b.y)
		var low := minf(prev, b.y) - 220.0 + 36.0
		cw.trace(tr, Vector3(x, top + 52.0 + 36.0, z), Vector3(x, low, z), half, CollisionWorld.MASK_PLAYER)
		if tr.startsolid:
			cw.trace(tr, Vector3(x, top + 20.0 + 36.0, z), Vector3(x, low, z), half, CollisionWorld.MASK_PLAYER)
			if tr.startsolid:
				return {}
		if tr.fraction >= 1.0 or tr.normal.y < 0.7:
			return {}
		var gy := tr.endpos.y - 36.0
		var dy := gy - prev
		if dy > 50.0:
			return {}
		if dy > 18.0:
			jump = true
		if dy < -18.0:
			drop = true
		prev = gy
	return {"jump": jump, "drop": drop} if absf(prev - b.y) < 10.0 else {}


func random_node(r: U.Rng) -> Variant:
	if nodes.is_empty():
		return null
	return nodes[int(r.next() * nodes.size()) % nodes.size()]
