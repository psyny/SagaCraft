"""Resources shaped by the DnD Lite ruleset: validation, visibility and edit rules."""
import io

import pytest
from PIL import Image

from domain.ruleset import Ruleset, RulesetError, get_ruleset

def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 40, 40)).save(buffer, "PNG")
    return buffer.getvalue()


PNG = _png()


def test_dnd_lite_characters_share_attributes():
    ruleset = get_ruleset("dnd_lite")
    for type_key in ("pc", "npc"):
        keys = [a.key for a in ruleset.type_def("character", type_key).attributes]
        assert {"name", "hp", "initiative", "controllers", "inventory"} <= set(keys)


def test_subtype_override_changes_view_rule():
    ruleset = get_ruleset("dnd_lite")
    pc_hp = next(a for a in ruleset.type_def("character", "pc").attributes if a.key == "hp")
    npc_hp = next(a for a in ruleset.type_def("character", "npc").attributes if a.key == "hp")
    assert "players" in pc_hp.view
    assert "players" not in npc_hp.view


def test_invalid_ruleset_is_rejected():
    with pytest.raises(RulesetError):
        Ruleset({"key": "bad", "kinds": {"character": {"attributes": [{"key": "x", "type": "nope"}],
                                                       "types": {"a": {}}}}})


def _setup(api, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    bob_id, bob = api.member(saga_id, dm, "bob")
    pc = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "type": "pc",
        "attributes": {"name": "Thorin", "hp": {"current": 20, "max": 20}, "controllers": [ana_id]},
    })
    npc = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "type": "npc", "attributes": {"name": "Goblin", "hp": {"current": 7, "max": 7}},
    })
    return saga_id, dm, ana, bob, pc, npc


def test_new_resources_are_hidden_except_from_controllers(api, root):
    saga_id, dm, ana, bob, pc, npc = _setup(api, root)
    ana_list = api.ok("GET", f"/api/sagas/{saga_id}/resources", ana)
    bob_list = api.ok("GET", f"/api/sagas/{saga_id}/resources", bob)
    assert [r["name"] for r in ana_list] == ["Thorin"]  # she controls Thorin
    assert bob_list == []


def test_player_edits_own_pc_hp_but_not_name_of_npc(api, client, root):
    saga_id, dm, ana, bob, pc, npc = _setup(api, root)
    updated = api.ok("POST", f"/api/sagas/{saga_id}/resources/{pc['id']}/counter", ana, json={"key": "hp", "delta": -5})
    assert updated["attributes"]["hp"]["current"] == 15
    # Ana can't touch the NPC (not visible to her: 404)
    response = client.post(f"/api/sagas/{saga_id}/resources/{npc['id']}/counter", headers=ana,
                           json={"key": "hp", "delta": -1})
    assert response.status_code == 404
    # Ana can't change who controls her PC
    response = client.patch(f"/api/sagas/{saga_id}/resources/{pc['id']}", headers=ana,
                            json={"attributes": {"controllers": []}})
    assert response.status_code == 403


def test_attribute_view_rules_filter_values(api, root):
    saga_id, dm, ana, bob, pc, npc = _setup(api, root)
    overview = api.ok("GET", f"/api/sagas/{saga_id}", dm)
    players = next(g["id"] for g in overview["groups"] if g["key"] == "players")
    # Reveal the NPC to all players: they see its name but not its HP (admins/controllers only)
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{npc['id']}", dm, json={"visibility": {"groups": [players]}})
    goblin = api.ok("GET", f"/api/sagas/{saga_id}/resources/{npc['id']}", bob)
    assert goblin["attributes"]["name"] == "Goblin"
    assert "hp" not in goblin["attributes"]


def test_invalid_values_are_rejected(api, client, root):
    saga_id, dm = api.saga(root)
    response = client.post(f"/api/sagas/{saga_id}/resources", headers=dm, json={
        "kind": "character", "type": "npc", "attributes": {"name": "X", "hp": {"current": "lots", "max": 3}}})
    assert response.status_code == 400
    response = client.post(f"/api/sagas/{saga_id}/resources", headers=dm, json={
        "kind": "character", "type": "npc", "attributes": {}})
    assert response.status_code == 400  # name is required


def test_picture_upload_and_signed_url(api, client, root):
    saga_id, dm = api.saga(root)
    uploaded = client.post(f"/api/sagas/{saga_id}/files", headers=dm, files={"file": ("a.png", PNG, "image/png")})
    assert uploaded.status_code == 200, uploaded.text
    file = uploaded.json()
    npc = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "type": "npc",
        "attributes": {"name": "Ogre", "portrait": {"file_id": file["id"], "face": {"x": 0.5, "y": 0.2, "size": 0.3}}},
    })
    url = npc["attributes"]["portrait"]["url"]
    assert client.get(url).content == PNG
    assert client.get(f"/api/files/{file['id']}").status_code == 404  # unsigned
    assert client.get(url.replace("s=", "s=x")).status_code == 404  # tampered
