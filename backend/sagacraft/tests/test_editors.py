"""Plan 20: the character and item editors' new settings (active, token, players sharing their character, using items)
and Saga → User (account, colour, dice style)."""
from tests.test_encounters import _character, _groups, _new_scene
from tests.test_stages import _categories, _live, _reveal


def _setup(api, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    bob_id, bob = api.member(saga_id, dm, "bob")
    vic_id, vic = api.member(saga_id, dm, "vic", role="viewer")
    groups = {g["key"]: g["id"] for g in api.ok("GET", f"/api/sagas/{saga_id}", dm)["groups"] if g["key"]}
    return saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), groups


def test_inactive_characters_stay_off_scenes_and_groups(api, client, root):
    saga_id, dm, (ana_id, ana), *_ = _setup(api, root)
    categories = _categories(api, saga_id, dm)
    thorin = _character(api, saga_id, dm, categories["player"]["id"], "Thorin")
    resting = _character(api, saga_id, dm, categories["player"]["id"], "Brienne")
    assert thorin["active"] is True
    url = f"/api/sagas/{saga_id}/resources/{resting['id']}"
    assert api.ok("PATCH", url, dm, json={"active": False})["active"] is False
    assert client.patch(url, headers=ana, json={"active": True}).status_code in (403, 404)
    party = _groups(api, saga_id, dm)["Player Party"]
    stage_id, set_id = _new_scene(api, saga_id, dm)
    stage = api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"group_ids": [party["id"]]})
    names = [c["name"] for c in stage["sets"][0]["content"]["cards"]]
    assert names == ["Thorin"]  # adding the party leaves the inactive one out
    # Added by hand, then made inactive: the DM sees it marked, players don't get it
    api.ok("PATCH", url, dm, json={"active": True})
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"resource_ids": [resting["id"]], "hidden": False})
    api.ok("PATCH", url, dm, json={"active": False})
    _reveal(api, saga_id, dm, set_id)
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    dm_cards = _live(api, saga_id, dm)["sets"][0]["content"]["cards"]
    assert {c["name"]: c["inactive"] for c in dm_cards} == {"Thorin": False, "Brienne": True}
    shown = _live(api, saga_id, ana)["sets"][0]["content"]
    assert [c["name"] for c in shown["cards"]] == ["Thorin"] and len(shown["tab"]["card_ids"]) == 1


def test_players_in_control_style_and_share_their_character(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), (vic_id, vic), g = _setup(api, root)
    url = f"/api/sagas/{saga_id}/resources"
    party = api.ok("POST", f"/api/sagas/{saga_id}/groups", dm, json={"name": "Party", "member_ids": [bob_id]})
    party_id = next(x["id"] for x in party["groups"] if x["name"] == "Party")
    hero = api.ok("POST", url, dm, json={"kind": "character", "type": "pc", "attributes": {"name": "Thorin", "controllers": [ana_id]},
                                         "visibility": {"groups": [party_id], "members": []}})
    mine = f"{url}/{hero['id']}"
    seen = api.ok("GET", mine, ana)
    assert seen["presentation"] == {"alias": None, "hide_name": False} and seen["sharing"] == {"groups": [], "members": []}
    assert "visibility" not in seen
    # Hiding the name: theirs; the name players see (alias): the DM's. (The token's style is the display template's.)
    out = api.ok("PATCH", mine, ana, json={"presentation": {"hide_name": True, "alias": "Mr X"}})
    assert out["presentation"] == {"alias": None, "hide_name": True}
    # Sharing: all players and/or some players; the DM's group stays
    api.ok("PATCH", mine, ana, json={"visibility": {"groups": [], "members": [bob_id]}})
    assert api.ok("GET", mine, dm)["visibility"] == {"groups": [party_id], "members": [bob_id]}
    api.ok("PATCH", mine, ana, json={"visibility": {"groups": [g["players"]], "members": []}})
    assert api.ok("GET", mine, dm)["visibility"] == {"groups": sorted([party_id, g["players"]]), "members": []}
    for bad in ({"groups": [party_id]}, {"groups": [g["viewers"]]}, {"members": [vic_id]}):
        assert client.patch(mine, headers=ana, json={"visibility": {"groups": [], "members": [], **bad}}).status_code == 403
    # Others can't
    assert client.patch(mine, headers=bob, json={"presentation": {"hide_name": False}}).status_code == 403
    assert client.patch(mine, headers=bob, json={"visibility": {"groups": [], "members": []}}).status_code == 403


def test_token_on_maps_follows_the_players_colour(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), _, g = _setup(api, root)
    shared = {"groups": [g["players"]], "members": []}
    url = f"/api/sagas/{saga_id}/resources"
    solo = api.ok("POST", url, dm, json={"kind": "character", "type": "pc", "visibility": shared,
                                         "attributes": {"name": "Thorin", "controllers": [ana_id]}})
    duo = api.ok("POST", url, dm, json={"kind": "character", "type": "pc", "visibility": shared,
                                        "attributes": {"name": "Twins", "controllers": [ana_id, bob_id]}})
    npc = api.ok("POST", url, dm, json={"kind": "character", "type": "npc", "visibility": shared, "attributes": {"name": "Guard"}})
    town = api.ok("POST", url, dm, json={"kind": "location", "type": "location", "visibility": shared, "attributes": {"name": "Town"}})
    mapc = f"/api/sagas/{saga_id}/locations/{town['id']}/map/command"
    api.ok("POST", mapc, dm, json={"name": "grid.set", "args": {"changes": {"type": "square", "cols": 4, "rows": 4}}})
    for i, who in enumerate((solo, duo, npc)):
        api.ok("POST", mapc, dm, json={"name": "links.add", "args": {"tile": [i, 0], "resource_ids": [who["id"]]}})
    api.ok("PATCH", f"/api/sagas/{saga_id}/me", ana, json={"color": "#112233"})
    links = {l["name"]: l["token"] for l in api.ok("GET", f"/api/sagas/{saga_id}/locations/{town['id']}/map", ana)["links"]}
    assert {n: (t["style"], t["color"]) for n, t in links.items()} == {
        "Thorin": ("gradient", "#112233"), "Twins": ("gradient", "#ffffff"), "Guard": ("gradient", "#000000")}
    # The template decides the style, and the values on and around the token (the name on top, by default)
    assert [v["key"] for v in links["Thorin"]["values"] if v["region"] == "hover_top"] == ["@name"]
    templates = api.ok("GET", f"/api/sagas/{saga_id}/display-templates", dm)["templates"]
    url = f"/api/sagas/{saga_id}/display-templates"
    for t in (t for t in templates if t["kind"] == "character"):
        api.ok("PATCH", f"{url}/{t['id']}", dm, json={"token_style": "chip"})
    links = {l["name"]: l["token"] for l in api.ok("GET", f"/api/sagas/{saga_id}/locations/{town['id']}/map", ana)["links"]}
    assert links["Thorin"]["style"] == "chip"
    assert client.patch(f"{url}/{templates[0]['id']}", headers=dm, json={"token_style": "double"}).status_code == 400


def test_using_an_item_from_an_inventory(api, client, root):
    saga_id, dm, (ana_id, ana), (bob_id, bob), _, g = _setup(api, root)
    url = f"/api/sagas/{saga_id}/resources"
    potion = api.ok("POST", url, dm, json={"kind": "item", "type": "consumable", "visibility": {"groups": [g["players"]], "members": []},
                                           "attributes": {"name": "Potion", "uses": {"current": 2, "max": 3}}})
    rope = api.ok("POST", url, dm, json={"kind": "item", "type": "gear", "attributes": {"name": "Rope"}})
    hero = api.ok("POST", url, dm, json={"kind": "character", "type": "pc", "attributes": {
        "name": "Thorin", "controllers": [ana_id], "inventory": [potion["id"], rope["id"]]}})
    use = f"{url}/{hero['id']}/use-item"
    assert api.ok("POST", use, ana, json={"item_id": potion["id"]})["attributes"]["uses"]["current"] == 1
    assert api.ok("POST", use, dm, json={"item_id": potion["id"]})["attributes"]["uses"]["current"] == 0
    assert client.post(use, headers=ana, json={"item_id": potion["id"]}).status_code == 400  # none left
    assert client.post(use, headers=ana, json={"item_id": rope["id"]}).status_code == 400  # nothing to use up
    other = api.ok("POST", url, dm, json={"kind": "item", "type": "consumable", "attributes": {"name": "Elixir", "uses": {"current": 1, "max": 1}}})
    assert client.post(use, headers=ana, json={"item_id": other["id"]}).status_code == 400  # not in this inventory
    assert client.post(use, headers=bob, json={"item_id": potion["id"]}).status_code == 404  # not their character


def test_saga_user_page(api, client, root):
    saga_id, dm, (ana_id, ana), *_ = _setup(api, root)
    overview = api.ok("GET", f"/api/sagas/{saga_id}", ana)
    assert overview["me"]["color"] is None and overview["me"]["die_style"] == "minimal"
    assert all(m["color"].startswith("#") for m in overview["members"])  # a palette colour until they pick one
    picked = api.ok("PATCH", f"/api/sagas/{saga_id}/me", ana, json={"color": "#A1B2C3", "die_style": "minimal"})
    assert picked["me"]["color"] == "#a1b2c3"
    assert next(m for m in picked["members"] if m["id"] == ana_id)["color"] == "#a1b2c3"
    for bad in ({"color": "red"}, {"die_style": "fancy"}):
        assert client.patch(f"/api/sagas/{saga_id}/me", headers=ana, json=bad).status_code == 400
    # The account: display name; password with the current one
    assert api.ok("PATCH", "/api/me", ana, json={"display_name": "  Ana  Lima "})["display_name"] == "Ana Lima"
    assert client.patch("/api/me", headers=ana, json={"password": "wrong", "new_password": "secret-2"}).status_code == 400
    assert client.patch("/api/me", headers=ana, json={"password": "pass-123", "new_password": "x"}).status_code == 400
    api.ok("PATCH", "/api/me", ana, json={"password": "pass-123", "new_password": "secret-2"})
    assert api.login("ana", "secret-2")
