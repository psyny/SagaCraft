"""Plan 41: a Saga template carries the Saga's Stages (their Sets' settings), EFX environments and character groups,
never its content; every Saga owns its template; the shipped DnD Lite starts a Saga ready to play."""
import json

from tests.test_encounters import _character, _tab
from tests.test_stages import _command


def _set(stage, type_key):
    return next(s for s in stage["sets"] if s["type"] == type_key)


def _prepared(api, root):
    """A Saga with an environment, a Stage of several Sets (with content and live state on them) and groups."""
    saga_id, dm = api.saga(root)
    api.member(saga_id, dm, "ana")
    env = api.ok("POST", f"/api/sagas/{saga_id}/environments", dm, json={"example": "starry_night"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Bridge"})
    stage_id = stage["id"]
    api.ok("PATCH", f"/api/sagas/{saga_id}/stages/{stage_id}", dm, json={"environment_id": env["id"], "controls": {"efx": False}})
    for type_key in ("efx_far", "actors_scene", "world_map", "dice", "desktop", "timeline"):
        stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage_id}/sets", dm, json={"type": type_key})
    scene, world, dice, desk = (_set(stage, t)["id"] for t in ("actors_scene", "world_map", "dice", "desktop"))
    # The scene: a tab's settings, a template for Major NPCs, a character on it and a turn going
    thorin = _character(api, saga_id, dm, "pc", "Thorin", hp=20, initiative=12)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{scene}/actors", dm, json={"resource_ids": [thorin["id"]], "hidden": False})
    content = _set(api.ok("GET", f"/api/sagas/{saga_id}/stages/{stage_id}", dm), "actors_scene")["content"]
    combat = _tab(content, "Combat")["id"]
    _command(api, saga_id, dm, scene, "tab.set", tab_id=combat, changes={"spacing": 56, "card_style": "full"})
    _command(api, saga_id, dm, scene, "turn", tab_id=combat, action="start")
    templates = api.ok("GET", f"/api/sagas/{saga_id}/display-templates", dm)["templates"]
    minor = next(t for t in templates if t["name"] == "Minor NPC")
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{scene}", dm, json={"config": {"templates": {"npc": minor["id"]}}})
    # The map: a location shown, a fog preset of the DM's
    location = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={"kind": "location", "type": "location", "attributes": {"name": "Aerth"}})
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{world}/actors", dm, json={"resource_ids": [location["id"]]})
    ash = api.ok("POST", f"/api/sagas/{saga_id}/fog-presets", dm, json={"name": "Ash", "look": {"style": "embers"}})
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{world}", dm, json={"config": {"fog_preset": ash["id"], "show_grid": False}})
    # Settings of the others; the DM's tools (private) stay private
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{dice}", dm, json={"config": {"speed": 3.0, "tray_edge": "top"}})
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{desk}", dm, json={"config": {"layout": "focus", "background": 40},
                                                                    "visibility": {"groups": [], "members": []}})
    # Groups: one with a character and a value
    goblin = _character(api, saga_id, dm, "minor_npc", "Goblin")
    api.ok("POST", f"/api/sagas/{saga_id}/character-groups", dm, json={
        "name": "Ambush", "color": "#e2604f", "members": [{"resource_id": goblin["id"], "count": 3}], "attributes": {"shared_gold": 40}})
    return saga_id, dm, stage_id


def test_an_export_carries_stages_environments_and_groups_without_content(api, root):
    saga_id, dm, _ = _prepared(api, root)
    exported = api.ok("GET", f"/api/sagas/{saga_id}/template/export", dm)
    assert [e["name"] for e in exported["environments"]] == ["Starry night"]
    [stage] = exported["stages"]
    assert (stage["name"], stage["environment"], stage["controls"]["efx"]) == ("Bridge", "Starry night", False)
    sets = {s["type"]: s for s in stage["sets"]}
    assert set(sets) == {"efx_far", "actors_scene", "world_map", "dice", "desktop", "timeline"}
    scene = sets["actors_scene"]["config"]
    assert scene["templates"] == {"npc": "Minor NPC"}  # by name
    combat = next(t for t in scene["tabs"] if t["name"] == "Combat")
    assert combat["spacing"] == 56 and combat["card_style"] == "full"
    assert not {"order", "turn", "highlight_actor_id", "spotlight"} & set(combat)  # nothing of what happened live
    assert sets["world_map"]["config"] == {"interactive": {"players": True, "viewers": False}, "show_grid": False, "fog_preset": "Ash"}
    assert sets["dice"]["config"]["speed"] == 3.0 and "rolls" not in sets["dice"]["config"] and "tray" not in sets["dice"]["config"]
    assert sets["desktop"]["config"] == {"layout": "focus", "gap": 16, "background": 40}
    assert sets["timeline"]["config"]["groups"] == ["players"]
    assert sets["actors_scene"]["visibility"] == {"groups": ["players"]} and sets["desktop"]["visibility"] == {"groups": []}
    # No resource, actor or Saga id anywhere in the Stages
    text = json.dumps(exported["stages"])
    assert "Thorin" not in text and "Aerth" not in text and '"current"' not in text and "actor_id" not in text
    # Groups: the Saga's, empty, without their values
    assert exported["starting"]["groups"] == [
        {"name": "Player Party", "player_party": True, "active": True, "favorite": True, "color": "#6cc9e0"},
        {"name": "Ambush", "player_party": False, "active": False, "favorite": False, "color": "#e2604f"}]


def test_a_saga_from_the_file_starts_with_them(api, root):
    saga_id, dm, _ = _prepared(api, root)
    exported = api.ok("GET", f"/api/sagas/{saga_id}/template/export", dm)
    made = api.ok("POST", "/api/system/sagas", root, json={
        "name": "Second", "admin_login": "dm2", "admin_password": "dm-pass", "template": exported})
    second, dm2 = made["id"], api.login("dm2", "dm-pass")
    [stage] = api.ok("GET", f"/api/sagas/{second}/stages", dm2)
    view = api.ok("GET", f"/api/sagas/{second}/stages/{stage['id']}", dm2)
    envs = api.ok("GET", f"/api/sagas/{second}/environments", dm2)
    assert [e["name"] for e in envs] == ["Starry night"] and view["environment_id"] == envs[0]["id"]
    assert [s["type"] for s in sorted(view["sets"], key=lambda s: s["layer"])][0] == "efx_far"
    scene = _set(view, "actors_scene")["content"]
    assert scene["cards"] == []
    combat = next(t for t in scene["tabs"] if t["name"] == "Combat")
    assert combat["spacing"] == 56 and combat["card_style"] == "full" and combat["turn"] == {"actor_id": None, "round": 0}
    templates = {t["name"]: t["id"] for t in api.ok("GET", f"/api/sagas/{second}/display-templates", dm2)["templates"]}
    world = _set(view, "world_map")["content"]
    presets = {p["name"]: p["id"] for p in api.ok("GET", f"/api/sagas/{second}/fog-presets", dm2)}
    assert world["fog_preset"] == presets["Ash"] and world["locations"] == [] and world["show_grid"] is False
    # Ids point to the new Saga's own things (looked up through the database: content doesn't show them all)
    from db.session import SessionLocal
    from models import Group, StageSet

    with SessionLocal() as db:
        sets = {s.type: s for s in db.query(StageSet).filter(StageSet.stage_id == stage["id"]).all()}
        players = db.query(Group).filter(Group.saga_id == second, Group.key == "players").one().id
        assert sets["actors_scene"].config["templates"] == {"npc": templates["Minor NPC"]}
        assert sets["actors_scene"].visibility == {"groups": [players], "members": []}
        assert sets["desktop"].visibility == {"groups": [], "members": []}
        assert sets["timeline"].config["groups"] == [players]
    groups = api.ok("GET", f"/api/sagas/{second}/character-groups", dm2)
    assert [(g["name"], g["members"]) for g in groups] == [("Player Party", []), ("Ambush", [])]


def test_importing_adds_what_the_saga_lacks(api, root):
    saga_id, dm, _ = _prepared(api, root)
    exported = api.ok("GET", f"/api/sagas/{saga_id}/template/export", dm)
    other, dm2 = api.saga(root, name="Other", admin_login="dm2")
    api.ok("POST", f"/api/sagas/{other}/stages", dm2, json={"name": "Bridge"})  # same name: kept as it is
    result = api.ok("POST", f"/api/sagas/{other}/template/import", dm2, json=exported)
    assert result["added"]["stages"] == 0 and result["added"]["environments"] == 1 and result["added"]["groups"] == 1
    assert (result["stages"], result["environments"], result["groups"]) == (1, 1, 2)
    renamed = {**exported, "stages": [{**exported["stages"][0], "name": "Bridge at night"}]}
    assert api.ok("POST", f"/api/sagas/{other}/template/import", dm2, json=renamed)["added"]["stages"] == 1
    # A file's bad settings are left at their defaults; unknown Set types are skipped
    broken = {**exported, "stages": [{"name": "Odd", "layout": "spiral", "environment": "Nowhere", "sets": [
        {"type": "dice", "config": {"speed": "fast", "tray_edge": "top"}, "screen": {"anchor": "sideways"}},
        {"type": "teleporter"}]}]}
    api.ok("POST", f"/api/sagas/{other}/template/import", dm2, json=broken)
    odd = next(s for s in api.ok("GET", f"/api/sagas/{other}/stages", dm2) if s["name"] == "Odd")
    view = api.ok("GET", f"/api/sagas/{other}/stages/{odd['id']}", dm2)
    assert view["layout"] == "interface" and view["environment_id"] is None and [s["type"] for s in view["sets"]] == ["dice"]


def test_the_shipped_dnd_lite_starts_a_saga_ready_and_its_sagas_keep_theirs(api, root, shipped_rulesets):
    from domain.ruleset import get_ruleset

    shipped = get_ruleset("dnd_lite").data
    saga_id, dm = api.saga(root)
    view = api.ok("GET", f"/api/sagas/{saga_id}/template", dm)
    assert view["own_copy"] is True
    assert set(view["template"]["kinds"]["character"]["types"]) == set(shipped["kinds"]["character"]["types"])
    assert "stages" not in view["template"] and "display_templates" not in view["template"]
    stages = api.ok("GET", f"/api/sagas/{saga_id}/stages", dm)
    assert [s["name"] for s in stages] == [s["name"] for s in shipped["stages"]]
    assert [s["set_count"] for s in stages] == [len(s["sets"]) for s in shipped["stages"]]
    envs = api.ok("GET", f"/api/sagas/{saga_id}/environments", dm)
    assert sorted(e["name"] for e in envs) == sorted(e["name"] for e in shipped["environments"])
    groups = api.ok("GET", f"/api/sagas/{saga_id}/character-groups", dm)
    assert sorted(g["name"] for g in groups) == sorted(g["name"] for g in shipped["starting"]["groups"])
    templates = api.ok("GET", f"/api/sagas/{saga_id}/display-templates", dm)["templates"]
    assert sorted(t["name"] for t in templates) == sorted(t["name"] for t in shipped["display_templates"])
    # The file changing later (here: the tests' older DnD Lite) never changes the Saga
    from domain import ruleset as rulesets
    from tests.conftest import CLASSIC_DND_LITE

    with open(CLASSIC_DND_LITE, encoding="utf-8") as f:
        rulesets._RULESETS["dnd_lite"] = rulesets.Ruleset(json.load(f))
    types = api.ok("GET", f"/api/sagas/{saga_id}/ruleset", dm)["kinds"]["character"]["types"]
    assert set(types) == set(shipped["kinds"]["character"]["types"])
