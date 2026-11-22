"""Plan 19: viewers see what players see, owners, who can edit, folders' own visibility, the Timeline Set, the live
link."""
from fastapi.testclient import TestClient


def _setup(api, root, name="Test Saga", admin="dm"):
    saga_id, dm = api.saga(root, name, admin)
    ana_id, ana = api.member(saga_id, dm, f"ana{admin}")
    bob_id, bob = api.member(saga_id, dm, f"bob{admin}")
    vic_id, vic = api.member(saga_id, dm, f"vic{admin}", role="viewer")
    groups = {g["key"]: g["id"] for g in api.ok("GET", f"/api/sagas/{saga_id}", dm)["groups"] if g["key"]}
    return saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), groups


def _make(api, saga_id, dm, **body):
    return api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json=body)


def test_viewers_see_what_players_see_and_never_edit(api, client, root):
    saga_id, dm, (ana_id, ana), _, (vic_id, vic), g = _setup(api, root)
    url = f"/api/sagas/{saga_id}/resources"
    shared = _make(api, saga_id, dm, kind="item", type="gear", attributes={"name": "Rope"},
                   visibility={"groups": [g["players"]], "members": []})
    _make(api, saga_id, dm, kind="item", type="gear", attributes={"name": "Secret"})
    assert [r["name"] for r in api.ok("GET", f"{url}?kind=item", vic)] == ["Rope"]
    # A viewer put in control of a character still edits nothing (and sees it)
    hero = _make(api, saga_id, dm, kind="character", type="pc",
                 attributes={"name": "Thorin", "hp": {"current": 9, "max": 9}, "controllers": [ana_id, vic_id]})
    seen = api.ok("GET", f"{url}/{hero['id']}", vic)
    assert seen["editable"] == [] and "hp" in seen["attributes"]
    assert client.patch(f"{url}/{hero['id']}", headers=vic, json={"attributes": {"hp": {"current": 1, "max": 9}}}).status_code == 403
    assert "hp" in api.ok("GET", f"{url}/{hero['id']}", ana)["editable"]
    assert shared["id"] in [r["id"] for r in api.ok("GET", f"{url}?kind=item", ana)]


def test_owners_see_what_shows_to_the_owner(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), _, _ = _setup(api, root)
    url = f"/api/sagas/{saga_id}/resources"
    journal = _make(api, saga_id, dm, kind="document", type="document", attributes={"name": "Ana's journal"},
                    owners=[ana_id], visibility={"groups": [], "members": [], "owner": True})
    assert journal["owners"] == [ana_id] and journal["visibility"]["owner"] is True and journal["shared"]
    assert [r["name"] for r in api.ok("GET", f"{url}?kind=document", ana)] == ["Ana's journal"]
    assert api.ok("GET", f"{url}?kind=document", bob) == []
    # Owners are members of this Saga; characters' owners are their players in control
    assert client.patch(f"{url}/{journal['id']}", headers=dm, json={"owners": [99999]}).status_code == 400
    hero = _make(api, saga_id, dm, kind="character", type="pc", attributes={"name": "Thorin", "controllers": [ana_id]})
    assert client.patch(f"{url}/{hero['id']}", headers=dm, json={"owners": [bob_id]}).status_code == 400
    assert client.patch(f"{url}/{journal['id']}", headers=ana, json={"owners": [ana_id, bob_id]}).status_code == 403


def test_who_can_edit_a_character(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), g = _setup(api, root)
    url = f"/api/sagas/{saga_id}/resources"
    party = api.ok("POST", f"/api/sagas/{saga_id}/groups", dm, json={"name": "Party", "member_ids": [bob_id]})
    party_id = next(x["id"] for x in party["groups"] if x["name"] == "Party")
    hero = _make(api, saga_id, dm, kind="character", type="pc", attributes={"name": "Thorin", "hp": {"current": 9, "max": 9},
                                                                            "controllers": [ana_id]})
    assert hero["editors"] == {"groups": [], "members": [], "owner": True}  # by default: its owners
    assert "hp" in api.ok("GET", f"{url}/{hero['id']}", ana)["editable"]
    assert client.get(f"{url}/{hero['id']}", headers=bob).status_code == 404  # hidden from other players
    # A group can edit (and so sees it); the owner no longer can, but still sees their character
    api.ok("PATCH", f"{url}/{hero['id']}", dm, json={"editors": {"groups": [party_id], "members": [], "owner": False}})
    assert "hp" in api.ok("GET", f"{url}/{hero['id']}", bob)["editable"]
    api.ok("PATCH", f"{url}/{hero['id']}", bob, json={"attributes": {"hp": {"current": 4, "max": 9}}})
    assert api.ok("GET", f"{url}/{hero['id']}", ana)["editable"] == []
    assert client.patch(f"{url}/{hero['id']}", headers=ana, json={"attributes": {"hp": {"current": 1, "max": 9}}}).status_code == 403
    # Viewers never edit, even when named (so that doesn't show it to them either); only the DM sets it; only
    # characters have it
    api.ok("PATCH", f"{url}/{hero['id']}", dm, json={"editors": {"groups": [g["viewers"]], "members": [vic_id]}})
    assert client.get(f"{url}/{hero['id']}", headers=vic).status_code == 404
    api.ok("PATCH", f"{url}/{hero['id']}", dm, json={"visibility": {"groups": [g["players"]], "members": []}})
    assert api.ok("GET", f"{url}/{hero['id']}", vic)["editable"] == []
    assert client.patch(f"{url}/{hero['id']}", headers=ana, json={"editors": {"members": [ana_id]}}).status_code == 403
    rope = _make(api, saga_id, dm, kind="item", type="gear", attributes={"name": "Rope"})
    assert client.patch(f"{url}/{rope['id']}", headers=dm, json={"editors": {"members": [ana_id]}}).status_code == 400


def test_folders_override_or_inherit(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), g = _setup(api, root)
    url = f"/api/sagas/{saga_id}/folders"
    res = f"/api/sagas/{saga_id}/resources"
    gear = api.ok("POST", url, dm, json={"name": "Gear", "kind": "item"})
    assert gear["visibility"] is None  # inherit
    rope = _make(api, saga_id, dm, kind="item", type="gear", attributes={"name": "Rope"}, folder_id=gear["id"],
                 visibility={"groups": [g["players"]], "members": []})
    hidden = _make(api, saga_id, dm, kind="item", type="gear", attributes={"name": "Cursed ring"}, folder_id=gear["id"])
    assert [r["name"] for r in api.ok("GET", f"{res}?kind=item", ana)] == ["Rope"]
    # Overriding: the folder decides (here: only Bob), whatever the items say
    api.ok("PATCH", f"{url}/{gear['id']}", dm, json={"visibility": {"groups": [], "members": [bob_id]}})
    assert api.ok("GET", f"{res}?kind=item", ana) == []
    assert sorted(r["name"] for r in api.ok("GET", f"{res}?kind=item", bob)) == ["Cursed ring", "Rope"]
    ring = api.ok("GET", f"{res}/{hidden['id']}", dm)
    assert ring["visibility"] == {"groups": [], "members": []} and ring["folder_visibility"]["members"] == [bob_id]
    assert ring["shared"] is True
    # Out of the folder, an item gets its own visibility back
    api.ok("PATCH", f"{res}/{rope['id']}", dm, json={"folder_id": 0})
    assert [r["name"] for r in api.ok("GET", f"{res}?kind=item", ana)] == ["Rope"]
    # A folder shows when shown to the member, even empty; an "owner" folder only through what it holds
    maps = api.ok("POST", url, dm, json={"name": "Maps", "kind": "location"})
    api.ok("PATCH", f"{url}/{maps['id']}", dm, json={"visibility": {"groups": [g["players"]], "members": []}})
    assert [f["name"] for f in api.ok("GET", f"{url}?kind=location", vic)] == ["Maps"]
    assert "visibility" not in api.ok("GET", f"{url}?kind=location", vic)[0]
    journals = api.ok("POST", url, dm, json={"name": "Journals"})
    api.ok("PATCH", f"{url}/{journals['id']}", dm, json={"visibility": {"groups": [], "members": [], "owner": True}})
    _make(api, saga_id, dm, kind="document", type="document", attributes={"name": "Ana's"}, owners=[ana_id],
          folder_id=journals["id"])
    assert [(f["name"], f["count"]) for f in api.ok("GET", f"{url}?kind=document", ana)] == [("Journals", 1)]
    assert api.ok("GET", f"{url}?kind=document", bob) == []
    assert api.ok("GET", f"{res}?kind=document", bob) == []
    # Back to inherit; players can't change folders
    assert api.ok("PATCH", f"{url}/{gear['id']}", dm, json={"inherit": True})["visibility"] is None
    assert client.patch(f"{url}/{gear['id']}", headers=ana, json={"inherit": True}).status_code == 403


def test_timeline_set_shows_the_chosen_knowledge(api, client, root):
    saga_id, dm, (ana_id, ana), _, (vic_id, vic), g = _setup(api, root)
    shared = {"groups": [g["players"]], "members": []}
    _make(api, saga_id, dm, kind="event", type="event", attributes={"name": "The siege", "date": 3000101}, visibility=shared)
    _make(api, saga_id, dm, kind="event", type="battle", attributes={"name": "Secret duel", "date": 3000201})
    _make(api, saga_id, dm, kind="event", type="event", attributes={"name": "Long ago", "date": 1000101}, visibility=shared)
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "History"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "timeline"})
    the_set = next(s for s in stage["sets"] if s["type"] == "timeline")
    set_url = f"/api/sagas/{saga_id}/sets/{the_set['id']}"
    content = the_set["content"]
    assert content["config"]["groups"] == [g["players"]]  # the players' knowledge by default
    assert [e["name"] for e in content["events"]] == ["Long ago", "The siege"]
    assert content["calendar"]["name"] and content["today"]
    api.ok("PATCH", set_url, dm, json={"config": {"from": 2000101, "expanded": True}})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage["id"]})
    for who in (ana, vic):
        live = api.ok("GET", f"/api/sagas/{saga_id}/live", who)["stage"]
        seen = next(s for s in live["sets"] if s["type"] == "timeline")["content"]
        assert [e["name"] for e in seen["events"]] == ["The siege"] and seen["expanded"] and "config" not in seen
    # The DM's knowledge (no group) and a type filter
    api.ok("PATCH", set_url, dm, json={"config": {"groups": [], "types": ["battle"], "from": None}})
    seen = next(s for s in api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]["sets"] if s["type"] == "timeline")["content"]
    assert [e["name"] for e in seen["events"]] == ["Secret duel"]
    for bad in ({"from": 3000101, "to": 1000101}, {"groups": "x"}, {"zoom": 2}):
        assert client.patch(set_url, headers=dm, json={"config": bad}).status_code == 400


def test_live_link(api, client: TestClient, root):
    saga_id, dm, (ana_id, ana), _, _, g = _setup(api, root)
    other_id, other_dm, *_ = _setup(api, root, "Other", "dm2")
    link = f"/api/sagas/{saga_id}/live-link"
    assert "live_token" in api.ok("GET", f"/api/sagas/{saga_id}", dm) and api.ok("GET", f"/api/sagas/{saga_id}", dm)["live_token"] is None
    assert "live_token" not in api.ok("GET", f"/api/sagas/{saga_id}", ana)
    assert client.put(link, headers=ana, json={"on": True}).status_code == 403
    assert client.put(f"/api/sagas/{saga_id}/live-link", headers=other_dm, json={"on": True}).status_code == 404
    token = api.ok("PUT", link, dm, json={"on": True})["live_token"]
    assert len(token) >= 20 and api.ok("PUT", link, dm, json={"on": True})["live_token"] == token  # kept
    # Nothing live yet: the screen waits
    screen = client.get(f"/api/live/{token}").json()
    assert screen["saga"]["name"] == "Test Saga" and screen["stage"] is None and "members" not in screen["saga"]
    # The live Stage, as a viewer: what players see only
    _make(api, saga_id, dm, kind="event", type="event", attributes={"name": "Shown", "date": 3000101},
          visibility={"groups": [g["players"]], "members": []})
    _make(api, saga_id, dm, kind="event", type="event", attributes={"name": "Hidden", "date": 3000101})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Tonight"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "timeline"})
    private = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "efx_controls"})
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{next(s['id'] for s in stage['sets'] if s['type'] == 'timeline')}", dm,
           json={"config": {"groups": []}})  # the DM's knowledge: its Set shows everything to whoever sees it
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage["id"]})
    shown = client.get(f"/api/live/{token}").json()["stage"]
    assert [s["type"] for s in shown["sets"]] == ["timeline"]  # the DM's controls are admins only
    assert "environment_id" not in shown or shown["environment_id"] is None
    assert private  # (used above)
    # A new link stops the old one; off stops it too; unknown tokens and other Sagas' tokens never work
    new = api.ok("POST", f"{link}/new", dm)["live_token"]
    assert new != token and client.get(f"/api/live/{token}").status_code == 404
    assert client.get(f"/api/live/{new}").status_code == 200
    with client.websocket_connect(f"/api/live/{new}/ws") as socket:
        assert socket.receive_json()["type"] == "live_stage"
    assert api.ok("PUT", link, dm, json={"on": False})["live_token"] is None
    assert client.get(f"/api/live/{new}").status_code == 404
    assert client.get("/api/live/nope").status_code == 404
    other = api.ok("PUT", f"/api/sagas/{other_id}/live-link", other_dm, json={"on": True})["live_token"]
    assert client.get(f"/api/live/{other}").json()["saga"]["name"] == "Other"
