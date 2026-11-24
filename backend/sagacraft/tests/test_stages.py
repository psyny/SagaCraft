"""Stages, the Actors Scene and what players receive."""
import json

from domain import discrete


def _categories(api, saga_id, headers):
    return {c["key"]: c for c in api.ok("GET", f"/api/sagas/{saga_id}/categories", headers)}


def _command(api, saga_id, headers, set_id, command, **args):
    return api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/command", headers, json={"name": command, "args": args})


def _reveal(api, saga_id, headers, set_id, shown=True, tab_id=None):
    return _command(api, saga_id, headers, set_id, "cards.show_all", shown=shown, tab_id=tab_id)


def _scene(api, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    pc = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "type": "pc",
        "attributes": {"name": "Thorin", "hp": {"current": 20, "max": 20}, "initiative": 12, "controllers": [ana_id]},
    })
    npc = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "type": "npc", "instanceable": False,
        "attributes": {"name": "Goblin King", "hp": {"current": 31, "max": 31}, "initiative": 17},
    })
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Ambush"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "actors_scene"})
    set_id = stage["sets"][0]["id"]
    stage = api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm,
                   json={"resource_ids": [pc["id"], npc["id"]]})
    cards = stage["sets"][0]["content"]["cards"]
    return saga_id, dm, ana, stage["id"], set_id, pc, npc, cards


def _live(api, saga_id, headers):
    return api.ok("GET", f"/api/sagas/{saga_id}/live", headers)["stage"]


def test_no_live_stage_means_nothing_to_show(api, root):
    saga_id, dm, ana, *_ = _scene(api, root)
    assert _live(api, saga_id, ana) is None


def test_draft_stages_are_admin_only(api, client, root):
    saga_id, dm, ana, stage_id, *_ = _scene(api, root)
    assert client.get(f"/api/sagas/{saga_id}/stages", headers=ana).status_code == 403
    assert client.get(f"/api/sagas/{saga_id}/stages/{stage_id}", headers=ana).status_code == 403


def test_new_cards_start_hidden_until_revealed(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    assert all(c["hidden"] for c in cards)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    live = _live(api, saga_id, ana)
    assert live["sets"][0]["content"]["cards"] == []
    _reveal(api, saga_id, dm, set_id)
    assert len(_live(api, saga_id, ana)["sets"][0]["content"]["cards"]) == 2


def test_players_get_bar_for_pc_and_only_balls_for_npc(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    api.ok("POST", f"/api/sagas/{saga_id}/resources/{npc['id']}/counter", dm, json={"key": "hp", "delta": -20})

    live = _live(api, saga_id, ana)
    by_name = {c["name"]: c for c in live["sets"][0]["content"]["cards"]}
    thorin_hp = next(a for a in by_name["Thorin"]["attributes"] if a["key"] == "hp")
    goblin_hp = next(a for a in by_name["Goblin King"]["attributes"] if a["key"] == "hp")
    assert thorin_hp["style"] == "bar" and thorin_hp["current"] == 20 and thorin_hp["max"] == 20
    assert goblin_hp["style"] == "discrete" and goblin_hp["region"] == "bottom"
    assert {"level", "levels"} <= set(goblin_hp) and not {"current", "max", "value", "player_style"} & set(goblin_hp)
    # NPC initiative is hidden by default: not even sent
    assert all(a["key"] != "initiative" for a in by_name["Goblin King"]["attributes"])
    # Nothing in the whole payload gives the goblin's real HP (11) or max (31) away
    payload = json.dumps(by_name["Goblin King"])
    assert "31" not in payload and "11" not in payload
    assert "sort_value" not in payload and "real_name" not in payload


def test_admin_sees_real_values_in_discrete_mode(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    stage = api.ok("GET", f"/api/sagas/{saga_id}/stages/{stage_id}", dm)
    goblin = next(c for c in stage["sets"][0]["content"]["cards"] if c["resource_id"] == npc["id"])
    hp = next(a for a in goblin["attributes"] if a["key"] == "hp")
    # The DM sees a bar by default ("how DM sees"), knows players see balls, and gets the real values
    assert hp["style"] == "bar" and hp["player_style"] == "discrete" and hp["player_region"] == "bottom"
    assert hp["current"] == 31 and hp["level"] == 4





def test_initiative_layout_orders_without_leaking_values(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _command(api, saga_id, dm, set_id, "order.set", by="initiative")
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    live_cards = _live(api, saga_id, ana)["sets"][0]["content"]["cards"]
    assert [c["name"] for c in live_cards] == ["Goblin King", "Thorin"]  # 17 before 12


def test_grab_attention_reaches_members_over_websocket(api, client, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    token = ana["Authorization"].split(" ", 1)[1]
    with client.websocket_connect(f"/api/sagas/{saga_id}/ws?token={token}") as ws:
        first = ws.receive_json()
        assert first["type"] == "live_stage" and first["stage"]["id"] == stage_id
        api.ok("POST", f"/api/sagas/{saga_id}/attention", dm, json={"set_id": set_id, "actor_id": cards[1]["id"]})
        message = ws.receive_json()
        assert message == {"type": "attention", "stage_id": stage_id, "set_id": set_id, "actor_id": cards[1]["id"]}


def test_hp_change_pushes_live_stage(api, client, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    token = ana["Authorization"].split(" ", 1)[1]
    with client.websocket_connect(f"/api/sagas/{saga_id}/ws?token={token}") as ws:
        ws.receive_json()
        api.ok("POST", f"/api/sagas/{saga_id}/resources/{pc['id']}/counter", dm, json={"key": "hp", "delta": -8})
        message = ws.receive_json()
        assert message["type"] == "live_stage"
        thorin = next(c for c in message["stage"]["sets"][0]["content"]["cards"] if c["name"] == "Thorin")
        assert next(a for a in thorin["attributes"] if a["key"] == "hp")["current"] == 12


def test_websocket_rejects_non_members(api, client, root):
    saga_id, dm, *_ = _scene(api, root)
    other_saga, other_dm = api.saga(root, "Other", "dm-2")
    token = other_dm["Authorization"].split(" ", 1)[1]
    try:
        with client.websocket_connect(f"/api/sagas/{saga_id}/ws?token={token}") as ws:
            ws.receive_json()
        raise AssertionError("should have been rejected")
    except Exception as exc:  # starlette raises WebSocketDisconnect
        assert "4401" in repr(exc) or "WebSocketDisconnect" in type(exc).__name__


# -- discrete threshold (pure) -------------------------------------------------


def test_discrete_thresholds_are_in_range_and_stable():
    for i in range(200):
        a, b = discrete.thresholds("secret", f"creature-{i}")
        assert 60 <= a <= 90 and 30 <= b <= a - 10
        assert (a, b) == discrete.thresholds("secret", f"creature-{i}")
    assert len({discrete.thresholds("secret", f"c{i}") for i in range(50)}) > 1


def test_discrete_levels():
    a, b = 75, 40
    assert discrete.level(31, 31, a, b) == 4
    assert discrete.level(30, 40, a, b) == 2  # 75% is not above 75
    assert discrete.level(31, 40, a, b) == 3
    assert discrete.level(17, 40, a, b) == 2  # 42.5%
    assert discrete.level(16, 40, a, b) == 1  # 40%
    assert discrete.level(1, 40, a, b) == 1
    assert discrete.level(0, 40, a, b) == 0
    assert discrete.level(-3, 40, a, b) == 0



def test_tab_layouts_are_validated(api, client, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    stage = _command(api, saga_id, dm, set_id, "tab.set", changes={"shape": "circle", "flow": "rotate", "spacing": 9999})
    tab = stage["sets"][0]["content"]["tab"]
    assert (tab["shape"], tab["flow"], tab["spacing"]) == ("circle", "rotate", 300)
    stage = _command(api, saga_id, dm, set_id, "tab.set", changes={
        "shape": "boundary", "spacing_y": 30, "margin_top": 60, "neutral": 200, "scatter": 25})
    tab = stage["sets"][0]["content"]["tab"]
    assert (tab["spacing_y"], tab["margin_top"], tab["neutral"], tab["scatter"]) == (30, 60, 80, 25)
    url = f"/api/sagas/{saga_id}/sets/{set_id}/command"
    assert client.post(url, headers=dm, json={"name": "tab.set", "args": {"changes": {"shape": "spiral"}}}).status_code == 400
    assert client.post(url, headers=dm, json={"name": "tab.set", "args": {"changes": {"spacing": "wide"}}}).status_code == 400
    assert client.post(url, headers=dm, json={"name": "tab.set", "args": {"changes": {"scatter": "lots"}}}).status_code == 400
    assert client.post(url, headers=dm, json={"name": "order.set", "args": {"by": "hp"}}).status_code == 400
    assert client.post(url, headers=dm, json={"name": "explode", "args": {}}).status_code == 400
    # Tab settings don't go through the Set's config
    assert client.patch(f"/api/sagas/{saga_id}/sets/{set_id}", headers=dm, json={"config": {"shape": "row"}}).status_code == 400
    assert client.post(url, headers=ana, json={"name": "tab.switch", "args": {"tab_id": 2}}).status_code == 403


def test_card_style_is_the_panels(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"card_style": "full"}})
    live = _live(api, saga_id, ana)["sets"][0]["content"]
    assert live["card_style"] == "full"
    assert {c["style"] for c in live["cards"]} == {"full"}


def test_transparent_sets(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    stage = api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"transparent": True})
    assert stage["sets"][0]["transparent"] is True
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    assert _live(api, saga_id, ana)["sets"][0]["transparent"] is True
    copy = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage_id}/duplicate", dm)
    assert copy["sets"][0]["transparent"] is True
