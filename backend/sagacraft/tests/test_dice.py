"""Plan 23: dice rules, the Dice roller Set (tray, the DM's pick, rolls), Saga template defaults."""
import pytest

from domain import dice
from tests.test_stages import _live


def test_reading_rolls():
    t = lambda read, x=0, mod=0: {"read": read, "x": x, "modifier": mod}
    assert dice.read_result(t("sum", mod=3), [2, 5]) == 10
    assert dice.read_result(t("highest"), [4, 17]) == 17 and dice.read_result(t("lowest"), [4, 17]) == 4
    assert dice.read_result(t("sum_above", 4), [3, 5, 6]) == 11 and dice.counted("sum_above", 4, [3, 5, 6]) == [False, True, True]
    assert dice.read_result(t("sum_below", 4), [3, 5, 1]) == 4
    assert dice.counted("highest", 0, [9, 9]) == [True, False]  # one die counts
    cleaned = dice.clean_roll_types([{"name": " Ability ", "dice": [{"count": 4, "sides": 6}], "read": "sum_above", "x": 2, "modifier": -1}])
    assert cleaned[0] == {"id": "r1", "name": "Ability", "dice": [{"count": 4, "sides": 6}], "read": "sum_above", "x": 2, "modifier": -1}
    assert dice.label(cleaned[0]) == "4d6 (above 2) -1"
    for bad in ([{"name": "", "dice": [{"sides": 6}]}], [{"name": "X", "dice": [{"sides": 7}]}], [{"name": "X", "dice": []}],
                [{"name": "X", "dice": [{"count": 13, "sides": 6}]}], [{"name": "X", "dice": [{"sides": 6}], "read": "average"}],
                [{"id": "a", "name": "X", "dice": [{"sides": 6}]}, {"id": "a", "name": "Y", "dice": [{"sides": 6}]}]):
        with pytest.raises(dice.DiceError):
            dice.clean_roll_types(bad)
    assert all(1 <= dice.roll_value(100) <= 100 for _ in range(50))
    coin = dice.clean_roll_types([{"name": "Coin", "dice": [{"sides": 2}]}])  # a d2: a coin
    assert coin[0]["dice"] == [{"count": 1, "sides": 2}] and {dice.roll_value(2) for _ in range(60)} == {1, 2}


def _setup(api, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    _, bob = api.member(saga_id, dm, "bob")
    _, vic = api.member(saga_id, dm, "vic", role="viewer")
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Rolls"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "dice"})
    return saga_id, dm, (ana_id, ana), bob, vic, stage["id"], stage["sets"][0]["id"]


def test_the_dice_tray(api, client, root):
    saga_id, dm, (ana_id, ana), bob, vic, stage_id, set_id = _setup(api, root)
    act = f"/api/sagas/{saga_id}/sets/{set_id}/act"
    post = lambda who, name, **args: client.post(act, headers=who, json={"name": name, "args": args})
    content = api.ok("GET", f"/api/sagas/{saga_id}/stages/{stage_id}", dm)["sets"][0]["content"]
    ids = [r["id"] for r in content["roll_types"]]
    assert ids[:3] == ["d20", "advantage", "disadvantage"] and content["roll_types"][1]["label"] == "2d20 (highest)"  # DnD Lite's
    # Not live: players can't act yet; the DM can (rehearsing)
    assert post(ana, "tray.add", type_id="d20").status_code == 404
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    api.ok("POST", act, ana, json={"name": "tray.add", "args": {"type_id": "advantage"}})
    api.ok("POST", act, bob, json={"name": "tray.add", "args": {"type_id": "2d6"}})
    assert post(vic, "tray.add", type_id="d20").status_code == 403
    # Each member's tray is their own: players get only theirs, the DM everyone's
    mine = _live(api, saga_id, ana)["sets"][0]["content"]
    assert [d["sides"] for d in mine["tray"]] == [20, 20] and mine["tray"][0]["member"] == "Ana" and mine["can_roll"] is True
    assert [d["sides"] for d in _live(api, saga_id, dm)["sets"][0]["content"]["tray"]] == [20, 20, 6, 6]
    assert _live(api, saga_id, vic)["sets"][0]["content"]["tray"] == []
    bobs = _live(api, saga_id, dm)["sets"][0]["content"]["tray"][2]["group"]
    assert post(ana, "tray.remove", group=bobs).status_code == 403
    assert post(ana, "clear.all").status_code == 403
    # The DM's pick: honoured, never shown to players
    first = mine["tray"][0]["id"]
    assert post(ana, "tray.force", die_id=first, value=20).status_code == 403
    assert post(dm, "tray.force", die_id=first, value=21).status_code == 400
    api.ok("POST", act, dm, json={"name": "tray.force", "args": {"die_id": first, "value": 20}})
    assert "forced" not in _live(api, saga_id, ana)["sets"][0]["content"]["tray"][0]
    assert _live(api, saga_id, dm)["sets"][0]["content"]["tray"][0]["forced"] == 20
    # Roll: yours only; values, results per roll type; a row that stays
    api.ok("POST", act, ana, json={"name": "roll", "args": {}})
    content = _live(api, saga_id, bob)["sets"][0]["content"]
    assert [d["sides"] for d in content["tray"]] == [6, 6]  # Bob's still waiting
    [roll] = content["rolls"]
    assert roll["by"] == "Ana" and roll["member_id"] == ana_id and roll["color"].startswith("#") and isinstance(roll["seed"], int)
    [advantage] = roll["groups"]
    assert advantage["result"] == 20 and advantage["dice"][0]["value"] == 20
    assert "forced" not in str(content)
    assert post(ana, "roll").status_code == 400  # nothing to roll
    api.ok("POST", act, bob, json={"name": "roll", "args": {}})
    two_d6 = _live(api, saga_id, ana)["sets"][0]["content"]["rolls"][1]["groups"][0]
    assert two_d6["result"] == sum(d["value"] for d in two_d6["dice"]) and all(1 <= d["value"] <= 6 for d in two_d6["dice"])
    # The same roll added again joins its group (3 × d12 is one sum); taking one back
    for _ in range(3):
        api.ok("POST", act, ana, json={"name": "tray.add", "args": {"type_id": "d12"}})
    api.ok("POST", act, ana, json={"name": "tray.add", "args": {"type_id": "advantage"}})
    api.ok("POST", act, ana, json={"name": "tray.take", "args": {"type_id": "advantage"}})
    api.ok("POST", act, ana, json={"name": "tray.take", "args": {"type_id": "d12"}})
    assert [d["sides"] for d in _live(api, saga_id, ana)["sets"][0]["content"]["tray"]] == [12, 12]
    assert post(ana, "tray.take", type_id="d4").status_code == 400
    api.ok("POST", act, ana, json={"name": "roll", "args": {}})
    rolls = _live(api, saga_id, ana)["sets"][0]["content"]["rolls"]
    assert len(rolls) == 3 and rolls[2]["groups"][0]["name"] == "d12 ×2"
    # Clear: your row (your rolls and waiting dice); clear all: the DM
    api.ok("POST", act, ana, json={"name": "tray.add", "args": {"type_id": "d4"}})
    api.ok("POST", act, ana, json={"name": "clear", "args": {}})
    content = _live(api, saga_id, ana)["sets"][0]["content"]
    assert [r["by"] for r in content["rolls"]] == ["Bob"] and content["tray"] == []
    # The DM hides the rolled dice for everyone (the results stay); a new roll shows them again
    assert post(ana, "rolls.hide", hidden=True).status_code == 403
    api.ok("POST", act, dm, json={"name": "rolls.hide", "args": {"hidden": True}})
    hidden = _live(api, saga_id, ana)["sets"][0]["content"]
    assert hidden["rolled_hidden"] is True and len(hidden["rolls"]) == 1
    api.ok("POST", act, ana, json={"name": "tray.add", "args": {"type_id": "d4"}})
    api.ok("POST", act, ana, json={"name": "roll", "args": {}})
    assert _live(api, saga_id, ana)["sets"][0]["content"]["rolled_hidden"] is False
    api.ok("POST", act, dm, json={"name": "clear.all", "args": {}})
    assert _live(api, saga_id, bob)["sets"][0]["content"]["rolls"] == []
    # Who can roll: some groups and members (the DM always can)
    set_url = f"/api/sagas/{saga_id}/sets/{set_id}"
    api.ok("PATCH", set_url, dm, json={"config": {"rollers": {"groups": [], "members": [ana_id]}}})
    assert _live(api, saga_id, bob)["sets"][0]["content"]["can_roll"] is False
    assert "rollers" not in _live(api, saga_id, bob)["sets"][0]["content"]
    assert post(bob, "tray.add", type_id="d20").status_code == 403
    api.ok("POST", act, ana, json={"name": "tray.add", "args": {"type_id": "d20"}})
    api.ok("POST", act, dm, json={"name": "tray.add", "args": {"type_id": "d20"}})
    assert client.patch(set_url, headers=dm, json={"config": {"rollers": {"groups": ["players"]}}}).status_code == 400
    api.ok("PATCH", set_url, dm, json={"config": {"rollers": None}})
    # Kept rolls: at most 12 on the Set, the oldest go
    for _ in range(13):
        api.ok("POST", act, bob, json={"name": "tray.add", "args": {"type_id": "d4"}})
        api.ok("POST", act, bob, json={"name": "roll", "args": {}})
    assert len(_live(api, saga_id, bob)["sets"][0]["content"]["rolls"]) == 12
    assert client.patch(f"/api/sagas/{saga_id}/sets/{set_id}", headers=dm, json={"config": {"tray_edge": "middle"}}).status_code == 400
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"tray_edge": "left"}})
    assert _live(api, saga_id, ana)["sets"][0]["content"]["tray_edge"] == "left"
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"speed": 5.5, "dice_size": 1.4}})
    shown = _live(api, saga_id, ana)["sets"][0]["content"]
    assert (shown["speed"], shown["dice_size"]) == (5.5, 1.4)
    for bad in ({"speed": 0.2}, {"speed": 9}, {"dice_size": 3}):
        assert client.patch(f"/api/sagas/{saga_id}/sets/{set_id}", headers=dm, json={"config": bad}).status_code == 400
    # The DM changes the roll types (checked); the template's default changes too
    set_url = f"/api/sagas/{saga_id}/sets/{set_id}"
    api.ok("PATCH", set_url, dm, json={"config": {"roll_types": [{"id": "hit", "name": "Hit", "dice": [{"count": 1, "sides": 20}], "modifier": 5}]}})
    assert [r["label"] for r in _live(api, saga_id, ana)["sets"][0]["content"]["roll_types"]] == ["1d20 +5"]
    assert client.patch(set_url, headers=dm, json={"config": {"roll_types": [{"name": "Bad", "dice": [{"sides": 3}]}]}}).status_code == 400
    command = f"/api/sagas/{saga_id}/template/command"
    api.ok("POST", command, dm, json={"name": "starting.set", "args": {"changes": {"dice_rolls": [
        {"id": "fate", "name": "Fate", "dice": [{"count": 4, "sides": 6}]}]}}})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage_id}/sets", dm, json={"type": "dice"})
    newest = next(s for s in stage["sets"] if s["id"] not in (set_id,) and s["type"] == "dice")
    assert [r["id"] for r in newest["content"]["roll_types"]] == ["fate"]


def test_members_carry_their_dice_style(api, client, root):
    saga_id, dm, (ana_id, ana), *_ = _setup(api, root)
    api.ok("PATCH", f"/api/sagas/{saga_id}/me", ana, json={"die_style": "ember"})
    members = api.ok("GET", f"/api/sagas/{saga_id}", dm)["members"]
    assert next(m for m in members if m["id"] == ana_id)["die_style"] == "ember"
    assert client.patch(f"/api/sagas/{saga_id}/me", headers=ana, json={"die_style": "glitter"}).status_code == 400
    for style in ("marble", "granite", "cobble", "agate", "hex", "glass", "sanded_glass", "gnomish", "jelly", "cosmic", "bone"):
        api.ok("PATCH", f"/api/sagas/{saga_id}/me", ana, json={"die_style": style})
