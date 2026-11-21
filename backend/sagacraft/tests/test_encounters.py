"""Categories, groups, instanceable characters and the Actors Scene's tabs, order and turns."""
import json

from tests.test_stages import _categories, _command, _live, _reveal


def _saga(api, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    return saga_id, dm, ana_id, ana


def _character(api, saga_id, dm, category_id, name, hp=10, initiative=0, **extra):
    return api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "category_id": category_id,
        "attributes": {"name": name, "hp": {"current": hp, "max": hp}, "initiative": initiative}, **extra,
    })


def _groups(api, saga_id, dm):
    return {g["name"]: g for g in api.ok("GET", f"/api/sagas/{saga_id}/character-groups", dm)}


def _new_scene(api, saga_id, dm):
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Bridge"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "actors_scene"})
    return stage["id"], stage["sets"][0]["id"]


def _content(api, saga_id, dm, stage_id):
    return api.ok("GET", f"/api/sagas/{saga_id}/stages/{stage_id}", dm)["sets"][0]["content"]


def _tab(content, name):
    return next(t for t in content["tabs"] if t["name"] == name)


# -- Saga template, categories, groups ----------------------------------------


def test_saga_template_defaults_are_applied_once(api, client, root):
    saga_id, dm, ana_id, ana = _saga(api, root)
    categories = _categories(api, saga_id, dm)
    assert {k: (c["type"], c["player"], c["instanceable"]) for k, c in categories.items()} == {
        "player": ("pc", True, False), "major_npc": ("npc", False, False), "minor_npc": ("npc", False, True)}
    groups = _groups(api, saga_id, dm)
    assert list(groups) == ["Player Party"]
    party = groups["Player Party"]
    assert (party["player_party"], party["active"], party["favorite"], party["color"]) == (True, True, True, "#6cc9e0")
    # Deleted defaults stay deleted
    api.ok("DELETE", f"/api/sagas/{saga_id}/character-groups/{party['id']}", dm)
    assert _groups(api, saga_id, dm) == {}
    # Players see the categories (the Characters tab's sections) but never the groups
    assert set(_categories(api, saga_id, ana)) == {"player", "major_npc", "minor_npc"}
    assert client.get(f"/api/sagas/{saga_id}/character-groups", headers=ana).status_code == 403


def test_category_picks_the_type_and_player_characters_join_the_party(api, client, root):
    saga_id, dm, ana_id, ana = _saga(api, root)
    categories = _categories(api, saga_id, dm)
    thorin = _character(api, saga_id, dm, categories["player"]["id"], "Thorin", controllers=None)
    goblin = _character(api, saga_id, dm, categories["minor_npc"]["id"], "Goblin")
    assert (thorin["type"], thorin["instanceable"]) == ("pc", False)
    assert (goblin["type"], goblin["instanceable"]) == ("npc", True)  # the category's default
    party = _groups(api, saga_id, dm)["Player Party"]
    assert thorin["group_ids"] == [party["id"]] and goblin["group_ids"] == []
    # Player characters are never instanceable
    assert api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm, json={"instanceable": True})["instanceable"] is False
    # Moving to a category of another type is refused; same type is fine
    url = f"/api/sagas/{saga_id}/resources/{thorin['id']}"
    assert client.patch(url, headers=dm, json={"category_id": categories["minor_npc"]["id"]}).status_code == 400
    guest = api.ok("POST", f"/api/sagas/{saga_id}/categories", dm, json={"name": "Guest", "plural": "Guests", "type": "pc"})
    moved = api.ok("PATCH", url, dm, json={"category_id": guest["id"]})
    assert moved["category_id"] == guest["id"]
    # A category in use can't be deleted; an unused one can
    assert client.delete(f"/api/sagas/{saga_id}/categories/{guest['id']}", headers=dm).status_code == 400
    boss = api.ok("POST", f"/api/sagas/{saga_id}/categories", dm,
                  json={"name": "Boss", "plural": "Bosses", "type": "npc", "instanceable": False})
    assert boss["type"] == "npc"
    api.ok("DELETE", f"/api/sagas/{saga_id}/categories/{boss['id']}", dm)
    # Players see the category, not the DM's flags on the character
    seen = api.ok("GET", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm)
    assert "group_ids" in seen
    api.ok("PATCH", url, dm, json={"visibility": {"groups": [], "members": [ana_id]}})
    as_player = api.ok("GET", url, ana)
    assert "instanceable" not in as_player and "group_ids" not in as_player and as_player["category_id"]


def test_groups_hold_counts_only_for_instanceable_characters(api, client, root):
    saga_id, dm, *_ = _saga(api, root)
    categories = _categories(api, saga_id, dm)
    thorin = _character(api, saga_id, dm, categories["player"]["id"], "Thorin")
    goblin = _character(api, saga_id, dm, categories["minor_npc"]["id"], "Goblin")
    group = api.ok("POST", f"/api/sagas/{saga_id}/character-groups", dm, json={
        "name": "Ambush", "favorite": True,
        "members": [{"resource_id": goblin["id"], "count": 3}, {"resource_id": thorin["id"], "count": 4}]})
    assert group["members"] == [{"resource_id": goblin["id"], "count": 3}, {"resource_id": thorin["id"], "count": 1}]
    assert client.post(f"/api/sagas/{saga_id}/character-groups", headers=dm,
                       json={"name": "Bad", "members": [{"resource_id": 999}]}).status_code == 400
    renamed = api.ok("PATCH", f"/api/sagas/{saga_id}/character-groups/{group['id']}", dm, json={"name": "Bridge ambush", "active": True})
    assert (renamed["name"], renamed["active"]) == ("Bridge ambush", True)
    # Favorites first
    plain = api.ok("POST", f"/api/sagas/{saga_id}/character-groups", dm, json={"name": "Aaa town"})
    assert list(_groups(api, saga_id, dm)) == ["Player Party", "Bridge ambush", plain["name"]]


# -- Actors Scene: groups, instances, tabs ------------------------------------


def _encounter(api, root):
    saga_id, dm, ana_id, ana = _saga(api, root)
    categories = _categories(api, saga_id, dm)
    thorin = _character(api, saga_id, dm, categories["player"]["id"], "Thorin", hp=20, initiative=12)
    goblin = _character(api, saga_id, dm, categories["minor_npc"]["id"], "Goblin", hp=7, initiative=0)
    ambush = api.ok("POST", f"/api/sagas/{saga_id}/character-groups", dm,
                    json={"name": "Ambush", "color": "#e2604f", "members": [{"resource_id": goblin["id"], "count": 2}]})
    party = _groups(api, saga_id, dm)["Player Party"]
    stage_id, set_id = _new_scene(api, saga_id, dm)
    return saga_id, dm, ana, thorin, goblin, party, ambush, stage_id, set_id


def test_new_scene_has_three_tabs_with_combat_by_initiative(api, root):
    saga_id, dm, ana, thorin, goblin, party, ambush, stage_id, set_id = _encounter(api, root)
    content = _content(api, saga_id, dm, stage_id)
    assert [t["name"] for t in content["tabs"]] == ["Exploration", "Dialog", "Combat"]
    combat = _tab(content, "Combat")
    assert (combat["shape"], combat["order_by"], combat["turn_controls"]) == ("bar", "initiative", True)
    assert _tab(content, "Dialog")["shape"] == "boundary"
    assert content["active_tab"] == _tab(content, "Exploration")["id"]


def test_adding_groups_puts_instances_in_the_scene(api, root):
    """Every tab has the scene's creatures; "Add and reveal" reveals them only in the tab they're added from."""
    saga_id, dm, ana, thorin, goblin, party, ambush, stage_id, set_id = _encounter(api, root)
    content = _content(api, saga_id, dm, stage_id)
    combat, exploration = _tab(content, "Combat")["id"], _tab(content, "Exploration")["id"]
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm,
           json={"group_ids": [party["id"], ambush["id"]], "tab_id": combat, "hidden": False})
    # Adding the groups again: the party is already there, the goblins come as new instances
    stage = api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm,
                   json={"group_ids": [party["id"], ambush["id"]], "tab_id": combat, "hidden": False})
    content = stage["sets"][0]["content"]
    names = sorted(c["real_name"] for c in content["cards"])
    assert names == ["Goblin 1", "Goblin 2", "Goblin 3", "Goblin 4", "Thorin"]
    tab_ids = {str(t["id"]) for t in content["tabs"]}  # JSON keys
    assert all(set(c["tabs"]) == tab_ids for c in content["cards"])
    assert all(c["tabs"][str(combat)]["shown"] and not c["tabs"][str(exploration)]["shown"] for c in content["cards"])
    assert len(_tab(content, "Exploration")["card_ids"]) == 5
    assert all(c["hidden"] for c in content["cards"])  # the active tab (Exploration): hidden
    # Each card has its group's color: the group it came with
    colors = {c["real_name"]: c["color"] for c in content["cards"]}
    assert colors["Thorin"] == party["color"] and colors["Goblin 1"] == "#e2604f"
    assert {c["group"]["name"] for c in content["cards"] if c["instance"]} == {"Ambush"}


def test_instances_keep_their_own_values(api, client, root):
    saga_id, dm, ana, thorin, goblin, party, ambush, stage_id, set_id = _encounter(api, root)
    stage = api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm,
                   json={"group_ids": [party["id"], ambush["id"]]})
    cards = {c["real_name"]: c for c in stage["sets"][0]["content"]["cards"]}
    api.ok("POST", f"/api/sagas/{saga_id}/actors/{cards['Goblin 1']['id']}/counter", dm, json={"key": "hp", "delta": -7})
    stage = api.ok("PATCH", f"/api/sagas/{saga_id}/actors/{cards['Goblin 2']['id']}/values", dm, json={"attributes": {"initiative": 15}})
    cards = {c["real_name"]: c for c in stage["sets"][0]["content"]["cards"]}
    hp = lambda card: next(a for a in card["attributes"] if a["key"] == "hp")["current"]  # noqa: E731
    assert hp(cards["Goblin 1"]) == 0 and cards["Goblin 1"]["defeated"] is True
    assert hp(cards["Goblin 2"]) == 7 and cards["Goblin 2"]["sort_values"]["initiative"] == 15
    # The character itself didn't change
    assert api.ok("GET", f"/api/sagas/{saga_id}/resources/{goblin['id']}", dm)["attributes"]["hp"]["current"] == 7
    # An instance keeps its character's name
    assert client.patch(f"/api/sagas/{saga_id}/actors/{cards['Goblin 2']['id']}/values", headers=dm,
                        json={"attributes": {"name": "Bob"}}).status_code == 400
    # A non-instance card changes the character everywhere
    api.ok("POST", f"/api/sagas/{saga_id}/actors/{cards['Thorin']['id']}/counter", dm, json={"key": "hp", "delta": -5})
    assert api.ok("GET", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm)["attributes"]["hp"]["current"] == 15
    # The instance's sheet shows its own values and number
    sheet = api.ok("GET", f"/api/sagas/{saga_id}/resources/{goblin['id']}/sheet?set_id={set_id}&actor_id={cards['Goblin 1']['id']}", dm)
    assert sheet["real_name"] == "Goblin 1" and sheet["instance"] == 1


def test_players_see_only_the_active_tab(api, root):
    saga_id, dm, ana, thorin, goblin, party, ambush, stage_id, set_id = _encounter(api, root)
    content = _content(api, saga_id, dm, stage_id)
    exploration, combat = _tab(content, "Exploration")["id"], _tab(content, "Combat")["id"]
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"group_ids": [party["id"]], "tab_id": exploration, "hidden": False})
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"group_ids": [party["id"], ambush["id"]], "tab_id": combat})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    live = _live(api, saga_id, ana)["sets"][0]["content"]
    assert [c["name"] for c in live["cards"]] == ["Thorin"]
    assert "tabs" not in live and "config" not in live and live["tab"]["name"] == "Exploration"
    # Thorin is the same card in both tabs, hidden in Combat until revealed there
    _command(api, saga_id, dm, set_id, "tab.switch", tab_id=combat)
    assert _live(api, saga_id, ana)["sets"][0]["content"]["cards"] == []
    _reveal(api, saga_id, dm, set_id)
    live = _live(api, saga_id, ana)["sets"][0]["content"]
    assert sorted(c["name"] for c in live["cards"]) == ["Goblin 1", "Goblin 2", "Thorin"]
    payload = json.dumps(live)
    assert "sort_value" not in payload and "real_name" not in payload and "Exploration" not in payload


def test_tabs_add_rename_move_delete(api, client, root):
    saga_id, dm, ana, thorin, goblin, party, ambush, stage_id, set_id = _encounter(api, root)
    content = _content(api, saga_id, dm, stage_id)
    combat = _tab(content, "Combat")["id"]
    stage = api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"group_ids": [ambush["id"]], "tab_id": combat})
    _command(api, saga_id, dm, set_id, "tab.add", name="Chase")
    _command(api, saga_id, dm, set_id, "tab.rename", tab_id=combat, name="Fight")
    content = _command(api, saga_id, dm, set_id, "tab.move", tab_id=combat, to=0)["sets"][0]["content"]
    assert [t["name"] for t in content["tabs"]] == ["Fight", "Exploration", "Dialog", "Chase"]
    # Deleting a tab keeps the scene's creatures
    content = _command(api, saga_id, dm, set_id, "tab.delete", tab_id=combat)["sets"][0]["content"]
    assert len(content["cards"]) == 2 and len(content["tabs"]) == 3
    for tab in content["tabs"][:-1]:
        _command(api, saga_id, dm, set_id, "tab.delete", tab_id=tab["id"])
    last = _content(api, saga_id, dm, stage_id)["tabs"][0]["id"]
    assert client.post(f"/api/sagas/{saga_id}/sets/{set_id}/command", headers=dm,
                       json={"name": "tab.delete", "args": {"tab_id": last}}).status_code == 400


def test_cards_are_shown_per_tab(api, client, root):
    saga_id, dm, ana, thorin, goblin, party, ambush, stage_id, set_id = _encounter(api, root)
    content = _content(api, saga_id, dm, stage_id)
    exploration, dialog = _tab(content, "Exploration")["id"], _tab(content, "Dialog")["id"]
    stage = api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"resource_ids": [thorin["id"]]})
    card = stage["sets"][0]["content"]["cards"][0]
    content = _command(api, saga_id, dm, set_id, "card.show", actor_id=card["id"], tab_id=dialog)["sets"][0]["content"]
    tabs = content["cards"][0]["tabs"]
    assert tabs[str(dialog)]["shown"] and not tabs[str(exploration)]["shown"]
    # Adding it again (non-instanceable) and revealing it in Exploration: the same card
    stage = api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm,
                   json={"resource_ids": [thorin["id"]], "tab_id": exploration, "hidden": False})
    cards = stage["sets"][0]["content"]["cards"]
    assert len(cards) == 1 and cards[0]["tabs"][str(exploration)]["shown"]
    # Taking cards out of a tab is gone: hide them there, or remove them from the scene
    assert client.post(f"/api/sagas/{saga_id}/sets/{set_id}/command", headers=dm,
                       json={"name": "card.tabs", "args": {"actor_id": card["id"], "tab_id": dialog}}).status_code == 400
    api.ok("DELETE", f"/api/sagas/{saga_id}/actors/{card['id']}", dm)
    assert _content(api, saga_id, dm, stage_id)["cards"] == []


# -- order and turns ----------------------------------------------------------


def _combat(api, root):
    saga_id, dm, ana, thorin, goblin, party, ambush, stage_id, set_id = _encounter(api, root)
    combat = _tab(_content(api, saga_id, dm, stage_id), "Combat")["id"]
    _command(api, saga_id, dm, set_id, "tab.switch", tab_id=combat)
    stage = api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"group_ids": [party["id"], ambush["id"]]})
    cards = {c["real_name"]: c["id"] for c in stage["sets"][0]["content"]["cards"]}
    for name, value in (("Goblin 1", 18), ("Goblin 2", 5)):
        api.ok("PATCH", f"/api/sagas/{saga_id}/actors/{cards[name]}/values", dm, json={"attributes": {"initiative": value}})
    _reveal(api, saga_id, dm, set_id)
    return saga_id, dm, ana, stage_id, set_id, combat, cards


def test_order_by_initiative_then_custom(api, root):
    saga_id, dm, ana, stage_id, set_id, combat, cards = _combat(api, root)
    tab = _tab(_content(api, saga_id, dm, stage_id), "Combat")
    assert tab["card_ids"] == [cards["Goblin 1"], cards["Thorin"], cards["Goblin 2"]]  # 18, 12, 5
    # Moving a card keeps what the DM sees and switches to custom
    content = _command(api, saga_id, dm, set_id, "order.move", actor_id=cards["Goblin 2"], by=-1)["sets"][0]["content"]
    tab = _tab(content, "Combat")
    assert tab["order_by"] == "custom"
    assert tab["card_ids"] == [cards["Goblin 1"], cards["Goblin 2"], cards["Thorin"]]
    content = _command(api, saga_id, dm, set_id, "order.set", by="initiative")["sets"][0]["content"]
    assert _tab(content, "Combat")["card_ids"][0] == cards["Goblin 1"]


def test_turns_start_next_previous_and_skip_defeated(api, root):
    saga_id, dm, ana, stage_id, set_id, combat, cards = _combat(api, root)
    turn = lambda stage: stage["sets"][0]["content"]["tab"]["turn"]  # noqa: E731
    assert turn(_command(api, saga_id, dm, set_id, "turn", action="start")) == {"actor_id": cards["Goblin 1"], "round": 1}
    assert turn(_command(api, saga_id, dm, set_id, "turn", action="next"))["actor_id"] == cards["Thorin"]
    # Goblin 2 goes down: next skips it and starts round 2
    api.ok("POST", f"/api/sagas/{saga_id}/actors/{cards['Goblin 2']}/counter", dm, json={"key": "hp", "current": 0})
    assert turn(_command(api, saga_id, dm, set_id, "turn", action="next")) == {"actor_id": cards["Goblin 1"], "round": 2}
    assert turn(_command(api, saga_id, dm, set_id, "turn", action="previous")) == {"actor_id": cards["Thorin"], "round": 1}
    # Players see the turn, without initiative values
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    live = _live(api, saga_id, ana)["sets"][0]["content"]
    assert live["tab"]["turn"]["actor_id"] == cards["Thorin"]
    assert "sort_values" not in json.dumps(live)
    # A hidden creature's turn isn't shown to players
    _command(api, saga_id, dm, set_id, "card.show", actor_id=cards["Thorin"], shown=False)
    assert _live(api, saga_id, ana)["sets"][0]["content"]["tab"]["turn"]["actor_id"] is None
    assert turn(_command(api, saga_id, dm, set_id, "turn", action="end")) == {"actor_id": None, "round": 0}


def test_rotate_flow_puts_the_current_creature_first(api, root):
    saga_id, dm, ana, stage_id, set_id, combat, cards = _combat(api, root)
    _command(api, saga_id, dm, set_id, "tab.set", changes={"shape": "circle", "flow": "rotate"})
    _command(api, saga_id, dm, set_id, "turn", action="start")
    stage = _command(api, saga_id, dm, set_id, "turn", action="next")
    assert stage["sets"][0]["content"]["tab"]["card_ids"] == [cards["Thorin"], cards["Goblin 2"], cards["Goblin 1"]]


def test_duplicate_stage_remaps_turns_and_order(api, root):
    saga_id, dm, ana, stage_id, set_id, combat, cards = _combat(api, root)
    _command(api, saga_id, dm, set_id, "order.move", actor_id=cards["Goblin 2"], by=-2)
    _command(api, saga_id, dm, set_id, "turn", action="start")
    copy = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage_id}/duplicate", dm)
    content = copy["sets"][0]["content"]
    new_ids = {c["id"] for c in content["cards"]}
    tab = _tab(content, "Combat")
    assert set(tab["card_ids"]) == new_ids and tab["turn"]["actor_id"] in new_ids
    assert sorted(c["real_name"] for c in content["cards"]) == ["Goblin 1", "Goblin 2", "Thorin"]


def test_boundary_sides_come_from_the_category(api, root):
    saga_id, dm, ana, stage_id, set_id, combat, cards = _combat(api, root)
    content = _content(api, saga_id, dm, stage_id)
    sides = {c["real_name"]: c["side"] for c in content["cards"]}
    assert sides == {"Thorin": "player", "Goblin 1": "other", "Goblin 2": "other"}
