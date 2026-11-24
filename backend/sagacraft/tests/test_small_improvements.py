"""Plan 34: the Actors Scene's margins, card sizes and card styles (evidence, sheets), and who is told an action ran."""
from set_types.actors_scene import ActorsScene
from tests.test_actions import _setup
from tests.test_encounters import _combat, _content, _tab
from tests.test_stages import _command


def test_tab_margins_sizes_and_the_old_distance_to_top():
    scene = ActorsScene()
    old = scene.normalize({"tabs": [{"id": 1, "name": "A", "top": 16}, {"id": 2, "name": "B", "top": 30}]})
    a, b = old["tabs"]
    # The old default distance to top (16) becomes the new top margin's default; a value the DM chose stays
    assert (a["margin_top"], b["margin_top"], a["margin_sides"], a["card_size"], a["current_size"]) == (50, 30, 50, 100, 170)
    assert "top" not in a and old["evidence_card_style"] == old["card_style"] == "face"  # evidence: as the default
    again = scene.normalize(old)
    assert again["tabs"][1]["margin_top"] == 30


def test_scene_settings_and_evidence_card(api, client, root):
    saga_id, dm, ana, stage_id, set_id, combat, cards = _combat(api, root)
    # Tab settings: margins, card size and the current turn's, kept within their limits
    _command(api, saga_id, dm, set_id, "tab.set", tab_id=combat, changes={
        "shape": "bar", "margin_top": 20, "margin_sides": 900, "card_size": 10, "current_size": 250})
    tab = _tab(_content(api, saga_id, dm, stage_id), "Combat")
    assert (tab["margin_top"], tab["margin_sides"], tab["card_size"], tab["current_size"]) == (20, 600, 50, 250)
    # Default and evidence card styles: the card ones and the sheets
    url = f"/api/sagas/{saga_id}/sets/{set_id}"
    assert client.patch(url, headers=dm, json={"config": {"evidence_card_style": "poster"}}).status_code == 400
    api.ok("PATCH", url, dm, json={"config": {"card_style": "full", "evidence_card_style": "immersive"}})
    content = _content(api, saga_id, dm, stage_id)
    assert (content["card_style"], content["evidence_card_style"]) == ("full", "immersive")
    assert not any("evidence" in c for c in content["cards"])  # no turn yet: no card in evidence
    _command(api, saga_id, dm, set_id, "turn", action="start")
    content = _content(api, saga_id, dm, stage_id)
    drawn = [c for c in content["cards"] if "evidence" in c]
    assert [c["id"] for c in drawn] == [cards["Goblin 1"]]
    evidence = drawn[0]["evidence"]
    assert evidence["style"] == "immersive" and evidence["sheet"]["name"] == "Goblin 1"  # an instance: its number
    # Players get it too (the active tab is the turn bar)
    live = api.ok("GET", f"/api/sagas/{saga_id}/stages/{stage_id}", dm)
    assert live["sets"][0]["content"]["tab"]["shape"] == "bar"
    # A sheet as the default style: every card carries its sheet
    api.ok("PATCH", url, dm, json={"config": {"card_style": "informative"}})
    content = _content(api, saga_id, dm, stage_id)
    assert all(c["style"] == "informative" and c["sheet"]["informative"] is not None for c in content["cards"])


def test_who_is_told_an_action_ran(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), vic, thorin, bram, rope = _setup(api, root)
    command = f"/api/sagas/{saga_id}/template/command"
    post = lambda cmd, **args: client.post(command, headers=dm, json={"name": cmd, "args": args})  # noqa: E731
    url = f"/api/sagas/{saga_id}/resources/{thorin['id']}/actions"
    assert post("action.update", key="short_rest", changes={"notify": "loud"}).status_code == 400
    sent: list[dict] = []
    import services.realtime as realtime

    async def direct(saga, messages):
        sent.append(messages)

    original, realtime.hub.direct = realtime.hub.direct, direct
    try:
        # Who ran it (the default): the DM is told, with everything; nobody else
        result = api.ok("POST", f"{url}/short_rest", ana)
        assert not result["secret"] and result["changes"]
        assert len(sent) == 1 and len(sent[0]) == 1
        (notice,) = sent[0].values()
        assert (notice["type"], notice["by"], notice["action"], notice["on"]) == ("action_notice", "Ana", "Short rest", "Thorin")
        assert {c["variable"] for c in notice["changes"]} == {"Hit dice", "HP"}
        # Only the DM: Ana isn't told the result
        assert post("action.update", key="long_rest", changes={"notify": "dm"}).status_code == 200
        result = api.ok("POST", f"{url}/long_rest", ana)
        assert result["secret"] and result["changes"] == [] and result["rolls"] == []
        assert len(sent[1]) == 1
        # Everyone: each member told what they may see (Bob doesn't see Thorin, the owners' character)
        assert post("action.update", key="long_rest", changes={"notify": "all"}).status_code == 200
        api.ok("POST", f"{url}/long_rest", ana)
        told = sent[2]
        assert len(told) == 3  # the DM, Bob and the viewer (not Ana, who ran it)
        bobs = told[bob_id]
        assert bobs["on"] is None and bobs["changes"] == []
    finally:
        realtime.hub.direct = original
