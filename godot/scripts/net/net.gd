extends Node
## Multiplayer. Host a match on this PC (you play too, and others join you over the LAN or by
## address) or join one. ENet carries three channels: 0 reliable (handshake, roster, events,
## buying), 1 unreliable (commands up every tick, snapshots down 32 times a second), 2 unreliable
## (effects: shots, footsteps). The host runs the whole game (NetServer); a client predicts its own
## movement and weapon, draws everyone else a few ticks in the past and plays what the host reports
## (NetClient). LAN games are found with a UDP broadcast that hosts answer (port 27621).

const VERSION := "wallr-net-1"
const PORT := 27620
const LAN_PORT := 27621
const MAX_PLAYERS := 16
const CH_REL := 0
const CH_UNREL := 1
const CH_FX := 2

# message types (first byte of every packet)
const M_HELLO := 1       ## client -> host: version, name, gun kits, preferred side
const M_WELCOME := 2     ## host -> client: your actor id, the map and rules
const M_REJECT := 3      ## host -> client: why not (full, version)
const M_READY := 4       ## client -> host: map loaded, put me in
const M_ROSTER := 5      ## host -> clients: everyone in the match
const M_EVENTS := 6      ## host -> clients: reliable events of one tick
const M_CMD := 7         ## client -> host: the last few commands (unreliable)
const M_SNAP := 8        ## host -> client: snapshot (unreliable)
const M_FX := 9          ## host -> clients: effect events of one tick (unreliable)
const M_BUY := 10        ## client -> host: buy an item
const M_CHAT := 11       ## both ways: a chat line
const M_TEAM := 12       ## client -> host: switch sides
const M_STATE := 13      ## host -> a joining client: round history and the like

signal lan_changed
signal state_changed

var mode := "off"                ## off | host | client
var peer: ENetMultiplayerPeer = null
var server: NetServer = null
var client: NetClient = null
var status := ""                 ## for the menus: what is happening / what went wrong
var error := ""
var host_name := ""
var lan_games: Dictionary = {}   ## "ip:port" -> {name, map, mode, players, max, ip, port, seen}
var _lan_udp: PacketPeerUDP = null      ## host: answers queries
var _scan_udp: PacketPeerUDP = null     ## browser: sends queries, gets answers
var _scan_t := 0.0
var scanning := false
var _losing := false             ## a client's disconnect is being handled (deferred out of poll)
var _connect_at := 0              ## msec when this client started joining (it gives up after CONNECT_TIMEOUT)
var _connect_to := ""
var _connect_port := PORT
var _scan_dests: Array = []
var _scan_own: Array = []         ## this PC's addresses (answers from them are a game on this PC)
const CONNECT_TIMEOUT := 10000
## --netsim=delay_ms,loss_pct,jitter_ms: hold back everything we send (and drop some unreliable
## packets) to try the game on a bad connection; both ends should use it.
var sim_lat := 0.0
var sim_loss := 0.0
var sim_jit := 0.0
var _simq: Array = []
var _simn := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var ns := String(Game.args.get("netsim", ""))
	if ns != "":
		var p := ns.split(",")
		sim_lat = float(p[0]) / 1000.0
		sim_loss = float(p[1]) / 100.0 if p.size() > 1 else 0.0
		sim_jit = float(p[2]) / 1000.0 if p.size() > 2 else 0.0


func active() -> bool:
	return mode != "off"


func is_host() -> bool:
	return mode == "host"


func is_client() -> bool:
	return mode == "client"


## Host a match on this PC. The map must already be loaded and the session begun (Menus does both).
func host(cfg: Dictionary, port: int = PORT, name: String = "") -> String:
	leave()
	peer = ENetMultiplayerPeer.new()
	var err := peer.create_server(port, MAX_PLAYERS - 1, 3)
	if err != OK:
		peer = null
		error = "Couldn't open port %d (is another game using it?)" % port
		return error
	peer.host.compress(ENetConnection.COMPRESS_RANGE_CODER)
	peer.peer_connected.connect(_on_peer_connected)
	peer.peer_disconnected.connect(_on_peer_disconnected)
	mode = "host"
	host_name = name if name != "" else default_game_name()
	server = NetServer.new(cfg, host_name, port)
	_lan_udp = PacketPeerUDP.new()
	if _lan_udp.bind(LAN_PORT) != OK:
		_lan_udp = null           # another host on this PC answers the LAN; ours still takes addresses
	error = ""
	status = "Hosting on port %d" % port
	if Actors.me and not Game.dedicated:
		Actors.me.name = player_name()
	state_changed.emit()
	return ""


var _guest_tag := 0


## Your name in network games: your account's, or "Guest 123" for a guest (fixed for this run).
func player_name() -> String:
	if not Accounts.is_guest():
		return Accounts.display_name()
	if _guest_tag == 0:
		_guest_tag = 100 + randi() % 900
	return "Guest %d" % _guest_tag


## Say something in a network game (everyone, or your team only): the host sends it on.
func say(text: String, team_only: bool) -> void:
	text = text.strip_edges().left(120)
	if text == "" or not active():
		return
	if is_client():
		send_msg(1, M_CHAT, {"text": text, "team": team_only})
	elif server and Actors.me:
		server.chat(Actors.me, text, team_only)


## Ask to play on the other side (the host decides; a full side says no).
func switch_team(team: int) -> void:
	if is_client():
		send_msg(1, M_TEAM, {"team": team})
	elif server and Actors.me:
		var why := server.switch_actor(Actors.me, team)
		if why != "":
			HUD.note(why)


## A dedicated server's console: what happened, with the time.
func log_line(text: String) -> void:
	if Game.dedicated:
		print("[%s] %s" % [Time.get_time_string_from_system(), text])


func default_game_name() -> String:
	var n := Accounts.display_name()
	return "LAN game" if Accounts.is_guest() or n == "You" else "%s's game" % n


## Join a match by address ("192.168.1.20", "pc-name", or with ":port").
func join(address: String, port: int = PORT) -> String:
	leave()
	var addr := address.strip_edges()
	if addr.contains(":"):
		var parts := addr.rsplit(":", true, 1)
		addr = parts[0]
		port = int(parts[1]) if parts[1].is_valid_int() else port
	if addr == "":
		error = "Type the host's address"
		return error
	peer = ENetMultiplayerPeer.new()
	var err := peer.create_client(addr, port, 3)
	if err != OK:
		peer = null
		error = "Couldn't reach %s:%d" % [addr, port]
		return error
	peer.host.compress(ENetConnection.COMPRESS_RANGE_CODER)
	peer.peer_connected.connect(_on_peer_connected)
	peer.peer_disconnected.connect(_on_peer_disconnected)
	mode = "client"
	client = NetClient.new()
	error = ""
	_connect_at = Time.get_ticks_msec()
	_connect_to = addr
	_connect_port = port
	status = "Connecting to %s:%d…" % [addr, port]
	state_changed.emit()
	return ""


## Close the connection (the host closing ends the game for everyone).
func leave(reason: String = "") -> void:
	if peer:
		if mode == "client":
			peer.close()
		else:
			for id: int in (server.clients.keys() if server else []):
				peer.disconnect_peer(id)
			peer.host.flush()          # send the goodbyes before the socket closes
			peer.close()
	peer = null
	if server:
		server.shutdown()
	server = null
	client = null
	_lan_udp = null
	var was := mode
	mode = "off"
	status = ""
	if reason != "":
		error = reason
	if was != "off":
		Actors.after_network(was == "client")
		if Actors.me:
			Actors.me.name = Accounts.display_name()
		state_changed.emit()


func _on_peer_connected(id: int) -> void:
	if mode == "client" and id == 1:
		status = "Connected · joining…"
		client.send_hello()
		state_changed.emit()
	elif mode == "host":
		server.on_connect(id)


func _on_peer_disconnected(id: int) -> void:
	if mode == "client" and id == 1:
		# inside peer.poll(): closing the peer here would pull it out from under ENet, so later
		var r := client.drop_reason if client and client.drop_reason != "" else "The host left the game"
		_losing = true
		_lost.call_deferred(r)
	elif mode == "host" and server:
		server.on_disconnect(id)


func _lost(reason: String) -> void:
	_losing = false
	if mode != "client":
		return
	var joining := client == null or not client.have_snap       # never got into the match
	leave(reason)
	Session.network_lost(reason, joining)


## Why joining didn't work, and what to check.
func _join_failed() -> String:
	var at := _connect_to + ("" if _connect_port == PORT else ":%d" % _connect_port)
	if peer and peer.get_connection_status() == MultiplayerPeer.CONNECTION_CONNECTED:
		return "%s answered but didn't let us in. Is it running the same version of wallr?" % at
	return "Couldn't reach %s. Check the address, that the game is still being hosted, and that the host's firewall lets wallr through (UDP %d)." % [at, _connect_port]


# --- sending ---------------------------------------------------------------------------------------

func send_raw(to: int, bytes: PackedByteArray, channel: int, reliable: bool) -> void:
	if peer == null or peer.get_connection_status() == MultiplayerPeer.CONNECTION_DISCONNECTED:
		return
	if sim_lat > 0.0 or sim_loss > 0.0:
		if not reliable and randf() < sim_loss:
			return
		var at := Time.get_ticks_msec() + int((sim_lat + (0.0 if reliable else randf() * sim_jit)) * 1000.0)
		_simn += 1
		_simq.append([at * 1000000 + _simn, to, bytes, channel, reliable])     # ties keep send order
		return
	_put(to, bytes, channel, reliable)


func _put(to: int, bytes: PackedByteArray, channel: int, reliable: bool) -> void:
	if peer == null or peer.get_connection_status() == MultiplayerPeer.CONNECTION_DISCONNECTED:
		return
	if to > 0 and mode == "host" and peer.get_peer(to) == null:
		return
	peer.set_target_peer(to)
	peer.set_transfer_channel(channel)
	peer.set_transfer_mode(MultiplayerPeer.TRANSFER_MODE_RELIABLE if reliable else MultiplayerPeer.TRANSFER_MODE_UNRELIABLE)
	peer.put_packet(bytes)


## Push what's queued onto the wire now (after each tick), not at the next frame's poll: on a slow
## frame rate that would hold commands and snapshots back.
func flush() -> void:
	if peer and peer.get_connection_status() != MultiplayerPeer.CONNECTION_DISCONNECTED:
		peer.host.flush()


## A reliable message: type byte + a Variant.
func send_msg(to: int, type: int, data: Variant) -> void:
	var b := PackedByteArray([type])
	b.append_array(var_to_bytes(data))
	send_raw(to, b, CH_REL, true)


## A positional sound the clients should hear too (host side; no-op otherwise).
func snd(fn: String, args: Array, except_peer: int = 0) -> void:
	if mode == "host":
		server.ev(["snd", fn, args], 0, except_peer, false)


# --- receiving -------------------------------------------------------------------------------------

func _process(dt: float) -> void:
	_poll_lan(dt)
	if peer == null:
		_simq.clear()
		return
	if not _simq.is_empty():
		var now := (Time.get_ticks_msec() + 1) * 1000000
		_simq.sort_custom(func(x: Array, y: Array) -> bool: return int(x[0]) < int(y[0]))
		while not _simq.is_empty() and int(_simq[0][0]) < now:
			var q: Array = _simq.pop_front()
			_put(int(q[1]), q[2], int(q[3]), bool(q[4]))
	if peer.get_connection_status() != MultiplayerPeer.CONNECTION_DISCONNECTED:
		peer.poll()
	if peer == null:
		return
	while peer and peer.get_available_packet_count() > 0:
		var from := peer.get_packet_peer()
		var pkt := peer.get_packet()
		if pkt.is_empty():
			continue
		_dispatch(from, pkt)
	if mode == "client" and peer and not _losing:
		if peer.get_connection_status() == MultiplayerPeer.CONNECTION_DISCONNECTED:
			_lost(_join_failed() if client and not client.welcomed else "Lost the connection to the host")
		elif client and not client.welcomed and Time.get_ticks_msec() - _connect_at > CONNECT_TIMEOUT:
			_lost(_join_failed())         # don't sit through ENet's own (much longer) timeout


func _dispatch(from: int, pkt: PackedByteArray) -> void:
	var type := pkt[0]
	if mode == "host":
		match type:
			M_CMD:
				server.on_cmds(from, pkt)
			_:
				var data: Variant = bytes_to_var(pkt.slice(1))
				server.on_msg(from, type, data)
	elif mode == "client" and client:
		match type:
			M_SNAP:
				client.on_snapshot(pkt)
			_:
				var data2: Variant = bytes_to_var(pkt.slice(1))
				client.on_msg(type, data2)


## The host's own copy of an event it sends out (chat lines).
func client_event_local(e: Array) -> void:
	if String(e[0]) == "chat":
		HUD.chat_line(String(e[2]), int(e[3]), String(e[4]), bool(e[5]))


## Round-trip time to a client in ms (host), or to the host (client).
func ping_of(id: int) -> int:
	if peer == null:
		return 0
	var pp := peer.get_peer(id)
	return int(pp.get_statistic(ENetPacketPeer.PEER_ROUND_TRIP_TIME)) if pp else 0


# --- LAN discovery ---------------------------------------------------------------------------------

## Start / stop looking for games on the local network (the Join screen).
func scan(on: bool) -> void:
	scanning = on
	if on and _scan_udp == null:
		_scan_udp = PacketPeerUDP.new()
		_scan_udp.set_broadcast_enabled(true)
		_scan_udp.bind(0)
		_scan_t = 0.0
		_scan_own = local_addresses()
		_scan_dests = _scan_targets()
		lan_games.clear()
	elif not on:
		_scan_udp = null


func _poll_lan(dt: float) -> void:
	# host: answer "who's there?" with what we're playing
	if _lan_udp and mode == "host" and server:
		while _lan_udp.get_available_packet_count() > 0:
			var q := _lan_udp.get_packet().get_string_from_utf8()
			var ip := _lan_udp.get_packet_ip()
			var port := _lan_udp.get_packet_port()
			if q.begins_with("WALLR?"):
				var ans := "WALLR!" + JSON.stringify(server.lan_info())
				_lan_udp.set_dest_address(ip, port)
				_lan_udp.put_packet(ans.to_utf8_buffer())
	# browser: ask every second, collect the answers
	if _scan_udp and scanning:
		_scan_t -= dt
		if _scan_t <= 0.0:
			_scan_t = 1.0
			for dest: String in _scan_dests:
				_scan_udp.set_dest_address(dest, LAN_PORT)
				_scan_udp.put_packet(("WALLR?" + VERSION).to_utf8_buffer())
			var now := Time.get_ticks_msec()
			var changed := false
			for k: String in lan_games.keys():
				if now - int(lan_games[k].seen) > 4000:
					lan_games.erase(k)
					changed = true
			if changed:
				lan_changed.emit()
		while _scan_udp.get_available_packet_count() > 0:
			var a := _scan_udp.get_packet().get_string_from_utf8()
			var ip2 := _scan_udp.get_packet_ip()
			if not a.begins_with("WALLR!"):
				continue
			var d: Variant = JSON.parse_string(a.substr(6))
			if not (d is Dictionary):
				continue
			var g: Dictionary = d
			if ip2.begins_with("127.") or _scan_own.has(ip2):
				ip2 = "127.0.0.1"          # a game on this PC answers on several addresses: list it once
			g.ip = ip2
			g.seen = Time.get_ticks_msec()
			var key := "%s:%d" % [ip2, int(g.get("port", PORT))]
			var fresh := not lan_games.has(key)
			lan_games[key] = g
			if fresh:
				lan_changed.emit()


## Where a LAN query goes: everyone (255.255.255.255), each of this PC's networks as the usual
## home /24 (on a PC with several adapters the plain broadcast may leave by the wrong one), and
## this PC itself.
func _scan_targets() -> Array:
	var out: Array = ["255.255.255.255"]
	for a: String in _scan_own:
		var p := a.split(".")
		if p.size() == 4 and not out.has("%s.%s.%s.255" % [p[0], p[1], p[2]]):
			out.append("%s.%s.%s.255" % [p[0], p[1], p[2]])
	out.append("127.0.0.1")
	return out


## This PC's network addresses, to tell friends where to connect: home and office networks first,
## then the rest (VPNs such as ZeroTier or Tailscale), then adapters only this PC can use
## (virtual machines, containers, WSL).
func local_addresses() -> Array:
	var ranked: Array = []
	var seen := {}
	for itf: Dictionary in IP.get_local_interfaces():
		var nm := (String(itf.get("friendly", "")) + " " + String(itf.get("name", ""))).to_lower()
		var local_only := false
		for w: String in ["docker", "virbr", "veth", "vethernet", "hyper-v", "wsl", "virtualbox", "vmware", "vmnet", "vboxnet", "br-"]:
			local_only = local_only or nm.contains(w)
		for a: String in itf.get("addresses", []):
			if a.contains(".") and not a.begins_with("127.") and not a.begins_with("169.254.") and not seen.has(a):
				seen[a] = true
				ranked.append([_addr_rank(a) + (10 if local_only else 0), a])
	for a: String in IP.get_local_addresses():     # anything the interface list missed
		if a.contains(".") and not a.begins_with("127.") and not a.begins_with("169.254.") and not seen.has(a):
			seen[a] = true
			ranked.append([_addr_rank(a), a])
	ranked.sort_custom(func(x: Array, y: Array) -> bool: return int(x[0]) < int(y[0]) or (int(x[0]) == int(y[0]) and String(x[1]) < String(y[1])))
	return ranked.map(func(e: Array) -> String: return String(e[1]))


static func _addr_rank(a: String) -> int:
	var p := a.split(".")
	if p[0] == "192" and p[1] == "168":
		return 5 if p[2] == "56" else 0         # 192.168.56.x: VirtualBox's host-only network
	if p[0] == "10":
		return 1
	if p[0] == "172" and int(p[1]) >= 16 and int(p[1]) <= 31:
		return 3                                 # often containers or WSL
	return 2
