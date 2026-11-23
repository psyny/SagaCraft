"""Saga templates (the Template page): variables and types, starting content, export, new Sagas from a file,
import; items with categories; multipage documents."""
from tests.test_uploads import picture, upload


def _setup(api, root, name="Test Saga", login="dm"):
    saga_id, dm = api.saga(root, name, login)
    return saga_id, dm


def _command(api, saga_id, dm, command, **args):
    return api.ok("POST", f"/api/sagas/{saga_id}/template/command", dm, json={"name": command, "args": args})


def _types(api, saga_id, dm, kind):
    return api.ok("GET", f"/api/sagas/{saga_id}/ruleset", dm)["kinds"][kind]["types"]


def test_variables_and_types(api, client, root):
    saga_id, dm = _setup(api, root)
    _, ana = api.member(saga_id, dm, "ana")
    data = api.ok("GET", f"/api/sagas/{saga_id}/template", dm)
    assert data["own_copy"] is False and data["template"]["name"] == "DnD Lite"
    assert set(data["template"]["kinds"]["item"]["types"]) == {"weapon", "armor", "consumable", "gear", "treasure"}
    assert client.get(f"/api/sagas/{saga_id}/template", headers=ana).status_code == 403
    # A shared item variable and a weapon's own: every item gets the first, weapons the second
    data = _command(api, saga_id, dm, "variable.add", kind="item", variable={"name": "Attunement", "type": "boolean"})
    assert data["own_copy"] is True
    _command(api, saga_id, dm, "variable.add", kind="item", type="weapon", variable={"name": "Range", "type": "number", "default": 5})
    types = _types(api, saga_id, dm, "item")
    assert "attunement" in [a["key"] for a in types["gear"]["attributes"]]
    weapon_keys = [a["key"] for a in types["weapon"]["attributes"]]
    assert "range" in weapon_keys and "range" not in [a["key"] for a in types["gear"]["attributes"]]
    sword = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "item", "type": "weapon", "attributes": {"name": "Longsword", "damage": "1d8 slashing", "attunement": True}})
    assert sword["attributes"]["range"] == 5 and sword["attributes"]["attunement"] is True
    # Edit: name, who sees; a choice's options; order
    _command(api, saga_id, dm, "variable.update", kind="item", type="weapon", key="range",
             changes={"name": "Reach", "view": ["admins"]})
    reach = next(a for a in _types(api, saga_id, dm, "item")["weapon"]["attributes"] if a["key"] == "range")
    assert (reach["name"], reach["view"]) == ("Reach", ["admins"])
    _command(api, saga_id, dm, "variable.update", kind="item", key="rarity", changes={"options": ["Plain", "Magic"]})
    _command(api, saga_id, dm, "variable.move", kind="item", key="attunement", delta=-10)
    assert _types(api, saga_id, dm, "item")["gear"]["attributes"][0]["key"] == "attunement"
    # Mistakes are refused; the app's own variables stay
    url = f"/api/sagas/{saga_id}/template/command"
    for body in ({"name": "variable.add", "args": {"kind": "item", "variable": {"name": "X", "type": "spell"}}},
                 {"name": "variable.delete", "args": {"kind": "item", "key": "name"}},
                 {"name": "variable.delete", "args": {"kind": "character", "key": "controllers"}},
                 {"name": "variable.update", "args": {"kind": "item", "key": "rarity", "changes": {"default": "Epic"}}},
                 {"name": "type.delete", "args": {"kind": "item", "type": "weapon"}},  # the longsword is one
                 {"name": "type.delete", "args": {"kind": "character", "type": "npc"}},  # categories use it
                 {"name": "variable.add", "args": {"kind": "item", "variable": {"name": "Owner", "type": "text", "view": ["controllers"]}}}):
        assert client.post(url, headers=dm, json=body).status_code == 400, body
    # A new item category, used, then deleted when empty
    _command(api, saga_id, dm, "type.add", kind="item", name="Wand")
    assert "wand" in _types(api, saga_id, dm, "item")
    _command(api, saga_id, dm, "type.update", kind="item", type="wand", changes={"plural": "Wands"})
    _command(api, saga_id, dm, "type.delete", kind="item", type="wand")
    # Who sees a shared variable, per type
    _command(api, saga_id, dm, "override.set", kind="character", type="npc", key="level", view=["admins", "players"])
    npc_level = next(a for a in _types(api, saga_id, dm, "character")["npc"]["attributes"] if a["key"] == "level")
    assert npc_level["view"] == ["admins", "players"]
    # Deleting a variable keeps the saved values (unseen)
    _command(api, saga_id, dm, "variable.delete", kind="item", key="attunement")
    again = api.ok("GET", f"/api/sagas/{saga_id}/resources/{sword['id']}", dm)
    assert "attunement" not in again["attributes"]


def test_starting_content_export_and_new_saga_from_file(api, client, root):
    saga_id, dm = _setup(api, root)
    _command(api, saga_id, dm, "info.set", changes={"name": "Grim Lite", "description": "Low fantasy, few heroes."})
    _command(api, saga_id, dm, "variable.add", kind="character", variable={"name": "Sanity", "type": "counter",
                                                                          "default": {"current": 10, "max": 10}})
    _command(api, saga_id, dm, "starting.set", changes={
        "groups": [{"name": "The Company", "color": "#e2604f", "player_party": True, "active": True}],
        "actors_tabs": [{"name": "Travel", "layout": "row"}, {"name": "Fight", "layout": "bar", "turns": True}]})
    assert client.post(f"/api/sagas/{saga_id}/template/command", headers=dm, json={
        "name": "starting.set", "args": {"changes": {"actors_tabs": [{"name": "X", "layout": "spiral"}]}}}).status_code == 400
    # A new Actors Scene starts with the template's tabs (turns: ordered by the turn order)
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Road"})
    scene = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "actors_scene"})
    tabs = scene["sets"][0]["content"]["tabs"]
    assert [(t["name"], t["shape"]) for t in tabs] == [("Travel", "row"), ("Fight", "bar")]
    assert tabs[1]["order_by"] == "initiative" and tabs[1]["turn_controls"] is True
    api.ok("POST", f"/api/sagas/{saga_id}/fog-presets", dm, json={"name": "Ash", "look": {"style": "embers"}})
    # Export: the definitions and what the Saga made its own
    exported = api.ok("GET", f"/api/sagas/{saga_id}/template/export", dm)
    assert exported["format"] == "sagacraft.saga_template" and exported["name"] == "Grim Lite"
    assert [c["name"] for c in exported["starting"]["categories"]] == ["Player", "Major NPC", "Minor NPC"]
    assert {p["name"] for p in exported["fog_presets"]} == {"White mist", "Ash"}
    player_template = next(t for t in exported["display_templates"] if t["for_categories"] == ["player"])
    assert player_template["kind"] == "character"
    # A new Saga from the file
    made = api.ok("POST", "/api/system/sagas", root, json={
        "name": "Second", "admin_login": "dm2", "admin_password": "dm-pass", "template": exported})
    dm2 = api.login("dm2", "dm-pass")
    second = made["id"]
    pc = _types(api, second, dm2, "character")["pc"]
    assert "sanity" in [a["key"] for a in pc["attributes"]]
    assert [g["name"] for g in api.ok("GET", f"/api/sagas/{second}/character-groups", dm2)] == ["The Company"]
    assert {p["name"] for p in api.ok("GET", f"/api/sagas/{second}/fog-presets", dm2)} == {"White mist", "Ash"}
    templates = api.ok("GET", f"/api/sagas/{second}/display-templates", dm2)["templates"]
    assert sorted(t["name"] for t in templates if t["kind"] == "character") == ["Major NPC", "Minor NPC", "Player"]
    # Not a template
    assert client.post("/api/system/sagas", headers=root, json={
        "name": "Bad", "admin_login": "dm3", "admin_password": "dm-pass", "template": {"kinds": {"spell": {}}}}).status_code == 400


def test_import_into_a_saga(api, client, root):
    saga_id, dm = _setup(api, root)
    exported = api.ok("GET", f"/api/sagas/{saga_id}/template/export", dm)
    api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={"kind": "item", "type": "gear", "attributes": {"name": "Rope"}})
    # A file without a type the Saga uses is refused
    without_gear = {**exported, "kinds": {**exported["kinds"], "item": {**exported["kinds"]["item"], "types": {
        k: v for k, v in exported["kinds"]["item"]["types"].items() if k != "gear"}}}}
    assert client.post(f"/api/sagas/{saga_id}/template/import", headers=dm, json=without_gear).status_code == 400
    # Another file: new variables; its fog presets join the Saga's
    exported["kinds"]["item"]["attributes"].append({"key": "cursed", "name": "Cursed", "type": "boolean", "view": ["admins"], "edit": ["admins"]})
    exported["fog_presets"].append({"name": "Deep", "look": {"style": "depths"}})
    result = api.ok("POST", f"/api/sagas/{saga_id}/template/import", dm, json=exported)
    assert result["added"]["fog_presets"] == 1 and result["added"]["categories"] == 0
    assert "cursed" in [a["key"] for a in _types(api, saga_id, dm, "item")["gear"]["attributes"]]


def test_documents_have_pages(api, client, root):
    saga_id, dm = _setup(api, root)
    _, ana = api.member(saga_id, dm, "ana")
    players = next(g["id"] for g in api.ok("GET", f"/api/sagas/{saga_id}", dm)["groups"] if g["key"] == "players")
    scan = upload(client, saga_id, dm, picture(300, 400), category="document").json()
    letter = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "document", "type": "document", "visibility": {"groups": [players], "members": []},
        "attributes": {"name": "The duke's letter", "pages": [
            {"kind": "text", "title": "Page one", "text": "My dear cousin..."},
            {"kind": "image", "title": "The seal", "image": {"file_id": scan["id"]}}]}})
    pages = letter["attributes"]["pages"]
    assert [p["kind"] for p in pages] == ["text", "image"] and pages[0]["id"] != pages[1]["id"]
    seen = api.ok("GET", f"/api/sagas/{saga_id}/resources/{letter['id']}", ana)["attributes"]["pages"]
    assert seen[1]["image"]["url"].startswith("/api/files/")
    url = f"/api/sagas/{saga_id}/resources/{letter['id']}"
    for pages in ([{"kind": "video"}], [{"kind": "image"}], [{"kind": "image", "image": {"file_id": 99999}}]):
        assert client.patch(url, headers=dm, json={"attributes": {"pages": pages}}).status_code == 400


def test_document_folders(api, client, root):
    saga_id, dm = _setup(api, root)
    _, ana = api.member(saga_id, dm, "ana")
    players = next(g["id"] for g in api.ok("GET", f"/api/sagas/{saga_id}", dm)["groups"] if g["key"] == "players")
    url = f"/api/sagas/{saga_id}/folders"
    letters = api.ok("POST", url, dm, json={"name": "  Letters "})
    secrets = api.ok("POST", url, dm, json={"name": "Secrets"})
    api.ok("POST", url, dm, json={"name": "Chapter 10"})
    api.ok("POST", url, dm, json={"name": "Chapter 2"})
    assert letters["name"] == "Letters"
    assert [f["name"] for f in api.ok("GET", url, dm)] == ["Chapter 2", "Chapter 10", "Letters", "Secrets"]
    for body in ({"name": "letters"}, {"name": "  "}, {"name": "Maps", "kind": "character"}):
        assert client.post(url, headers=dm, json=body).status_code in (400, 409), body
    assert client.post(url, headers=ana, json={"name": "Mine"}).status_code == 403

    shared = {"groups": [players], "members": []}
    letter = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "document", "type": "document", "folder_id": letters["id"], "visibility": shared,
        "attributes": {"name": "The duke's letter"}})
    plan = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "document", "type": "document", "attributes": {"name": "The villain's plan"}})
    assert letter["folder_id"] == letters["id"] and plan["folder_id"] is None
    # Filing: drag cards onto a folder; a hidden document's folder stays hidden from players
    api.ok("POST", f"{url}/file", dm, json={"folder_id": secrets["id"], "resource_ids": [plan["id"]]})
    assert {f["name"]: f["count"] for f in api.ok("GET", url, dm)}["Secrets"] == 1
    assert [(f["name"], f["count"]) for f in api.ok("GET", url, ana)] == [("Letters", 1)]
    assert client.post(f"{url}/file", headers=ana, json={"folder_id": None, "resource_ids": [letter["id"]]}).status_code == 403
    sword = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={"kind": "item", "type": "weapon", "attributes": {"name": "Sword"}})
    assert client.post(f"{url}/file", headers=dm, json={"folder_id": letters["id"], "resource_ids": [sword["id"]]}).status_code == 400
    # Moving out of a folder (0), renaming, deleting a folder keeps its documents
    doc_url = f"/api/sagas/{saga_id}/resources/{letter['id']}"
    assert api.ok("PATCH", doc_url, dm, json={"folder_id": 0})["folder_id"] is None
    assert api.ok("PATCH", doc_url, dm, json={"folder_id": letters["id"]})["folder_id"] == letters["id"]
    assert api.ok("PATCH", f"{url}/{letters['id']}", dm, json={"name": "Correspondence"})["name"] == "Correspondence"
    assert client.patch(f"{url}/{letters['id']}", headers=dm, json={"name": "Secrets"}).status_code == 409
    assert client.delete(f"{url}/{letters['id']}", headers=dm).status_code == 204
    assert api.ok("GET", doc_url, dm)["folder_id"] is None
    # Another Saga's folder can't be used
    other_id, other_dm = _setup(api, root, "Other", "dm2")
    theirs = api.ok("POST", f"/api/sagas/{other_id}/folders", other_dm, json={"name": "Theirs"})
    assert client.patch(doc_url, headers=dm, json={"folder_id": theirs["id"]}).status_code == 404


def test_group_variables(api, client, root):
    """Plan 26: the template's group variables (kind "group", no types) and every group's values of them."""
    saga_id, dm = _setup(api, root)
    _, ana = api.member(saga_id, dm, "ana")
    ruleset = api.ok("GET", f"/api/sagas/{saga_id}/ruleset", dm)
    assert [a["key"] for a in ruleset["group_attributes"]] == ["shared_gold", "rations"]  # DnD Lite's
    _command(api, saga_id, dm, "variable.add", kind="group", variable={"name": "Morale", "type": "counter"})
    _command(api, saga_id, dm, "variable.add", kind="group", variable={"name": "Banner", "type": "choice"})
    _command(api, saga_id, dm, "variable.update", kind="group", key="banner", changes={"options": ["Lion", "Raven"]})
    _command(api, saga_id, dm, "variable.move", kind="group", key="banner", delta=-1)
    template = api.ok("GET", f"/api/sagas/{saga_id}/template", dm)["template"]
    assert [a["key"] for a in template["group_attributes"]] == ["shared_gold", "rations", "banner", "morale"]
    url = f"/api/sagas/{saga_id}/template/command"
    for bad in ({"name": "variable.add", "args": {"kind": "group", "type": "weapon", "variable": {"name": "X", "type": "text"}}},
                {"name": "variable.add", "args": {"kind": "group", "variable": {"name": "X", "type": "image"}}}):
        assert client.post(url, headers=dm, json=bad).status_code == 400
    # A group's values: checked against the variables; kept with the group
    group = api.ok("POST", f"/api/sagas/{saga_id}/character-groups", dm, json={"name": "The party"})
    assert group["attributes"] == {}
    g_url = f"/api/sagas/{saga_id}/character-groups/{group['id']}"
    group = api.ok("PATCH", g_url, dm, json={"attributes": {"shared_gold": 120, "banner": "Raven", "morale": {"current": 3, "max": 5}},
                                              "player_party": True, "favorite": True})
    assert group["attributes"] == {"shared_gold": 120, "banner": "Raven", "morale": {"current": 3, "max": 5}} and group["player_party"]
    for bad in ({"shared_gold": "lots"}, {"banner": "Wolf"}, {"unknown": 1}):
        assert client.patch(g_url, headers=dm, json={"attributes": bad}).status_code == 400, bad
    assert client.patch(g_url, headers=ana, json={"attributes": {"shared_gold": 1}}).status_code == 403
    # Deleting a variable keeps the value (unseen) on the group
    _command(api, saga_id, dm, "variable.delete", kind="group", key="banner")
    group = next(g for g in api.ok("GET", f"/api/sagas/{saga_id}/character-groups", dm) if g["id"] == group["id"])
    assert group["attributes"]["banner"] == "Raven"
    # Exported with the template
    exported = api.ok("GET", f"/api/sagas/{saga_id}/template/export", dm)
    assert [a["key"] for a in exported["group_attributes"]] == ["shared_gold", "rations", "morale"]
