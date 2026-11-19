"""System admins, Sagas, members, groups and Saga isolation."""


def test_root_admin_is_bootstrapped(api, root):
    me = api.ok("GET", "/api/me", root)
    assert me["system_admin"]["is_root"] is True
    assert "sagas.create" in me["system_admin"]["permissions"]


def test_wrong_password_is_rejected(client):
    response = client.post("/api/auth/login", json={"login": "root", "password": "nope"})
    assert response.status_code == 401


def test_system_admin_cannot_grant_what_they_lack(api, client, root):
    api.ok("POST", "/api/system/admins", root, json={
        "login": "helper", "password": "helper-pass", "permissions": ["system_admins.manage", "sagas.create"],
    })
    helper = api.login("helper", "helper-pass")
    # helper doesn't hold users.manage, so can't grant it
    response = client.post("/api/system/admins", headers=helper, json={
        "login": "other", "password": "other-pass", "permissions": ["users.manage"],
    })
    assert response.status_code == 403
    # ...but can grant what they hold
    api.ok("POST", "/api/system/admins", helper, json={"login": "other", "password": "other-pass",
                                                        "permissions": ["sagas.create"]})


def test_creating_a_saga_needs_permissions(api, client, root):
    api.ok("POST", "/api/system/admins", root, json={"login": "limited", "password": "limited-pass", "permissions": []})
    limited = api.login("limited", "limited-pass")
    response = client.post("/api/system/sagas", headers=limited, json={
        "name": "Nope", "admin_login": "x", "admin_password": "x-pass-1"})
    assert response.status_code == 403


def test_saga_has_default_groups_and_admin(api, root):
    saga_id, dm = api.saga(root)
    overview = api.ok("GET", f"/api/sagas/{saga_id}", dm)
    assert overview["me"]["role"] == "admin"
    assert {g["key"] for g in overview["groups"] if g["is_default"]} == {"admins", "players", "viewers"}


def test_members_follow_default_groups_and_custom_groups(api, root):
    saga_id, dm = api.saga(root)
    ana_id, _ = api.member(saga_id, dm, "ana")
    bob_id, _ = api.member(saga_id, dm, "bob", role="viewer")
    overview = api.ok("POST", f"/api/sagas/{saga_id}/groups", dm, json={"name": "Party A", "member_ids": [ana_id]})
    groups = {g["key"] or g["name"]: g for g in overview["groups"]}
    assert groups["players"]["member_ids"] == [ana_id]
    assert groups["viewers"]["member_ids"] == [bob_id]
    assert groups["Party A"]["member_ids"] == [ana_id]


def test_players_cannot_manage_members(api, client, root):
    saga_id, dm = api.saga(root)
    _, ana = api.member(saga_id, dm, "ana")
    response = client.post(f"/api/sagas/{saga_id}/members", headers=ana, json={"login": "eve", "password": "eve-pass-1"})
    assert response.status_code == 403


def test_last_admin_cannot_be_demoted(api, client, root):
    saga_id, dm = api.saga(root)
    overview = api.ok("GET", f"/api/sagas/{saga_id}", dm)
    response = client.patch(f"/api/sagas/{saga_id}/members/{overview['me']['member_id']}", headers=dm,
                            json={"role": "player"})
    assert response.status_code == 400


def test_sagas_are_isolated(api, client, root):
    saga_a, dm_a = api.saga(root, "A", "dm-a")
    saga_b, dm_b = api.saga(root, "B", "dm-b")
    # DM of A can't see B at all (404, not 403: Sagas don't leak)
    assert client.get(f"/api/sagas/{saga_b}", headers=dm_a).status_code == 404
    assert client.get(f"/api/sagas/{saga_b}/resources", headers=dm_a).status_code == 404
    # ...and can't reach B's resources through A's URL
    npc = api.ok("POST", f"/api/sagas/{saga_b}/resources", dm_b, json={
        "kind": "character", "type": "npc", "attributes": {"name": "Goblin"}})
    assert client.get(f"/api/sagas/{saga_a}/resources/{npc['id']}", headers=dm_a).status_code == 404


def test_existing_account_can_join_another_saga(api, root):
    saga_a, dm_a = api.saga(root, "A", "dm-a")
    saga_b, dm_b = api.saga(root, "B", "dm-b")
    api.member(saga_a, dm_a, "ana")
    # Saga B's admin adds the existing account by login, without a password
    api.ok("POST", f"/api/sagas/{saga_b}/members", dm_b, json={"login": "ana", "role": "viewer"})
    ana = api.login("ana", "pass-123")
    me = api.ok("GET", "/api/me", ana)
    assert {(s["name"], s["role"]) for s in me["sagas"]} == {("A", "player"), ("B", "viewer")}
