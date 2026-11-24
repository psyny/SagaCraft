"""Plan 37: an action's changes (add, remove, set; "gains" before), the Saga's settings, and an action's dice thrown
on the live Stage's dice roller."""
from types import SimpleNamespace

from domain import actions as rules
from services.saga_templates import document
from tests.test_actions import _setup
from tests.test_stages import _live


class _Self:
    def related(self, thing, place):
        return [thing]


def _thing(**values):
    types = {k: "counter" if isinstance(v, dict) else "number" for k, v in values.items()}
    return rules.Thing("character", 1, "T", "pc", values, types)


def _one(op, amount, variable="hp"):
    return {"go": {"key": "go", "name": "Go", "on": "character", "types": [], "who": "owner", "costs": [],
                   "changes": [{"target": "self", "variable": variable, "op": op, "amount": amount}], "triggers": []}}


def test_changes_add_remove_or_set():
    def after(op, amount, **values):
        thing = _thing(**values)
        rules.run(_one(op, amount, next(iter(values))), "go", thing, _Self())
        return thing.values[next(iter(values))]

    assert after("add", 4, hp={"current": 8, "max": 10})["current"] == 10  # a counter never passes its max
    assert after("add", "max", hp={"current": 3, "max": 10})["current"] == 10
    assert after("remove", 5, hp={"current": 3, "max": 10})["current"] == 0  # never below 0
    assert after("remove", 2, exhaustion=3) == 1
    assert after("set", 4, hp={"current": 9, "max": 10})["current"] == 4  # set: even down
    assert after("set", 40, hp={"current": 9, "max": 10})["current"] == 10  # at most its max
    assert after("set", "max", hp={"current": 2, "max": 10})["current"] == 10
    assert after("set", 0, exhaustion=3) == 0


def test_gains_written_before_are_changes_that_add():
    old = {"key": "rest", "name": "Rest", "on": "character", "costs": [],
           "gains": [{"target": "self", "variable": "hp", "amount": "max"}],
           "triggers": [{"target": "self", "action": "rest", "skip_costs": False, "skip_gains": True, "skip_triggers": False}]}
    new = rules.upgrade(old)
    assert "gains" not in new and new["changes"] == [{"target": "self", "variable": "hp", "amount": "max", "op": "add"}]
    assert new["triggers"][0]["skip_changes"] is True and "skip_gains" not in new["triggers"][0]
    assert rules.upgrade(new) == new  # as it's written now: as it is
    (checked,) = rules.clean_actions([old], lambda kind: {"hp": "counter"}, lambda kind: {"pc"})
    assert checked["changes"][0]["op"] == "add" and checked["triggers"][0]["skip_changes"] is True
    # A Saga's template saved before reads with changes (saved so on its next change)
    saga = SimpleNamespace(template={"actions": [old], "kinds": {}}, ruleset_key="dnd_lite")
    assert document(saga)["actions"][0]["changes"][0]["op"] == "add"


def test_saga_settings(api, client, root):
    saga_id, dm, (ana_id, ana), *_ = _setup(api, root)
    url = f"/api/sagas/{saga_id}/settings"
    assert api.ok("GET", f"/api/sagas/{saga_id}", dm)["settings"] == {"action_dice": True}  # on by default
    assert "settings" not in api.ok("GET", f"/api/sagas/{saga_id}", ana)
    assert client.patch(url, headers=ana, json={"action_dice": False}).status_code == 403
    assert client.patch(url, headers=dm, json={"loud": True}).status_code == 400
    assert client.patch(url, headers=dm, json={"action_dice": "no"}).status_code == 400
    assert api.ok("PATCH", url, dm, json={"action_dice": False}) == {"action_dice": False}
    assert api.ok("GET", f"/api/sagas/{saga_id}", dm)["settings"]["action_dice"] is False


def test_an_actions_dice_roll_on_the_live_dice_roller(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), vic, thorin, bram, rope = _setup(api, root)
    command = f"/api/sagas/{saga_id}/template/command"
    api.ok("POST", command, dm, json={"name": "action.add", "args": {"name": "Second wind", "on": "character"}})
    api.ok("POST", command, dm, json={"name": "action.update", "args": {"key": "second_wind", "changes": {
        "changes": [{"target": "self", "variable": "hp", "op": "add", "amount": {"formula": "2d4 + 1"}}]}}})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Table"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "dice"})
    run = f"/api/sagas/{saga_id}/resources/{thorin['id']}/actions/second_wind"
    rolls = lambda: _live(api, saga_id, ana)["sets"][0]["content"]["rolls"]  # noqa: E731
    # No live Stage: nothing thrown (the action runs all the same)
    api.ok("POST", run, ana)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage["id"]})
    assert rolls() == []
    # The DM runs it on Thorin: thrown in the dice of Thorin's player (Ana), as the action rolled them
    result = api.ok("POST", run, dm)
    (roll,) = rolls()
    (group,) = roll["groups"]
    assert (roll["member_id"], roll["by"], group["member"]) == (ana_id, "Ana", "Ana")
    assert group["name"] == "Second wind (2d4 + 1)" and group["result"] == result["rolls"][0]["value"]
    assert [d["value"] for d in group["dice"]] == result["rolls"][0]["rolls"][0]["results"] and {d["sides"] for d in group["dice"]} == {4}
    # A secret (only the DM is told) is rolled behind the screen
    api.ok("POST", command, dm, json={"name": "action.update", "args": {"key": "second_wind", "changes": {"notify": "dm"}}})
    api.ok("POST", run, ana)
    assert len(rolls()) == 1
    # The Saga's setting off: no dice on the roller
    api.ok("POST", command, dm, json={"name": "action.update", "args": {"key": "second_wind", "changes": {"notify": "user"}}})
    api.ok("PATCH", f"/api/sagas/{saga_id}/settings", dm, json={"action_dice": False})
    api.ok("POST", run, ana)
    assert len(rolls()) == 1
    # Without dice (a fixed amount): nothing thrown
    api.ok("PATCH", f"/api/sagas/{saga_id}/settings", dm, json={"action_dice": True})
    api.ok("POST", f"/api/sagas/{saga_id}/resources/{thorin['id']}/actions/long_rest", ana)
    assert len(rolls()) == 1


def test_a_groups_action_runs_on_its_instances(api, client, root):
    """A group's action on each of its characters: an instanceable one's instances that came with the group (their
    own values change; the character doesn't), a character with no instances itself."""
    from tests.test_encounters import _content, _encounter

    saga_id, dm, ana, thorin, goblin, party, ambush, stage_id, set_id = _encounter(api, root)
    groups = f"/api/sagas/{saga_id}/character-groups"
    api.ok("PATCH", f"{groups}/{ambush['id']}", dm, json={"attributes": {"rations": {"current": 3, "max": 10}}})
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"group_ids": [ambush["id"]]})
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"resource_ids": [goblin["id"]]})  # not the group's

    def goblins():
        cards = [c for c in _content(api, saga_id, dm, stage_id)["cards"] if c["real_name"].startswith("Goblin")]
        return {c["real_name"]: (c["id"], next(a["current"] for a in c["attributes"] if a["key"] == "hp")) for c in cards}

    for name, (actor_id, _) in goblins().items():  # everyone hurt
        api.ok("POST", f"/api/sagas/{saga_id}/actors/{actor_id}/counter", dm, json={"key": "hp", "current": 1})
    result = api.ok("POST", f"{groups}/{ambush['id']}/actions/party_long_rest", dm)
    changed = {(c["name"], c["variable"], c["before"], c["after"]) for c in result["changes"]}
    assert {("Goblin 1", "HP", 1, 7), ("Goblin 2", "HP", 1, 7)} <= changed
    assert not any(name in ("Goblin", "Goblin 3") for name, *_ in changed)  # not the character, nor the lone goblin
    assert {name: hp for name, (_, hp) in goblins().items()} == {"Goblin 1": 7, "Goblin 2": 7, "Goblin 3": 1}
    assert api.ok("GET", f"/api/sagas/{saga_id}/resources/{goblin['id']}", dm)["attributes"]["hp"]["current"] == 7
    # A group whose instanceable character has no instances: the character itself, as before
    camp = api.ok("POST", groups, dm, json={"name": "Camp", "members": [{"resource_id": goblin["id"], "count": 1}],
                                            "attributes": {"rations": {"current": 1, "max": 5}}})
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{goblin['id']}", dm, json={"attributes": {"hp": {"current": 2, "max": 7}}})
    result = api.ok("POST", f"{groups}/{camp['id']}/actions/party_long_rest", dm)
    assert ("Goblin", "HP", 2, 7) in {(c["name"], c["variable"], c["before"], c["after"]) for c in result["changes"]}


def test_scenes_sort_by_any_numeric_variable(api, root):
    """Plan 38: a tab orders by any number, counter (its current value) or calculated variable characters have; none
    is named in the code."""
    from tests.test_encounters import _content, _encounter, _tab
    from tests.test_stages import _command

    saga_id, dm, ana, thorin, goblin, party, ambush, stage_id, set_id = _encounter(api, root)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"group_ids": [party["id"], ambush["id"]]})
    content = _content(api, saga_id, dm, stage_id)
    keys = {k: kind for k, _, kind in content["sort_keys"]}
    assert keys["hp"] == "counter" and keys["level"] == "number" and keys["carried"] == "calculated"
    assert "name" not in keys
    tab = _tab(content, "Exploration")["id"]
    cards = {c["real_name"]: c for c in content["cards"]}
    api.ok("POST", f"/api/sagas/{saga_id}/actors/{cards['Goblin 1']['id']}/counter", dm, json={"key": "hp", "current": 1})
    _command(api, saga_id, dm, set_id, "order.set", tab_id=tab, by="hp")  # by HP (current), highest first
    content = _content(api, saga_id, dm, stage_id)
    names = {c["id"]: c["real_name"] for c in content["cards"]}
    order = [names[i] for i in _tab(content, "Exploration")["card_ids"]]
    assert order == ["Thorin", "Goblin 2", "Goblin 1"]  # 20, 7, 1
    assert {names[c["id"]]: c["sort_values"]["hp"] for c in content["cards"]} == {"Thorin": 20, "Goblin 1": 1, "Goblin 2": 7}


def test_counters_stay_between_min_and_max(api, client, root):
    """Plan 40: a counter's current value never leaves its min (0 unless set) and max: past them, the boundary."""
    saga_id, dm, (ana_id, ana), _, _, thorin, _, _ = _setup(api, root)
    url = f"/api/sagas/{saga_id}/resources/{thorin['id']}"
    hp = lambda: api.ok("GET", url, dm)["attributes"]["hp"]  # noqa: E731
    api.ok("PATCH", url, dm, json={"attributes": {"hp": {"current": 99, "max": 10}}})
    assert hp() == {"current": 10, "max": 10}  # above its max: the max
    api.ok("POST", f"{url}/counter", dm, json={"key": "hp", "delta": -50})
    assert hp()["current"] == 0  # below 0 (no min set): 0
    api.ok("PATCH", url, dm, json={"attributes": {"hp": {"current": 3, "max": 10, "min": -10}}})
    api.ok("POST", f"{url}/counter", dm, json={"key": "hp", "delta": -50})
    assert hp() == {"current": -10, "max": 10, "min": -10}  # a min of its own
    bad = client.patch(url, headers=dm, json={"attributes": {"hp": {"current": 1, "max": 5, "min": 6}}})
    assert bad.status_code == 400  # a min above its max


def test_a_cards_counter_stays_within_its_max(api, root):
    """Plan 40: on a card (an instance's own value) too."""
    from tests.test_encounters import _content, _encounter

    saga2, dm2, ana2, thorin2, goblin, party, ambush, stage_id, set_id = _encounter(api, root)
    api.ok("POST", f"/api/sagas/{saga2}/sets/{set_id}/actors", dm2, json={"group_ids": [ambush["id"]]})
    card = next(c for c in _content(api, saga2, dm2, stage_id)["cards"] if c["real_name"] == "Goblin 1")
    api.ok("POST", f"/api/sagas/{saga2}/actors/{card['id']}/counter", dm2, json={"key": "hp", "current": 300})
    card = next(c for c in _content(api, saga2, dm2, stage_id)["cards"] if c["real_name"] == "Goblin 1")
    assert next(a for a in card["attributes"] if a["key"] == "hp")["current"] == 7  # its max


def test_actions_keep_counters_within_min():
    thing = rules.Thing("character", 1, "T", "pc", {"hp": {"current": 2, "max": 10, "min": -5}}, {"hp": "counter"})
    rules.run(_one("remove", 20), "go", thing, _Self())
    assert thing.values["hp"]["current"] == -5  # its own min, not 0
