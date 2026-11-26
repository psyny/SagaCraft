"""Display templates (lists per region), defaults per type, the panel's template choice, character sheets and names for players."""
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
    """One built-in template per character type of the Saga template (plan 40: the types are what categories were)."""
    saga_id, dm, *_ = _scene(api, root)
    data = _templates(api, saga_id, dm)
    names = {t["name"]: t for t in data["templates"] if t["kind"] == "character"}
    assert set(names) == {"Player", "Major NPC", "Minor NPC"}
    # Items: one per item category, its default
    items = {t["name"]: t["id"] for t in data["templates"] if t["kind"] == "item"}
    assert set(items) == {"Weapon", "Armor", "Consumable", "Gear", "Treasure"}
    assert data["defaults"]["item"]["weapon"] == items["Weapon"]
    assert data["defaults"]["character"] == {"pc": names["Player"]["id"], "npc": names["Major NPC"]["id"],
                                             "minor_npc": names["Minor NPC"]["id"]}
    config = names["Major NPC"]["config"]
    assert config["version"] == 3 and config["color"].startswith("#")
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


def test_panel_can_pick_another_template_per_type(api, root):
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
    """Plan 40: a template is each type's default (character and item types alike); a default isn't deleted."""
    saga_id, dm, *_ = _scene(api, root)
    templates = {t["name"]: t for t in _templates(api, saga_id, dm)["templates"]}
    defaults = f"/api/sagas/{saga_id}/display-defaults"
    delete = lambda t: client.delete(f"/api/sagas/{saga_id}/display-templates/{t['id']}", headers=dm)  # noqa: E731
    boss = api.ok("POST", f"/api/sagas/{saga_id}/display-templates", dm, json={"name": "Boss", "copy_from": templates["Major NPC"]["id"]})
    assert boss["config"] == templates["Major NPC"]["config"]
    assert delete(templates["Minor NPC"]).status_code == 400  # the minor NPCs' default
    api.ok("PUT", defaults, dm, json={"kind": "character", "type": "minor_npc", "template_id": boss["id"]})
    assert delete(templates["Minor NPC"]).status_code in (200, 204)
    data = _templates(api, saga_id, dm)
    assert next(t for t in data["templates"] if t["id"] == boss["id"])["default_for"] == ["minor_npc"]
    assert delete(boss).status_code == 400
    for bad in ({"kind": "character", "type": "weapon", "template_id": boss["id"]},  # not a character type
                {"kind": "item", "type": "weapon", "template_id": boss["id"]},  # a character template
                {"kind": "character", "type": "npc", "template_id": None}):
        assert client.put(defaults, headers=dm, json=bad).status_code == 400, bad
    # An item type's default stops it too
    assert delete({"id": data["defaults"]["item"]["weapon"]}).status_code == 400


def test_type_defaults(api, client, root):
    """Each character type has its default template (plan 40: what each category had)."""
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    templates = {t["name"]: t for t in _templates(api, saga_id, dm)["templates"]}
    data = _templates(api, saga_id, dm)
    assert data["defaults"]["character"]["npc"] == templates["Major NPC"]["id"]
    assert data["defaults"]["character"]["pc"] == templates["Player"]["id"]
    blank = api.ok("POST", f"/api/sagas/{saga_id}/display-templates", dm, json={"name": "Blank"})
    api.ok("PUT", f"/api/sagas/{saga_id}/display-defaults", dm, json={"kind": "character", "type": "npc", "template_id": blank["id"]})
    goblin = _by_name(_live(api, saga_id, ana)["sets"][0]["content"]["cards"])[npc["id"]]
    assert _keys(goblin["attributes"]) == ["@name"]  # blank: players see only the name
    dm_goblin = _by_name(_live(api, saga_id, dm)["sets"][0]["content"]["cards"])[npc["id"]]
    assert _keys(dm_goblin["attributes"], "bottom") == ["level", "hp", "initiative", "hit_dice", "carried"]  # the DM sees every value
    assert client.delete(f"/api/sagas/{saga_id}/display-templates/{blank['id']}", headers=dm).status_code == 400
    # Back to its template
    api.ok("PUT", f"/api/sagas/{saga_id}/display-defaults", dm, json={"kind": "character", "type": "npc", "template_id": templates["Major NPC"]["id"]})
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
    assert patch({"modes": {"face": {"player": {"bottom": [{"key": "hp", "icon": "comets"}]}}}}) == 400
    # Plan 57's settings: checked
    for bad in ({"bar": "pill"}, {"value_shown": "all"}, {"icons": 0}, {"icons": 11}, {"icons": 2.5}, {"icons": True},
                {"icon_gap": 51}, {"icon_gap": -1}, {"icon_gap": "5"}, {"logic": "random"}):
        assert patch({"modes": {"face": {"player": {"bottom": [{"key": "hp", "style": "discrete", **bad}]}}}}) == 400, bad
    styled = api.ok("PATCH", url, dm, json={"modes": {"face": {"player": {"bottom": [
        {"key": "hp", "style": "discrete", "icon": "bars", "icons": 10, "icon_gap": 0, "logic": "soft_variant", "hide_full": True},
        {"key": "level", "style": "number", "value_shown": "none"}]}}}})["config"]["modes"]["face"]["player"]["bottom"]
    assert {k: styled[0][k] for k in ("icon", "icons", "icon_gap", "logic", "hide_full", "bar", "value_shown")} == {
        "icon": "bars", "icons": 10, "icon_gap": 0, "logic": "soft_variant", "hide_full": True, "bar": "round", "value_shown": "current_max"}
    assert styled[1]["value_shown"] == "none" and styled[1]["icons"] == 4
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


def test_version_2_configs_are_upgraded():
    """Plan 57: version 2's bars renamed (they keep their look), the new settings at their defaults."""
    old = {"version": 2, "color": "#123456", "modes": {"face": {"player": {"bottom": [
        {"key": "hp", "style": "bar", "bar": "rounded", "gradient": True, "icon": "balls", "color": "theme", "number_color": "theme", "show_label": True},
        {"key": "mp", "style": "bar", "bar": "flat", "gradient": False, "icon": "hearts", "color": "group", "number_color": "white", "show_label": False}]}}}}
    new = display.upgrade(old)
    hp, mp = new["modes"]["face"]["player"]["bottom"]
    assert new["version"] == 3 and new["color"] == "#123456"
    assert (hp["bar"], hp["gradient"], mp["bar"], mp["icon"], mp["number_color"], mp["show_label"]) == ("round", True, "rounded", "hearts", "white", False)
    assert all(hp[k] == ELEMENT_DEFAULTS[k] for k in ("value_shown", "icons", "icon_gap", "logic", "hide_full"))
    assert old["modes"]["face"]["player"]["bottom"][0]["bar"] == "rounded"  # the stored one isn't changed in place


def _goblin_hp(api, saga_id, who, npc):
    goblin = _by_name(_live(api, saga_id, who)["sets"][0]["content"]["cards"])[npc["id"]]
    return next((a for a in goblin["attributes"] if a["key"] == "hp"), None)


def test_what_players_get_follows_what_is_shown(api, root):
    """Plan 57: a bar or number showing a percentage (or nothing) sends players only the percentage; discrete hidden
    while full isn't sent while full; the DM's level for players' icons follows the players' element."""
    saga_id, dm, ana, stage_id, set_id, pc, npc, cards = _scene(api, root)
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    api.ok("POST", f"/api/sagas/{saga_id}/resources/{npc['id']}/counter", dm, json={"key": "hp", "delta": -20})  # 11 / 31
    url = f"/api/sagas/{saga_id}/display-templates/{_template(api, saga_id, dm, 'Major NPC')['id']}"

    def show(**element):
        api.ok("PATCH", url, dm, json={"modes": {"face": {"player": {"bottom": [{"key": "hp", **element}]}}}})
        return _goblin_hp(api, saga_id, ana, npc)

    hp = show(style="bar", value_shown="current_max")
    assert (hp["current"], hp["max"], hp["percent"]) == (11, 31, 35)
    for style in ("bar", "number"):
        for shown in ("percent", "none"):
            hp = show(style=style, value_shown=shown)
            assert hp["percent"] == 35 and hp["value_shown"] == shown and not {"current", "max", "min"} & set(hp), (style, shown)
            assert "11" not in json.dumps(hp) and "31" not in json.dumps(hp)
    hp = show(style="discrete", icon="stars", icons=10, icon_gap=12, logic="precise")
    assert (hp["level"], hp["levels"], hp["icon"], hp["icon_gap"]) == (4, 10, "stars", 12)  # 11 of 31 in tenths: above 3 of 9 points
    assert not {"current", "max", "percent"} & set(hp)
    # The DM's bar knows how many icons players see
    dm_hp = _goblin_hp(api, saga_id, dm, npc)
    assert (dm_hp["style"], dm_hp["level"], dm_hp["levels"], dm_hp["current"]) == ("bar", 4, 10, 11)
    # Hidden while full: not sent at all; back once hurt
    show(style="discrete", hide_full=True)
    api.ok("POST", f"/api/sagas/{saga_id}/resources/{npc['id']}/counter", dm, json={"key": "hp", "delta": 20})  # 31 / 31
    assert _goblin_hp(api, saga_id, ana, npc) is None
    assert _goblin_hp(api, saga_id, dm, npc)["style"] == "bar"  # the DM's own element isn't hidden
    api.ok("POST", f"/api/sagas/{saga_id}/resources/{npc['id']}/counter", dm, json={"key": "hp", "delta": -1})
    assert _goblin_hp(api, saga_id, ana, npc)["level"] == 4


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
