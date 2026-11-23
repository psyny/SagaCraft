"""Display templates (lists per region), defaults per category, the panel's template choice, character sheets and names for players."""
import json

from domain import display
from domain.display import ELEMENT_DEFAULTS
from tests.test_stages import _categories, _live, _reveal, _scene


def _templates(api, saga_id, dm):
    return api.ok("GET", f"/api/sagas/{saga_id}/display-templates", dm)


def _by_name(cards):
    return {c["resource_id"]: c for c in cards}


def _keys(items, region=None):
    return [i["key"] for i in items if region is None or i["region"] == region]


def test_builtin_templates_come_from_the_ruleset(api, root):
    """One built-in template per category of the Saga template; a type's default is its first category's."""
    saga_id, dm, *_ = _scene(api, root)
    data = _templates(api, saga_id, dm)
    names = {t["name"]: t for t in data["templates"] if t["kind"] == "character"}
    assert set(names) == {"Player", "Major NPC", "Minor NPC"}
    # Items: one per item category, its default
    items = {t["name"]: t["id"] for t in data["templates"] if t["kind"] == "item"}
    assert set(items) == {"Weapon", "Armor", "Consumable", "Gear", "Treasure"}
    assert data["defaults"]["item"]["weapon"] == items["Weapon"]
    assert data["defaults"]["character"] == {"pc": names["Player"]["id"], "npc": names["Major NPC"]["id"]}
    config = names["Major NPC"]["config"]
    assert config["version"] == 2 and config["color"].startswith("#")
    face = config["modes"]["face"]
    assert face["player"]["top"] == [{"key": "@name", "style": "text", **ELEMENT_DEFAULTS}]
    assert [(e["key"], e["style"]) for e in face["player"]["bottom"]] == [("hp", "discrete")]
    assert [e["key"] for e in face["dm"]["hover_bottom"]] == ["level", "hit_dice", "carried"]
    # Sheets: the ruleset hides NPC inventory from players; the DM gets everything
    informative = config["modes"]["informative"]
    assert "inventory" not in [e["key"] for r in informative["player"].values() for e in r]
    assert [e["key"] for e in informative["dm"]["header"]] == ["level", "hp", "initiative", "hit_dice"]
    assert "inventory" in [e["key"] for e in informative["dm"]["body"]]
    # Calling again doesn't create more
    assert len(_templates(api, saga_id, dm)["templates"]) == 8


def test_templates_are_admin_only(api, client, root):
    saga_id, dm, ana, *_ = _scene(api, root)
    assert client.get(f"/api/sagas/{saga_id}/display-templates", headers=ana).status_code == 403


def _template(api, saga_id, dm, name):
    return next(t for t in _templates(api, saga_id, dm)["templates"] if t["name"] == name)


def test_template_change_reaches_the_cards(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    npc_template = _template(api, saga_id, dm, "Major NPC")
    api.ok("PATCH", f"/api/sagas/{saga_id}/display-templates/{npc_template['id']}", dm, json={"modes": {"face": {"player": {
        "bottom": [{"key": "initiative"}], "hover_bottom": [{"key": "hp", "style": "discrete", "icon": "hearts"}]}}}})
    goblin = _by_name(_live(api, saga_id, ana)["sets"][0]["content"]["cards"])[npc["id"]]
    assert [(a["key"], a["region"]) for a in goblin["attributes"]] == [("@name", "top"), ("initiative", "bottom"), ("hp", "hover_bottom")]
    assert goblin["attributes"][0]["value"] == "Goblin King"
    hp = goblin["attributes"][2]
    assert hp["style"] == "discrete" and hp["icon"] == "hearts" and "current" not in hp and "max" not in hp
    # The DM still sees bars, and how players see them
    dm_goblin = _by_name(_live(api, saga_id, dm)["sets"][0]["content"]["cards"])[npc["id"]]
    dm_hp = next(a for a in dm_goblin["attributes"] if a["key"] == "hp")
    assert dm_hp["style"] == "bar" and dm_hp["player_style"] == "discrete" and dm_hp["player_region"] == "hover_bottom"
    dm_level = next(a for a in dm_goblin["attributes"] if a["key"] == "level")
    assert dm_level["player_region"] == "hidden" and dm_level["player_style"] is None
    assert dm_goblin["template"]["id"] == npc_template["id"]


def test_panel_can_pick_another_template_per_category(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    major = str(_categories(api, saga_id, dm)["major_npc"]["id"])
    # "Open book": a copy of the Player template, used for Major NPCs on this scene only
    open_book = api.ok("POST", f"/api/sagas/{saga_id}/display-templates", dm,
                       json={"name": "Open book", "copy_from": _template(api, saga_id, dm, "Player")["id"]})
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"templates": {major: open_book["id"]}}})
    goblin = _by_name(_live(api, saga_id, ana)["sets"][0]["content"]["cards"])[npc["id"]]
    hp = next(a for a in goblin["attributes"] if a["key"] == "hp")
    assert hp["style"] == "bar" and hp["current"] == 31
    # Back to the default
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"templates": {major: None}}})
    goblin = _by_name(_live(api, saga_id, ana)["sets"][0]["content"]["cards"])[npc["id"]]
    assert next(a for a in goblin["attributes"] if a["key"] == "hp")["style"] == "discrete"


def test_defaults_and_delete_rules(api, client, root):
    saga_id, dm, *_ = _scene(api, root)
    templates = {t["name"]: t for t in _templates(api, saga_id, dm)["templates"]}
    minor = _categories(api, saga_id, dm)["minor_npc"]["id"]
    boss = api.ok("POST", f"/api/sagas/{saga_id}/display-templates", dm, json={"name": "Boss", "copy_from": templates["Major NPC"]["id"]})
    assert boss["config"] == templates["Major NPC"]["config"]
    api.ok("PUT", f"/api/sagas/{saga_id}/display-defaults", dm, json={"kind": "character", "type": "npc", "template_id": boss["id"]})
    assert client.delete(f"/api/sagas/{saga_id}/display-templates/{boss['id']}", headers=dm).status_code == 400
    # A category's own default can't be deleted; once it follows its type, it can
    assert client.delete(f"/api/sagas/{saga_id}/display-templates/{templates['Minor NPC']['id']}", headers=dm).status_code == 400
    api.ok("PUT", f"/api/sagas/{saga_id}/display-defaults", dm, json={"category_id": minor, "template_id": None})
    api.ok("DELETE", f"/api/sagas/{saga_id}/display-templates/{templates['Minor NPC']['id']}", dm)
    data = _templates(api, saga_id, dm)
    assert next(t for t in data["templates"] if t["id"] == boss["id"])["default_for"] == [minor]


def test_category_defaults(api, client, root):
    """Each category can have its own default; without one it follows its type's."""
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    categories = _categories(api, saga_id, dm)
    major = categories["major_npc"]["id"]
    templates = {t["name"]: t for t in _templates(api, saga_id, dm)["templates"]}
    data = _templates(api, saga_id, dm)
    assert data["category_defaults"][str(major)] == templates["Major NPC"]["id"]
    assert data["category_defaults"][str(categories["player"]["id"])] == templates["Player"]["id"]
    blank = api.ok("POST", f"/api/sagas/{saga_id}/display-templates", dm, json={"name": "Blank"})
    api.ok("PUT", f"/api/sagas/{saga_id}/display-defaults", dm, json={"category_id": major, "template_id": blank["id"]})
    goblin = _by_name(_live(api, saga_id, ana)["sets"][0]["content"]["cards"])[npc["id"]]
    assert _keys(goblin["attributes"]) == ["@name"]  # blank: players see only the name
    dm_goblin = _by_name(_live(api, saga_id, dm)["sets"][0]["content"]["cards"])[npc["id"]]
    assert _keys(dm_goblin["attributes"], "bottom") == ["level", "hp", "initiative", "hit_dice", "carried"]  # the DM sees every value
    assert client.delete(f"/api/sagas/{saga_id}/display-templates/{blank['id']}", headers=dm).status_code == 400
    # Back to the type's default
    api.ok("PUT", f"/api/sagas/{saga_id}/display-defaults", dm, json={"category_id": major, "template_id": None})
    goblin = _by_name(_live(api, saga_id, ana)["sets"][0]["content"]["cards"])[npc["id"]]
    assert "hp" in _keys(goblin["attributes"])


def test_template_validation(api, client, root):
    saga_id, dm, *_ = _scene(api, root)
    template = next(t for t in _templates(api, saga_id, dm)["templates"] if t["kind"] == "character")
    url = f"/api/sagas/{saga_id}/display-templates/{template['id']}"

    def patch(body):
        return client.patch(url, headers=dm, json=body).status_code

    assert patch({"modes": {"face": {"player": {"header": []}}}}) == 400  # not a card region
    assert patch({"modes": {"poster": {}}}) == 400
    assert patch({"modes": {"face": {"player": {"top": [{"key": "@name"}, {"key": "@category"}]}}}}) == 400  # one element
    assert patch({"modes": {"face": {"player": {"bottom": [{"key": "hp"}, {"key": "hp"}]}}}}) == 400  # once per view
    assert patch({"modes": {"face": {"player": {"bottom": [{"key": "@name"}]}}}}) == 400  # already on top
    assert patch({"modes": {"face": {"player": {"bottom": [{"key": "initiative", "style": "discrete"}]}}}}) == 400
    assert patch({"modes": {"face": {"player": {"bottom": [{"key": "inventory"}]}}}}) == 400  # lists don't fit cards
    assert patch({"modes": {"face": {"player": {"bottom": [{"key": "hp", "icon": "stars"}]}}}}) == 400
    header = [{"key": k} for k in ("level", "hp", "initiative", "controllers", "inventory")]
    assert patch({"modes": {"informative": {"dm": {"header": header, "body": []}}}}) == 400
    assert patch({"color": "red"}) == 400
    updated = api.ok("PATCH", url, dm, json={"color": "#A1B2C3", "modes": {"informative": {"player": {"body": [{"key": "inventory"}]}}}})
    assert updated["config"]["color"] == "#a1b2c3"
    assert updated["config"]["modes"]["informative"]["player"]["body"][0]["key"] == "inventory"


def test_colors_and_system_elements(api, root):
    """Values can take their group's, their template's or their player's color; Category and Group are elements too."""
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    group = api.ok("POST", f"/api/sagas/{saga_id}/character-groups", dm,
                   json={"name": "Bridge goblins", "color": "#e2604f", "members": [{"resource_id": npc["id"]}]})
    template = _template(api, saga_id, dm, "Major NPC")
    api.ok("PATCH", f"/api/sagas/{saga_id}/display-templates/{template['id']}", dm, json={"color": "#52c06e", "modes": {"face": {"player": {
        "bottom": [{"key": "hp", "style": "discrete", "color": "group"}, {"key": "@category", "color": "template"},
                   {"key": "@group"}, {"key": "level", "color": "player"}]}}}})
    goblin = _by_name(_live(api, saga_id, ana)["sets"][0]["content"]["cards"])[npc["id"]]
    assert goblin["color"] == "#e2604f"
    items = {i["key"]: i for i in goblin["attributes"]}
    assert items["hp"]["color"] == "#e2604f"
    assert (items["@category"]["value"], items["@category"]["color"]) == ("Major NPC", "#52c06e")
    assert (items["@group"]["value"], items["@group"]["color"]) == (group["name"], None)  # theme
    assert items["level"]["color"] == "#000000"  # player: its token colour (no player: black)
    assert "group" not in goblin  # which group is the DM's business


def test_old_template_configs_are_upgraded():
    old = {"modes": {
        "face": {"hp": {"player": {"style": "discrete", "display_on": "card"}, "dm": {"style": "bar", "display_on": "card"}},
                 "level": {"player": {"style": "number", "display_on": "hidden"}, "dm": {"style": "number", "display_on": "hover"}}},
        "informative": {"hp": {"dm": {"style": "bar", "display_on": "highlight"}}, "inventory": {"dm": {"style": "number", "display_on": "body"}}},
    }}
    new = display.upgrade(old)
    face = new["modes"]["face"]
    assert [e["key"] for e in face["player"]["top"]] == ["@name"]
    assert [(e["key"], e["style"]) for e in face["player"]["bottom"]] == [("hp", "discrete")]
    assert [e["key"] for e in face["dm"]["hover_bottom"]] == ["level"]
    assert [e["key"] for e in new["modes"]["informative"]["dm"]["header"]] == ["hp"]
    assert [e["key"] for e in new["modes"]["informative"]["dm"]["body"]] == ["inventory"]
    assert display.upgrade(new) is new


def test_sheet_for_players_and_controllers(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    bob_id, bob = api.member(saga_id, dm, "bob")
    everyone = api.ok("GET", f"/api/sagas/{saga_id}", dm)
    groups = [g["id"] for g in everyone["groups"] if g["key"] in ("players", "viewers")]
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{npc['id']}", dm, json={"visibility": {"groups": groups, "members": []}})
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{pc['id']}", dm, json={"visibility": {"groups": groups, "members": []}})

    goblin = api.ok("GET", f"/api/sagas/{saga_id}/resources/{npc['id']}/sheet", bob)
    # The name on top; HP as balls; no level, initiative or inventory (ruleset hides them)
    assert [(i["key"], i["region"]) for i in goblin["immersive"]] == [("@name", "top_center"), ("hp", "bottom_panel"), ("controllers", "bottom_panel")]
    assert goblin["immersive"][1]["style"] == "discrete" and "31" not in json.dumps(goblin)

    # Ana controls Thorin: she also sees what the ruleset lets her see (her inventory)
    thorin_for_ana = api.ok("GET", f"/api/sagas/{saga_id}/resources/{pc['id']}/sheet", ana)
    thorin_for_bob = api.ok("GET", f"/api/sagas/{saga_id}/resources/{pc['id']}/sheet", bob)
    assert "inventory" in _keys(thorin_for_ana["informative"], "body")
    assert "inventory" not in json.dumps(thorin_for_bob)

    dm_sheet = api.ok("GET", f"/api/sagas/{saga_id}/resources/{npc['id']}/sheet", dm)
    assert _keys(dm_sheet["informative"], "header") == ["level", "hp", "initiative", "hit_dice"]
    assert dm_sheet["template"]["name"] == "Major NPC" and dm_sheet["category_name"] == "Major NPC"


def test_players_open_sheets_of_cards_on_the_live_stage(api, client, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    url = f"/api/sagas/{saga_id}/resources/{npc['id']}/sheet"
    assert client.get(url, headers=ana).status_code == 404  # the NPC isn't shared
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    assert client.get(url, headers=ana).status_code == 200


def test_names_for_players(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    api.ok("PATCH", f"/api/sagas/{saga_id}/resources/{npc['id']}", dm,
           json={"presentation": {"alias": "Hooded figure"}})
    _reveal(api, saga_id, dm, set_id)
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
    assert resource["presentation"] == {"alias": "Hooded figure", "hide_name": True}  # a change keeps the rest


def test_preview_as_dm_and_player(api, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    npc_template = _template(api, saga_id, dm, "Major NPC")
    preview = api.ok("GET", f"/api/sagas/{saga_id}/display-templates/{npc_template['id']}/preview?resource_id={npc['id']}", dm)
    assert set(preview["cards"]["player"]) == {"face", "full", "none"}
    player_hp = preview["cards"]["player"]["face"]["attributes"][1]
    assert player_hp["key"] == "hp" and player_hp["style"] == "discrete" and "current" not in player_hp
    assert next(a for a in preview["cards"]["dm"]["face"]["attributes"] if a["key"] == "hp")["current"] == 31
    assert _keys(preview["sheet"]["player"]["immersive"]) == ["@name", "hp", "controllers"]


def test_cards_have_no_settings_of_their_own(api, client, root):
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    # There's no per-card settings route; the scene's config takes only scene settings
    assert client.patch(f"/api/sagas/{saga_id}/actors/{cards[0]['id']}", headers=dm, json={"config": {}}).status_code == 405
    assert client.patch(f"/api/sagas/{saga_id}/sets/{set_id}", headers=dm,
                        json={"config": {"cards": {"x": 1}}}).status_code == 400
