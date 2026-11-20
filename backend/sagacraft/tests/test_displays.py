"""Display templates, defaults per type, the panel's template choice, character sheets and names for players."""
import json

from tests.test_stages import _live, _scene


def _templates(api, saga_id, dm):
    return api.ok("GET", f"/api/sagas/{saga_id}/display-templates", dm)


def _by_name(cards):
    return {c["resource_id"]: c for c in cards}


def test_builtin_templates_come_from_the_ruleset(api, root):
    saga_id, dm, *_ = _scene(api, root)
    data = _templates(api, saga_id, dm)
    names = {t["name"]: t for t in data["templates"]}
    assert set(names) == {"Player character", "NPC"}
    assert data["defaults"]["character"] == {"pc": names["Player character"]["id"], "npc": names["NPC"]["id"]}
    npc = names["NPC"]["config"]["modes"]
    assert npc["face"]["hp"]["player"] == {"style": "discrete", "display_on": "card"}
    assert npc["face"]["initiative"]["player"]["display_on"] == "hidden"
    # Sheets: the ruleset hides NPC inventory from players; the DM gets everything
    assert npc["informative"]["inventory"] == {"player": {"style": "number", "display_on": "hidden"},
                                               "dm": {"style": "number", "display_on": "body"}}
    # Calling again doesn't create more
    assert len(_templates(api, saga_id, dm)["templates"]) == 2


def test_templates_are_admin_only(api, client, root):
    saga_id, dm, ana, *_ = _scene(api, root)
    assert client.get(f"/api/sagas/{saga_id}/display-templates", headers=ana).status_code == 403


def test_template_change_reaches_the_cards(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    npc_template = next(t for t in _templates(api, saga_id, dm)["templates"] if t["name"] == "NPC")
    api.ok("PATCH", f"/api/sagas/{saga_id}/display-templates/{npc_template['id']}", dm,
           json={"modes": {"face": {"hp": {"player": {"display_on": "hover"}}, "initiative": {"player": {"display_on": "card"}}}}})
    goblin = _by_name(_live(api, saga_id, ana)["sets"][0]["content"]["cards"])[npc["id"]]
    assert [(a["key"], a["display_on"]) for a in goblin["attributes"]] == [("hp", "hover"), ("initiative", "card")]
    hp = goblin["attributes"][0]
    assert hp["style"] == "discrete" and "current" not in hp and "max" not in hp
    # The DM still sees bars, and how players see them
    dm_goblin = _by_name(_live(api, saga_id, dm)["sets"][0]["content"]["cards"])[npc["id"]]
    dm_hp = next(a for a in dm_goblin["attributes"] if a["key"] == "hp")
    assert dm_hp["style"] == "bar" and dm_hp["player_style"] == "discrete" and dm_hp["player_display_on"] == "hover"
    assert dm_goblin["template"]["id"] == npc_template["id"]


def test_panel_can_pick_another_template_per_type(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    pc_template = next(t for t in _templates(api, saga_id, dm)["templates"] if t["name"] == "Player character")
    # "Open book": a copy of the PC template, used for NPCs on this panel only
    open_book = api.ok("POST", f"/api/sagas/{saga_id}/display-templates", dm,
                       json={"name": "Open book", "copy_from": pc_template["id"]})
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"templates": {"npc": open_book["id"]}}})
    goblin = _by_name(_live(api, saga_id, ana)["sets"][0]["content"]["cards"])[npc["id"]]
    hp = next(a for a in goblin["attributes"] if a["key"] == "hp")
    assert hp["style"] == "bar" and hp["current"] == 31
    # Back to the default
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"templates": {"npc": None}}})
    goblin = _by_name(_live(api, saga_id, ana)["sets"][0]["content"]["cards"])[npc["id"]]
    assert next(a for a in goblin["attributes"] if a["key"] == "hp")["style"] == "discrete"


def test_defaults_and_delete_rules(api, client, root):
    saga_id, dm, *_ = _scene(api, root)
    templates = {t["name"]: t for t in _templates(api, saga_id, dm)["templates"]}
    boss = api.ok("POST", f"/api/sagas/{saga_id}/display-templates", dm, json={"name": "Boss", "copy_from": templates["NPC"]["id"]})
    api.ok("PUT", f"/api/sagas/{saga_id}/display-defaults", dm, json={"kind": "character", "type": "npc", "template_id": boss["id"]})
    assert client.delete(f"/api/sagas/{saga_id}/display-templates/{boss['id']}", headers=dm).status_code == 400
    api.ok("DELETE", f"/api/sagas/{saga_id}/display-templates/{templates['NPC']['id']}", dm)
    data = _templates(api, saga_id, dm)
    assert data["defaults"]["character"]["npc"] == boss["id"]
    assert next(t for t in data["templates"] if t["id"] == boss["id"])["default_for"] == ["npc"]


def test_template_validation(api, client, root):
    saga_id, dm, *_ = _scene(api, root)
    template = _templates(api, saga_id, dm)["templates"][0]
    url = f"/api/sagas/{saga_id}/display-templates/{template['id']}"
    assert client.patch(url, headers=dm, json={"modes": {"face": {"hp": {"player": {"display_on": "highlight"}}}}}).status_code == 400
    assert client.patch(url, headers=dm, json={"modes": {"poster": {}}}).status_code == 400
    too_many = {k: {"dm": {"display_on": "highlight"}} for k in ("level", "hp", "initiative", "controllers", "inventory")}
    assert client.patch(url, headers=dm, json={"modes": {"informative": too_many}}).status_code == 400


def test_sheet_for_players_and_controllers(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    bob_id, bob = api.member(saga_id, dm, "bob")
    everyone = api.ok("GET", f"/api/sagas/{saga_id}", dm)
    groups = [g["id"] for g in everyone["groups"] if g["key"] in ("players", "viewers")]
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{npc['id']}", dm, json={"visibility": {"groups": groups, "members": []}})
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{pc['id']}", dm, json={"visibility": {"groups": groups, "members": []}})

    goblin = api.ok("GET", f"/api/sagas/{saga_id}/resources/{npc['id']}/sheet", bob)
    keys = [i["key"] for i in goblin["immersive"]]
    assert keys == ["hp", "controllers"]  # HP as balls; no level, initiative or inventory (ruleset hides them)
    assert goblin["immersive"][0]["style"] == "discrete" and "31" not in json.dumps(goblin)

    # Ana controls Thorin: she also sees what the ruleset lets her see (her inventory)
    thorin_for_ana = api.ok("GET", f"/api/sagas/{saga_id}/resources/{pc['id']}/sheet", ana)
    thorin_for_bob = api.ok("GET", f"/api/sagas/{saga_id}/resources/{pc['id']}/sheet", bob)
    assert "inventory" in [i["key"] for i in thorin_for_ana["informative"]["body"]]
    assert "inventory" not in json.dumps(thorin_for_bob)

    dm_sheet = api.ok("GET", f"/api/sagas/{saga_id}/resources/{npc['id']}/sheet", dm)
    assert {i["key"] for i in dm_sheet["informative"]["highlight"]} == {"level", "hp", "initiative"}
    assert dm_sheet["template"]["name"] == "NPC"


def test_players_open_sheets_of_cards_on_the_live_stage(api, client, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    url = f"/api/sagas/{saga_id}/resources/{npc['id']}/sheet"
    assert client.get(url, headers=ana).status_code == 404  # the NPC isn't shared
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    assert client.get(url, headers=ana).status_code == 200


def test_names_for_players(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{npc['id']}", dm,
           json={"presentation": {"alias": "Hooded figure"}})
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/reveal", dm, json={"revealed": True})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    live = _live(api, saga_id, ana)["sets"][0]["content"]["cards"]
    assert _by_name(live)[npc["id"]]["name"] == "Hooded figure"
    assert "Goblin" not in json.dumps(live)
    assert "Goblin" not in json.dumps(api.ok("GET", f"/api/sagas/{saga_id}/resources/{npc['id']}/sheet", ana))
    dm_card = _by_name(_live(api, saga_id, dm)["sets"][0]["content"]["cards"])[npc["id"]]
    assert (dm_card["name"], dm_card["player_name"]) == ("Goblin King", "Hooded figure")

    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{npc['id']}", dm, json={"presentation": {"hide_name": True}})
    assert _by_name(_live(api, saga_id, ana)["sets"][0]["content"]["cards"])[npc["id"]]["name"] is None
    resource = api.ok("GET", f"/api/sagas/{saga_id}/resources/{npc['id']}", dm)
    assert resource["presentation"] == {"alias": None, "hide_name": True}


def test_preview_as_dm_and_player(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    npc_template = next(t for t in _templates(api, saga_id, dm)["templates"] if t["name"] == "NPC")
    preview = api.ok("GET", f"/api/sagas/{saga_id}/display-templates/{npc_template['id']}/preview?resource_id={npc['id']}", dm)
    assert set(preview["cards"]["player"]) == {"face", "full", "none"}
    player_hp = preview["cards"]["player"]["face"]["attributes"][0]
    assert player_hp["style"] == "discrete" and "current" not in player_hp
    assert next(a for a in preview["cards"]["dm"]["face"]["attributes"] if a["key"] == "hp")["current"] == 31
    assert [i["key"] for i in preview["sheet"]["player"]["immersive"]] == ["hp", "controllers"]


def test_cards_have_no_settings_of_their_own(api, client, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    response = client.patch(f"/api/sagas/{saga_id}/actors/{cards[0]['id']}", headers=dm, json={"config": {"card_style": "full"}})
    assert response.status_code == 400
