"""Plan 43: System administration of Sagas: the list (search, order, pages), a Saga's page (numbers, members, files),
turning a Saga off and on, deleting it, adding a DM; last logins."""


def _resource(api, saga_id, dm, kind, type_key, name, **attributes):
    return api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={"kind": kind, "type": type_key, "attributes": {"name": name, **attributes}})


def test_the_list_searches_orders_and_pages(api, client, root):
    ids = {}
    for i, name in enumerate(["Gamma", "alpha", "Delta", "Beta", "Epsilon", "Zeta", "Eta"]):
        ids[name], dm = api.saga(root, name=name, admin_login=f"dm{i}")
        if name in ("Delta", "Zeta"):
            api.ok("GET", f"/api/sagas/{ids[name]}", dm)  # opened: its last login
    page = api.ok("GET", "/api/system/sagas", root)
    assert page["total"] == 7 and len(page["sagas"]) == 5
    # Last login first (the latest first), then the never opened by name
    assert [s["name"] for s in page["sagas"]] == ["Zeta", "Delta", "alpha", "Beta", "Epsilon"]
    assert page["sagas"][0]["last_login"] and page["sagas"][2]["last_login"] is None
    assert page["sagas"][0]["admins"] == ["dm5"] and page["sagas"][0]["member_count"] == 1
    second = api.ok("GET", "/api/system/sagas?offset=5", root)
    assert [s["name"] for s in second["sagas"]] == ["Eta", "Gamma"]
    assert [s["name"] for s in api.ok("GET", "/api/system/sagas?order=name&limit=3", root)["sagas"]] == ["alpha", "Beta", "Delta"]
    assert [s["name"] for s in api.ok("GET", "/api/system/sagas?order=newest&limit=2", root)["sagas"]] == ["Eta", "Zeta"]
    found = api.ok("GET", "/api/system/sagas?q=ETA", root)  # not case sensitive
    assert found["total"] == 3 and {s["name"] for s in found["sagas"]} == {"Beta", "Zeta", "Eta"}
    api.ok("PATCH", f"/api/system/sagas/{ids['Gamma']}", root, json={"active": False})
    assert [s["name"] for s in api.ok("GET", "/api/system/sagas?status=inactive", root)["sagas"]] == ["Gamma"]
    assert api.ok("GET", "/api/system/sagas?status=active", root)["total"] == 6
    assert client.get("/api/system/sagas?order=size", headers=root).status_code == 400
    assert client.get("/api/system/sagas", headers=dm).status_code == 403


def test_a_sagas_page_has_its_numbers_never_its_content(api, client, root):
    saga_id, dm = api.saga(root)
    api.member(saga_id, dm, "ana")
    api.member(saga_id, dm, "vic", role="viewer")
    thorin = _resource(api, saga_id, dm, "character", "pc", "Thorin")
    goblin = _resource(api, saga_id, dm, "character", "minor_npc", "Goblin")
    _resource(api, saga_id, dm, "character", "npc", "Duke")
    _resource(api, saga_id, dm, "item", "weapon", "Axe")
    _resource(api, saga_id, dm, "document", "document", "Letter")
    _resource(api, saga_id, dm, "event", "event", "Coronation")
    town = _resource(api, saga_id, dm, "location", "location", "Riverton")
    _resource(api, saga_id, dm, "location", "location", "Nowhere")
    api.ok("POST", f"/api/sagas/{saga_id}/relationships", dm, json={"from_id": thorin["id"], "to_id": goblin["id"], "type": "knows"})
    api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Bridge"})
    from db.session import SessionLocal
    from models import LocationMap, StoredFile

    with SessionLocal() as db:  # files and a map picture, straight in (uploads have their own tests)
        for category, size in (("character", 1000), ("character", 500), ("map", 4000)):
            db.add(StoredFile(saga_id=saga_id, category=category, content_type="image/webp", size=size, data=b"x"))
        db.add(LocationMap(resource_id=town["id"], data={"layers": [{"id": 1, "images": [{"id": 1, "file_id": 1}]}]}))
        db.commit()
    page = api.ok("GET", f"/api/system/sagas/{saga_id}", root)
    assert page["counts"] == {"player_characters": 1, "npcs": 2, "items": 1, "documents": 1, "events": 1, "locations": 2,
                              "maps": 1, "relationships": 1, "stages": 1, "dms": 1, "players": 1, "viewers": 1}
    assert [(f["category"], f["count"], f["size"]) for f in page["files"]] == [("map", 1, 4000), ("character", 2, 1500)]
    assert page["files_size"] == 5500 and page["files"][0]["label"]
    assert [(m["login"], m["role"], m["display_name"]) for m in page["members"]] == [("dm", "admin", "The DM"), ("ana", "player", "Ana"), ("vic", "viewer", "Vic")]
    assert "Thorin" not in str(page)  # numbers, never content
    assert client.get(f"/api/system/sagas/{saga_id}", headers=dm).status_code == 403
    assert client.get("/api/system/sagas/999", headers=root).status_code == 404


def test_turning_a_saga_off_closes_it_to_its_members(api, client, root):
    saga_id, dm = api.saga(root)
    api.ok("POST", "/api/system/admins", root, json={"login": "helper", "password": "pass-123", "permissions": ["sagas.create"]})
    helper = api.login("helper", "pass-123")
    assert client.patch(f"/api/system/sagas/{saga_id}", headers=helper, json={"active": False}).status_code == 403
    assert api.ok("PATCH", f"/api/system/sagas/{saga_id}", root, json={"active": False})["is_archived"] is True
    assert client.get(f"/api/sagas/{saga_id}", headers=dm).status_code == 404
    assert api.ok("GET", "/api/me", dm)["sagas"] == []
    assert api.ok("GET", f"/api/system/sagas/{saga_id}", root)["name"] == "Test Saga"  # system admins still see it
    api.ok("PATCH", f"/api/system/sagas/{saga_id}", root, json={"active": True})
    assert api.ok("GET", f"/api/sagas/{saga_id}", dm)["name"] == "Test Saga"


def test_deleting_a_saga_deletes_everything_in_it(api, client, root):
    saga_id, dm = api.saga(root)
    other, dm2 = api.saga(root, name="Other", admin_login="dm2")
    _resource(api, saga_id, dm, "character", "pc", "Thorin")
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Bridge"})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage["id"]})
    url = f"/api/system/sagas/{saga_id}"
    assert client.delete(f"{url}?confirm=Wrong", headers=root).status_code == 400
    api.ok("POST", "/api/system/admins", root, json={"login": "helper", "password": "pass-123", "permissions": ["sagas.create"]})
    assert client.delete(f"{url}?confirm=Test Saga", headers=api.login("helper", "pass-123")).status_code == 403
    assert client.delete(f"{url}?confirm=Test Saga", headers=root).status_code == 204
    assert client.get(url, headers=root).status_code == 404
    from db.session import SessionLocal
    from models import Resource, SagaMember, Stage

    with SessionLocal() as db:
        assert db.query(Resource).filter(Resource.saga_id == saga_id).count() == 0
        assert db.query(Stage).filter(Stage.saga_id == saga_id).count() == 0
        assert db.query(SagaMember).filter(SagaMember.saga_id == saga_id).count() == 0
    assert api.ok("GET", "/api/me", dm)["sagas"] == []  # the account stays
    assert api.ok("GET", f"/api/sagas/{other}", dm2)["name"] == "Other"


def test_a_dm_is_added_from_the_sagas_page(api, client, root):
    saga_id, dm = api.saga(root)
    _, ana = api.member(saga_id, dm, "ana")
    other, dm2 = api.saga(root, name="Other", admin_login="dm2")
    url = f"/api/system/sagas/{saga_id}/admins"
    # A member made DM; an account from elsewhere; a new one
    api.ok("POST", url, root, json={"account": "existing", "login": "ana"})
    api.ok("POST", url, root, json={"account": "existing", "login": "DM2", "display_name": "Guest DM"})
    page = api.ok("POST", url, root, json={"account": "new", "login": "nova", "password": "pass-123"})
    assert {(m["login"], m["role"], m["display_name"]) for m in page["members"]} == {
        ("dm", "admin", "The DM"), ("ana", "admin", "Ana"), ("dm2", "admin", "Guest DM"), ("nova", "admin", "nova")}
    assert client.post(url, headers=root, json={"account": "new", "login": "ana", "password": "pass-123"}).status_code == 409
    api.ok("POST", "/api/system/admins", root, json={"login": "helper", "password": "pass-123", "permissions": ["sagas.create"]})
    assert client.post(url, headers=api.login("helper", "pass-123"), json={"account": "existing", "login": "ana"}).status_code == 403


def test_last_logins(api, client, root):
    saga_id, dm = api.saga(root)
    accounts = {a["login"]: a for a in api.ok("GET", "/api/system/users", root)}
    assert accounts["dm"]["last_login"] and accounts["root"]["last_login"]
    assert api.ok("GET", f"/api/system/sagas/{saga_id}", root)["last_login"] is None
    api.ok("GET", f"/api/sagas/{saga_id}", dm)
    page = api.ok("GET", f"/api/system/sagas/{saga_id}", root)
    assert page["last_login"] and page["members"][0]["last_login"] == page["last_login"]
