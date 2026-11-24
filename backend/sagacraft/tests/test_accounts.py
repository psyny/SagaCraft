"""Plan 42: accounts are the server's (System → Users), display names are each Saga's, the DM looks accounts up."""


def _members(api, saga_id, headers):
    return {m["display_name"]: m for m in api.ok("GET", f"/api/sagas/{saga_id}", headers)["members"]}


def test_names_are_each_sagas(api, client, root):
    first, dm = api.saga(root, name="First")
    second, dm2 = api.saga(root, name="Second", admin_login="dm2")
    _, ana = api.member(first, dm, "ana")
    api.ok("POST", f"/api/sagas/{second}/members", dm2, json={"login": "ana", "account": "existing", "display_name": "Lady Ana"})
    assert "Ana" in _members(api, first, dm) and "Lady Ana" in _members(api, second, dm2)
    api.ok("PATCH", f"/api/sagas/{first}/me", ana, json={"display_name": "Ana the Bard"})
    assert "Ana the Bard" in _members(api, first, dm) and "Lady Ana" in _members(api, second, dm2)
    me = api.ok("GET", "/api/me", ana)
    assert "display_name" not in me
    assert {s["name"]: s["display_name"] for s in me["sagas"]} == {"First": "Ana the Bard", "Second": "Lady Ana"}
    # No name given: the login
    api.ok("POST", f"/api/sagas/{first}/members", dm, json={"login": "bo", "password": "pass-123", "account": "new"})
    assert "bo" in _members(api, first, dm)


def test_logins_are_not_case_sensitive(api, client, root):
    saga_id, dm = api.saga(root)
    api.ok("POST", f"/api/sagas/{saga_id}/members", dm, json={"login": "Carla", "password": "pass-123", "account": "new"})
    assert api.login("CARLA", "pass-123")
    other, dm2 = api.saga(root, name="Other", admin_login="dm2")
    api.ok("POST", f"/api/sagas/{other}/members", dm2, json={"login": "cArLa", "account": "existing"})
    assert client.post(f"/api/sagas/{other}/members", headers=dm2, json={
        "login": "CARLA", "password": "pass-123", "account": "new"}).status_code == 409


def test_the_dm_looks_accounts_up_and_adds_them(api, client, root):
    saga_id, dm = api.saga(root)
    _, ana = api.member(saga_id, dm, "ana")
    other, dm2 = api.saga(root, name="Other", admin_login="dm2")
    for login in ("anabel", "anatole", "bruno"):
        api.ok("POST", f"/api/sagas/{other}/members", dm2, json={"login": login, "password": "pass-123", "account": "new"})
    # Logins with what's typed, not those already in the Saga, two letters at least; the DM's only
    assert [a["login"] for a in api.ok("GET", f"/api/sagas/{saga_id}/accounts?q=AN", dm)] == ["anabel", "anatole"]
    assert api.ok("GET", f"/api/sagas/{saga_id}/accounts?q=a", dm) == []
    assert api.ok("GET", f"/api/sagas/{saga_id}/accounts?q=a%25", dm) == []  # % is a letter, not a wildcard
    assert client.get(f"/api/sagas/{saga_id}/accounts?q=an", headers=ana).status_code == 403
    # Adding: an existing account (with a name here), or a new one
    api.ok("POST", f"/api/sagas/{saga_id}/members", dm, json={"login": "anabel", "account": "existing", "display_name": "Bel", "role": "viewer"})
    assert _members(api, saga_id, dm)["Bel"]["role"] == "viewer"
    assert [a["login"] for a in api.ok("GET", f"/api/sagas/{saga_id}/accounts?q=an", dm)] == ["anatole"]
    add = f"/api/sagas/{saga_id}/members"
    assert client.post(add, headers=dm, json={"login": "nobody", "account": "existing"}).status_code == 404
    assert client.post(add, headers=dm, json={"login": "bruno", "password": "pass-123", "account": "new"}).status_code == 409
    assert client.post(add, headers=dm, json={"login": "newbie", "account": "new"}).status_code == 400
    assert client.post(add, headers=dm, json={"login": "anabel", "account": "existing"}).status_code == 409  # already in


def test_system_admins_manage_accounts(api, client, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    # Only with "manage accounts"
    api.ok("POST", "/api/system/admins", root, json={"login": "helper", "password": "pass-123", "permissions": ["sagas.create"]})
    helper = api.login("helper", "pass-123")
    assert client.get("/api/system/users", headers=helper).status_code == 403
    assert client.get("/api/system/users", headers=dm).status_code == 403
    accounts = {a["login"]: a for a in api.ok("GET", "/api/system/users", root)}
    assert set(accounts) == {"root", "dm", "ana", "helper"}
    assert accounts["ana"]["sagas"] == [{"id": saga_id, "name": "Test Saga", "role": "player", "display_name": "Ana", "is_archived": False}]
    assert accounts["root"]["system_admin"]["is_root"] is True
    assert [a["login"] for a in api.ok("GET", "/api/system/users?q=AN", root)] == ["ana"]
    # Create one, in no Saga
    made = api.ok("POST", "/api/system/users", root, json={"login": "Dora", "password": "pass-123"})
    assert made["login"] == "dora" and made["sagas"] == []
    assert client.post("/api/system/users", headers=root, json={"login": "dora", "password": "pass-123"}).status_code == 409
    # Rename, turn off and on, reset the password
    user_id = accounts["ana"]["id"]
    assert api.ok("PATCH", f"/api/system/users/{user_id}", root, json={"login": "Anna"})["login"] == "anna"
    assert client.patch(f"/api/system/users/{user_id}", headers=root, json={"login": "dm"}).status_code == 409
    api.ok("PATCH", f"/api/system/users/{user_id}", root, json={"is_active": False})
    assert client.post("/api/auth/login", json={"login": "anna", "password": "pass-123"}).status_code == 401
    assert client.get("/api/me", headers=ana).status_code == 401  # signed out at once
    api.ok("PATCH", f"/api/system/users/{user_id}", root, json={"is_active": True, "password": "fresh-pass"})
    assert api.login("anna", "fresh-pass")
    assert client.patch(f"/api/system/users/{user_id}", headers=root, json={"password": "x"}).status_code == 400
    # Never your own account turned off, nor the root's; only the root changes the root's login or password
    root_id = accounts["root"]["id"]
    assert client.patch(f"/api/system/users/{root_id}", headers=root, json={"is_active": False}).status_code == 400
    api.ok("POST", "/api/system/admins", root, json={"login": "keeper", "password": "pass-123", "permissions": ["users.manage"]})
    keeper = api.login("keeper", "pass-123")
    assert client.patch(f"/api/system/users/{root_id}", headers=keeper, json={"password": "taken-over"}).status_code == 403
    # Delete: it leaves every Saga; never the root, yourself, or a Saga's only DM
    assert client.delete(f"/api/system/users/{root_id}", headers=keeper).status_code == 400
    assert client.delete(f"/api/system/users/{accounts['dm']['id']}", headers=root).status_code == 400
    me_id = api.ok("GET", "/api/me", keeper)["id"]
    assert client.delete(f"/api/system/users/{me_id}", headers=keeper).status_code == 400
    group = api.ok("POST", f"/api/sagas/{saga_id}/groups", dm, json={"name": "Scouts", "member_ids": [ana_id]})
    assert client.delete(f"/api/system/users/{user_id}", headers=keeper).status_code == 204
    overview = api.ok("GET", f"/api/sagas/{saga_id}", dm)
    assert [m["display_name"] for m in overview["members"]] == ["The DM"]
    assert next(g for g in overview["groups"] if g["name"] == "Scouts")["member_ids"] == []
    assert client.post("/api/auth/login", json={"login": "anna", "password": "fresh-pass"}).status_code == 401
    assert group


def test_an_account_is_made_a_system_admin_from_its_editor(api, client, root):
    saga_id, dm = api.saga(root)
    api.member(saga_id, dm, "ana")
    ana_id = next(a["id"] for a in api.ok("GET", "/api/system/users?q=ana", root))
    # An existing account, no password: it becomes a system admin with the permissions given
    api.ok("POST", "/api/system/admins", root, json={"login": "Ana", "permissions": ["users.manage"]})
    account = next(a for a in api.ok("GET", "/api/system/users?q=ana", root))
    assert account["system_admin"] == {"is_root": False, "permissions": ["users.manage"]}
    api.ok("PATCH", f"/api/system/admins/{ana_id}", root, json={"permissions": ["users.manage", "sagas.create"]})
    ana = api.login("ana", "pass-123")
    assert client.get("/api/system/users", headers=ana).status_code == 200
    # Removed: an account again, still in its Saga; never the root, nor yourself, nor by someone holding less
    api.ok("POST", "/api/system/admins", root, json={"login": "keeper", "password": "pass-123", "permissions": ["system_admins.manage"]})
    keeper = api.login("keeper", "pass-123")
    assert client.delete(f"/api/system/admins/{ana_id}", headers=keeper).status_code == 403  # holds less than Ana
    root_id = api.ok("GET", "/api/me", root)["id"]
    keeper_id = api.ok("GET", "/api/me", keeper)["id"]
    assert client.delete(f"/api/system/admins/{root_id}", headers=keeper).status_code == 400
    assert client.delete(f"/api/system/admins/{keeper_id}", headers=keeper).status_code == 400
    assert client.delete(f"/api/system/admins/{ana_id}", headers=root).status_code == 204
    assert next(a for a in api.ok("GET", "/api/system/users?q=ana", root))["system_admin"] is None
    assert client.get("/api/system/users", headers=ana).status_code == 403
    assert [s["name"] for s in api.ok("GET", "/api/me", ana)["sagas"]] == ["Test Saga"]
    # A system admin's account can be deleted too (its system admin part goes with it)
    assert client.delete(f"/api/system/users/{keeper_id}", headers=root).status_code == 204
    assert [a["login"] for a in api.ok("GET", "/api/system/admins", root)] == ["root"]


def test_a_new_sagas_dm_is_an_existing_account_or_a_new_one(api, client, root):
    saga_id, dm = api.saga(root)
    api.member(saga_id, dm, "ana")
    # Looking accounts up: for system admins who assign Saga admins (or manage accounts)
    assert [a["login"] for a in api.ok("GET", "/api/system/logins?q=AN", root)] == ["ana"]
    assert client.get("/api/system/logins?q=an", headers=dm).status_code == 403
    new = lambda **body: client.post("/api/system/sagas", headers=root, json={"name": "Second", "ruleset_key": "dnd_lite", **body})  # noqa: E731
    assert new(admin_login="nobody", admin_account="existing").status_code == 404
    assert new(admin_login="ana", admin_password="pass-123", admin_account="new").status_code == 409
    made = new(admin_login="ana", admin_account="existing", admin_display_name="Ana the DM").json()
    ana = api.login("ana", "pass-123")
    assert {s["name"]: (s["role"], s["display_name"]) for s in api.ok("GET", "/api/me", ana)["sagas"]} == {
        "Test Saga": ("player", "Ana"), "Second": ("admin", "Ana the DM")}
    made = client.post("/api/system/sagas", headers=root, json={
        "name": "Third", "ruleset_key": "dnd_lite", "admin_login": "Rita", "admin_password": "pass-123", "admin_account": "new"}).json()
    assert made["admins"] == ["rita"] and api.login("rita", "pass-123")
