"""Plan 30: the Saga template's actions (costs, changes, triggers; who runs them) and calculated variables."""
import pytest

from domain import actions as rules
from domain import calculated


def _setup(api, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    bob_id, bob = api.member(saga_id, dm, "bob")
    _, vic = api.member(saga_id, dm, "vic", role="viewer")
    url = f"/api/sagas/{saga_id}/resources"
    rope = api.ok("POST", url, dm, json={"kind": "item", "type": "gear", "attributes": {"name": "Rope", "weight": 10}})
    pack = api.ok("POST", url, dm, json={"kind": "item", "type": "gear", "attributes": {"name": "Pack", "weight": 5}})
    thorin = api.ok("POST", url, dm, json={"kind": "character", "type": "pc", "attributes": {
        "name": "Thorin", "hp": {"current": 3, "max": 10}, "hit_dice": {"current": 2, "max": 2}, "controllers": [ana_id],
        "inventory": [rope["id"], pack["id"], rope["id"]]}, "visibility": {"groups": [], "members": [], "owner": True}})
    bram = api.ok("POST", url, dm, json={"kind": "character", "type": "pc", "attributes": {
        "name": "Bram", "hp": {"current": 1, "max": 8}, "hit_dice": {"current": 0, "max": 1}, "controllers": [bob_id]},
        "visibility": {"groups": [], "members": [], "owner": True}})
    return saga_id, dm, (ana_id, ana), (bob_id, bob), vic, thorin, bram, rope


def test_actions_on_characters_and_who_runs_them(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), vic, thorin, bram, rope = _setup(api, root)
    url = f"/api/sagas/{saga_id}/resources/{thorin['id']}/actions"
    listed = api.ok("GET", url, ana)
    assert [(a["key"], a["can"]) for a in listed["actions"]] == [("short_rest", True), ("long_rest", True)]
    # Short rest: a hit die for 5 HP; the result lists the changes
    result = api.ok("POST", f"{url}/short_rest", ana)
    assert {(c["name"], c["variable"], c["before"], c["after"]) for c in result["changes"]} == {("Thorin", "Hit dice", 2, 1), ("Thorin", "HP", 3, 8)}
    result = api.ok("POST", f"{url}/short_rest", ana)
    hp = api.ok("GET", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm)["attributes"]
    assert hp["hp"] == {"current": 10, "max": 10} and hp["hit_dice"]["current"] == 0  # a counter never passes its max
    # Not enough: nothing changes
    assert client.post(f"{url}/short_rest", headers=ana).status_code == 400
    # Who: Bob doesn't control Thorin; viewers never; the DM always
    assert client.post(f"{url}/short_rest", headers=bob).status_code in (403, 404)
    assert client.post(f"{url}/long_rest", headers=vic).status_code in (403, 404)
    api.ok("POST", f"{url}/long_rest", dm)
    assert api.ok("GET", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm)["attributes"]["hit_dice"]["current"] == 2
    assert client.post(f"{url}/fly", headers=dm).status_code == 400
    # A value it has none of (the variable came after the character): its default (1 of 1)
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm, json={"attributes": {"hit_dice": None}})
    result = api.ok("POST", f"{url}/short_rest", ana)
    assert ("Thorin", "Hit dice", 1, 0) in {(c["name"], c["variable"], c["before"], c["after"]) for c in result["changes"]}


def test_group_actions_trigger_their_characters(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), vic, thorin, bram, rope = _setup(api, root)
    groups = f"/api/sagas/{saga_id}/character-groups"
    for g in api.ok("GET", groups, dm):  # the Saga's starting party steps aside: ours is the active one
        api.ok("PATCH", f"{groups}/{g['id']}", dm, json={"active": False, "player_party": False})
    party = api.ok("POST", groups, dm, json={"name": "The party", "player_party": True, "active": True,
                                              "members": [{"resource_id": thorin["id"]}, {"resource_id": bram["id"]}],
                                              "attributes": {"rations": {"current": 1, "max": 10}}})
    # Ana sees her party's actions from her character, and may run the party's long rest ("group": its players)
    listed = api.ok("GET", f"/api/sagas/{saga_id}/resources/{thorin['id']}/actions", ana)
    assert listed["party"]["name"] == "The party" and [a["key"] for a in listed["party"]["actions"]] == ["party_long_rest"]
    result = api.ok("POST", f"{groups}/{party['id']}/actions/party_long_rest", ana)
    changed = {(c["name"], c["variable"]): (c["before"], c["after"]) for c in result["changes"]}
    assert changed[("The party", "Rations")] == (1, 0) and changed[("Thorin", "HP")] == (3, 10)
    assert ("Bram", "HP") not in changed  # Bob's character: Ana doesn't see its HP (it changed all the same)
    assert api.ok("GET", f"/api/sagas/{saga_id}/resources/{bram['id']}", dm)["attributes"]["hp"]["current"] == 8
    assert "resource_ids" not in result
    # No ration left: refused, nothing changed (all or nothing)
    assert client.post(f"{groups}/{party['id']}/actions/party_long_rest", headers=dm).status_code == 400
    # A player out of the party may not; groups' actions list is the DM's
    other = api.ok("POST", groups, dm, json={"name": "Goblins", "members": []})
    assert client.post(f"{groups}/{other['id']}/actions/party_long_rest", headers=ana).status_code == 403
    assert client.get(f"{groups}/{party['id']}/actions", headers=ana).status_code == 403
    assert [a["key"] for a in api.ok("GET", f"{groups}/{party['id']}/actions", dm)] == ["party_long_rest"]


def test_template_actions_are_checked(api, client, root):
    saga_id, dm, *_ = _setup(api, root)
    command = f"/api/sagas/{saga_id}/template/command"
    post = lambda cmd, **args: client.post(command, headers=dm, json={"name": cmd, "args": args})  # noqa: E731
    assert post("action.add", name="Second wind", on="character").status_code == 200
    tpl = api.ok("GET", f"/api/sagas/{saga_id}/template", dm)["template"]
    assert [a["key"] for a in tpl["actions"]][-1] == "second_wind"
    ok = post("action.update", key="second_wind", changes={"who": "players", "changes": [{"target": "self", "variable": "hp", "op": "add", "amount": 3}]})
    assert ok.status_code == 200, ok.text
    for bad in ({"changes": [{"target": "self", "variable": "name", "amount": 1}]},  # not a number
                {"changes": [{"target": "group_characters", "variable": "hp", "amount": 1}]},  # not on characters
                {"changes": [{"target": "self", "variable": "hp", "op": "double", "amount": 1}]},  # add, remove or set
                {"changes": [{"target": "self", "variable": "hp", "op": "remove", "amount": "max"}]},  # max: adding, setting
                {"triggers": [{"target": "self", "action": "party_long_rest"}]},  # an action on groups
                {"who": "anyone"}):
        assert post("action.update", key="second_wind", changes=bad).status_code == 400, bad
    assert post("action.delete", key="long_rest").status_code == 400  # the party's long rest triggers it
    assert post("variable.delete", kind="character", key="hit_dice").status_code == 400  # short rest uses it
    assert post("action.delete", key="second_wind").status_code == 200


def test_calculated_variables(api, client, root):
    saga_id, dm, (ana_id, ana), _, _, thorin, bram, rope = _setup(api, root)
    got = api.ok("GET", f"/api/sagas/{saga_id}/resources/{thorin['id']}", ana)
    assert got["attributes"]["carried"] == 25 and "carried" not in got["editable"]  # rope twice and a pack
    # Typed values are ignored
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm, json={"attributes": {"carried": 999}})
    assert api.ok("GET", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm)["attributes"]["carried"] == 25
    # A formula of the thing's own values; a group's total of its characters'
    command = f"/api/sagas/{saga_id}/template/command"
    api.ok("POST", command, dm, json={"name": "variable.add", "args": {"kind": "character", "variable": {"name": "Load", "type": "calculated"}}})
    bad = client.post(command, headers=dm, json={"name": "variable.update", "args": {"kind": "character", "key": "load",
                                                                                      "changes": {"calc": {"op": "formula", "formula": "__import__('os')"}}}})
    assert bad.status_code == 400
    api.ok("POST", command, dm, json={"name": "variable.update", "args": {"kind": "character", "key": "load",
                                                                          "changes": {"calc": {"op": "formula", "formula": "level * 15 + 1"}}}})
    assert api.ok("GET", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm)["attributes"]["load"] == 16  # level 1
    api.ok("POST", command, dm, json={"name": "variable.add", "args": {"kind": "group", "variable": {"name": "Party HP", "type": "calculated"}}})
    api.ok("POST", command, dm, json={"name": "variable.update", "args": {"kind": "group", "key": "party_hp",
                                                                          "changes": {"calc": {"op": "sum", "of": "characters", "variable": "hp"}}}})
    party = api.ok("POST", f"/api/sagas/{saga_id}/character-groups", dm, json={"name": "P", "members": [{"resource_id": thorin["id"]}, {"resource_id": bram["id"]}]})
    assert party["attributes"]["party_hp"] == 4


def test_running_rules_in_memory():
    """The pure rules: loops stop, optional costs take what there is."""
    acts = {
        "a": {"key": "a", "name": "A", "on": "character", "types": [], "who": "owner",
              "costs": [{"source": "self", "variable": "x", "amount": 5, "consume": True, "required": False}],
              "changes": [{"target": "self", "variable": "y", "op": "add", "amount": 1}],
              "triggers": [{"target": "self", "action": "a", "skip_costs": False, "skip_changes": False, "skip_triggers": False}]},
    }
    thing = rules.Thing("character", 1, "T", "pc", {"x": 2, "y": 0}, {"x": "number", "y": "number"})

    class World:
        def related(self, t, place):
            return [t]
    rules.run(acts, "a", thing, World())
    assert thing.values == {"x": 0, "y": 1}  # took the 2 there was; the loop on itself stopped
    assert calculated.evaluate("max(a, 3) / 2 + floor(b)", {"a": {"current": 7, "max": 9}, "b": 1.9}) == 4.5
    with pytest.raises(calculated.CalcError):
        calculated.check({"op": "formula", "formula": "a.__class__"}, "character", {"character": {"a": "number"}})


def test_amounts_can_be_formulas_with_dice(api, client, root):
    """Plan 33: a cost's or change's amount may be a formula of the thing's numbers, with dice (2d6, level d20) rolled
    when the action runs; the result lists the rolls (to whoever may see them)."""
    saga_id, dm, (ana_id, ana), (bob_id, bob), vic, thorin, bram, rope = _setup(api, root)
    command = f"/api/sagas/{saga_id}/template/command"
    post = lambda cmd, **args: client.post(command, headers=dm, json={"name": cmd, "args": args})  # noqa: E731
    assert post("action.add", name="Second wind", on="character").status_code == 200
    ok = post("action.update", key="second_wind", changes={
        "who": "owner", "changes": [{"target": "self", "variable": "hp", "op": "add", "amount": {"formula": "level d4 + 1"}}]})
    assert ok.status_code == 200, ok.text
    lines = next(a for a in api.ok("GET", f"/api/sagas/{saga_id}/template", dm)["template"]["actions"] if a["key"] == "second_wind")["changes"]
    assert lines[0]["amount"] == {"formula": "level d4 + 1"}
    for bad in ({"formula": "name d6"},  # not a number
                {"formula": "level d"},  # not dice
                {"formula": "__import__('os')"},
                {"formula": ""}):
        assert post("action.update", key="second_wind", changes={"changes": [{"target": "self", "variable": "hp", "amount": bad}]}).status_code == 400, bad
    # Calculated variables stay without dice (a worked-out value doesn't change by itself)
    with pytest.raises(calculated.CalcError):
        calculated.check({"op": "formula", "formula": "2d6"}, "character", {"character": {"level": "number"}})
    # Running: Thorin at level 2, 0 of 30 HP: adds 2d4 + 1 (3 to 9)
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm, json={"attributes": {"level": 2, "hp": {"current": 0, "max": 30}}})
    result = api.ok("POST", f"/api/sagas/{saga_id}/resources/{thorin['id']}/actions/second_wind", ana)
    (change,) = result["changes"]
    assert 3 <= change["after"] <= 9
    (roll,) = result["rolls"]
    assert roll["formula"] == "level d4 + 1" and roll["thing"] == "Thorin" and roll["value"] == change["after"]
    assert roll["rolls"][0]["count"] == 2 and roll["rolls"][0]["sides"] == 4 and sum(roll["rolls"][0]["results"]) + 1 == change["after"]


def test_formula_amounts_in_memory():
    import random
    thing = rules.Thing("character", 1, "T", "pc", {"level": 3, "hp": {"current": 1, "max": 50}}, {"level": "number", "hp": "counter"})
    log: list = []
    value = rules.amount_of({"formula": "level d20 + level"}, thing, log, random.Random(4))
    assert log[0]["rolls"][0]["count"] == 3 and value == sum(log[0]["rolls"][0]["results"]) + 3
    assert rules.amount_of({"formula": "0 - 5"}, thing) == 0  # never below 0
    assert rules.amount_of(4, thing) == 4
    assert calculated.with_dice("2d6 + d8 + level d10") == "roll(2, 6) + roll(1, 8) + roll(level, 10)"


def test_stage_action_control_lists_what_each_member_runs_actions_on(api, client, root):
    """Plan 33: the Stage's Action control lists, per member, the characters, items and groups they run actions on."""
    saga_id, dm, (ana_id, ana), (bob_id, bob), vic, thorin, bram, rope = _setup(api, root)
    groups = f"/api/sagas/{saga_id}/character-groups"
    for g in api.ok("GET", groups, dm):
        api.ok("PATCH", f"{groups}/{g['id']}", dm, json={"active": False, "player_party": False})
    party = api.ok("POST", groups, dm, json={"name": "The party", "player_party": True, "active": True,
                                              "members": [{"resource_id": thorin["id"]}, {"resource_id": bram["id"]}]})
    api.ok("POST", groups, dm, json={"name": "Goblins", "members": []})
    url = f"/api/sagas/{saga_id}/actions/actors"
    mine = api.ok("GET", url, ana)
    assert [(c["name"], [a["key"] for a in c["actions"]]) for c in mine["character"]] == [("Thorin", ["short_rest", "long_rest"])]
    assert "The party" in [g["name"] for g in mine["group"]]  # groups with her character (its long rest: "group")
    assert "Goblins" not in [g["name"] for g in mine["group"]]
    everything = api.ok("GET", url, dm)
    assert {"Thorin", "Bram"} <= {c["name"] for c in everything["character"]}
    assert party["id"] in {g["id"] for g in everything["group"]}
    assert api.ok("GET", url, vic) == {"character": [], "item": [], "group": []}  # viewers never run actions
