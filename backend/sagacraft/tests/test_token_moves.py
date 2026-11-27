"""Plan 58: who moves a token on a map Set of the live Stage (and when), pausing the Stage, sheets' editable values."""
from tests.test_locations import _command, _map_set
from tests.test_map_tokens import _setup, _tokens


def _live_tokens(api, saga_id, who):
    content = api.ok("GET", f"/api/sagas/{saga_id}/live", who)["stage"]["sets"]
    return {t["name"]: t for s in content if s["type"] == "world_map" for t in s["content"]["map"]["tokens"]}


def _scene(api, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), g, town = _setup(api, root)
    shared = {"groups": [g["players"]], "members": []}
    hero = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "type": "pc", "visibility": shared,
        "attributes": {"name": "Thorin", "controllers": [ana_id], "hp": {"current": 20, "max": 20}, "initiative": 20,
                       "hit_dice": {"current": 5, "max": 5}}})
    spy = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "type": "npc", "attributes": {"name": "Spy", "initiative": 1}})
    stage_id, set_id = _map_set(api, saga_id, dm)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"resource_ids": [town["id"]]})
    everyone = {"groups": [g["players"], g["viewers"]], "members": []}
    _command(api, saga_id, dm, town["id"], "tokens.save", token={"kind": "character", "ref": hero["id"], "tile": [0, 0], "visibility": everyone})
    _command(api, saga_id, dm, town["id"], "tokens.save", token={"kind": "custom", "name": "Boulder", "tile": [1, 1], "visibility": everyone})
    ids = {t["name"]: t["id"] for t in _tokens(api, saga_id, dm, town)}
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    return saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), g, town, hero, spy, stage_id, set_id, ids


def _move(client, saga_id, who, set_id, token_id, path):
    """A planned move (plan 59: members move along a route of touching tiles)."""
    return client.post(f"/api/sagas/{saga_id}/sets/{set_id}/act", headers=who,
                       json={"name": "token.move", "args": {"id": token_id, "path": path}}).status_code


def test_who_may_move_a_token(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), g, town, hero, spy, stage_id, set_id, ids = _scene(api, root)
    save = lambda token_id, **changes: _command(api, saga_id, dm, town["id"], "tokens.save", token={"id": token_id, **changes})  # noqa: E731
    url = f"/api/sagas/{saga_id}/locations/{town['id']}/map/command"
    for bad in ({"move_by": "everyone"}, {"move_when": "sometimes"}):
        assert client.post(url, headers=dm, json={"name": "tokens.save", "args": {"token": {"id": ids["Boulder"], **bad}}}).status_code == 400
    # A custom token has no players and no turn
    for bad in ({"move_by": "owners"}, {"move_when": "turn"}):
        assert client.post(url, headers=dm, json={"name": "tokens.save", "args": {"token": {"id": ids["Boulder"], **bad}}}).status_code == 400
    # The DM only, by default: nobody else may
    assert all(not t["movable"] for who in (ana, bob, vic) for t in _live_tokens(api, saga_id, who).values())
    dm_tokens = _live_tokens(api, saga_id, dm)
    assert (dm_tokens["Thorin"]["move_by"], dm_tokens["Thorin"]["move_when"]) == ("dm", "always") and "movable" not in dm_tokens["Thorin"]
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[1, 0]]) == 403
    # Its players; players; anyone (viewers too)
    save(ids["Thorin"], move_by="owners")
    save(ids["Boulder"], move_by="players")
    movable = lambda who: {n: t["movable"] for n, t in _live_tokens(api, saga_id, who).items()}  # noqa: E731
    assert movable(ana) == {"Thorin": True, "Boulder": True}
    assert movable(bob) == {"Thorin": False, "Boulder": True}
    assert movable(vic) == {"Thorin": False, "Boulder": False}
    assert "move_by" not in _live_tokens(api, saga_id, ana)["Thorin"]
    assert _live_tokens(api, saga_id, ana)["Thorin"]["ref"] == hero["id"]  # a character they see: its sheet
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[1, 0], [2, 0]]) == 200
    assert _move(client, saga_id, bob, set_id, ids["Thorin"], [[3, 0]]) == 403
    assert _move(client, saga_id, bob, set_id, ids["Boulder"], [[2, 2]]) == 200
    assert _move(client, saga_id, vic, set_id, ids["Boulder"], [[3, 2]]) == 403  # viewers: only "anyone"
    save(ids["Boulder"], move_by="anyone")
    assert movable(vic)["Boulder"] is True
    assert _move(client, saga_id, vic, set_id, ids["Boulder"], [[3, 2]]) == 200
    assert client.post(f"/api/sagas/{saga_id}/sets/{set_id}/act", headers=vic, json={"name": "roll", "args": {}}).status_code == 403
    assert {t["name"]: t["tile"] for t in _tokens(api, saga_id, dm, town)} == {"Thorin": [2, 0], "Boulder": [3, 2]}
    for bad in ([[99, 0]], "here", [[4, 0]], []):  # off the map, not a route, not touching, nothing
        assert _move(client, saga_id, ana, set_id, ids["Thorin"], bad) == 400, bad
    assert _move(client, saga_id, ana, set_id, "token-404", [[1, 0]]) == 404
    # A member plans: a tile alone isn't a move
    assert client.post(f"/api/sagas/{saga_id}/sets/{set_id}/act", headers=ana,
                       json={"name": "token.move", "args": {"id": ids["Thorin"], "tile": [3, 0]}}).status_code == 400
    # Their drag shows live to the others; one they can't move: refused
    drag = f"/api/sagas/{saga_id}/sets/{set_id}/token-drag"
    api.ok("POST", drag, ana, json={"token": ids["Thorin"], "tile": [2, 1]})
    assert client.post(drag, headers=bob, json={"token": ids["Thorin"], "tile": [2, 1]}).status_code == 403
    # Under their fog: not theirs to move; and only onto tiles they know
    _command(api, saga_id, dm, town["id"], "fog.set", enabled=True)
    _command(api, saga_id, dm, town["id"], "fog.fill", group_ids=[g["players"]], state="0")
    _command(api, saga_id, dm, town["id"], "fog.paint", group_ids=[g["players"]], state="2", tiles=[[2, 0], [2, 1]])
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[3, 1], [4, 2], [4, 3]]) == 400
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[2, 1]]) == 200
    assert _move(client, saga_id, bob, set_id, ids["Boulder"], [[2, 1]]) == 404  # where it is, bob knows nothing
    # Not the live Stage: nobody but the DM
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": None})
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[2, 0]]) == 404


def test_on_its_turn(api, client, root):
    saga_id, dm, (ana_id, ana), _, _, g, town, hero, spy, stage_id, set_id, ids = _scene(api, root)
    _command(api, saga_id, dm, town["id"], "tokens.save", token={"id": ids["Thorin"], "move_by": "owners", "move_when": "turn"})
    assert _live_tokens(api, saga_id, ana)["Thorin"]["movable"] is False  # no turns running
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[1, 0]]) == 403
    scene = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage_id}/sets", dm, json={"type": "actors_scene"})["sets"]
    scene_id = next(s["id"] for s in scene if s["type"] == "actors_scene")
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{scene_id}/actors", dm, json={"resource_ids": [hero["id"], spy["id"]]})
    command = lambda name, **args: api.ok("POST", f"/api/sagas/{saga_id}/sets/{scene_id}/command", dm, json={"name": name, "args": args})  # noqa: E731
    command("order.set", by="initiative")
    command("turn", action="start")  # Thorin (20) first
    assert _live_tokens(api, saga_id, ana)["Thorin"]["movable"] is True
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[1, 0]]) == 200
    command("turn", action="next")  # the spy's turn
    assert _live_tokens(api, saga_id, ana)["Thorin"]["movable"] is False
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[2, 0]]) == 403
    command("turn", action="end")
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[2, 0]]) == 403


def test_a_paused_stage(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), g, town, hero, spy, stage_id, set_id, ids = _scene(api, root)
    _command(api, saga_id, dm, town["id"], "tokens.save", token={"id": ids["Boulder"], "move_by": "players"})
    stage_url = f"/api/sagas/{saga_id}/stages/{stage_id}"
    assert client.patch(stage_url, headers=ana, json={"paused": True}).status_code == 403  # the DM's
    assert api.ok("PATCH", stage_url, dm, json={"paused": True})["paused"] is True
    live = api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]
    assert live["paused"] is True
    assert "movable" not in _live_tokens(api, saga_id, ana)["Boulder"]
    assert _move(client, saga_id, ana, set_id, ids["Boulder"], [[2, 2]]) == 403
    assert client.post(f"/api/sagas/{saga_id}/sets/{set_id}/ping", headers=ana, json={"tile": [1, 1]}).status_code == 403
    assert client.post(f"/api/sagas/{saga_id}/sets/{set_id}/token-drag", headers=ana, json={"token": ids["Boulder"], "tile": [2, 2]}).status_code == 403
    assert client.post(f"/api/sagas/{saga_id}/resources/{hero['id']}/actions/short_rest", headers=ana).status_code == 403
    # The DM keeps every control
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/ping", dm, json={"tile": [1, 1]})
    api.ok("POST", f"/api/sagas/{saga_id}/resources/{hero['id']}/actions/short_rest", dm)
    _command(api, saga_id, dm, town["id"], "tokens.move", id=ids["Boulder"], tile=[4, 1])
    # Resumed: back to normal; another Stage live isn't paused
    assert api.ok("PATCH", stage_url, dm, json={"paused": False})["paused"] is False
    assert _move(client, saga_id, ana, set_id, ids["Boulder"], [[4, 2]]) == 200  # from (4, 1), where the DM put it
    api.ok("POST", f"/api/sagas/{saga_id}/resources/{hero['id']}/actions/short_rest", ana)
    api.ok("PATCH", stage_url, dm, json={"paused": True})
    other = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Elsewhere"})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": other["id"]})
    assert api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]["paused"] is False
    api.ok("POST", f"/api/sagas/{saga_id}/resources/{hero['id']}/actions/short_rest", ana)


def test_sheets_say_what_you_may_change(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), g, town, hero, spy, stage_id, set_id, ids = _scene(api, root)
    sheet = lambda who, rid=hero["id"], **query: api.ok("GET", f"/api/sagas/{saga_id}/resources/{rid}/sheet", who, params=query)  # noqa: E731
    assert set(sheet(dm)["editable"]) == {"level", "hp", "initiative", "hit_dice"}  # counters and numbers
    assert set(sheet(ana)["editable"]) == {"hp", "initiative", "hit_dice"}  # the ruleset: level is the DM's
    assert sheet(bob)["editable"] == [] and sheet(vic)["editable"] == []
    # An instance's own values: the DM's only
    scene = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage_id}/sets", dm, json={"type": "actors_scene"})["sets"]
    scene_id = next(s["id"] for s in scene if s["type"] == "actors_scene")
    goblin = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "type": "minor_npc", "attributes": {"name": "Goblin", "hp": {"current": 7, "max": 7}}})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/sets/{scene_id}/actors", dm, json={"resource_ids": [goblin["id"]]})
    card = next(c for s in stage["sets"] if s["id"] == scene_id for c in s["content"]["cards"])
    assert "hp" in sheet(dm, goblin["id"], set_id=scene_id, actor_id=card["id"])["editable"]
    # Players change what the sheet lets them, through the character (the server checks the ruleset as before)
    api.ok("POST", f"/api/sagas/{saga_id}/resources/{hero['id']}/counter", ana, json={"key": "hp", "current": 12})
    assert client.post(f"/api/sagas/{saga_id}/resources/{hero['id']}/counter", headers=bob, json={"key": "hp", "current": 1}).status_code in (403, 404)


def test_the_dms_player_view(api, client, root):
    """Plan 59: any Stage (live or not) as every player sees it, or as one player; the DM's only."""
    saga_id, dm, (ana_id, ana), (bob_id, bob), _, g, town, hero, spy, stage_id, set_id, ids = _scene(api, root)
    _command(api, saga_id, dm, town["id"], "tokens.save", token={"id": ids["Thorin"], "visibility": {"groups": [], "members": [ana_id]}})
    url = f"/api/sagas/{saga_id}/stages/{stage_id}/as-players"
    names = lambda stage: {t["name"] for s in stage["sets"] for t in s["content"]["map"]["tokens"]}  # noqa: E731
    everyone = api.ok("GET", url, dm)
    assert names(everyone) == {"Boulder"} and "move_by" not in str(everyone)  # not the DM's view
    assert names(api.ok("GET", f"{url}?member_id={ana_id}", dm)) == {"Boulder", "Thorin"}  # hers
    assert client.get(url, headers=ana).status_code == 403
    assert client.get(f"{url}?member_id=999", headers=dm).status_code == 404
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": None})
    assert names(api.ok("GET", url, dm)) == {"Boulder"}  # not live: a preview all the same


def test_tile_costs_and_planned_routes(api, client, root):
    """Plan 59: tiles cost 1, 2 or 3 to move into, or are blocked; a move is a route of touching tiles around them; the
    route being planned is seen live; players get only the costs of tiles they know."""
    saga_id, dm, (ana_id, ana), (bob_id, bob), _, g, town, hero, spy, stage_id, set_id, ids = _scene(api, root)
    _command(api, saga_id, dm, town["id"], "tokens.save", token={"id": ids["Thorin"], "move_by": "owners"})
    url = f"/api/sagas/{saga_id}/locations/{town['id']}/map/command"
    for bad in (11, 1.25, 0.5, "y", True):  # 1 to 10 by halves, or "x"
        assert client.post(url, headers=dm, json={"name": "moves.paint", "args": {"tiles": [[1, 0]], "cost": bad}}).status_code == 400, bad
    assert client.post(url, headers=ana, json={"name": "moves.paint", "args": {"tiles": [[1, 0]], "cost": "x"}}).status_code == 403
    _command(api, saga_id, dm, town["id"], "moves.paint", tiles=[[1, 0], [1, 1]], cost="x")
    data = _command(api, saga_id, dm, town["id"], "moves.paint", tiles=[[2, 2], [3, 3]], cost=2)
    assert data["moves"] == {"1,0": "x", "1,1": "x", "2,2": 2, "3,3": 2}
    data = _command(api, saga_id, dm, town["id"], "moves.paint", tiles=[[3, 3]], cost=1)  # back to the usual
    assert data["moves"] == {"1,0": "x", "1,1": "x", "2,2": 2}
    data = _command(api, saga_id, dm, town["id"], "moves.paint", tiles=[[4, 3]], cost=2.5)  # by halves (plan 60)
    assert data["moves"]["4,3"] == 2.5
    data = _command(api, saga_id, dm, town["id"], "moves.paint", tiles=[[4, 3]], cost=1)
    assert "4,3" not in data["moves"]
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[1, 0], [2, 0]]) == 400  # through a blocked tile
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[0, 1], [1, 2], [2, 1]]) == 200  # around it
    # Players: only the costs of tiles they know
    _command(api, saga_id, dm, town["id"], "fog.set", enabled=True)
    _command(api, saga_id, dm, town["id"], "fog.fill", group_ids=[g["players"]], state="0")
    _command(api, saga_id, dm, town["id"], "fog.paint", group_ids=[g["players"]], state="1", tiles=[[1, 1], [2, 1]])
    moves = lambda who: next(s for s in api.ok("GET", f"/api/sagas/{saga_id}/live", who)["stage"]["sets"])["content"]["map"]["moves"]  # noqa: E731
    assert moves(ana) == {"1,1": "x"} and moves(dm) == {"1,0": "x", "1,1": "x", "2,2": 2}
    # The route being planned: the others who see the token along it see it; nothing is saved
    route = f"/api/sagas/{saga_id}/sets/{set_id}/token-route"
    assert client.post(route, headers=bob, json={"token": ids["Thorin"], "path": [[2, 0]]}).status_code == 403
    token = dm["Authorization"].split(" ", 1)[1]
    with client.websocket_connect(f"/api/sagas/{saga_id}/ws?token={token}") as ws:
        ws.receive_json()
        api.ok("POST", route, ana, json={"token": ids["Thorin"], "path": [[2, 0], [3, 0]]})
        message = ws.receive_json()
        assert (message["type"], message["path"], message["origin"], message["tile"]) == ("token_route", [[2, 0], [3, 0]], [2, 1], [3, 0])
        api.ok("POST", route, ana, json={"token": ids["Thorin"], "path": None})
        assert ws.receive_json()["path"] is None
    assert {t["name"]: t["tile"] for t in _tokens(api, saga_id, dm, town)}["Thorin"] == [2, 1]


def test_a_made_move_goes_along_its_route(api, client, root):
    """Plan 59: a planned move made, the others see the token go along its route, at the Set's speed (1 to 10: at once)."""
    saga_id, dm, (ana_id, ana), _, _, g, town, hero, spy, stage_id, set_id, ids = _scene(api, root)
    _command(api, saga_id, dm, town["id"], "tokens.save", token={"id": ids["Thorin"], "move_by": "owners"})
    set_url = f"/api/sagas/{saga_id}/sets/{set_id}"
    for bad in (0, 11, 2.5, True):
        assert client.patch(set_url, headers=dm, json={"config": {"move_speed": bad}}).status_code == 400, bad
    api.ok("PATCH", set_url, dm, json={"config": {"move_speed": 8}})
    live = api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]
    assert live["sets"][0]["content"]["move_speed"] == 8
    token = dm["Authorization"].split(" ", 1)[1]
    with client.websocket_connect(f"/api/sagas/{saga_id}/ws?token={token}") as ws:
        ws.receive_json()
        assert _move(client, saga_id, ana, set_id, ids["Thorin"], [[1, 0], [2, 1]]) == 200
        message = next(m for m in (ws.receive_json() for _ in range(4)) if m["type"] == "token_route")
        assert (message["moved"], message["origin"], message["path"]) == (True, [0, 0], [[1, 0], [2, 1]])
