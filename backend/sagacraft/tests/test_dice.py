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
    content = api.ok("GET", f"/api/sagas/{saga_id}/stages/{stage_id}", dm)["sets"][0]["content"]
    ids = [r["id"] for r in content["roll_types"]]
    assert ids[:3] == ["d20", "advantage", "disadvantage"] and content["roll_types"][1]["label"] == "2d20 (highest)"  # DnD Lite's
    # Not live: players can't act yet; the DM can (rehearsing)
    assert client.post(act, headers=ana, json={"name": "tray.add", "args": {"type_id": "d20"}}).status_code == 404
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    api.ok("POST", act, ana, json={"name": "tray.add", "args": {"type_id": "advantage"}})
    api.ok("POST", act, bob, json={"name": "tray.add", "args": {"type_id": "2d6"}})
    assert client.post(act, headers=vic, json={"name": "tray.add", "args": {"type_id": "d20"}}).status_code == 403
    tray = _live(api, saga_id, ana)["sets"][0]["content"]["tray"]
    assert [d["sides"] for d in tray] == [20, 20, 6, 6] and tray[0]["member"] == "Ana" and tray[0]["color"].startswith("#")
    # Taking back: your own (or the DM any); clearing: the DM
    bobs = tray[2]["group"]
    assert client.post(act, headers=ana, json={"name": "tray.remove", "args": {"group": bobs}}).status_code == 403
    assert client.post(act, headers=ana, json={"name": "tray.clear", "args": {}}).status_code == 403
    # The DM's pick: honoured, never shown to players
    first = tray[0]["id"]
    assert client.post(act, headers=ana, json={"name": "tray.force", "args": {"die_id": first, "value": 20}}).status_code == 403
    assert client.post(act, headers=dm, json={"name": "tray.force", "args": {"die_id": first, "value": 21}}).status_code == 400
    api.ok("POST", act, dm, json={"name": "tray.force", "args": {"die_id": first, "value": 20}})
    assert "forced" not in _live(api, saga_id, ana)["sets"][0]["content"]["tray"][0]
    assert _live(api, saga_id, dm)["sets"][0]["content"]["tray"][0]["forced"] == 20
    # Roll: values, results per roll type, the tray emptied
    api.ok("POST", act, bob, json={"name": "roll", "args": {}})
    content = _live(api, saga_id, ana)["sets"][0]["content"]
    roll = content["roll"]
    assert content["tray"] == [] and roll["by"] == "Bob" and isinstance(roll["seed"], int)
    advantage, two_d6 = roll["groups"]
    assert advantage["result"] == 20 and advantage["dice"][0]["value"] == 20 and advantage["member"] == "Ana"
    assert two_d6["result"] == sum(d["value"] for d in two_d6["dice"]) and all(1 <= d["value"] <= 6 for d in two_d6["dice"])
    assert "forced" not in str(content)
    assert client.post(act, headers=bob, json={"name": "roll", "args": {}}).status_code == 400  # nothing to roll
    # The same roll added again joins its group (read together: 3 × d12 is one sum); the results can be cleared
    for _ in range(3):
        api.ok("POST", act, ana, json={"name": "tray.add", "args": {"type_id": "d12"}})
    assert len({d["group"] for d in _live(api, saga_id, ana)["sets"][0]["content"]["tray"]}) == 1
    api.ok("POST", act, ana, json={"name": "roll", "args": {}})
    three = _live(api, saga_id, ana)["sets"][0]["content"]["roll"]["groups"]
    assert len(three) == 1 and three[0]["name"] == "d12 ×3" and three[0]["result"] == sum(d["value"] for d in three[0]["dice"])
    api.ok("POST", act, bob, json={"name": "roll.clear", "args": {}})
    cleared = _live(api, saga_id, ana)["sets"][0]["content"]
    assert cleared["roll"] is None and cleared["history"][0]["groups"][0]["name"] == "d12 ×3"
    assert client.post(act, headers=vic, json={"name": "roll.clear", "args": {}}).status_code == 403
    # Another roll: the last one goes to the history
    api.ok("POST", act, ana, json={"name": "tray.add", "args": {"type_id": "d4"}})
    api.ok("POST", act, ana, json={"name": "roll", "args": {}})
    content = _live(api, saga_id, ana)["sets"][0]["content"]
    assert content["roll"]["groups"][0]["name"] == "d4" and content["history"][1]["id"] == roll["id"]
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
