"""Stages, the Actors Scene and what players receive."""
import json

from domain import discrete


# Before plan 40 characters had categories; they're their types now. Tests still name DnD Lite's by those keys.
_OLD_KEYS = {"pc": "player", "npc": "major_npc", "minor_npc": "minor_npc"}


def _categories(api, saga_id, headers):
    """The character types, by their old category keys (player, major_npc, minor_npc): {"id": the type's key, ...}."""
    types = api.ok("GET", f"/api/sagas/{saga_id}/ruleset", headers)["kinds"]["character"]["types"]
    return {_OLD_KEYS.get(k, k): {"id": k, "key": k, "type": k, **t} for k, t in types.items()}


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


def test_precise_icons_are_even_shares():
    # The draft's example: range 100, 4 icons, each 25; an icon goes when its share is lost
    points = discrete.breakpoints(0, 100, 4, "precise", "secret", "x")
    assert points == [25, 50, 75]
    assert [discrete.level(v, 0, 100, points) for v in (100, 80, 76, 75, 51, 50, 26, 25, 1, 0, -3)] == [4, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0]
    assert discrete.level(130, 0, 100, points) == 4  # above the max
    # Its own min: the range is min to max
    assert discrete.breakpoints(-10, 30, 4, "precise", "s", "x") == [0, 10, 20]
    assert discrete.level_for(-10, -10, 30, 4, "precise", "s", "x") == 0 and discrete.level_for(1, -10, 30, 4, "precise", "s", "x") == 2
    # One icon: shown above the min; ten: tenths
    assert discrete.level_for(1, 0, 10, 1, "precise", "s", "x") == 1 and discrete.level_for(0, 0, 10, 1, "precise", "s", "x") == 0
    assert discrete.level_for(7, 0, 10, 10, "precise", "s", "x") == 7
    assert discrete.level_for(5, 5, 5, 4, "precise", "s", "x") == 0 and discrete.level_for(6, 5, 5, 4, "precise", "s", "x") == 4


def test_full_variant_moves_each_point_up_to_k_seeded_per_creature():
    seen = set()
    for i in range(200):
        points = discrete.breakpoints(0, 100, 4, "full_variant", "secret", f"creature-{i}")
        assert all(abs(p - even) <= 10 and p == int(p) for p, even in zip(points, (25, 50, 75)))  # K = int(0.4 * 100 / 4)
        assert points == sorted(points) and 0 < points[0] and points[-1] < 100
        assert points == discrete.breakpoints(0, 100, 4, "full_variant", "secret", f"creature-{i}")  # stable
        seen.add(tuple(points))
    assert len(seen) > 100  # different between creatures
    # K = 0 (a small range): even points
    assert discrete.breakpoints(0, 5, 4, "full_variant", "secret", "c") == [1.25, 2.5, 3.75]


def test_soft_variant_keeps_the_half_point():
    middles, others = set(), set()
    for i in range(100):
        points = discrete.breakpoints(0, 100, 4, "soft_variant", "secret", f"c{i}")
        middles.add(points[1])
        others.add(points[0])
        assert abs(points[0] - 25) <= 10 and abs(points[2] - 75) <= 10
    assert middles == {50} and len(others) > 1
    six = discrete.breakpoints(0, 60, 6, "soft_variant", "secret", "c1")
    assert six[2] == 30 and len(six) == 5
    # An odd number of icons has no half point: like Full variant
    assert discrete.breakpoints(0, 90, 3, "soft_variant", "secret", "c1") == discrete.breakpoints(0, 90, 3, "full_variant", "secret", "c1")


def test_percent_from_min_to_max():
    assert [discrete.percent(v, 0, 100) for v in (100, 74.6, 50, 0)] == [100, 75, 50, 0]
    assert discrete.percent(1, 0, 300) == 1 and discrete.percent(299, 0, 300) == 99  # never 0 above the min nor 100 below the max
    assert discrete.percent(0, -10, 30) == 25 and discrete.percent(40, 0, 30) == 100 and discrete.percent(-5, 0, 30) == 0
    assert discrete.percent(3, 3, 3) == 100 and discrete.percent(2, 3, 3) == 0


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
    # Plan 38: any number, counter or calculated variable orders a tab; not a text
    assert client.post(url, headers=dm, json={"name": "order.set", "args": {"by": "hp"}}).status_code == 200
    assert client.post(url, headers=dm, json={"name": "order.set", "args": {"by": "name"}}).status_code == 400
    assert client.post(url, headers=dm, json={"name": "explode", "args": {}}).status_code == 400
    # Tab settings don't go through the Set's config
    assert client.patch(f"/api/sagas/{saga_id}/sets/{set_id}", headers=dm, json={"config": {"shape": "row"}}).status_code == 400
    assert client.post(url, headers=ana, json={"name": "tab.switch", "args": {"tab_id": 2}}).status_code == 403


def test_card_style_is_the_panels(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    _command(api, saga_id, dm, set_id, "tab.set", changes={"card_style": "full"})  # the active tab's
    live = _live(api, saga_id, ana)["sets"][0]["content"]
    assert live["tab"]["card_style"] == "full"
    assert {c["style"] for c in live["cards"]} == {"full"}


def test_transparent_sets(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    stage = api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"transparent": True})
    assert stage["sets"][0]["transparent"] is True
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    assert _live(api, saga_id, ana)["sets"][0]["transparent"] is True
    copy = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage_id}/duplicate", dm)
    assert copy["sets"][0]["transparent"] is True
