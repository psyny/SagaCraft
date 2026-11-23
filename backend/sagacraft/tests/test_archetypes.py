"""Plan 33: archetypes (races, classes, talents...): the Saga template's categories and archetypes, each adding
character variables level by level; a character's archetypes; shown by category in display templates."""


def _setup(api, client, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    command = f"/api/sagas/{saga_id}/template/command"

    def post(cmd, **args):
        return client.post(command, headers=dm, json={"name": cmd, "args": args})
    for name in ("Race", "Class"):
        assert post("archetype_category.add", name=name).status_code == 200
    assert post("archetype.add", name="Human", category="race").status_code == 200
    assert post("archetype.add", name="Warrior", category="class").status_code == 200
    assert post("archetype.update", key="warrior", changes={"max_level": 5, "description": "Fights"}).status_code == 200
    # Its variables: the template's variable commands, kind "archetype", the archetype as the type
    assert post("variable.add", kind="archetype", type="warrior", variable={"name": "Rage", "type": "counter"}).status_code == 200
    assert post("variable.update", kind="archetype", type="warrior", key="rage",
                changes={"level": 2, "view": ["players", "controllers"], "default": {"current": 2, "max": 2}}).status_code == 200
    assert post("variable.add", kind="archetype", type="human", variable={"name": "Languages", "type": "text"}).status_code == 200
    thorin = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={"kind": "character", "type": "pc", "attributes": {
        "name": "Thorin", "controllers": [ana_id]}, "visibility": {"groups": [], "members": [], "owner": True}})
    return saga_id, dm, ana, post, thorin


def test_template_archetypes_and_their_variables(api, client, root):
    saga_id, dm, ana, post, thorin = _setup(api, client, root)
    tpl = api.ok("GET", f"/api/sagas/{saga_id}/template", dm)["template"]
    assert [c["name"] for c in tpl["archetype_categories"]] == ["Race", "Class"]
    warrior = next(a for a in tpl["archetypes"] if a["key"] == "warrior")
    assert warrior["max_level"] == 5 and warrior["variables"][0]["level"] == 2
    # Checked: a level beyond the archetype's, fewer levels than a variable needs, a type it can't add
    assert post("variable.update", kind="archetype", type="warrior", key="rage", changes={"level": 9}).status_code == 400
    assert post("archetype.update", key="warrior", changes={"max_level": 1}).status_code == 400
    assert post("variable.add", kind="archetype", type="warrior", variable={"name": "Fury", "type": "calculated"}).status_code == 400
    # A variable's key is one of the character's: a second "Level" gets its own
    assert post("variable.add", kind="archetype", type="warrior", variable={"name": "Level", "type": "number"}).status_code == 200
    keys = [v["key"] for v in next(a for a in api.ok("GET", f"/api/sagas/{saga_id}/template", dm)["template"]["archetypes"] if a["key"] == "warrior")["variables"]]
    assert keys == ["rage", "level_2"]
    # A category with archetypes isn't deleted; an archetype a character has isn't either
    assert post("archetype_category.delete", key="race").status_code == 400
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm, json={"archetypes": [{"key": "warrior", "level": 1}]})
    assert post("archetype.delete", key="warrior").status_code == 400
    assert post("archetype.delete", key="human").status_code == 200


def test_a_characters_archetypes_give_it_variables_by_level(api, client, root):
    saga_id, dm, ana, post, thorin = _setup(api, client, root)
    url = f"/api/sagas/{saga_id}/resources/{thorin['id']}"
    # Warrior 1: no Rage yet; Human: Languages
    got = api.ok("PATCH", url, dm, json={"archetypes": [{"key": "human", "level": 1}, {"key": "warrior", "level": 1}]})
    assert got["archetypes"] == [{"key": "human", "level": 1}, {"key": "warrior", "level": 1}]
    assert "rage" not in got["attributes"] and "languages" in got["attributes"]
    # Warrior 2: Rage, at its default; its value is the character's like any other
    got = api.ok("PATCH", url, dm, json={"archetypes": [{"key": "human", "level": 1}, {"key": "warrior", "level": 2}]})
    assert got["attributes"]["rage"] == {"current": 2, "max": 2}
    got = api.ok("PATCH", url, dm, json={"attributes": {"rage": {"current": 1, "max": 3}}})
    assert got["attributes"]["rage"] == {"current": 1, "max": 3}
    assert api.ok("GET", url, ana)["attributes"]["rage"]["current"] == 1  # its player sees it (who sees it: players)
    # Checked: unknown, twice, a level it hasn't; the DM's only
    for bad in ([{"key": "elf"}], [{"key": "human"}, {"key": "human"}], [{"key": "warrior", "level": 6}], "warrior"):
        assert client.patch(url, headers=dm, json={"archetypes": bad}).status_code in (400, 422), bad
    assert client.patch(url, headers=ana, json={"archetypes": []}).status_code == 403
    # Back to Warrior 1: Rage goes from what shows (its value stays, unseen, for when it comes back)
    got = api.ok("PATCH", url, dm, json={"archetypes": [{"key": "warrior", "level": 1}]})
    assert "rage" not in got["attributes"] and "languages" not in got["attributes"]
    got = api.ok("PATCH", url, dm, json={"archetypes": [{"key": "warrior", "level": 3}]})
    assert got["attributes"]["rage"] == {"current": 1, "max": 3}


def test_archetypes_show_by_category_and_feed_actions(api, client, root):
    saga_id, dm, ana, post, thorin = _setup(api, client, root)
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{thorin['id']}", dm,
           json={"archetypes": [{"key": "human", "level": 1}, {"key": "warrior", "level": 4}]})
    # A display template shows them by category ("Warrior 4": a level when it has more than one) or all
    sheet_url = f"/api/sagas/{saga_id}/resources/{thorin['id']}/sheet"
    template_id = api.ok("GET", sheet_url, dm)["template"]["id"]  # the one its sheet uses
    api.ok("PATCH", f"/api/sagas/{saga_id}/display-templates/{template_id}", dm, json={"modes": {"informative": {"dm": {"body": [
        {"key": "@archetypes:race"}, {"key": "@archetypes:class"}, {"key": "@archetypes"}]}}}})
    sheet = api.ok("GET", sheet_url, dm)
    shown = {i["key"]: (i["label"], i["value"]) for i in sheet["informative"] if i["key"].startswith("@archetypes")}
    assert shown == {"@archetypes:race": ("Race", "Human"), "@archetypes:class": ("Class", "Warrior 4"),
                     "@archetypes": ("Archetypes", "Human, Warrior 4")}
    # An archetype's variable is a character variable: actions use it
    assert post("action.add", name="Rage", on="character").status_code == 200
    assert post("action.update", key="rage", changes={"costs": [{"source": "self", "variable": "rage", "amount": 1}]}).status_code == 200
    result = api.ok("POST", f"/api/sagas/{saga_id}/resources/{thorin['id']}/actions/rage", ana)
    assert [(c["variable"], c["before"], c["after"]) for c in result["changes"]] == [("Rage", 2, 1)]


def test_variables_change_by_level(api, client, root):
    """A variable can change at some levels (only those): a counter's max (Superiority dice 4, 5 at level 7, 6 at
    15), a number's value. A character gets its level's value, and again whenever its level crosses a change; what's
    spent stays spent; values changed by hand stay until then."""
    saga_id, dm, ana, post, thorin = _setup(api, client, root)
    assert post("archetype.update", key="warrior", changes={"max_level": 20}).status_code == 200
    assert post("variable.add", kind="archetype", type="warrior", variable={"name": "Superiority dice", "type": "counter"}).status_code == 200
    ok = post("variable.update", kind="archetype", type="warrior", key="superiority_dice", changes={
        "level": 3, "default": {"current": 4, "max": 4}, "by_level": [{"level": 15, "value": 6}, {"level": 7, "value": 5}]})
    assert ok.status_code == 200, ok.text
    assert post("variable.add", kind="archetype", type="warrior", variable={"name": "Fighting bonus", "type": "number"}).status_code == 200
    assert post("variable.update", kind="archetype", type="warrior", key="fighting_bonus",
                changes={"default": 1, "by_level": [{"level": 5, "value": 2}]}).status_code == 200
    dice = next(v for a in api.ok("GET", f"/api/sagas/{saga_id}/template", dm)["template"]["archetypes"] if a["key"] == "warrior"
                for v in a["variables"] if v["key"] == "superiority_dice")
    assert dice["by_level"] == [{"level": 7, "value": 5}, {"level": 15, "value": 6}]  # in level order
    # Checked: before it comes, past the levels, a counter's max below 0, a level twice; fewer levels than a change
    for bad in ([{"level": 2, "value": 5}], [{"level": 25, "value": 5}], [{"level": 7, "value": -1}],
                [{"level": 7, "value": 5}, {"level": 7, "value": 6}]):
        assert post("variable.update", kind="archetype", type="warrior", key="superiority_dice", changes={"by_level": bad}).status_code == 400, bad
    assert post("archetype.update", key="warrior", changes={"max_level": 10}).status_code == 400
    assert post("variable.update", kind="human", type="human", key="languages", changes={"by_level": []}).status_code == 400

    url = f"/api/sagas/{saga_id}/resources/{thorin['id']}"
    level = lambda n: api.ok("PATCH", url, dm, json={"archetypes": [{"key": "warrior", "level": n}]})["attributes"]  # noqa: E731
    got = level(3)
    assert got["superiority_dice"] == {"current": 4, "max": 4} and got["fighting_bonus"] == 1
    api.ok("PATCH", url, dm, json={"attributes": {"superiority_dice": {"current": 1, "max": 4}}})  # 3 spent
    got = level(7)  # max 5: one more die, the 3 spent stay spent
    assert got["superiority_dice"] == {"current": 2, "max": 5} and got["fighting_bonus"] == 2
    api.ok("PATCH", url, dm, json={"attributes": {"fighting_bonus": 9}})  # by hand
    assert level(8)["fighting_bonus"] == 9  # no change between 7 and 8: kept
    got = level(15)
    assert got["superiority_dice"] == {"current": 3, "max": 6} and got["fighting_bonus"] == 9
    got = level(4)  # down: back to level 4's
    assert got["superiority_dice"] == {"current": 1, "max": 4} and got["fighting_bonus"] == 1
    # A new character at a high level starts with that level's values
    bram = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={"kind": "character", "type": "pc", "attributes": {"name": "Bram"},
                                                                     "archetypes": [{"key": "warrior", "level": 15}]})
    assert bram["attributes"]["superiority_dice"] == {"current": 6, "max": 6} and bram["attributes"]["fighting_bonus"] == 2
    assert api.ok("GET", f"/api/sagas/{saga_id}/template", dm)["archetype_usage"] == {"warrior": 2}
