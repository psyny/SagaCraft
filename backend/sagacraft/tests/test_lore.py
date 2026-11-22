"""Lore: the in-world calendar, relationships (groups, types, masking, reveal), events (dates, sub-events, the
relationship/event sync), eras, the timeline, graphs and the relationship graph Set."""
import json


def _date(y, m, d):
    return y * 10000 + m * 100 + d


def _setup(api, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    _, vic = api.member(saga_id, dm, "vic", role="viewer")
    groups = {g["key"]: g["id"] for g in api.ok("GET", f"/api/sagas/{saga_id}", dm)["groups"] if g["key"]}
    return saga_id, dm, ana_id, ana, vic, groups


def _resource(api, saga_id, dm, kind, type_key, name, shared_with=None, **attributes):
    body = {"kind": kind, "type": type_key, "attributes": {"name": name, **attributes}}
    if shared_with:
        body["visibility"] = {"groups": shared_with, "members": []}
    return api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json=body)


def test_calendar(api, client, root):
    saga_id, dm, _, ana, _, _ = _setup(api, root)
    saga = api.ok("GET", f"/api/sagas/{saga_id}", ana)
    assert saga["calendar"]["name"] == "Twelve Moons" and saga["story_date"] == _date(1, 1, 1)
    url = f"/api/sagas/{saga_id}/calendar"
    assert client.put(url, headers=ana, json={"preset": "gregorian"}).status_code == 403
    cal = api.ok("PUT", url, dm, json={"preset": "gregorian"})["calendar"]
    assert cal["real"] and cal["months"][1]["days"] == 28
    today = f"{url}/today"
    assert client.put(today, headers=dm, json={"date": _date(2023, 2, 29)}).status_code == 400
    assert api.ok("PUT", today, dm, json={"date": _date(2024, 2, 29)})["story_date"] == _date(2024, 2, 29)
    for bad in ({"months": []}, {"months": [{"name": "A", "days": 0}]}, {"months": [{"name": "A", "days": 30}] * 25}):
        assert client.put(url, headers=dm, json=bad).status_code == 400
    own = api.ok("PUT", url, dm, json={"name": "Ring", "year_label": "AR", "months": [{"name": "Ash", "days": 40}, {"name": "", "days": 20}]})
    assert own["calendar"]["months"][1]["name"] == "Month 2" and own["calendar"]["year_label"] == "AR"
    # Exported with the template: a Saga made from the file counts days the same way
    assert api.ok("GET", f"/api/sagas/{saga_id}/template/export", dm)["starting"]["calendar"]["name"] == "Ring"


def test_relationships_belong_to_groups(api, client, root):
    saga_id, dm, ana_id, ana, vic, g = _setup(api, root)
    shared = [g["players"]]
    aldric = _resource(api, saga_id, dm, "character", "npc", "Aldric", shared)
    bram = _resource(api, saga_id, dm, "character", "npc", "Bram", shared)
    spy = _resource(api, saga_id, dm, "character", "npc", "The spy")  # hidden from players
    url = f"/api/sagas/{saga_id}/relationships"
    # The DM's truth (admins group by default); players don't see it
    truth = api.ok("POST", url, dm, json={"from_id": spy["id"], "to_id": bram["id"], "type": "killed"})
    assert truth["group_id"] == g["admins"] and truth["created_by"]["role"] == "admin" and truth["type"]["label"] == "killed"
    assert api.ok("GET", url, ana) == []
    # A player's theory, in their own group, with a type of their own
    theory = api.ok("POST", url, ana, json={"group_id": g["players"], "from_id": aldric["id"], "to_id": bram["id"],
                                            "type": {"label": "framed", "inverse": "framed by", "directed": True},
                                            "note": "with the duke's seal"})
    assert theory["created_by"] == {"member_id": ana_id, "role": "player"} and theory["type"]["ref"].startswith("c")
    assert theory["editable"] and theory["note"] == "with the duke's seal"
    assert [r["id"] for r in api.ok("GET", url, dm)] == [truth["id"], theory["id"]]
    # Refused: the admins group, a hidden resource, the same resource twice, a viewer writing, an unknown type
    for body in ({"group_id": g["admins"], "from_id": aldric["id"], "to_id": bram["id"], "type": "knows"},
                 {"group_id": g["players"], "from_id": spy["id"], "to_id": bram["id"], "type": "knows"},
                 {"group_id": g["players"], "from_id": bram["id"], "to_id": bram["id"], "type": "knows"},
                 {"group_id": g["players"], "from_id": aldric["id"], "to_id": bram["id"], "type": "nope"}):
        assert client.post(url, headers=ana, json=body).status_code in (400, 403, 404), body
    assert client.post(url, headers=vic, json={"group_id": g["viewers"], "from_id": aldric["id"], "to_id": bram["id"],
                                                 "type": "knows"}).status_code == 403
    assert api.ok("GET", url, vic) == []
    # A typed label matching a predefined type uses it; the group's types list
    same = api.ok("POST", url, ana, json={"group_id": g["players"], "from_id": aldric["id"], "to_id": bram["id"],
                                          "type": {"label": "Knows"}})
    assert same["type"]["ref"] == "knows"
    types = api.ok("GET", f"/api/sagas/{saga_id}/relationship-types", ana)
    assert any(t["label"] == "framed" and t["group_id"] == g["players"] for t in types) and any(t["ref"] == "killed" for t in types)
    framed = theory["type"]["id"]
    assert client.delete(f"/api/sagas/{saga_id}/relationship-types/{framed}", headers=ana).status_code == 400  # in use
    api.ok("PATCH", f"/api/sagas/{saga_id}/relationship-types/{framed}", ana, json={"label": "set up"})
    assert api.ok("GET", f"{url}/{theory['id']}", ana)["type"]["label"] == "set up"
    # Revealing the truth: a copy in the players' group, the hidden killer masked
    copy = api.ok("POST", f"{url}/{truth['id']}/reveal", dm, json={"group_id": g["players"]})
    assert copy["source_id"] == truth["id"] and copy["group_id"] == g["players"]
    seen = next(r for r in api.ok("GET", url, ana) if r["id"] == copy["id"])
    assert seen["from"] == {"id": None, "hidden": True, "kind": "character", "type": None, "name": None, "icon": None, "face": None}
    assert seen["to"]["name"] == "Bram" and "The spy" not in json.dumps(api.ok("GET", url, ana))
    assert "source_id" not in seen
    # By resource; editing and deleting in their own group only
    assert {r["id"] for r in api.ok("GET", f"{url}?resource_id={aldric['id']}", ana)} == {theory["id"], same["id"]}
    assert client.get(f"{url}?resource_id={spy['id']}", headers=ana).status_code == 404
    assert client.patch(f"{url}/{truth['id']}", headers=ana, json={"note": "x"}).status_code == 404
    api.ok("PATCH", f"{url}/{theory['id']}", ana, json={"note": "no, with a forged seal"})
    assert client.delete(f"{url}/{same['id']}", headers=ana).status_code == 204
    # Deleting a resource deletes its relationships
    client.delete(f"/api/sagas/{saga_id}/resources/{aldric['id']}", headers=dm)
    assert all(aldric["id"] not in (r["from"]["id"], r["to"]["id"]) for r in api.ok("GET", url, dm))


def test_events_and_relationships_stay_in_sync(api, client, root):
    saga_id, dm, _, ana, _, g = _setup(api, root)
    api.ok("PUT", f"/api/sagas/{saga_id}/calendar/today", dm, json={"date": _date(300, 3, 12)})
    shared = [g["players"]]
    aldric = _resource(api, saga_id, dm, "character", "npc", "Aldric", shared)
    bram = _resource(api, saga_id, dm, "character", "npc", "Bram", shared)
    bridge = _resource(api, saga_id, dm, "location", "location", "Old Bridge", shared)
    vault = _resource(api, saga_id, dm, "location", "location", "The vault")  # hidden
    # A new event starts today in the story; its date must fit the calendar
    ambush = _resource(api, saga_id, dm, "event", "battle", "Ambush at the old bridge", shared)
    assert ambush["attributes"]["date"] == _date(300, 3, 12)
    assert client.post(f"/api/sagas/{saga_id}/resources", headers=dm, json={
        "kind": "event", "type": "event", "attributes": {"name": "X", "date": _date(300, 13, 1)}}).status_code == 400
    # Resource sub-events: the DM's; members see those whose resource they see
    sub_url = f"/api/sagas/{saga_id}/events/{ambush['id']}/sub-events"
    view = api.ok("POST", sub_url, dm, json={"resource_id": bridge["id"], "what": "Discovered"})
    api.ok("POST", sub_url, dm, json={"resource_id": vault["id"], "what": "Looted"})
    assert client.post(sub_url, headers=ana, json={"resource_id": bridge["id"], "what": "Seen"}).status_code == 403
    assert [s["what"] for s in api.ok("GET", f"/api/sagas/{saga_id}/events/{ambush['id']}", ana)["sub_events"]] == ["Discovered"]
    first = view["sub_events"][0]["id"]
    moved = api.ok("PATCH", f"/api/sagas/{saga_id}/sub-events/{first}", dm, json={"move": 1})
    assert [s["what"] for s in moved["sub_events"]] == ["Looted", "Discovered"]
    # A relationship sub-event: started at the event (start date = the event's)
    url = f"/api/sagas/{saga_id}/relationships"
    killed = api.ok("POST", url, ana, json={"group_id": g["players"], "from_id": aldric["id"], "to_id": bram["id"],
                                            "type": "killed", "event_id": ambush["id"]})
    assert killed["start"] == _date(300, 3, 12) and killed["event_id"] == ambush["id"]
    assert [r["id"] for r in api.ok("GET", f"/api/sagas/{saga_id}/events/{ambush['id']}", ana)["relationships"]] == [killed["id"]]
    # Moving the event moves the relationship's start: one record
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{ambush['id']}", dm, json={"attributes": {"date": _date(300, 4, 1)}})
    assert api.ok("GET", f"{url}/{killed['id']}", ana)["start"] == _date(300, 4, 1)
    # A start date without an event makes one, seen by the relationship's group, named as its creator sees it
    met = api.ok("POST", url, ana, json={"group_id": g["players"], "from_id": aldric["id"], "to_id": bridge["id"],
                                         "type": "lives_in", "start": _date(290, 1, 1)})
    made = api.ok("GET", f"/api/sagas/{saga_id}/events/{met['event_id']}", ana)
    assert made["name"] == "Aldric lives in Old Bridge" and made["date"] == _date(290, 1, 1)
    assert api.ok("GET", f"/api/sagas/{saga_id}/resources/{met['event_id']}", dm)["visibility"]["groups"] == [g["players"]]
    # Changing the start moves the event made for it; clearing it deletes the (empty) event
    api.ok("PATCH", f"{url}/{met['id']}", ana, json={"start": _date(291, 2, 2)})
    assert api.ok("GET", f"/api/sagas/{saga_id}/events/{met['event_id']}", ana)["date"] == _date(291, 2, 2)
    api.ok("PATCH", f"{url}/{met['id']}", ana, json={"start": None})
    assert client.get(f"/api/sagas/{saga_id}/resources/{met['event_id']}", headers=dm).status_code == 404
    assert api.ok("GET", f"{url}/{met['id']}", ana)["event_id"] is None
    # The DM's dated truth makes a hidden event; dates must be in order
    secret = api.ok("POST", url, dm, json={"from_id": bram["id"], "to_id": bridge["id"], "type": "born_in", "start": _date(250, 5, 5)})
    assert api.ok("GET", f"/api/sagas/{saga_id}/resources/{secret['event_id']}", dm)["visibility"] == {"groups": [], "members": []}
    assert client.patch(f"{url}/{secret['id']}", headers=dm, json={"end": _date(240, 1, 1)}).status_code == 400
    # Revealing it shares the event made for it
    api.ok("POST", f"{url}/{secret['id']}/reveal", dm, json={"group_id": g["players"]})
    assert api.ok("GET", f"/api/sagas/{saga_id}/events/{secret['event_id']}", ana)["name"] == "Bram born in Old Bridge"
    # Deleting the relationship deletes the event made only for it
    mine = api.ok("POST", url, dm, json={"from_id": aldric["id"], "to_id": bram["id"], "type": "knows", "start": _date(280, 1, 1)})
    client.delete(f"{url}/{mine['id']}", headers=dm)
    assert client.get(f"/api/sagas/{saga_id}/resources/{mine['event_id']}", headers=dm).status_code == 404
    # Deleting an event keeps its relationships (and their start)
    client.delete(f"/api/sagas/{saga_id}/resources/{ambush['id']}", headers=dm)
    kept = api.ok("GET", f"{url}/{killed['id']}", ana)
    assert kept["event_id"] is None and kept["start"] == _date(300, 4, 1)


def test_timeline_and_eras(api, client, root):
    saga_id, dm, _, ana, _, g = _setup(api, root)
    shared = [g["players"]]
    later = _resource(api, saga_id, dm, "event", "event", "The coronation", shared, date=_date(301, 1, 1))
    _resource(api, saga_id, dm, "event", "event", "The secret pact", None, date=_date(299, 6, 1))
    earlier = _resource(api, saga_id, dm, "event", "battle", "The siege", shared, date=_date(300, 2, 10))
    seen = api.ok("GET", f"/api/sagas/{saga_id}/timeline", ana)
    assert [e["id"] for e in seen["events"]] == [earlier["id"], later["id"]]
    assert len(api.ok("GET", f"/api/sagas/{saga_id}/timeline", dm)["events"]) == 3
    url = f"/api/sagas/{saga_id}/eras"
    war = api.ok("POST", url, dm, json={"name": "The Long War", "start": _date(280, 1, 1), "end": _date(300, 12, 30)})
    assert war["visibility"] == {"groups": [], "members": []} and api.ok("GET", url, ana) == []
    api.ok("PATCH", f"{url}/{war['id']}", dm, json={"visibility": {"groups": shared, "members": []}, "color": "#aa3344"})
    assert [(e["name"], e["end"], e["color"]) for e in api.ok("GET", url, ana)] == [("The Long War", _date(300, 12, 30), "#aa3344")]
    assert "visibility" not in api.ok("GET", url, ana)[0]
    api.ok("POST", url, dm, json={"name": "The Peace", "start": _date(301, 1, 1)})  # still going
    for body in ({"name": "Bad", "start": _date(300, 1, 1), "end": _date(299, 1, 1)}, {"name": "Bad", "start": None}):
        assert client.post(url, headers=dm, json=body).status_code == 400
    assert client.post(url, headers=ana, json={"name": "Mine", "start": _date(1, 1, 1)}).status_code == 403
    assert client.delete(f"{url}/{war['id']}", headers=dm).status_code == 204


def test_graphs(api, client, root):
    saga_id, dm, _, ana, _, g = _setup(api, root)
    shared = [g["players"]]
    a, b, c, d = (_resource(api, saga_id, dm, "character", "npc", n, shared) for n in ("Aldric", "Bram", "Cora", "Dain"))
    town = _resource(api, saga_id, dm, "location", "location", "Riverton", shared)
    url = f"/api/sagas/{saga_id}/relationships"
    for x, y, t, start, end in ((a, b, "sibling", None, None), (b, c, "enemy", _date(300, 1, 1), _date(305, 1, 1)),
                                (c, d, "ally", None, None), (a, town, "lives_in", None, None)):
        api.ok("POST", url, dm, json={"group_id": g["players"], "from_id": x["id"], "to_id": y["id"], "type": t,
                                      "start": start, "end": end})
    graph = f"{url}/graph"
    everything = api.ok("POST", graph, ana, json={"mode": "all"})
    assert len(everything["edges"]) == 4 and len(everything["nodes"]) == 5
    chars = api.ok("POST", graph, ana, json={"mode": "characters"})
    assert {n["name"] for n in chars["nodes"]} == {"Aldric", "Bram", "Cora", "Dain"} and len(chars["edges"]) == 3
    around = api.ok("POST", graph, ana, json={"mode": "around", "ids": [a["id"]], "hops": 1})
    assert {n["name"] for n in around["nodes"]} == {"Aldric", "Bram", "Riverton"}
    two = api.ok("POST", graph, ana, json={"mode": "around", "ids": [a["id"]], "hops": 2, "kinds": ["character"]})
    assert {n["name"] for n in two["nodes"]} == {"Aldric", "Bram", "Cora"}
    at = api.ok("POST", graph, ana, json={"mode": "all", "at": _date(310, 1, 1)})
    assert "enemy of" not in [e["label"] for e in at["edges"]]
    # The DM's graph shows the truth by default (none here); the players' group when asked
    assert api.ok("POST", graph, dm, json={"mode": "all"})["edges"] == []
    assert len(api.ok("POST", graph, dm, json={"mode": "all", "groups": [g["players"]]})["edges"]) == 4
    # References: a location's parent as an edge
    hall = _resource(api, saga_id, dm, "location", "location", "Town hall", shared, parent=town["id"])
    refs = api.ok("POST", graph, ana, json={"mode": "all", "references": True})
    assert any(e["reference"] and e["from"] == f"r{hall['id']}" and e["to"] == f"r{town['id']}" for e in refs["edges"])


def test_relationship_graph_set(api, client, root):
    saga_id, dm, _, ana, _, g = _setup(api, root)
    shared = [g["players"]]
    a = _resource(api, saga_id, dm, "character", "npc", "Aldric", shared)
    spy = _resource(api, saga_id, dm, "character", "npc", "The spy")
    url = f"/api/sagas/{saga_id}/relationships"
    api.ok("POST", url, dm, json={"group_id": g["players"], "from_id": spy["id"], "to_id": a["id"], "type": "hates"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Clues"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "relationship_graph"})
    the_set = stage["sets"][0]
    assert the_set["content"]["config"]["groups"] == [g["players"]] and the_set["content"]["config"]["mode"] == "characters"
    set_url = f"/api/sagas/{saga_id}/sets/{the_set['id']}"
    api.ok("PATCH", set_url, dm, json={"config": {"mode": "all", "labels": False}})
    assert client.patch(set_url, headers=dm, json={"config": {"mode": "nope"}}).status_code == 400
    content = api.ok("POST", f"{set_url}/command", dm, json={"name": "nodes.place", "args": {"positions": {f"r{a['id']}": [0.2, 1.4]}}})["sets"][0]["content"]
    assert content["positions"] == {f"r{a['id']}": [0.2, 1.0]}
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage["id"]})
    live = api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]["sets"][0]["content"]
    assert len(live["graph"]["edges"]) == 1 and "config" not in live and "The spy" not in json.dumps(live)
    assert any(n["hidden"] for n in live["graph"]["nodes"])


def test_template_events_and_sub_event_lists(api, client, root):
    saga_id, dm, _, _, _, _ = _setup(api, root)
    command = f"/api/sagas/{saga_id}/template/command"
    view = api.ok("GET", f"/api/sagas/{saga_id}/template", dm)
    assert "event" in view["kinds"] and "date" in view["new_types"]
    api.ok("POST", command, dm, json={"name": "type.update", "args": {"kind": "location", "type": "location",
                                                                       "changes": {"sub_events": ["Flooded", " flooded ", "Burned"]}}})
    ruleset = api.ok("GET", f"/api/sagas/{saga_id}/ruleset", dm)
    assert ruleset["kinds"]["location"]["types"]["location"]["sub_events"] == ["Flooded", "Burned"]
    api.ok("POST", command, dm, json={"name": "variable.add", "args": {"kind": "character", "variable": {"name": "Birthday", "type": "date"}}})
    char = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={"kind": "character", "type": "npc",
                                                                         "attributes": {"name": "Cora", "birthday": _date(280, 5, 5)}})
    assert char["attributes"]["birthday"] == _date(280, 5, 5)
    # The event's date is the app's: it can't be deleted
    assert client.post(command, headers=dm, json={"name": "variable.delete", "args": {"kind": "event", "key": "date"}}).status_code == 400


def test_older_templates_get_events(api, client, root):
    """A template copied or written before events existed (no event kind) gets the built-in one."""
    saga_id, dm, _, _, _, _ = _setup(api, root)
    old = api.ok("GET", f"/api/sagas/{saga_id}/template/export", dm)
    del old["kinds"]["event"]
    api.ok("POST", f"/api/sagas/{saga_id}/template/import", dm, json=old)
    assert "event" in api.ok("GET", f"/api/sagas/{saga_id}/ruleset", dm)["kinds"]
    assert "event" in api.ok("GET", f"/api/sagas/{saga_id}/template", dm)["template"]["kinds"]
    made = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={"kind": "event", "type": "event", "attributes": {"name": "Coronation"}})
    assert made["attributes"]["date"] == _date(1, 1, 1)


def test_graph_shows_faces(api, client, root):
    """A character without an icon shows its picture's face crop in the graph."""
    from tests.test_uploads import picture, upload

    saga_id, dm, _, _, _, g = _setup(api, root)
    face = upload(client, saga_id, dm, picture(300, 400)).json()
    a = _resource(api, saga_id, dm, "character", "npc", "Aldric", portrait={"file_id": face["id"], "face": {"x": 0.4, "y": 0.2, "size": 0.3}})
    b = _resource(api, saga_id, dm, "character", "npc", "Bram")
    api.ok("POST", f"/api/sagas/{saga_id}/relationships", dm, json={"from_id": a["id"], "to_id": b["id"], "type": "knows"})
    nodes = {n["name"]: n for n in api.ok("POST", f"/api/sagas/{saga_id}/relationships/graph", dm, json={"mode": "all"})["nodes"]}
    assert nodes["Aldric"]["icon"].startswith("/api/files/") and nodes["Aldric"]["face"] == {"x": 0.4, "y": 0.2, "size": 0.3}
    assert nodes["Bram"]["icon"] is None
