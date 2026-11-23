"""Plan 21: mobile tokens on maps, grab attention on the DM's view, pings."""
from tests.test_locations import _command, _location, _map_set
from tests.test_uploads import picture, upload


def _setup(api, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    bob_id, bob = api.member(saga_id, dm, "bob")
    vic_id, vic = api.member(saga_id, dm, "vic", role="viewer")
    groups = {g["key"]: g["id"] for g in api.ok("GET", f"/api/sagas/{saga_id}", dm)["groups"] if g["key"]}
    town = _location(api, saga_id, dm, "Town", shared=[groups["players"]])
    _command(api, saga_id, dm, town["id"], "grid.set", changes={"type": "square", "cols": 6, "rows": 4})
    return saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), groups, town


def _tokens(api, saga_id, who, town):
    return api.ok("GET", f"/api/sagas/{saga_id}/locations/{town['id']}/map", who)["tokens"]


def test_tokens_on_a_map(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), _, g, town = _setup(api, root)
    url = f"/api/sagas/{saga_id}/resources"
    shared = {"groups": [g["players"]], "members": []}
    hero = api.ok("POST", url, dm, json={"kind": "character", "type": "pc", "visibility": shared,
                                         "attributes": {"name": "Thorin", "controllers": [ana_id]}})
    spy = api.ok("POST", url, dm, json={"kind": "character", "type": "npc", "attributes": {"name": "Spy"}})
    party = api.ok("POST", f"/api/sagas/{saga_id}/character-groups", dm, json={"name": "Raiders", "color": "#e2604f"})
    pic = upload(client, saga_id, dm, picture(200, 200), category="token").json()
    version = api.ok("GET", f"/api/sagas/{saga_id}/locations/{town['id']}/map", dm)["version"]
    for token in ({"kind": "character", "ref": hero["id"], "tile": [1, 1]}, {"kind": "character", "ref": spy["id"], "tile": [2, 1]},
                  {"kind": "group", "ref": party["id"], "tile": [3, 1], "size": 2},
                  {"kind": "custom", "name": "Boulder", "file_id": pic["id"], "tile": [4, 1]}):
        _command(api, saga_id, dm, town["id"], "tokens.save", token=token)
    mine = {t["kind"] + str(t["tile"][0]): t for t in _tokens(api, saga_id, ana, town)}
    assert mine["character1"]["name"] == "Thorin" and mine["character1"]["color"].startswith("#") and mine["character1"]["color"] != "#000000"
    assert mine["character2"]["name"] is None and mine["character2"]["color"] == "#000000"  # a hidden character: "?"
    assert (mine["group3"]["name"], mine["group3"]["color"], mine["group3"]["size"]) == ("Raiders", "#e2604f", 2)
    assert mine["custom4"]["name"] == "Boulder" and mine["custom4"]["icon"]["url"].startswith("/api/files/")
    assert "visibility" not in mine["custom4"]
    # Moving doesn't redraw the players' picture (the map's version stays)
    boulder = next(t for t in _tokens(api, saga_id, dm, town) if t["kind"] == "custom")
    _command(api, saga_id, dm, town["id"], "tokens.move", id=boulder["id"], tile=[5, 3])
    after = api.ok("GET", f"/api/sagas/{saga_id}/locations/{town['id']}/map", dm)
    assert after["version"] == version  # token commands (saves and moves) keep it
    assert next(t for t in after["tokens"] if t["id"] == boulder["id"])["tile"] == [5, 3]
    # Refused: off the grid, a size of 11, another kind's resource, a picture that isn't a token's, players
    cmd = f"/api/sagas/{saga_id}/locations/{town['id']}/map/command"
    other = upload(client, saga_id, dm, picture(200, 200), category="item").json()
    for bad in ({"kind": "character", "ref": hero["id"], "tile": [9, 9]}, {"kind": "character", "ref": hero["id"], "tile": [0, 0], "size": 11},
                {"kind": "item", "ref": hero["id"], "tile": [0, 0]}, {"kind": "custom", "name": "X", "file_id": other["id"], "tile": [0, 0]},
                {"kind": "dragon", "ref": 1, "tile": [0, 0]}):
        assert client.post(cmd, headers=dm, json={"name": "tokens.save", "args": {"token": bad}}).status_code == 400, bad
    assert client.post(cmd, headers=ana, json={"name": "tokens.move", "args": {"id": boulder["id"], "tile": [0, 0]}}).status_code == 403
    # Hidden by the fog, or by its own who can see
    _command(api, saga_id, dm, town["id"], "fog.set", enabled=True)
    _command(api, saga_id, dm, town["id"], "fog.fill", group_ids=[g["players"]], state="2")
    _command(api, saga_id, dm, town["id"], "fog.paint", group_ids=[g["players"]], state="0", tiles=[[1, 1]])
    assert "character1" not in {t["kind"] + str(t["tile"][0]) for t in _tokens(api, saga_id, ana, town)}
    _command(api, saga_id, dm, town["id"], "tokens.save", token={"id": boulder["id"], "visibility": {"groups": [], "members": [bob_id]}})
    assert boulder["id"] not in {t["id"] for t in _tokens(api, saga_id, ana, town)}
    assert boulder["id"] in {t["id"] for t in _tokens(api, saga_id, bob, town)}
    # A custom token's picture goes with it
    _command(api, saga_id, dm, town["id"], "tokens.delete", id=boulder["id"])
    assert client.get(pic["url"]).status_code == 404


def test_grab_attention_on_the_view_and_pings(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), g, town = _setup(api, root)
    stage_id, set_id = _map_set(api, saga_id, dm)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"resource_ids": [town["id"]]})
    ping = f"/api/sagas/{saga_id}/sets/{set_id}/ping"
    assert client.post(ping, headers=ana, json={"tile": [1, 1]}).status_code == 404  # not live yet
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    attention = f"/api/sagas/{saga_id}/attention"
    for bad in ({"k": 20, "cx": 0.5, "cy": 0.5}, {"k": 2, "cx": 2, "cy": 0.5}, {"k": 2}):
        assert client.post(attention, headers=dm, json={"set_id": set_id, "target": {"view": bad}}).status_code == 400
    token = ana["Authorization"].split(" ", 1)[1]
    with client.websocket_connect(f"/api/sagas/{saga_id}/ws?token={token}") as ws:
        ws.receive_json()
        api.ok("POST", attention, dm, json={"set_id": set_id, "target": {"view": {"k": 2.5, "cx": 0.25, "cy": 0.75}}})
        assert ws.receive_json()["target"] == {"location_id": town["id"], "view": {"k": 2.5, "cx": 0.25, "cy": 0.75}}
        # Pings: to whoever sees the Set, with the pinger's name and colour
        api.ok("POST", ping, bob, json={"tile": [2, 3]})
        message = ws.receive_json()
        assert (message["type"], message["tile"], message["name"], message["location_id"]) == ("ping", [2, 3], "Bob", town["id"])
        assert message["color"].startswith("#") and "set_visibility" not in message
    assert client.post(ping, headers=bob, json={"tile": [2, 2]}).status_code == 400  # one at a time
    assert client.post(ping, headers=vic, json={"tile": [1, 1]}).status_code == 403  # viewers don't ping
    assert client.post(ping, headers=dm, json={"tile": [99, 1]}).status_code == 400
    api.ok("POST", ping, dm, json={"tile": [0, 0]})
