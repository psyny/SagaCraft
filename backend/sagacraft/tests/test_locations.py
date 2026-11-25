"""Locations: sub-locations, tags, galleries, maps (pictures, grid, fog, links, paths, regions), players' composed
picture, and the World and Local map Sets."""
import io
import json

from PIL import Image

from domain import maps
from tests.test_uploads import picture, upload


def _setup(api, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    overview = api.ok("GET", f"/api/sagas/{saga_id}", dm)
    groups = {g["key"]: g["id"] for g in overview["groups"] if g["key"]}
    return saga_id, dm, ana_id, ana, groups


def _location(api, saga_id, dm, name, parent=None, shared=None, tags=None):
    return api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "location", "type": "location", "attributes": {"name": name, "parent": parent},
        "visibility": {"groups": shared or [], "members": []}, "tags": tags or [],
    })


def _command(api, saga_id, headers, location_id, name, **args):
    return api.ok("POST", f"/api/sagas/{saga_id}/locations/{location_id}/map/command", headers,
                  json={"name": name, "args": args})


def _map_picture(client, saga_id, dm, color=(200, 30, 30), size=(256, 128)):
    image = Image.new("RGB", size, color)
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    response = upload(client, saga_id, dm, buffer.getvalue(), category="map")
    assert response.status_code == 200, response.text
    return response.json()


# -- locations as resources ---------------------------------------------------


def test_sub_locations_tags_and_hidden_parents(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    players = [groups["players"]]
    world = _location(api, saga_id, dm, "Aerth", tags=["World"])
    secret = _location(api, saga_id, dm, "Hidden vale", parent=world["id"], tags=["valley", "Secret"])
    town = _location(api, saga_id, dm, "Riverton", parent=secret["id"], shared=players, tags=["town", "town ", "TOWN"])
    assert town["tags"] == ["town"] and town["attributes"]["parent"] == secret["id"]
    # A location can't be inside itself
    response = client.patch(f"/api/sagas/{saga_id}/resources/{world['id']}", headers=dm,
                            json={"attributes": {"parent": town["id"]}})
    assert response.status_code == 400
    # Parent must be a location
    character = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={"kind": "character", "type": "pc",
                                                                             "attributes": {"name": "Thorin"}})
    assert client.patch(f"/api/sagas/{saga_id}/resources/{town['id']}", headers=dm,
                        json={"attributes": {"parent": character["id"]}}).status_code == 400
    # Players see Riverton at the top level: they don't learn the hidden vale exists
    listed = api.ok("GET", f"/api/sagas/{saga_id}/resources?kind=location", ana)
    assert [(l["name"], l["attributes"]["parent"]) for l in listed] == [("Riverton", None)]
    assert api.ok("GET", f"/api/sagas/{saga_id}/resources/{town['id']}", ana)["attributes"]["parent"] is None
    assert api.ok("GET", f"/api/sagas/{saga_id}/resources/{town['id']}", dm)["attributes"]["parent"] == secret["id"]
    # Tags: the DM's vocabulary, as each member may see it
    assert api.ok("GET", f"/api/sagas/{saga_id}/tags?kind=location", dm) == ["Secret", "town", "valley", "World"]
    assert api.ok("GET", f"/api/sagas/{saga_id}/tags?kind=location", ana) == ["town"]
    # Only the DM tags
    assert client.patch(f"/api/sagas/{saga_id}/resources/{town['id']}", headers=ana, json={"tags": ["mine"]}).status_code in (403, 404)


def test_galleries_hold_several_pictures_up_to_the_limit(api, client, root):
    saga_id, dm, *_ = _setup(api, root)
    files = [upload(client, saga_id, dm, picture(200, 200)).json()["id"] for _ in range(3)]
    thorin = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={
        "kind": "character", "type": "pc",
        "attributes": {"name": "Thorin", "pictures": [{"file_id": f} for f in files] + [{"file_id": files[0]}]}})
    assert [p["file_id"] for p in thorin["attributes"]["pictures"]] == files  # each once
    assert all(p["url"].startswith("/api/files/") for p in thorin["attributes"]["pictures"])
    api.ok("PUT", "/api/system/settings/upload-limits", root,
           json={"categories": {"character": {"max_mb": 1, "max_px": 1024, "max_count": 2}}})
    response = client.patch(f"/api/sagas/{saga_id}/resources/{thorin['id']}", headers=dm,
                            json={"attributes": {"pictures": [{"file_id": f} for f in files]}})
    assert response.status_code == 400 and "at most 2" in response.text


# -- maps ---------------------------------------------------------------------


def test_pictures_and_grid(api, client, root):
    saga_id, dm, *_ = _setup(api, root)
    place = _location(api, saga_id, dm, "Riverton")
    first, second = _map_picture(client, saga_id, dm), _map_picture(client, saga_id, dm)
    data = _command(api, saga_id, dm, place["id"], "images.set", images=[
        {"file_id": first["id"], "x": 0, "y": 0}, {"file_id": second["id"], "x": 256, "y": 0, "scale": 0.5}])
    assert [(i["w"], i["h"]) for i in data["images"]] == [(256, 128), (256, 128)]
    # Grid first: the pictures don't change the grid (100 px tiles, 16 x 12, contrast lines); the map covers both
    grid = data["grid"]
    assert (grid["cols"], grid["rows"], grid["size"], grid["auto"], grid["mode"], grid["opacity"], grid["line"]) == (16, 12, 100, False, "contrast", 0.5, 0.5)
    assert data["size"] == [1600, 1200]
    # Turned and mirrored: kept (the angle between -180 and 180); the map grows to the turned picture's box
    data = _command(api, saga_id, dm, place["id"], "images.set", images=[
        {"file_id": first["id"], "x": 1500, "y": 0, "rotation": 450, "flip_x": True}])
    image = data["images"][0]
    assert (image["rotation"], image["flip_x"], image["flip_y"]) == (90, True, False)
    assert data["size"] == [1692, 1200]  # 128 wide once turned, around the middle of a 256 x 128 picture at x 1500
    # Only map pictures of this Saga
    character_picture = upload(client, saga_id, dm, picture(100, 100)).json()["id"]
    other_saga, other_dm = api.saga(root, "Other", "dm-2")
    foreign = _map_picture(client, other_saga, other_dm)["id"]
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map/command"
    assert client.post(url, headers=dm, json={"name": "images.set", "args": {"images": [{"file_id": foreign}]}}).status_code == 400
    assert character_picture  # any category of the Saga's own pictures is fine (crop flows upload as "map")
    hexes = _command(api, saga_id, dm, place["id"], "grid.set", changes={"type": "hex", "cols": 10, "rows": 4, "opacity": 3})
    assert (hexes["grid"]["type"], hexes["grid"]["cols"], hexes["grid"]["auto"], hexes["grid"]["opacity"]) == ("hex", 10, False, 1)
    assert client.post(url, headers=dm, json={"name": "grid.set", "args": {"changes": {"mode": "rainbow"}}}).status_code == 400
    assert client.post(url, headers=dm, json={"name": "grid.set", "args": {"changes": {"cols": 400, "rows": 400}}}).status_code == 400


def test_resizing_keeps_things_on_their_tiles():
    data = maps.normalize({"grid": {"cols": 4, "rows": 3, "auto": False}})
    data["fog"]["enabled"] = True
    maps.paint(data, [7], maps.VISIBLE, [[0, 0], [3, 2], [1, 1]])
    top = maps.add_layer(data, "Upstairs")
    for layer, rid in ((data["layers"][0], 99), (top, 97)):  # each layer's own links and paths
        view = maps.layer_view(data, layer)
        maps.add_links(view, [3, 2], [rid])
        maps.add_links(view, [1, 1], [rid - 1])
        maps.save_path(view, {"tiles": [[0, 0], [1, 1], [3, 2]]}, {"groups": [], "members": []})
        maps.commit(data, layer, view)
    maps.resize(data, 3, 5)
    fog = data["fog"]["layers"]["7"]
    assert len(fog) == 15 and fog[0] == "2" and fog[1 * 3 + 1] == "2" and fog.count("2") == 2  # (3, 2) dropped
    for layer in data["layers"]:  # every layer's
        assert [l["tile"] for l in layer["links"]] == [[1, 1]]
        assert layer["paths"][0]["tiles"] == [[0, 0], [1, 1]]
    maps.resize(data, 5, 5)
    assert data["fog"]["layers"]["7"][1 * 5 + 1] == "2"  # still on (1, 1)


def test_hex_geometry():
    grid = {**maps.default_grid(), "type": "hex", "size": 60, "x": 10, "y": 20, "cols": 3, "rows": 3}
    radius = 60 / maps.SQRT3
    assert maps.tile_center(grid, 0, 0) == (40, 20 + radius)
    odd = maps.tile_center(grid, 0, 1)
    assert odd[0] == 70 and abs(odd[1] - (20 + 2.5 * radius)) < 1e-9  # odd rows shift half a tile
    assert len(maps.tile_polygon(grid, 1, 1)) == 6
    width, height = maps.grid_extent(grid)
    assert width == 210 and abs(height - (2 * radius + 3 * radius)) < 1e-9


def test_neighbours_and_shown_tiles():
    square = {**maps.default_grid(), "cols": 4, "rows": 3}
    assert sorted(maps.neighbours(square, 0, 0)) == [(0, 1), (1, 0), (1, 1)]
    assert len(maps.neighbours(square, 1, 1)) == 8
    hexes = {**square, "type": "hex"}
    assert sorted(maps.neighbours(hexes, 1, 1)) == [(0, 1), (1, 0), (1, 2), (2, 0), (2, 1), (2, 2)]  # odd row
    assert sorted(maps.neighbours(hexes, 1, 2)) == [(0, 1), (0, 2), (1, 1), (2, 2)]  # even row, last row
    fog = "0" * 12
    fog = fog[:5] + "1" + fog[6:]  # tile (1, 1) known
    assert maps.shown_tiles(fog, hexes) == {5, 4, 6, 1, 2, 9, 10}


def test_fog_per_member_group_and_players_payload(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    bob_id, bob = api.member(saga_id, dm, "bob")
    overview = api.ok("POST", f"/api/sagas/{saga_id}/groups", dm, json={"name": "Scouts", "member_ids": [bob_id]})
    scouts = next(g["id"] for g in overview["groups"] if g["name"] == "Scouts")
    place = _location(api, saga_id, dm, "Riverton", shared=[groups["players"]])
    red = _map_picture(client, saga_id, dm)
    _command(api, saga_id, dm, place["id"], "images.set", images=[{"file_id": red["id"], "x": 0, "y": 0}])
    _command(api, saga_id, dm, place["id"], "grid.set", changes={"size": 64, "cols": 4, "rows": 2})  # 64 px tiles over the picture
    _command(api, saga_id, dm, place["id"], "fog.set", enabled=True)
    _command(api, saga_id, dm, place["id"], "fog.paint", group_ids=[groups["players"]], state="2", tiles=[[0, 0]])
    _command(api, saga_id, dm, place["id"], "fog.paint", group_ids=[groups["players"]], state="1", tiles=[[1, 0]])
    data = _command(api, saga_id, dm, place["id"], "fog.paint", group_ids=[scouts], state="2", tiles=[[1, 0], [2, 0]])
    assert data["fog"]["layers"][str(scouts)][:3] == "022"
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map"
    for_ana = api.ok("GET", url, ana)
    for_bob = api.ok("GET", url, bob)  # a player and a scout: the best of both
    assert for_ana["fog"]["states"][:4] == "2100" and for_bob["fog"]["states"][:4] == "2220"
    # Players never get the map's pictures: one composed picture, for their fog
    payload = json.dumps(for_ana)
    assert "images" not in for_ana and f"/api/files/{red['id']}" not in payload and "layers" not in for_ana["fog"]
    assert str(scouts) not in json.dumps(for_ana["fog"])  # nor other groups' fog
    composed = client.get(for_ana["image"]["url"])
    assert composed.status_code == 200 and composed.headers["content-type"] == "image/webp"
    image = Image.open(io.BytesIO(composed.content)).convert("RGB")
    assert image.size == (256, 256)
    red_pixel, black = image.getpixel((32, 32)), image.getpixel((200, 32))
    assert red_pixel[0] > 150 and red_pixel[1] < 80  # tile (0, 0): visible
    assert max(black) < 20  # tile (3, 0): unknown, black in the picture itself
    assert image.getpixel((160, 32))[0] > 150  # tile (2, 0): unknown but touching a known tile (the fog's soft edge)
    assert max(image.getpixel((100, 32))) > 100  # tile (1, 0): known (players get it; it's drawn grey on screen)
    # The URL is signed: another fog can't be asked for
    tampered = for_ana["image"]["url"].replace(f"g={groups['players']}", f"g={groups['players']},{scouts}")
    assert client.get(tampered).status_code == 404
    # Only DMs paint
    assert client.post(f"{url}/command", headers=ana, json={"name": "fog.fill", "args": {"group_ids": [groups["players"]], "state": "2"}}).status_code == 403


def test_links_and_paths_follow_visibility(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    players = [groups["players"]]
    place = _location(api, saga_id, dm, "Riverton", shared=players)
    inn = _location(api, saga_id, dm, "The Prancing Goat", parent=place["id"], shared=players)
    cellar = _location(api, saga_id, dm, "Secret cellar", parent=place["id"])
    _command(api, saga_id, dm, place["id"], "links.add", tile=[0, 0], resource_ids=[inn["id"], cellar["id"]])
    _command(api, saga_id, dm, place["id"], "links.add", tile=[5, 5], resource_ids=[inn["id"]])
    _command(api, saga_id, dm, place["id"], "paths.save", path={"name": "Our road", "tiles": [[0, 0], [1, 0], [1, 1]],
                                                               "body": "arrows", "visibility": {"groups": players, "members": []}})
    data = _command(api, saga_id, dm, place["id"], "paths.save", path={"name": "Escape tunnel", "tiles": [[2, 2]],
                                                                      "visibility": {"groups": [], "members": []}})
    assert [len(l) for l in (data["links"], data["paths"])] == [3, 2]
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map"
    seen = api.ok("GET", url, ana)
    assert [(l["name"], l["tile"]) for l in seen["links"]] == [("The Prancing Goat", [0, 0]), ("The Prancing Goat", [5, 5])]
    assert [p["name"] for p in seen["paths"]] == ["Our road"] and "visibility" not in seen["paths"][0]
    # A partly shown path (progress on a route): players get it cut short, never the route ahead
    road = next(p for p in api.ok("GET", url, dm)["paths"] if p["name"] == "Our road")
    assert road["shown"] == 100
    long = [[c, 0] for c in range(6)]
    _command(api, saga_id, dm, place["id"], "paths.save", path={"id": road["id"], "tiles": long, "shown": 30})
    part = api.ok("GET", url, ana)["paths"][0]
    assert part["tiles"] == long[:4] and part["cut"] == 1.5 and "shown" not in part  # 1.5 tiles along: spline piece 2
    mine = next(p for p in api.ok("GET", url, dm)["paths"] if p["name"] == "Our road")
    assert mine["tiles"] == long and mine["shown"] == 30 and "cut" not in mine
    _command(api, saga_id, dm, place["id"], "paths.save", path={"id": road["id"], "render": "poly", "shown": 0})
    assert api.ok("GET", url, ana)["paths"][0]["tiles"] == long[:2]
    _command(api, saga_id, dm, place["id"], "paths.save", path={"id": road["id"], "render": "spline", "shown": 100})
    part = api.ok("GET", url, ana)["paths"][0]
    assert part["tiles"] == long and "cut" not in part
    # With fog, links on tiles they don't know disappear
    _command(api, saga_id, dm, place["id"], "fog.set", enabled=True)
    _command(api, saga_id, dm, place["id"], "fog.paint", group_ids=players, state="1", tiles=[[0, 0]])
    assert [l["tile"] for l in api.ok("GET", url, ana)["links"]] == [[0, 0]]
    data = _command(api, saga_id, dm, place["id"], "links.remove", tile=[0, 0], resource_id=inn["id"])
    assert [(l["name"], l["tile"]) for l in data["links"]] == [("Secret cellar", [0, 0]), ("The Prancing Goat", [5, 5])]
    road = next(p for p in data["paths"] if p["name"] == "Our road")
    assert client.post(f"{url}/command", headers=dm, json={"name": "paths.save", "args": {"path": {"id": road["id"], "head": "star"}}}).status_code == 400
    assert client.post(f"{url}/command", headers=dm, json={"name": "paths.save", "args": {"path": {"tiles": [[99, 0]]}}}).status_code == 400
    # A location players can't see has no map for them
    assert client.get(f"/api/sagas/{saga_id}/locations/{cellar['id']}/map", headers=ana).status_code == 404



def test_new_things_show_and_links_hide_and_move(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    players = [groups["players"]]
    place = _location(api, saga_id, dm, "Riverton", shared=players)
    inn = _location(api, saga_id, dm, "The Prancing Goat", parent=place["id"], shared=players)
    # Paths, regions and labels start shown to players (the eye hides them); a new path is Normal (7)
    _command(api, saga_id, dm, place["id"], "paths.save", path={"name": "Road", "tiles": [[0, 0]]})
    _command(api, saga_id, dm, place["id"], "regions.save", region={"name": "Woods", "tiles": [[1, 1]]})
    data = _command(api, saga_id, dm, place["id"], "labels.save", label={"text": "Well", "point": [10, 10]})
    assert data["paths"][0]["width"] == 7
    for kind in ("paths", "regions", "labels"):
        assert data[kind][0]["visibility"] == {"groups": players, "members": []}
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map"
    seen = api.ok("GET", url, ana)
    assert [len(seen[k]) for k in ("paths", "regions", "labels")] == [1, 1, 1]
    # A link the DM hides: players don't get it; the DM sees it marked
    _command(api, saga_id, dm, place["id"], "links.add", tile=[0, 0], resource_ids=[inn["id"]])
    assert api.ok("GET", url, dm)["links"][0]["hidden"] is False
    data = _command(api, saga_id, dm, place["id"], "links.hide", tile=[0, 0], resource_id=inn["id"], hidden=True)
    assert data["links"][0]["hidden"] is True
    assert api.ok("GET", url, ana)["links"] == []
    _command(api, saga_id, dm, place["id"], "links.hide", tile=[0, 0], resource_id=inn["id"], hidden=False)
    assert len(api.ok("GET", url, ana)["links"]) == 1
    # Moved to another tile; onto a tile that already has it, the two become one
    data = _command(api, saga_id, dm, place["id"], "links.move", tile=[0, 0], resource_id=inn["id"], to=[2, 1])
    assert [l["tile"] for l in data["links"]] == [[2, 1]]
    _command(api, saga_id, dm, place["id"], "links.add", tile=[0, 0], resource_ids=[inn["id"]])
    data = _command(api, saga_id, dm, place["id"], "links.move", tile=[0, 0], resource_id=inn["id"], to=[2, 1])
    assert [l["tile"] for l in data["links"]] == [[2, 1]]
    for bad in ({"tile": [5, 5], "resource_id": inn["id"], "to": [1, 1]}, {"tile": [2, 1], "resource_id": inn["id"], "to": [99, 0]}):
        assert client.post(f"{url}/command", headers=dm, json={"name": "links.move", "args": bad}).status_code == 400


def test_regions(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    players = [groups["players"]]
    place = _location(api, saga_id, dm, "Riverlands", shared=players)
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map"
    data = _command(api, saga_id, dm, place["id"], "regions.save", region={
        "name": "Elf woods", "tiles": [[0, 0], [1, 0], [1, 0], [1, 1]], "show": "border", "render": "poly",
        "visibility": {"groups": players, "members": []}})
    woods = data["regions"][0]
    assert woods["tiles"] == [[0, 0], [1, 0], [1, 1]] and woods["show"] == "border" and woods["label"] is True
    _command(api, saga_id, dm, place["id"], "regions.save", region={"name": "Dragon's lair", "tiles": [[4, 4]],
                                                                    "visibility": {"groups": [], "members": []}})
    seen = api.ok("GET", url, ana)
    assert [r["name"] for r in seen["regions"]] == ["Elf woods"] and "visibility" not in seen["regions"][0]
    # Edits keep what isn't sent; bad values are refused
    data = _command(api, saga_id, dm, place["id"], "regions.save", region={"id": woods["id"], "opacity": 0.6})
    assert data["regions"][0]["tiles"] == woods["tiles"] and data["regions"][0]["opacity"] == 0.6
    for bad in ({"show": "glow"}, {"tiles": [[99, 0]]}, {"color": "red"}):
        response = client.post(f"{url}/command", headers=dm, json={"name": "regions.save", "args": {"region": {"id": woods["id"], **bad}}})
        assert response.status_code == 400
    # Resizing the grid drops the region's tiles past the new edge
    data = _command(api, saga_id, dm, place["id"], "grid.set", changes={"cols": 1, "rows": 1})
    assert data["regions"][0]["tiles"] == [[0, 0]]
    data = _command(api, saga_id, dm, place["id"], "regions.delete", id=woods["id"])
    assert [r["name"] for r in data["regions"]] == ["Dragon's lair"]


# -- map Sets -------------------------------------------------------------------


def _map_set(api, saga_id, dm, type_key="world_map"):
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Travel"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": type_key})
    return stage["id"], stage["sets"][0]["id"]


def test_world_map_shows_one_location_at_a_time(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    world = _location(api, saga_id, dm, "Aerth")
    town = _location(api, saga_id, dm, "Riverton")  # not shared: the map Set shows it anyway
    character = api.ok("POST", f"/api/sagas/{saga_id}/resources", dm, json={"kind": "character", "type": "pc",
                                                                             "attributes": {"name": "Thorin"}})
    stage_id, set_id = _map_set(api, saga_id, dm)
    actors_url = f"/api/sagas/{saga_id}/sets/{set_id}/actors"
    assert client.post(actors_url, headers=dm, json={"resource_ids": [character["id"]]}).status_code == 400
    stage = api.ok("POST", actors_url, dm, json={"resource_ids": [world["id"], town["id"], world["id"]]})
    content = stage["sets"][0]["content"]
    assert [l["name"] for l in content["locations"]] == ["Aerth", "Riverton"] and content["current"] == world["id"]
    # Drawn with the Saga's default fog preset (made with the Saga)
    assert content["fog"]["style"] == "mist" and content["fog"]["display"] == "soft" and content["map"]["location"]["name"] == "Aerth"
    assert [p["name"] for p in content["fog_presets"]] == ["White mist"] and content["fog_preset"] == content["fog_presets"][0]["id"]
    command = f"/api/sagas/{saga_id}/sets/{set_id}/command"
    content = api.ok("POST", command, dm, json={"name": "location.show", "args": {"location_id": town["id"]}})["sets"][0]["content"]
    assert content["map"]["location"]["id"] == town["id"]
    # A preset of the DM's: the Set picks it
    ink = api.ok("POST", f"/api/sagas/{saga_id}/fog-presets", dm, json={"name": "Ink", "look": {"style": "ink", "motion": 0}})
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"fog_preset": ink["id"], "interactive": {"viewers": True}}})
    assert client.patch(f"/api/sagas/{saga_id}/sets/{set_id}", headers=dm, json={"config": {"fog_style": "void"}}).status_code == 400
    assert client.patch(f"/api/sagas/{saga_id}/sets/{set_id}", headers=dm, json={"config": {"current": world["id"]}}).status_code == 400
    # Players get the shown location only, and whether they may click
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    live = api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]["sets"][0]["content"]
    assert live["map"]["location"]["name"] == "Riverton" and "locations" not in live and "Aerth" not in json.dumps(live)
    assert (live["interactive"], live["fog"]["style"], live["fog"]["motion"]) == (True, "ink", 0)
    assert "fog_presets" not in live
    # Deleting the preset: the Set falls back to the Saga's first one
    assert client.delete(f"/api/sagas/{saga_id}/fog-presets/{ink['id']}", headers=dm).status_code == 204
    assert api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]["sets"][0]["content"]["fog"]["style"] == "mist"
    # The shown location's map opens for them from the live Stage (it isn't shared otherwise)
    assert client.get(f"/api/sagas/{saga_id}/locations/{town['id']}/map", headers=ana).status_code == 200
    assert client.get(f"/api/sagas/{saga_id}/locations/{world['id']}/map", headers=ana).status_code == 404
    # Highlight and grab attention on tiles
    content = api.ok("POST", command, dm, json={"name": "highlight", "args": {"tiles": [[1, 1], [2, 1]]}})["sets"][0]["content"]
    assert content["map"]["highlight"] == [[1, 1], [2, 1]]
    assert client.post(command, headers=dm, json={"name": "highlight", "args": {"tiles": [[99, 99]]}}).status_code == 400
    # Off: kept for later (the DM has the tiles), shown to no one; on again without painting
    content = api.ok("POST", command, dm, json={"name": "highlight", "args": {"on": False}})["sets"][0]["content"]
    assert content["map"]["highlight"] is None and content["config"]["highlight"] == [[1, 1], [2, 1]]
    content = api.ok("POST", command, dm, json={"name": "highlight", "args": {"on": True}})["sets"][0]["content"]
    assert content["map"]["highlight"] == [[1, 1], [2, 1]]
    token = ana["Authorization"].split(" ", 1)[1]
    with client.websocket_connect(f"/api/sagas/{saga_id}/ws?token={token}") as ws:
        ws.receive_json()
        api.ok("POST", f"/api/sagas/{saga_id}/attention", dm, json={"set_id": set_id, "target": {"tiles": [[3, 2]]}})
        message = ws.receive_json()
        assert message["target"] == {"location_id": town["id"], "tiles": [[3, 2]]}


def test_one_map_set(api, client, root):
    """The Local map was merged into the Map Set (key world_map): only it can be added."""
    saga_id, dm, *_ = _setup(api, root)
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Travel"})
    assert client.post(f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", headers=dm, json={"type": "local_map"}).status_code == 400
    types = {t["key"]: t["name"] for t in api.ok("GET", f"/api/sagas/{saga_id}/set-types", dm)}
    assert types["world_map"] == "Map" and "local_map" not in types


def test_fog_presets(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    url = f"/api/sagas/{saga_id}/fog-presets"
    presets = api.ok("GET", url, dm)
    assert [p["name"] for p in presets] == ["White mist"] and presets[0]["look"]["display"] == "soft"
    assert client.get(url, headers=ana).status_code == 403  # the DM's tool
    # A style brings its colours unless colours come with it
    nebula = api.ok("POST", url, dm, json={"name": "Deep space", "look": {"style": "nebula", "size": 2}})
    assert nebula["look"]["colors"] == ["#050510", "#5b3fb0", "#b0506e"] and nebula["look"]["size"] == 2
    copy = api.ok("POST", url, dm, json={"copy_of": nebula["id"]})
    assert copy["name"] == "Deep space (copy)" and copy["look"] == nebula["look"]
    edited = api.ok("PATCH", f"{url}/{copy['id']}", dm, json={"name": "Embers", "changes": {
        "style": "embers", "colors": ["#000000", "#111111", "#FF0000"], "intensity": 0.9, "known": 0.2}})
    assert edited["look"]["colors"] == ["#000000", "#111111", "#ff0000"] and edited["name"] == "Embers"
    for bad in ({"style": "lava"}, {"size": 9}, {"motion": -1}, {"colors": ["#000000"]}, {"glow": 1}, {"display": "3d"}):
        assert client.patch(f"{url}/{copy['id']}", headers=dm, json={"changes": bad}).status_code == 400
    assert client.patch(f"{url}/{copy['id']}", headers=dm, json={"name": "  "}).status_code == 400
    # The last preset stays
    for preset in api.ok("GET", url, dm)[1:]:
        assert client.delete(f"{url}/{preset['id']}", headers=dm).status_code == 204
    assert client.delete(f"{url}/{presets[0]['id']}", headers=dm).status_code == 400
    # Another Saga's presets are out of reach
    other_id, other_dm = api.saga(root, "Other", "dm2")
    assert client.patch(f"/api/sagas/{other_id}/fog-presets/{presets[0]['id']}", headers=other_dm, json={"name": "x"}).status_code == 404


def test_map_labels(api, client, root):
    saga_id, dm, _, ana, groups = _setup(api, root)
    place = _location(api, saga_id, dm, "Riverton", shared=[groups["players"]])
    _command(api, saga_id, dm, place["id"], "fog.set", enabled=True)
    _command(api, saga_id, dm, place["id"], "fog.paint", group_ids=[groups["players"]], state="1", tiles=[[0, 0]])
    shared = {"groups": [groups["players"]], "members": []}
    data = _command(api, saga_id, dm, place["id"], "labels.save", label={
        "text": "  The Old Mill ", "point": [20, 30], "pin": "star", "side": "right", "visibility": shared})
    mill = data["labels"][0]
    assert (mill["text"], mill["pin"], mill["side"], mill["size"], mill["on_click"]) == ("The Old Mill", "star", "right", "medium", False)
    _command(api, saga_id, dm, place["id"], "labels.save", label={"text": "Dragon lair", "point": [600, 500], "visibility": shared})  # unknown tile
    _command(api, saga_id, dm, place["id"], "labels.save", label={"text": "Secret door", "point": [40, 40],
                                                                  "visibility": {"groups": [], "members": []}})  # hidden
    _command(api, saga_id, dm, place["id"], "labels.save", label={"id": mill["id"], "on_click": True, "size": "large"})
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map/command"
    clamped = _command(api, saga_id, dm, place["id"], "labels.save", label={"text": "Edge", "point": [99999, -5]})["labels"][-1]
    assert clamped["point"][0] == data["size"][0] and clamped["point"][1] == 0  # kept on the map
    _command(api, saga_id, dm, place["id"], "labels.delete", id=clamped["id"])
    for args in ({"label": {"text": "X", "point": [1]}}, {"label": {"text": "X", "point": [1, 1], "pin": "skull"}},
                 {"label": {"text": "", "point": [1, 1], "pin": "none"}}, {"label": {"text": "X", "point": [1, 1], "side": "below"}}):
        assert client.post(url, headers=dm, json={"name": "labels.save", "args": args}).status_code == 400, args
    seen = api.ok("GET", f"/api/sagas/{saga_id}/locations/{place['id']}/map", ana)["labels"]
    assert [(l["text"], l["on_click"], l["size"]) for l in seen] == [("The Old Mill", True, "large")] and "visibility" not in seen[0]
    data = _command(api, saga_id, dm, place["id"], "labels.delete", id=mill["id"])
    assert [l["text"] for l in data["labels"]] == ["Dragon lair", "Secret door"]
    # Hex grids: the tile under a point
    assert maps.tile_at({"type": "hex", "size": 60, "x": 0, "y": 0}, 30, 34) == (0, 0)
    assert maps.tile_at({"type": "hex", "size": 60, "x": 0, "y": 0}, 60, 86) == (0, 1)


def test_stage_layouts_and_layers(api, client, root):
    saga_id, dm, _, ana, groups = _setup(api, root)
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Table"})
    sid = stage["id"]
    assert stage["layout"] == "interface"  # new Stages: Sets fixed to the screen
    assert api.ok("PATCH", f"/api/sagas/{saga_id}/stages/{sid}", dm, json={"layout": "canvas"})["layout"] == "canvas"
    api.ok("POST", f"/api/sagas/{saga_id}/stages/{sid}/sets", dm, json={"type": "world_map"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{sid}/sets", dm, json={"type": "actors_scene"})
    world, scene = stage["sets"]
    assert world["screen"] == {"anchor": "center", "width": 60, "height": 60, "x": 0, "y": 0}
    stage = api.ok("PATCH", f"/api/sagas/{saga_id}/stages/{sid}", dm, json={"layout": "interface"})
    assert stage["layout"] == "interface" and stage["name"] == "Table"
    assert client.patch(f"/api/sagas/{saga_id}/stages/{sid}", headers=dm, json={"layout": "grid"}).status_code == 400
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{world['id']}", dm, json={"screen": {"anchor": "top-left", "width": 100, "height": 100}})
    stage = api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{scene['id']}", dm, json={"screen": {"anchor": "bottom", "height": 30, "y": -2}})
    assert stage["sets"][1]["screen"] == {"anchor": "bottom", "width": 60, "height": 30, "x": 0, "y": -2}
    for bad in ({"anchor": "middle"}, {"width": 0}, {"x": 300}, {"depth": 3}):
        assert client.patch(f"/api/sagas/{saga_id}/sets/{scene['id']}", headers=dm, json={"screen": bad}).status_code == 400
    # Layers: bottom to top, every Set once
    stage = api.ok("PUT", f"/api/sagas/{saga_id}/stages/{sid}/layers", dm, json={"set_ids": [scene["id"], world["id"]]})
    assert [s["id"] for s in stage["sets"]] == [scene["id"], world["id"]]
    assert client.put(f"/api/sagas/{saga_id}/stages/{sid}/layers", headers=dm, json={"set_ids": [scene["id"]]}).status_code == 400
    assert client.put(f"/api/sagas/{saga_id}/stages/{sid}/layers", headers=ana, json={"set_ids": [scene["id"], world["id"]]}).status_code == 403
    copy = api.ok("POST", f"/api/sagas/{saga_id}/stages/{sid}/duplicate", dm)
    assert [s["screen"]["anchor"] for s in copy["sets"]] == ["bottom", "top-left"]
    from domain.stage_layout import screen_rect
    assert screen_rect({"anchor": "bottom", "width": 50, "height": 30, "x": 0, "y": 0}, 1000, 800) == (250, 560, 500, 240)


def test_set_toolbars(api, client, root):
    """Where a Set's controls sit: only what the DM changed is kept (the Set type has the defaults)."""
    saga_id, dm, _, ana, groups = _setup(api, root)
    sid = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Table"})["id"]
    scene = api.ok("POST", f"/api/sagas/{saga_id}/stages/{sid}/sets", dm, json={"type": "actors_scene"})["sets"][0]
    assert scene["toolbars"] == {}
    url = f"/api/sagas/{saga_id}/sets/{scene['id']}"
    stage = api.ok("PATCH", url, dm, json={"toolbars": {"turns": {"anchor": "right", "vertical": True, "y": 40}}})
    stage = api.ok("PATCH", url, dm, json={"toolbars": {"turns": {"size": "large"}, "main": {"hidden": True, "outside": True}}})
    assert stage["sets"][0]["toolbars"] == {"turns": {"anchor": "right", "vertical": True, "y": 40, "size": "large"},
                                            "main": {"hidden": True, "outside": True}}
    # null: back to the default; players get the places too (the map's zoom buttons are theirs)
    stage = api.ok("PATCH", url, dm, json={"toolbars": {"main": None}})
    assert list(stage["sets"][0]["toolbars"]) == ["turns"]
    assert api.ok("GET", f"/api/sagas/{saga_id}/stages/{sid}", dm)["sets"][0]["toolbars"]["turns"]["anchor"] == "right"
    for bad in ({"turns": {"anchor": "center"}}, {"turns": {"vertical": "yes"}}, {"turns": {"x": 5000}}, {"turns": {"size": "huge"}},
                {"turns": {"depth": 1}}, {"Bad Key": {}}, {"turns": 3}, {f"t{i}": {} for i in range(13)}):
        assert client.patch(url, headers=dm, json={"toolbars": bad}).status_code == 400, bad
    assert client.patch(url, headers=ana, json={"toolbars": {"turns": {"size": "small"}}}).status_code == 403
    copy = api.ok("POST", f"/api/sagas/{saga_id}/stages/{sid}/duplicate", dm)
    assert copy["sets"][0]["toolbars"]["turns"]["size"] == "large"


def test_location_graph(api, client, root):
    """The location map: links between places on their maps, "part of" towards the parent (the node's group); a
    player sees only places shared with them, and links on tiles they know."""
    saga_id, dm, _, ana, groups = _setup(api, root)
    players = [groups["players"]]
    world = _location(api, saga_id, dm, "Riverlands", shared=players)
    town = _location(api, saga_id, dm, "Riverton", parent=world["id"], shared=players)
    mill = _location(api, saga_id, dm, "Old Mill", parent=world["id"], shared=players)
    vault = _location(api, saga_id, dm, "Vault", parent=town["id"])  # not shared
    _command(api, saga_id, dm, world["id"], "links.add", tile=[0, 0], resource_ids=[town["id"]])
    _command(api, saga_id, dm, world["id"], "links.add", tile=[1, 0], resource_ids=[mill["id"]])
    _command(api, saga_id, dm, town["id"], "links.add", tile=[0, 0], resource_ids=[world["id"], vault["id"]])
    url = f"/api/sagas/{saga_id}/locations/graph"
    graph = api.ok("GET", url, dm)
    groups_of = {n["name"]: n["group"] for n in graph["nodes"]}
    assert groups_of == {"Riverlands": None, "Riverton": f"r{world['id']}", "Old Mill": f"r{world['id']}", "Vault": f"r{town['id']}"}
    links = {(e["from"], e["to"], e["directed"]) for e in graph["edges"] if not e["reference"]}
    w, t, m, v = (f"r{x['id']}" for x in (world, town, mill, vault))
    assert links == {(w, t, False), (w, m, True), (t, v, True)}  # both ways: one undirected link
    assert {(e["from"], e["to"]) for e in graph["edges"] if e["reference"]} == {(t, w), (m, w), (v, t)}
    # Players: no vault; the world's fog hides the mill's tile
    _command(api, saga_id, dm, world["id"], "fog.set", enabled=True)
    _command(api, saga_id, dm, world["id"], "fog.paint", group_ids=players, state="1", tiles=[[0, 0]])
    seen = api.ok("GET", url, ana)
    assert sorted(n["name"] for n in seen["nodes"]) == ["Old Mill", "Riverlands", "Riverton"]
    assert {(e["from"], e["to"]) for e in seen["edges"] if not e["reference"]} == {(w, t)}
    assert all(v not in (e["from"], e["to"]) for e in seen["edges"])


def test_sets_put_away(api, client, root):
    """A Set put away (the eye) is drawn for no one: players aren't even sent it; the DM brings it back."""
    saga_id, dm, _, ana, _ = _setup(api, root)
    sid = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Table"})["id"]
    api.ok("POST", f"/api/sagas/{saga_id}/stages/{sid}/sets", dm, json={"type": "world_map"})
    scene = api.ok("POST", f"/api/sagas/{saga_id}/stages/{sid}/sets", dm, json={"type": "actors_scene"})["sets"][1]
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": sid})
    stage = api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{scene['id']}", dm, json={"off": True})
    assert [s["off"] for s in stage["sets"]] == [False, True]
    assert [s["type"] for s in api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]["sets"]] == ["world_map"]
    assert "off" not in api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]["sets"][0]
    assert client.patch(f"/api/sagas/{saga_id}/sets/{scene['id']}", headers=ana, json={"off": False}).status_code == 403
    assert api.ok("POST", f"/api/sagas/{saga_id}/stages/{sid}/duplicate", dm)["sets"][1]["off"] is True
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{scene['id']}", dm, json={"off": False})
    assert len(api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]["sets"]) == 2


def test_map_layers(api, client, root):
    """Plan 27: layers (each its pictures, links, tokens...), see-through, the no-map colour, the Map Set's layer."""
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    players = [groups["players"]]
    tower = _location(api, saga_id, dm, "Tower", shared=players)
    inn = _location(api, saga_id, dm, "Inn", shared=players)
    red = _map_picture(client, saga_id, dm)
    data = _command(api, saga_id, dm, tower["id"], "images.set", images=[{"file_id": red["id"], "x": 0, "y": 0}])
    assert [(l["name"], l["see_through"]) for l in data["layers"]] == [("Map", False)] and data["background"] == "#000000"
    ground = data["layer"]
    add_layer = lambda name: api.ok("POST", f"/api/sagas/{saga_id}/locations/{tower['id']}/map/command", dm,  # noqa: E731
                                    json={"name": "layers.add", "args": {"name": name}})
    data = add_layer("Upstairs")
    upstairs = data["layers"][-1]["id"]
    # Each layer has its own things: links, tokens...
    _command(api, saga_id, dm, tower["id"], "links.add", layer=upstairs, tile=[1, 1], resource_ids=[inn["id"]])
    data = _command(api, saga_id, dm, tower["id"], "tokens.save", layer=ground, token={"kind": "custom", "name": "Cart", "tile": [0, 0]})
    cart = data["tokens"][0]["id"]
    url = f"/api/sagas/{saga_id}/locations/{tower['id']}/map"
    up = api.ok("GET", f"{url}?layer={upstairs}", dm)
    assert up["layer"] == upstairs and up["images"] == [] and [l["tile"] for l in up["links"]] == [[1, 1]] and up["tokens"] == []
    assert api.ok("GET", url, dm)["links"] == []  # the first layer's: none
    # See-through: the layers under it show where it has no picture
    _command(api, saga_id, dm, tower["id"], "layers.update", id=upstairs, changes={"see_through": True, "name": "Attic"})
    up = api.ok("GET", f"{url}?layer={upstairs}", dm)
    assert [i["file_id"] for i in up["images"]] == [red["id"]] and up["layers"][-1]["name"] == "Attic"
    # Players: a composed picture per layer
    for_ana = api.ok("GET", f"{url}?layer={upstairs}", ana)
    assert f"l={upstairs}" in for_ana["image"]["url"] and "images" not in for_ana
    assert client.get(for_ana["image"]["url"]).status_code == 200
    tampered = for_ana["image"]["url"].replace(f"l={upstairs}", f"l={ground}")
    assert client.get(tampered).status_code == 404  # the layer is signed too
    # A token moves to another layer (same tile); the no-map colour; order
    data = _command(api, saga_id, dm, tower["id"], "tokens.layer", layer=upstairs, id=cart, to=upstairs)
    assert [t["id"] for t in data["tokens"]] == [cart]
    data = _command(api, saga_id, dm, tower["id"], "background.set", color="#223344")
    assert data["background"] == "#223344"
    data = _command(api, saga_id, dm, tower["id"], "layers.move", id=upstairs, delta=-1)
    assert [l["id"] for l in data["layers"]] == [upstairs, ground]
    cmd = f"{url}/command"
    for bad in ({"name": "background.set", "args": {"color": "red"}}, {"name": "links.add", "args": {"layer": "nope", "tile": [0, 0], "resource_ids": [inn["id"]]}},
                {"name": "layers.update", "args": {"id": ground, "changes": {"name": ""}}}):
        assert client.post(cmd, headers=dm, json=bad).status_code == 400, bad
    # Deleting a layer takes its things (not the last layer)
    data = _command(api, saga_id, dm, tower["id"], "layers.delete", id=upstairs)
    assert [l["id"] for l in data["layers"]] == [ground] and data["tokens"] == []
    assert client.post(cmd, headers=dm, json={"name": "layers.delete", "args": {"id": ground}}).status_code == 400
    # The Map Set shows the layer the DM picks, per location
    add_layer("Roof")
    roof = api.ok("GET", url, dm)["layers"][-1]["id"]
    stage_id, set_id = _map_set(api, saga_id, dm)
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"resource_ids": [tower["id"]]})
    set_cmd = f"/api/sagas/{saga_id}/sets/{set_id}/command"
    assert client.post(set_cmd, headers=dm, json={"name": "layer.show", "args": {"layer_id": "nope"}}).status_code == 400
    content = api.ok("POST", set_cmd, dm, json={"name": "layer.show", "args": {"layer_id": roof}})["sets"][0]["content"]
    assert content["map"]["layer"] == roof


def test_old_maps_become_one_layer():
    old = {"images": [{"id": "img1", "file_id": 3, "x": 0, "y": 0, "w": 10, "h": 10, "scale": 1}],
           "links": [{"tile": [0, 0], "resource_id": 9}], "tokens": [], "paths": [], "regions": [], "labels": [], "next_id": 4}
    data = maps.normalize(old)
    assert len(data["layers"]) == 1 and data["layers"][0]["images"][0]["file_id"] == 3 and data["layers"][0]["links"][0]["resource_id"] == 9
    assert "images" not in data and data["next_id"] == 4 and data["background"] == "#000000"


# -- players' composed picture: memory ----------------------------------------


def test_fog_changes_reuse_the_composed_pictures(api, client, root, monkeypatch):
    """Painting fog makes a new map version per stroke: the pictures are decoded and scaled once, and only the fog's
    mask is redrawn (decoding them per stroke ran the API out of memory)."""
    from services import locations

    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    place = _location(api, saga_id, dm, "Riverton", shared=[groups["players"]])
    red = _map_picture(client, saga_id, dm)
    _command(api, saga_id, dm, place["id"], "images.set", images=[{"file_id": red["id"], "x": 0, "y": 0}])
    _command(api, saga_id, dm, place["id"], "fog.set", enabled=True)
    decoded = []
    real = locations._picture
    monkeypatch.setattr(locations, "_picture", lambda file, size: decoded.append(file.id) or real(file, size))
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map"
    pictures = []
    for tile in ([0, 0], [1, 0], [2, 0]):
        _command(api, saga_id, dm, place["id"], "fog.paint", group_ids=[groups["players"]], state="2", tiles=[tile])
        composed = client.get(api.ok("GET", url, ana)["image"]["url"])
        assert composed.status_code == 200
        pictures.append(Image.open(io.BytesIO(composed.content)).convert("RGB"))
    assert decoded == [red["id"]]  # once, for three fog versions
    # Each its own fog: tile (3, 0) is far from the fog's edge at first, touching it after the third stroke
    assert max(pictures[0].getpixel((232, 32))) < 20 and pictures[2].getpixel((232, 32))[0] > 150
    # A new picture is composed again
    blue = _map_picture(client, saga_id, dm, color=(30, 30, 200))
    _command(api, saga_id, dm, place["id"], "images.set", images=[{"file_id": blue["id"], "x": 0, "y": 0}])
    image = Image.open(io.BytesIO(client.get(api.ok("GET", url, ana)["image"]["url"]).content)).convert("RGB")
    assert image.getpixel((32, 32))[2] > 150 and decoded == [red["id"], blue["id"]]


def test_composed_pictures_are_turned_and_mirrored(api, client, root):
    """Players' composed picture draws a picture as the DM placed it: mirrored, then turned around its middle."""
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    place = _location(api, saga_id, dm, "Riverton", shared=[groups["players"]])
    halves = Image.new("RGB", (200, 100), (220, 30, 30))
    halves.paste((30, 30, 220), (100, 0, 200, 100))  # left red, right blue
    buffer = io.BytesIO()
    halves.save(buffer, "PNG")
    file_id = upload(client, saga_id, dm, buffer.getvalue(), category="map").json()["id"]
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map"

    def composed(**placed):
        _command(api, saga_id, dm, place["id"], "images.set", images=[{"file_id": file_id, "x": 100, "y": 100, **placed}])
        return Image.open(io.BytesIO(client.get(api.ok("GET", url, ana)["image"]["url"]).content)).convert("RGB")

    plain = composed()
    assert plain.getpixel((120, 150))[0] > 150 and plain.getpixel((280, 150))[2] > 150
    mirrored = composed(flip_x=True)
    assert mirrored.getpixel((120, 150))[2] > 150 and mirrored.getpixel((280, 150))[0] > 150
    turned = composed(rotation=90)  # a quarter clockwise around (200, 150): the left half goes on top
    assert turned.getpixel((200, 70))[0] > 150 and turned.getpixel((200, 230))[2] > 150
    assert max(turned.getpixel((120, 150))) < 20  # where the picture was before turning: the no-map colour


def test_composing_jpegs_and_transparent_pictures(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    place = _location(api, saga_id, dm, "Riverton", shared=[groups["players"]])
    big = Image.new("RGB", (2048, 1024), (30, 160, 40))
    buffer = io.BytesIO()
    big.save(buffer, "JPEG", quality=90)
    jpeg = upload(client, saga_id, dm, buffer.getvalue(), category="map", content_type="image/jpeg")
    assert jpeg.status_code == 200, jpeg.text
    clear = Image.new("RGBA", (256, 128), (0, 0, 0, 0))
    clear.paste((250, 250, 250, 255), (0, 0, 128, 128))  # left half white, right half see-through
    buffer = io.BytesIO()
    clear.save(buffer, "PNG")
    overlay = upload(client, saga_id, dm, buffer.getvalue(), category="map")
    assert overlay.status_code == 200, overlay.text
    _command(api, saga_id, dm, place["id"], "images.set", images=[
        {"file_id": jpeg.json()["id"], "x": 0, "y": 0, "w": 256, "h": 128},
        {"file_id": overlay.json()["id"], "x": 0, "y": 0},
    ])
    data = api.ok("GET", f"/api/sagas/{saga_id}/locations/{place['id']}/map", ana)
    image = Image.open(io.BytesIO(client.get(data["image"]["url"]).content)).convert("RGB")
    assert min(image.getpixel((32, 32))) > 200  # the overlay's white
    green = image.getpixel((200, 32))
    assert green[1] > 120 and green[0] < 80  # the JPEG shows through the transparent half


def test_composing_is_limited_to_a_few_at_once(monkeypatch):
    """At most COMPOSE_SLOTS pictures are composed at once, whatever the number of requests."""
    import threading
    import time

    from services import locations

    running, peak, lock = [0], [0], threading.Lock()

    class Row:
        version = 1
        data = {}

    class Db:
        def get(self, model, key):
            return Row()

    def fake_normalize(data):
        with lock:
            running[0] += 1
            peak[0] = max(peak[0], running[0])
        time.sleep(0.05)
        with lock:
            running[0] -= 1
        raise RuntimeError("stop here")

    monkeypatch.setattr(locations.maps, "normalize", fake_normalize)

    def ask(i):
        try:
            locations.compose(Db(), 1000 + i, [i], None)
        except RuntimeError:
            pass

    threads = [threading.Thread(target=ask, args=(i,)) for i in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert 1 <= peak[0] <= locations.COMPOSE_SLOTS
