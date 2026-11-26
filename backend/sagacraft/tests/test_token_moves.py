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


def _move(client, saga_id, who, set_id, token_id, tile):
    return client.post(f"/api/sagas/{saga_id}/sets/{set_id}/act", headers=who,
                       json={"name": "token.move", "args": {"id": token_id, "tile": tile}}).status_code


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
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [1, 0]) == 403
    # Its players; players; anyone (viewers too)
    save(ids["Thorin"], move_by="owners")
    save(ids["Boulder"], move_by="players")
    movable = lambda who: {n: t["movable"] for n, t in _live_tokens(api, saga_id, who).items()}  # noqa: E731
    assert movable(ana) == {"Thorin": True, "Boulder": True}
    assert movable(bob) == {"Thorin": False, "Boulder": True}
    assert movable(vic) == {"Thorin": False, "Boulder": False}
    assert "move_by" not in _live_tokens(api, saga_id, ana)["Thorin"]
    assert _live_tokens(api, saga_id, ana)["Thorin"]["ref"] == hero["id"]  # a character they see: its sheet
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [2, 0]) == 200
    assert _move(client, saga_id, bob, set_id, ids["Thorin"], [3, 0]) == 403
    assert _move(client, saga_id, bob, set_id, ids["Boulder"], [2, 2]) == 200
    assert _move(client, saga_id, vic, set_id, ids["Boulder"], [3, 2]) == 403  # viewers: only "anyone"
    save(ids["Boulder"], move_by="anyone")
    assert movable(vic)["Boulder"] is True
    assert _move(client, saga_id, vic, set_id, ids["Boulder"], [3, 2]) == 200
    assert client.post(f"/api/sagas/{saga_id}/sets/{set_id}/act", headers=vic, json={"name": "roll", "args": {}}).status_code == 403
    assert {t["name"]: t["tile"] for t in _tokens(api, saga_id, dm, town)} == {"Thorin": [2, 0], "Boulder": [3, 2]}
    for bad in ([99, 0], "here"):
        assert _move(client, saga_id, ana, set_id, ids["Thorin"], bad) == 400
    assert _move(client, saga_id, ana, set_id, "token-404", [1, 0]) == 404
    # Their drag shows live to the others; one they can't move: refused
    drag = f"/api/sagas/{saga_id}/sets/{set_id}/token-drag"
    api.ok("POST", drag, ana, json={"token": ids["Thorin"], "tile": [2, 1]})
    assert client.post(drag, headers=bob, json={"token": ids["Thorin"], "tile": [2, 1]}).status_code == 403
    # Under their fog: not theirs to move; and only onto tiles they know
    _command(api, saga_id, dm, town["id"], "fog.set", enabled=True)
    _command(api, saga_id, dm, town["id"], "fog.fill", group_ids=[g["players"]], state="0")
    _command(api, saga_id, dm, town["id"], "fog.paint", group_ids=[g["players"]], state="2", tiles=[[2, 0], [2, 1]])
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [4, 3]) == 400
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [2, 1]) == 200
    assert _move(client, saga_id, bob, set_id, ids["Boulder"], [2, 0]) == 404  # where it is, bob knows nothing
    # Not the live Stage: nobody but the DM
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": None})
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [2, 0]) == 404


def test_on_its_turn(api, client, root):
    saga_id, dm, (ana_id, ana), _, _, g, town, hero, spy, stage_id, set_id, ids = _scene(api, root)
    _command(api, saga_id, dm, town["id"], "tokens.save", token={"id": ids["Thorin"], "move_by": "owners", "move_when": "turn"})
    assert _live_tokens(api, saga_id, ana)["Thorin"]["movable"] is False  # no turns running
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [1, 0]) == 403
    scene = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage_id}/sets", dm, json={"type": "actors_scene"})["sets"]
    scene_id = next(s["id"] for s in scene if s["type"] == "actors_scene")
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{scene_id}/actors", dm, json={"resource_ids": [hero["id"], spy["id"]]})
    command = lambda name, **args: api.ok("POST", f"/api/sagas/{saga_id}/sets/{scene_id}/command", dm, json={"name": name, "args": args})  # noqa: E731
    command("order.set", by="initiative")
    command("turn", action="start")  # Thorin (20) first
    assert _live_tokens(api, saga_id, ana)["Thorin"]["movable"] is True
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [1, 0]) == 200
    command("turn", action="next")  # the spy's turn
    assert _live_tokens(api, saga_id, ana)["Thorin"]["movable"] is False
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [2, 0]) == 403
    command("turn", action="end")
    assert _move(client, saga_id, ana, set_id, ids["Thorin"], [2, 0]) == 403


def test_a_paused_stage(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), g, town, hero, spy, stage_id, set_id, ids = _scene(api, root)
    _command(api, saga_id, dm, town["id"], "tokens.save", token={"id": ids["Boulder"], "move_by": "players"})
    stage_url = f"/api/sagas/{saga_id}/stages/{stage_id}"
    assert client.patch(stage_url, headers=ana, json={"paused": True}).status_code == 403  # the DM's
    assert api.ok("PATCH", stage_url, dm, json={"paused": True})["paused"] is True
    live = api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]
    assert live["paused"] is True
    assert "movable" not in _live_tokens(api, saga_id, ana)["Boulder"]
    assert _move(client, saga_id, ana, set_id, ids["Boulder"], [2, 2]) == 403
    assert client.post(f"/api/sagas/{saga_id}/sets/{set_id}/ping", headers=ana, json={"tile": [1, 1]}).status_code == 403
    assert client.post(f"/api/sagas/{saga_id}/sets/{set_id}/token-drag", headers=ana, json={"token": ids["Boulder"], "tile": [2, 2]}).status_code == 403
    assert client.post(f"/api/sagas/{saga_id}/resources/{hero['id']}/actions/short_rest", headers=ana).status_code == 403
    # The DM keeps every control
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/ping", dm, json={"tile": [1, 1]})
    api.ok("POST", f"/api/sagas/{saga_id}/resources/{hero['id']}/actions/short_rest", dm)
    _command(api, saga_id, dm, town["id"], "tokens.move", id=ids["Boulder"], tile=[4, 1])
    # Resumed: back to normal; another Stage live isn't paused
    assert api.ok("PATCH", stage_url, dm, json={"paused": False})["paused"] is False
    assert _move(client, saga_id, ana, set_id, ids["Boulder"], [2, 2]) == 200
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
