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
