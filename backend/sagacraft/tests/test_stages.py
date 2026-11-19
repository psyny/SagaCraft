"""Stages, the Creature panel and what players receive."""
import json

from domain import discrete


def _scene(api, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    pc = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "type": "pc",
        "attributes": {"name": "Thorin", "hp": {"current": 20, "max": 20}, "initiative": 12, "controllers": [ana_id]},
    })
    npc = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "type": "npc",
        "attributes": {"name": "Goblin King", "hp": {"current": 31, "max": 31}, "initiative": 17},
    })
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Ambush"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "creature_panel"})
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
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
    assert len(_live(api, saga_id, ana)["sets"][0]["content"]["cards"]) == 2


def test_players_get_bar_for_pc_and_only_balls_for_npc(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    api.ok("POST", f"/api/sagas/{saga_id}/resources/{npc['id']}/counter", dm, json={"key": "hp", "delta": -20})

    live = _live(api, saga_id, ana)
    by_name = {c["name"]: c for c in live["sets"][0]["content"]["cards"]}
    thorin_hp = next(a for a in by_name["Thorin"]["attributes"] if a["key"] == "hp")
    goblin_hp = next(a for a in by_name["Goblin King"]["attributes"] if a["key"] == "hp")
    assert thorin_hp["style"] == "bar" and thorin_hp["current"] == 20 and thorin_hp["max"] == 20
    assert goblin_hp["style"] == "discrete" and goblin_hp["display_on"] == "card"
    assert set(goblin_hp) == {"key", "label", "type", "style", "display_on", "level", "levels"}
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
    assert hp["style"] == "bar" and hp["player_style"] == "discrete" and hp["player_display_on"] == "card"
    assert hp["current"] == 31 and hp["level"] == 4


def test_hover_and_hidden_values(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    thorin = next(c for c in cards if c["resource_id"] == pc["id"])
    config = thorin["config"]
    for entry in config["attributes"]:
        entry["player"]["display_on"] = "hover" if entry["key"] == "hp" else "hidden"
    api.ok("PATCH", f"/api/sagas/{saga_id}/actors/{thorin['id']}", dm, json={"config": {"attributes": config["attributes"]}})
    card = next(c for c in _live(api, saga_id, ana)["sets"][0]["content"]["cards"] if c["id"] == thorin["id"])
    assert [(a["key"], a["display_on"]) for a in card["attributes"]] == [("hp", "hover")]
    # The DM still gets everything, with how players see it
    dm_card = next(c for c in _live(api, saga_id, dm)["sets"][0]["content"]["cards"] if c["id"] == thorin["id"])
    initiative = next(a for a in dm_card["attributes"] if a["key"] == "initiative")
    assert initiative["display_on"] == "card" and initiative["player_display_on"] == "hidden"


def test_names_per_view_and_dm_hidden(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    goblin_card = next(c for c in cards if c["resource_id"] == npc["id"])
    api.ok("PATCH", f"/api/sagas/{saga_id}/actors/{goblin_card['id']}", dm,
           json={"config": {"player": {"name": "Hooded figure"}, "dm": {"name": "Gob (disguised)", "hidden": True}},
                 "revealed": True})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    live_cards = _live(api, saga_id, ana)["sets"][0]["content"]["cards"]
    assert [c["name"] for c in live_cards] == ["Hooded figure"]
    assert "Goblin" not in json.dumps(live_cards) and "dm_hidden" not in json.dumps(live_cards)
    dm_goblin = next(c for c in _live(api, saga_id, dm)["sets"][0]["content"]["cards"] if c["id"] == goblin_card["id"])
    assert (dm_goblin["name"], dm_goblin["player_name"], dm_goblin["dm_hidden"]) == ("Gob (disguised)", "Hooded figure", True)


def test_old_card_settings_are_converted(api, root):
    from set_types.creature_panel import CreaturePanel
    converted = CreaturePanel().validate_actor_config(None, {}, {
        "picture": "full", "display_name": "Shadow", "hide_name": False,
        "attributes": [{"key": "hp", "mode": "discrete", "dm_mode": None, "audience": None},
                       {"key": "initiative", "mode": "hidden", "dm_mode": "number", "audience": None}],
    })
    assert converted["card_style"] == "full"
    assert converted["player"] == {"name": "Shadow", "hide_name": False}
    assert converted["dm"] == {"name": None, "hide_name": False, "hidden": False}
    assert converted["attributes"] == [
        {"key": "hp", "player": {"style": "discrete", "display_on": "card"}, "dm": {"style": "bar", "display_on": "card"}},
        {"key": "initiative", "player": {"style": "bar", "display_on": "hidden"}, "dm": {"style": "number", "display_on": "card"}},
    ]
    assert not {"display_name", "hide_name", "picture"} & set(converted)


def test_initiative_layout_orders_without_leaking_values(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"order": "initiative"}})
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    live_cards = _live(api, saga_id, ana)["sets"][0]["content"]["cards"]
    assert [c["name"] for c in live_cards] == ["Goblin King", "Thorin"]  # 17 before 12


def test_grab_attention_reaches_members_over_websocket(api, client, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
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
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
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


def test_dm_display_mode_is_separate_from_players(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    thorin = next(c for c in cards if c["resource_id"] == pc["id"])
    config = thorin["config"]
    for entry in config["attributes"]:
        if entry["key"] == "hp":
            entry["dm"]["style"] = "number"
    api.ok("PATCH", f"/api/sagas/{saga_id}/actors/{thorin['id']}", dm, json={"config": config})
    dm_card = next(c for c in _live(api, saga_id, dm)["sets"][0]["content"]["cards"] if c["id"] == thorin["id"])
    ana_card = next(c for c in _live(api, saga_id, ana)["sets"][0]["content"]["cards"] if c["id"] == thorin["id"])
    assert next(a for a in dm_card["attributes"] if a["key"] == "hp")["style"] == "number"
    assert next(a for a in ana_card["attributes"] if a["key"] == "hp")["style"] == "bar"
    assert "player_style" not in json.dumps(ana_card)


def test_shapes_and_old_layouts(api, client, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    stage = api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"shape": "circle"}})
    assert stage["sets"][0]["content"]["shape"] == "circle"
    assert client.patch(f"/api/sagas/{saga_id}/sets/{set_id}", headers=dm,
                        json={"config": {"shape": "spiral"}}).status_code == 400
    # A panel saved with the old single "layout" setting still reads correctly
    from set_types.creature_panel import CreaturePanel
    converted = CreaturePanel().validate_config({}, {"layout": "initiative", "card_size": "l", "picture": "full"})
    assert (converted["shape"], converted["order"], converted["card_style"]) == ("grid", "initiative", "full")
    assert not {"layout", "card_size", "picture"} & set(converted)
    # Spacing: clamped, and rejected when not a number
    stage = api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"spacing": 9999}})
    assert stage["sets"][0]["content"]["spacing"] == 300
    assert client.patch(f"/api/sagas/{saga_id}/sets/{set_id}", headers=dm,
                        json={"config": {"spacing": "wide"}}).status_code == 400


def test_card_style_per_panel_and_per_card(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"card_style": "full"}})
    goblin = next(c for c in cards if c["resource_id"] == npc["id"])
    api.ok("PATCH", f"/api/sagas/{saga_id}/actors/{goblin['id']}", dm, json={"config": {"card_style": "none"}})
    live = _live(api, saga_id, ana)["sets"][0]["content"]
    styles = {c["name"]: c["style"] for c in live["cards"]}
    assert live["card_style"] == "full"
    assert styles == {"Thorin": "full", "Goblin King": "none"}


def test_transparent_sets(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    stage = api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"transparent": True})
    assert stage["sets"][0]["transparent"] is True
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    assert _live(api, saga_id, ana)["sets"][0]["transparent"] is True
    copy = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage_id}/duplicate", dm)
    assert copy["sets"][0]["transparent"] is True
