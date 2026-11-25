"""The map painter (plans 47 to 50): the style's catalogue and art, the RLE channels, painting terrain, routes,
boundaries (on edges), scenery, effects and features, plan 47's paintings read into layers, layers seen together, the
grid changing, and what players get."""
import io
import random
import re

from PIL import Image

from domain import map_paint as mp
from domain import maps
from tests.test_locations import _command, _location, _map_picture, _setup

SQUARE = {"type": "square", "size": 100, "x": 0, "y": 0, "cols": 6, "rows": 4}
HEX = {**SQUARE, "type": "hex"}


def values(paint, channel, grid=SQUARE):
    return list(mp.rle_decode(paint[channel], grid["cols"] * grid["rows"]))


def test_rle_round_trips_and_stays_small():
    rng = random.Random(4)
    for data in (bytes(1000), bytes([7]) * 700, bytes(rng.randrange(3) for _ in range(5000)), bytes([1, 2, 3])):
        assert bytes(mp.rle_decode(mp.rle_encode(data), len(data))) == data
    assert mp.rle_encode(bytes(40000)) == ""  # nothing painted: nothing kept
    big = bytes([3]) * 20000 + bytes([5]) * 20000  # a 200 x 200 map in two halves
    assert len(mp.rle_encode(big)) < 16
    assert list(mp.rle_decode("", 4)) == [0, 0, 0, 0]


def test_the_style_folder_is_the_catalogue_and_its_art_is_complete():
    cat = mp.catalogue()
    kinds = {t["kind"] for t in cat["types"]}
    assert kinds == {"terrain", "road", "river", "boundary", "scenery", "effect", "feature"}
    assert all(len(t["colors"]) == 3 and len(t["roles"]) == 3 for t in cat["types"])
    assert {t["category"] for t in cat["types"]} <= {c["key"] for c in cat["categories"]}
    assert len({t["key"] for t in cat["types"]}) == len(cat["types"])
    for style in mp.STYLES:
        pack = mp.style_pack(style)
        # every type is drawn (its art), every sprite named exists, and each is an SVG with its anchor
        for t in pack["types"]:
            art = t["art"]
            if t["kind"] == "terrain":
                assert art.get("fluid") or art["patterns"], t["key"]
                # the ground shader's patterns (frontend/src/maps/painter/shader.ts, data.ts PATTERNS)
                assert {p["kind"] for p in art.get("patterns", [])} <= {"strokes", "stipple", "cracks", "flecks", "drifts", "sparkle", "puddles", "lava",
                                                                        "reeds", "fields", "tufts", "dunes", "cobbles", "tiles", "bricks", "ice"}, t["key"]
                assert len(art.get("patterns", [])) <= 2, t["key"]
            elif t["kind"] == "effect":
                # the sprite shader's particle shapes and motions (frontend/src/maps/painter/sprites.ts)
                assert art.get("particles") or art.get("layers"), t["key"]
                for p in art.get("particles", []):
                    assert p["shape"] in ("glow", "puff", "spark", "leaf", "bubble", "mote"), t["key"]
                    assert p.get("motion", "still") in ("still", "wander", "rise", "fall", "drift", "pulse"), t["key"]
                    assert 0 < p["density"] <= 40 and 0 < p["size"][0] <= p["size"][1] <= 1, t["key"]
            elif t["kind"] == "boundary":
                assert art["look"] in ("fence", "palisade", "stone", "brick", "castle", "hedge", "cliff", "barrier", "slope"), t["key"]
                assert 0 < art["height"] <= 0.6 and 0 < art["thickness"] <= 0.2, t["key"]
                assert (art["look"] == "slope") == (0 < art.get("run", 0) <= 0.6), t["key"]  # slopes reach out
            elif t["kind"] in ("road", "river"):
                assert art["look"] in ("dirt", "paved", "trail", "highway", "rail", "light", "river", "lava"), t["key"]
            elif t["kind"] == "scenery":
                assert art["layers"], t["key"]
            else:
                assert art["variants"] and art["height"] > 0, t["key"]
        missing = mp.sprites_used(pack) - set(pack["sprites"])
        assert not missing, missing
        for name, text in pack["sprites"].items():
            assert text.startswith("<svg") and "viewBox" in text and "data-anchor" in text, name
            assert not re.search(r"<(image|script|foreignObject)|href=", text), name  # self-contained, safe to draw
        assert pack["style"]["key"] == style and pack["version"]


def test_the_style_is_served_to_anyone_and_cached(client):
    res = client.get("/api/map-painter/storybook")
    assert res.status_code == 200 and "max-age" in res.headers["cache-control"]
    body = res.json()
    assert body["sprites"]["pine-1"].startswith("<svg")
    assert client.get("/api/map-painter/storybook", headers={"If-None-Match": res.headers["etag"]}).status_code == 304
    assert client.get("/api/map-painter/nope").status_code == 404
    assert client.get("/api/map-painter").json()["styles"][0] == {"key": "storybook", "name": "Storybook", "description": mp.style_pack("storybook")["style"]["description"]}


def test_one_style_for_now_older_ones_read_as_it():
    # plan 48: sketch renamed Storybook, diorama dropped (the styles mechanism stays)
    for old in ("sketch", "diorama", None, "storybook"):
        assert mp.normalize_settings({"style": old})["style"] == "storybook"
    water = mp.CATALOGUE["water.ocean"]
    assert water["roles"] == ["Water", "Deep", "Shoreline"]


def test_terrain_painting_shares_and_prunes_the_palette():
    paint = mp.default_paint()
    mp.paint_tiles(paint, SQUARE, "ground.sand", None, [[0, 0], [1, 0], [99, 0]])  # off the grid: ignored
    mp.paint_tiles(paint, SQUARE, "ground.sand", None, [[2, 0]])
    mp.paint_tiles(paint, SQUARE, "ground.sand", ["#112233"], [[3, 0]])  # other colours: another entry
    assert [e["colors"][0] for e in paint["palette"]] == ["#e8d49a", "#112233"]
    assert values(paint, "tiles")[:4] == [1, 1, 1, 2]
    mp.paint_tiles(paint, SQUARE, None, None, [[0, 0], [1, 0], [2, 0]])  # erased: the unused entry goes
    assert [e["colors"][0] for e in paint["palette"]] == ["#112233"] and values(paint, "tiles")[:4] == [0, 0, 0, 1]
    for bad in (("nope", None), ("road.dirt", None), ("trees.pine", None), ("ground.sand", ["red"])):
        try:
            mp.paint_tiles(paint, SQUARE, bad[0], bad[1], [[0, 0]])
        except mp.PaintError:
            continue
        raise AssertionError(bad)


def test_roads_join_tiles_both_ways_and_rivers_flow():
    paint = mp.default_paint()
    # Square: E, SE, S, SW, W, NW, N, NE; (0,0) → (1,1) → (2,1): SE then E
    mp.connect(paint, SQUARE, "road", "road.dirt", None, [[0, 0], [1, 1], [2, 1]])
    roads = values(paint, "roads")
    assert roads[0] == 1 << 1 and roads[7] == (1 << 5) | (1 << 0) and roads[8] == 1 << 4
    assert values(paint, "road_kinds")[:9] == [1, 0, 0, 0, 0, 0, 0, 1, 1]
    # A junction: another road through (1,1) going down
    mp.connect(paint, SQUARE, "road", "road.dirt", None, [[1, 1], [1, 2]])
    assert values(paint, "roads")[7] == (1 << 5) | (1 << 0) | (1 << 2)
    # Erasing a step parts the two tiles; erasing one tile alone clears it and its neighbours' arms to it
    mp.connect(paint, SQUARE, "road", None, None, [[1, 1], [2, 1]], erase=True)
    assert values(paint, "roads")[8] == 0 and values(paint, "road_kinds")[8] == 0
    mp.connect(paint, SQUARE, "road", None, None, [[1, 1]], erase=True)
    assert not any(values(paint, "roads")) and paint["palette"] == []
    # Rivers flow the way they're drawn
    mp.connect(paint, SQUARE, "river", "river.river", None, [[0, 3], [1, 3], [2, 3]])
    out = values(paint, "river_out")
    assert out[18] == 1 and out[19] == 1 and out[20] == 0
    # Hex (odd rows shifted right): E, SE, SW, W, NW, NE; (1,0) → (1,1) is SE from an even row
    hexes = mp.default_paint()
    mp.connect(hexes, HEX, "road", "road.paved", None, [[1, 0], [1, 1], [2, 2]])
    roads = values(hexes, "roads", HEX)
    assert roads[1] == 1 << 1  # SE
    assert roads[7] == (1 << 4) | (1 << 1)  # back NW to (1,0); SE from an odd row: (2,2)
    assert roads[14] == 1 << 4
    mp.connect(hexes, HEX, "road", "road.paved", None, [[0, 0], [3, 3]])  # not neighbours: nothing
    assert values(hexes, "roads", HEX)[0] == 0


def test_rivers_flow_a_b_or_as_the_rivers_they_join():
    paint = mp.default_paint()
    # b: toward the north or west, whichever way it's drawn
    mp.connect(paint, SQUARE, "river", "river.river", None, [[0, 0], [1, 0], [2, 0]], flow="b")
    assert values(paint, "river_out")[:3] == [0, 16, 16]  # (2,0) flows west into (1,0), (1,0) into (0,0)
    # painted over with a: toward the south or east
    mp.connect(paint, SQUARE, "river", "river.river", None, [[2, 0], [1, 0]], flow="a")
    assert values(paint, "river_out")[:3] == [0, 1 | 16, 0]
    # join: going on from (2,0), drawn either way, it flows on away from the river it leaves; alone, it's a
    joined = mp.default_paint()
    mp.connect(joined, SQUARE, "river", "river.river", None, [[1, 0], [2, 0]], flow="a")  # (1,0) → (2,0)
    mp.connect(joined, SQUARE, "river", "river.river", None, [[2, 2], [2, 1], [2, 0]])  # drawn up to it
    out = values(joined, "river_out")
    assert out[2] & (1 << 2) and out[8] & (1 << 2)  # (2,0) → (2,1) → (2,2): on downstream
    mp.connect(joined, SQUARE, "river", "river.river", None, [[5, 3], [4, 3]])
    assert values(joined, "river_out")[22] == 1 and values(joined, "river_out")[23] == 0  # alone: a (east)
    try:
        mp.connect(joined, SQUARE, "river", "river.river", None, [[0, 0], [1, 0]], flow="up")
    except mp.PaintError:
        pass
    else:
        raise AssertionError("an unknown flow")


def test_scenery_is_its_own_layer_over_the_terrain():
    paint = mp.default_paint()
    mp.paint_tiles(paint, SQUARE, "ground.grass", None, [[0, 0], [1, 0]])
    mp.paint_tiles(paint, SQUARE, "trees.pine", None, [[0, 0], [2, 0]], "scenery")
    mp.paint_tiles(paint, SQUARE, "settlement.castle", None, [[3, 0]], "scenery")
    assert values(paint, "tiles")[:4] == [1, 1, 0, 0] and values(paint, "scenery")[:4] == [2, 0, 2, 3]
    mp.paint_tiles(paint, SQUARE, None, None, [[0, 0], [2, 0]], "scenery")  # erasing scenery leaves the ground
    assert values(paint, "tiles")[:2] == [1, 1] and [e["type"] for e in paint["palette"]] == ["ground.grass", "settlement.castle"]
    for bad in (("ground.grass", "scenery"), ("trees.pine", "terrain"), ("trees.pine", "sky")):
        try:
            mp.paint_tiles(paint, SQUARE, bad[0], None, [[0, 0]], bad[1])
        except mp.PaintError:
            continue
        raise AssertionError(bad)


def test_features_have_a_size_and_a_look():
    paint = mp.default_paint()
    mill = mp.save_feature(paint, SQUARE, {"type": "feature.windmill", "tile": [2, 2]}, "ft1")
    assert mill["size"] == 1 and mill["variant"] == 0 and mill["name"] == "Windmill"
    moved = mp.save_feature(paint, SQUARE, {"id": "ft1", "tile": [3, 1], "size": 3, "variant": 7, "name": "Old mill"}, "x")
    assert (moved["tile"], moved["size"], moved["variant"], moved["name"]) == ([3, 1], 3, 0, "Old mill")
    for bad in ({"type": "trees.pine", "tile": [0, 0]}, {"type": "feature.mine", "tile": [9, 9]}, {"type": "feature.mine", "tile": [0, 0], "size": 9}):
        try:
            mp.save_feature(paint, SQUARE, bad, "ft9")
        except mp.PaintError:
            continue
        raise AssertionError(bad)
    mp.delete_feature(paint, "ft1")
    assert paint["features"] == []


def test_plan_47_paintings_are_read_into_the_layers():
    old = {"palette": [{"type": "trees.pine", "colors": ["#56744a", "#2c4230", "#a7b27c"]}, {"type": "ground.sand", "colors": ["#e8d49a", "#b8985a", "#f6eac4"]}],
           "tiles": mp.rle_encode(bytes([1, 1, 2, 0, 0, 0] + [0] * 18)), "roads": "", "road_kinds": "", "rivers": "", "river_kinds": "", "river_out": "",
           "objects": [{"id": "obj1", "type": "settlement.castle", "tile": [4, 2], "size": 2, "variant": 1, "colors": ["#b9b2a5", "#58627a", "#b23a3a"], "name": "Keep"},
                       {"id": "obj2", "type": "landmark.windmill", "tile": [0, 3], "size": 1, "variant": 1, "colors": ["#e2d3b4", "#8a6a4a", "#7a4a3a"], "name": "Mill", "hidden": True},
                       {"id": "obj3", "type": "landmark.ruins", "tile": [5, 0], "size": 1, "variant": 0, "colors": ["#b0a898", "#77705f", "#6d8a4a"], "name": "Ruins"}]}
    data = maps.normalize({"grid": {"cols": 6, "rows": 4}, "layers": [{"id": "layer1", "name": "Map", "paint": old}]})
    paint = data["layers"][0]["paint"]
    kinds = {i + 1: e["type"] for i, e in enumerate(paint["palette"])}
    tiles, scenery = values(paint, "tiles"), values(paint, "scenery")
    # the forest stands over a ground of its old ground colour; sand stays terrain
    assert [kinds.get(v) for v in scenery[:3]] == ["trees.pine", "trees.pine", None]
    assert [kinds.get(v) for v in tiles[:3]] == ["ground.grass", "ground.grass", "ground.sand"]
    grass = next(e for e in paint["palette"] if e["type"] == "ground.grass")
    assert grass["colors"][0] == "#a7b27c"
    # the castle covers its tile and its neighbours; the ruins their tile; the windmill is a feature (still hidden)
    assert kinds[scenery[2 * 6 + 4]] == "settlement.castle" and kinds[scenery[1 * 6 + 4]] == "settlement.castle"
    assert kinds[scenery[5]] == "settlement.ruins"
    assert paint["features"] == [{"id": "obj2", "type": "feature.windmill", "tile": [0, 3], "size": 1, "variant": 0,
                                  "colors": ["#e2d3b4", "#8a6a4a", "#7a4a3a"], "name": "Mill", "hidden": True}]
    assert "objects" not in paint and maps.normalize(data)["layers"][0]["paint"] == paint  # once


def test_resizing_and_new_grid_kinds():
    data = maps.normalize({"grid": {"cols": 4, "rows": 3}})
    paint = data["layers"][0]["paint"]
    mp.paint_tiles(paint, data["grid"], "water.lake", None, [[3, 2], [1, 1]])
    mp.connect(paint, data["grid"], "road", "road.dirt", None, [[0, 0], [1, 0]])
    mp.save_feature(paint, data["grid"], {"type": "feature.cave", "tile": [3, 2]}, "ft1")
    mp.paint_tiles(paint, data["grid"], "trees.dead", None, [[3, 0], [0, 2]], "scenery")
    maps.resize(data, 3, 5)
    grid = data["grid"]
    assert values(paint, "tiles", grid)[1 * 3 + 1] == 1 and sum(1 for v in values(paint, "tiles", grid) if v) == 1
    assert [i for i, v in enumerate(values(paint, "scenery", grid)) if v] == [6]
    assert paint["features"] == []  # its tile is gone
    assert values(paint, "roads", grid)[:2] == [1, 16]
    maps.set_grid(data, {"type": "hex"})  # directions change meaning: roads go, terrain stays
    assert paint["roads"] == "" and values(paint, "tiles", grid)[4] == 1


def test_players_get_the_painting_of_their_tiles_only(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    players = [groups["players"]]
    place = _location(api, saga_id, dm, "Barovia", shared=players)
    _command(api, saga_id, dm, place["id"], "grid.set", changes={"cols": 6, "rows": 4})
    data = _command(api, saga_id, dm, place["id"], "paint.tiles", type="ground.grass", tiles=[[c, r] for c in range(6) for r in range(4)])
    assert data["paint"]["palette"][0]["type"] == "ground.grass" and data["painter"] == {"style": "storybook", "kind": "world", "animated": False}
    _command(api, saga_id, dm, place["id"], "paint.scenery", type="trees.pine", tiles=[[0, 0], [5, 3]])
    _command(api, saga_id, dm, place["id"], "paint.features.save", feature={"type": "feature.tower", "tile": [5, 3], "name": "Ravenloft"})
    _command(api, saga_id, dm, place["id"], "paint.connect", channel="road", type="road.dirt", tiles=[[0, 0], [1, 0], [2, 0], [3, 0]])
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map"
    seen = api.ok("GET", url, ana)  # no fog: everything
    assert seen["paint"]["tiles"] and seen["paint"]["scenery"] and seen["paint"]["features"][0]["type"] == "feature.tower"
    assert "name" not in seen["paint"]["features"][0]
    # With fog: only the tiles they know and the ring around them
    _command(api, saga_id, dm, place["id"], "fog.set", enabled=True)
    _command(api, saga_id, dm, place["id"], "fog.paint", group_ids=players, state="2", tiles=[[0, 0]])
    seen = api.ok("GET", url, ana)["paint"]
    grid = {**SQUARE, "cols": 6, "rows": 4}
    painted = [i for i, v in enumerate(values(seen, "tiles", grid)) if v]
    assert painted == [0, 1, 6, 7] and seen["features"] == []  # (0,0) and its neighbours; the tower is far
    assert [i for i, v in enumerate(values(seen, "scenery", grid)) if v] == [0]
    assert [i for i, v in enumerate(values(seen, "roads", grid)) if v] == [0, 1]
    # A hidden feature: only the DM sees it
    _command(api, saga_id, dm, place["id"], "fog.paint", group_ids=players, state="2", tiles=[[5, 3]])
    tower = api.ok("GET", url, dm)["paint"]["features"][0]
    assert len(api.ok("GET", url, ana)["paint"]["features"]) == 1
    _command(api, saga_id, dm, place["id"], "paint.features.save", feature={"id": tower["id"], "hidden": True})
    assert api.ok("GET", url, ana)["paint"]["features"] == []
    # The DM sees it all; settings; bad ones refused
    assert len(api.ok("GET", url, dm)["paint"]["features"]) == 1
    data = _command(api, saga_id, dm, place["id"], "painter.set", changes={"style": "storybook", "animated": True})
    assert data["painter"] == {"style": "storybook", "kind": "world", "animated": True}
    for bad in ({"name": "painter.set", "args": {"changes": {"kind": "local"}}}, {"name": "paint.tiles", "args": {"type": "lava", "tiles": [[0, 0]]}},
                {"name": "paint.scenery", "args": {"type": "ground.grass", "tiles": [[0, 0]]}}):
        assert client.post(f"{url}/command", headers=dm, json=bad).status_code == 400


def test_the_dm_gets_the_map_as_the_players_see_it(api, client, root):
    saga_id, dm, _ana_id, ana, groups = _setup(api, root)
    place = _location(api, saga_id, dm, "Vallaki", shared=[groups["players"]])
    _command(api, saga_id, dm, place["id"], "grid.set", changes={"cols": 6, "rows": 4})
    _command(api, saga_id, dm, place["id"], "paint.tiles", type="ground.grass", tiles=[[c, r] for c in range(6) for r in range(4)])
    _command(api, saga_id, dm, place["id"], "paint.features.save", feature={"type": "feature.tower", "tile": [5, 3], "hidden": True})
    _command(api, saga_id, dm, place["id"], "fog.set", enabled=True)
    _command(api, saga_id, dm, place["id"], "fog.paint", group_ids=[groups["players"]], state="2", tiles=[[0, 0]])
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map/players"
    seen = api.ok("GET", url, dm)
    assert "images" not in seen and seen["fog"]["enabled"] and seen["fog"]["states"][0] == "2"
    assert seen["paint"]["features"] == []  # hidden: the DM's
    grid = {**SQUARE, "cols": 6, "rows": 4}
    assert [i for i, v in enumerate(values(seen["paint"], "tiles", grid)) if v] == [0, 1, 6, 7]  # their tiles and the ring
    assert client.get(url, headers=ana).status_code == 403  # the DM's only


def test_layers_seen_together_and_the_composed_picture(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    place = _location(api, saga_id, dm, "Tower", shared=[groups["players"]])
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map"
    _command(api, saga_id, dm, place["id"], "grid.set", changes={"cols": 4, "rows": 2, "size": 64})
    red = _map_picture(client, saga_id, dm, size=(64, 64))
    _command(api, saga_id, dm, place["id"], "images.set", images=[{"file_id": red["id"], "x": 0, "y": 0},
                                                                    {"file_id": red["id"], "x": 64, "y": 0, "hidden": True}])
    before = api.ok("GET", url, ana)
    picture = Image.open(io.BytesIO(client.get(before["image"]["url"]).content))
    assert picture.mode == "RGB" and picture.convert("RGB").getpixel((96, 32))[0] < 20  # the hidden picture isn't there
    # Painted: a new composed picture, transparent where no picture lies
    data = _command(api, saga_id, dm, place["id"], "paint.tiles", type="ground.sand", tiles=[[0, 1], [1, 1]])
    assert data["version"] > before["version"]
    after = api.ok("GET", url, ana)
    picture = Image.open(io.BytesIO(client.get(after["image"]["url"]).content)).convert("RGBA")
    assert picture.getpixel((32, 32))[3] == 255 and picture.getpixel((32, 32))[0] > 150 and picture.getpixel((96, 32))[3] == 0
    # More strokes keep the same picture
    again = _command(api, saga_id, dm, place["id"], "paint.tiles", type="ground.sand", tiles=[[2, 1]])
    assert again["version"] == data["version"]
    # A see-through layer on top: its painting wins where it painted, the one under shows elsewhere
    top = api.ok("POST", f"{url}/command", dm, json={"name": "layers.add", "args": {"name": "Upstairs"}})["layers"][-1]["id"]
    _command(api, saga_id, dm, place["id"], "layers.update", id=top, changes={"see_through": True})
    data = _command(api, saga_id, dm, place["id"], "paint.tiles", layer=top, type="water.lake", tiles=[[1, 1]])
    grid = {**SQUARE, "cols": 4, "rows": 2}
    merged = data["paint"]
    kinds = {i + 1: e["type"] for i, e in enumerate(merged["palette"])}
    assert [kinds.get(v) for v in values(merged, "tiles", grid)[4:7]] == ["ground.sand", "water.lake", "ground.sand"]


def kinds_of(paint):
    return {i + 1: e["type"] for i, e in enumerate(paint["palette"])}


def test_boundaries_are_on_the_edges_between_tiles():
    paint = mp.default_paint()
    # (0, 0)'s east edge, given from either side; its south edge; a diagonal and the map's own edge have none
    mp.paint_edges(paint, SQUARE, "wall.fence", None, [[0, 0, 0], [1, 0, 4], [0, 1, 6], [0, 0, 1], [5, 0, 0], [0, 0, 6]])
    assert values(paint, "bounds_0")[:2] == [1, 0] and values(paint, "bounds_1")[:2] == [1, 0]
    assert paint["palette"] == [{"type": "wall.fence", "colors": ["#a07a4c", "#5c4128", "#c9a878"]}]
    # one boundary per edge: painting another replaces it; erasing clears it (and its colours go)
    mp.paint_edges(paint, SQUARE, "wall.stone", None, [[1, 0, 4]])
    assert kinds_of(paint)[values(paint, "bounds_0")[0]] == "wall.stone" and kinds_of(paint)[values(paint, "bounds_1")[0]] == "wall.fence"
    mp.paint_edges(paint, SQUARE, None, None, [[0, 0, 0], [0, 0, 2]])
    assert not paint["bounds_0"] and not paint["bounds_1"] and paint["palette"] == []
    # cliffs face the viewer (the edge's first tile is the high side) until turned; painted again, they keep their side
    mp.paint_edges(paint, SQUARE, "cliff.low", None, [[2, 1, 2]])
    assert values(paint, "bound_sides")[8] == 0
    mp.turn_edges(paint, SQUARE, [[2, 2, 6], [2, 2, 6], [3, 3, 0]])
    assert values(paint, "bound_sides")[8] == 2  # its second own edge (south): the neighbour's side is high
    mp.paint_edges(paint, SQUARE, "cliff.low", None, [[2, 1, 2]])
    assert values(paint, "bound_sides")[8] == 2
    mp.paint_edges(paint, SQUARE, "cliff.high", None, [[2, 1, 2]])
    assert values(paint, "bound_sides")[8] == 0
    for bad in (("trees.pine", [[0, 0, 0]]), ("wall.fence", [[0, 0]]), ("wall.fence", [[0, 0, True]]), ("wall.fence", "x")):
        try:
            mp.paint_edges(paint, SQUARE, bad[0], None, bad[1])
        except mp.PaintError:
            continue
        raise AssertionError(bad)
    # hex grids: three own edges (E, SE, SW); the north-west edge of an odd row's tile is the tile above's south-east
    hexed = mp.default_paint()
    mp.paint_edges(hexed, HEX, "wall.stone", None, [[1, 1, 4], [1, 0, 2]])
    assert values(hexed, "bounds_1", HEX)[1] == 1 and values(hexed, "bounds_2", HEX)[1] == 1
    # a new kind of grid: they go with the roads
    mp.clear_connections(hexed, HEX["cols"] * HEX["rows"])
    assert not any(hexed[c] for c in mp.BOUND_CHANNELS) and hexed["palette"] == []


def test_painted_areas_of_plan_49_and_walls_of_plan_48_become_edges():
    # plan 49: a cliff painted on (1, 0) and (2, 0): their outer edges, the painted side high
    raw = {"palette": [{"type": "cliff.low", "colors": ["#a89c88", "#5e554a", "#9aa868"]}],
           "bounds": mp.rle_encode(bytes([0, 1, 1] + [0] * 21)), "features": []}
    data = maps.normalize({"grid": {"cols": 6, "rows": 4}, "layers": [{"id": "layer1", "name": "Map", "paint": raw}]})
    paint = data["layers"][0]["paint"]
    assert "bounds" not in paint
    assert values(paint, "bounds_0")[:4] == [1, 0, 1, 0]  # west of (1, 0) (kept on (0, 0)), east of (2, 0)
    assert values(paint, "bounds_1")[:4] == [0, 1, 1, 0]  # their south edges
    assert values(paint, "bound_sides")[:4] == [1, 0, 0, 0]  # (0, 0)'s east edge: its neighbour (painted) is high
    assert maps.normalize(data)["layers"][0]["paint"] == paint  # once
    # plan 48: a castle's walls were its own: its tiles' outer edges get a castle wall
    old = {"palette": [{"type": "settlement.castle", "colors": ["#c9c1b2", "#55607a", "#b23a3a"]}],
           "tiles": "", "scenery": mp.rle_encode(bytes([1, 1] + [0] * 22)), "features": []}
    data = maps.normalize({"grid": {"cols": 6, "rows": 4}, "layers": [{"id": "layer1", "name": "Map", "paint": old}]})
    paint = data["layers"][0]["paint"]
    kinds = kinds_of(paint)
    assert [kinds.get(v) for v in values(paint, "bounds_0")[:3]] == [None, "wall.castle", None]
    assert [kinds.get(v) for v in values(paint, "bounds_1")[:3]] == ["wall.castle", "wall.castle", None]
    assert maps.normalize(data)["layers"][0]["paint"] == paint


def test_boundaries_seen_together_and_by_players():
    lower, upper = mp.default_paint(), mp.default_paint()
    mp.paint_edges(lower, SQUARE, "cliff.low", None, [[0, 0, 0], [1, 0, 0]])
    mp.turn_edges(lower, SQUARE, [[0, 0, 0], [1, 0, 0]])
    mp.paint_edges(upper, SQUARE, "wall.stone", None, [[1, 0, 0]])
    merged = mp.merge([lower, upper], SQUARE["cols"] * SQUARE["rows"])
    kinds = kinds_of(merged)
    assert [kinds.get(v) for v in values(merged, "bounds_0")[:3]] == ["cliff.low", "wall.stone", None]
    assert values(merged, "bound_sides")[:2] == [1, 0]  # the wall's side, not the cliff's under it
    # a player sees an edge's boundary when they may see either of its tiles
    seen = mp.render(lower, SQUARE, {1})
    assert values(seen, "bounds_0")[:3] == [1, 1, 0] and values(seen, "bound_sides")[:3] == [1, 1, 0]
    seen = mp.render(lower, SQUARE, {0})
    assert values(seen, "bounds_0")[:3] == [1, 0, 0] and values(seen, "bound_sides")[:3] == [1, 0, 0]


def test_boundary_commands(api, client, root):
    saga_id, dm, _ana_id, _ana, _groups = _setup(api, root)
    place = _location(api, saga_id, dm, "Krezk")
    _command(api, saga_id, dm, place["id"], "grid.set", changes={"cols": 6, "rows": 4})
    data = _command(api, saga_id, dm, place["id"], "paint.boundaries", type="cliff.medium", edges=[[0, 0, 2], [1, 0, 2]])
    assert values(data["paint"], "bounds_1")[:3] == [1, 1, 0]
    data = _command(api, saga_id, dm, place["id"], "paint.boundaries.turn", edges=[[1, 1, 6]])
    assert values(data["paint"], "bound_sides")[:3] == [0, 2, 0]
    data = _command(api, saga_id, dm, place["id"], "paint.boundaries", type=None, edges=[[0, 0, 2]])
    assert values(data["paint"], "bounds_1")[:3] == [0, 1, 0]
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map/command"
    for bad in ({"type": "trees.pine", "edges": [[0, 0, 2]]}, {"type": "wall.stone", "edges": [[0, 0]]}, {"type": "wall.stone", "tiles": [[0, 0]], "edges": "all"}):
        assert client.post(url, headers=dm, json={"name": "paint.boundaries", "args": bad}).status_code == 400


def test_effects_are_painted_on_tiles_and_merged_like_scenery():
    paint = mp.default_paint()
    mp.paint_tiles(paint, SQUARE, "lights.fireflies", None, [[0, 0], [1, 0]], "effects")
    assert values(paint, "effects")[:3] == [1, 1, 0] and paint["palette"][0]["type"] == "lights.fireflies"
    try:
        mp.paint_tiles(paint, SQUARE, "trees.pine", None, [[0, 0]], "effects")
    except mp.PaintError:
        pass
    else:
        raise AssertionError("scenery painted as an effect")
    upper = mp.default_paint()
    mp.paint_tiles(upper, SQUARE, "mists.ground", None, [[1, 0]], "effects")
    merged = mp.merge([paint, upper], SQUARE["cols"] * SQUARE["rows"])
    kinds = {i + 1: e["type"] for i, e in enumerate(merged["palette"])}
    assert [kinds.get(v) for v in values(merged, "effects")[:3]] == ["lights.fireflies", "mists.ground", None]
