"""The map painter (plan 47): the catalogue, the RLE channels, painting terrain, roads and rivers, landmarks, layers
seen together, the grid changing, and what players get."""
import io
import random

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


def test_catalogue_covers_every_kind_with_three_colours():
    cat = mp.catalogue()
    kinds = {t["kind"] for t in cat["types"]}
    assert kinds == {"terrain", "road", "river", "object"}
    assert all(len(t["colors"]) == 3 and len(t["roles"]) == 3 for t in cat["types"])
    assert len({t["material"] for t in cat["types"]}) == len(cat["types"])  # one shader material each
    assert {t["category"] for t in cat["types"]} <= {c["key"] for c in cat["categories"]}


def test_one_style_for_now_older_ones_read_as_it():
    # plan 48: sketch renamed Storybook, diorama dropped (the styles mechanism stays)
    for old in ("sketch", "diorama", None, "storybook"):
        assert mp.normalize_settings({"style": old})["style"] == "storybook"
    water = mp.CATALOGUE["water.ocean"]
    assert water["roles"] == ["Water", "Deep", "Shoreline"]


def test_terrain_painting_shares_and_prunes_the_palette():
    paint = mp.default_paint()
    mp.paint_tiles(paint, SQUARE, "trees.pine", None, [[0, 0], [1, 0], [99, 0]])  # off the grid: ignored
    mp.paint_tiles(paint, SQUARE, "trees.pine", None, [[2, 0]])
    mp.paint_tiles(paint, SQUARE, "trees.pine", ["#112233"], [[3, 0]])  # other colours: another entry
    assert [e["colors"][0] for e in paint["palette"]] == ["#56744a", "#112233"]
    assert values(paint, "tiles")[:4] == [1, 1, 1, 2]
    mp.paint_tiles(paint, SQUARE, None, None, [[0, 0], [1, 0], [2, 0]])  # erased: the unused entry goes
    assert [e["colors"][0] for e in paint["palette"]] == ["#112233"] and values(paint, "tiles")[:4] == [0, 0, 0, 1]
    for bad in (("nope", None), ("road.dirt", None), ("trees.pine", ["red"])):
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


def test_landmarks_have_a_size_and_a_look():
    paint = mp.default_paint()
    castle = mp.save_object(paint, SQUARE, {"type": "settlement.castle", "tile": [2, 2]}, "obj1")
    assert castle["size"] == 2 and 0 <= castle["variant"] < 3 and castle["name"] == "Castle"
    moved = mp.save_object(paint, SQUARE, {"id": "obj1", "tile": [3, 1], "size": 3, "variant": 7, "name": "Ravenloft"}, "x")
    assert (moved["tile"], moved["size"], moved["variant"], moved["name"]) == ([3, 1], 3, 1, "Ravenloft")
    for bad in ({"type": "trees.pine", "tile": [0, 0]}, {"type": "landmark.mine", "tile": [9, 9]}, {"type": "landmark.mine", "tile": [0, 0], "size": 9}):
        try:
            mp.save_object(paint, SQUARE, bad, "obj9")
        except mp.PaintError:
            continue
        raise AssertionError(bad)
    mp.delete_object(paint, "obj1")
    assert paint["objects"] == []


def test_resizing_and_new_grid_kinds():
    data = maps.normalize({"grid": {"cols": 4, "rows": 3}})
    paint = data["layers"][0]["paint"]
    mp.paint_tiles(paint, data["grid"], "water.lake", None, [[3, 2], [1, 1]])
    mp.connect(paint, data["grid"], "road", "road.dirt", None, [[0, 0], [1, 0]])
    mp.save_object(paint, data["grid"], {"type": "landmark.cave", "tile": [3, 2]}, "obj1")
    maps.resize(data, 3, 5)
    grid = data["grid"]
    assert values(paint, "tiles", grid)[1 * 3 + 1] == 1 and sum(1 for v in values(paint, "tiles", grid) if v) == 1
    assert paint["objects"] == []  # its tile is gone
    assert values(paint, "roads", grid)[:2] == [1, 16]
    maps.set_grid(data, {"type": "hex"})  # directions change meaning: roads go, terrain stays
    assert paint["roads"] == "" and values(paint, "tiles", grid)[4] == 1


def test_players_get_the_painting_of_their_tiles_only(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    players = [groups["players"]]
    place = _location(api, saga_id, dm, "Barovia", shared=players)
    _command(api, saga_id, dm, place["id"], "grid.set", changes={"cols": 6, "rows": 4})
    data = _command(api, saga_id, dm, place["id"], "paint.tiles", type="trees.pine", tiles=[[c, r] for c in range(6) for r in range(4)])
    assert data["paint"]["palette"][0]["material"] == 20 and data["painter"] == {"style": "storybook", "kind": "world", "animated": False}
    _command(api, saga_id, dm, place["id"], "paint.objects.save", object={"type": "settlement.castle", "tile": [5, 3], "name": "Ravenloft"})
    _command(api, saga_id, dm, place["id"], "paint.connect", channel="road", type="road.dirt", tiles=[[0, 0], [1, 0], [2, 0], [3, 0]])
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map"
    seen = api.ok("GET", url, ana)  # no fog: everything
    assert seen["paint"]["tiles"] and seen["paint"]["objects"][0]["material"] == 100 and "name" not in seen["paint"]["objects"][0]
    # With fog: only the tiles they know and the ring around them
    _command(api, saga_id, dm, place["id"], "fog.set", enabled=True)
    _command(api, saga_id, dm, place["id"], "fog.paint", group_ids=players, state="2", tiles=[[0, 0]])
    seen = api.ok("GET", url, ana)["paint"]
    grid = {**SQUARE, "cols": 6, "rows": 4}
    painted = [i for i, v in enumerate(values(seen, "tiles", grid)) if v]
    assert painted == [0, 1, 6, 7] and seen["objects"] == []  # (0,0) and its neighbours; the castle is far
    assert [i for i, v in enumerate(values(seen, "roads", grid)) if v] == [0, 1]
    # A hidden landmark: only the DM sees it
    _command(api, saga_id, dm, place["id"], "fog.paint", group_ids=players, state="2", tiles=[[5, 3]])
    castle = api.ok("GET", url, dm)["paint"]["objects"][0]
    assert len(api.ok("GET", url, ana)["paint"]["objects"]) == 1
    _command(api, saga_id, dm, place["id"], "paint.objects.save", object={"id": castle["id"], "hidden": True})
    assert api.ok("GET", url, ana)["paint"]["objects"] == []
    # The DM sees it all; settings; bad ones refused
    assert len(api.ok("GET", url, dm)["paint"]["objects"]) == 1
    data = _command(api, saga_id, dm, place["id"], "painter.set", changes={"style": "storybook", "animated": True})
    assert data["painter"] == {"style": "storybook", "kind": "world", "animated": True}
    for bad in ({"name": "painter.set", "args": {"changes": {"kind": "local"}}}, {"name": "paint.tiles", "args": {"type": "lava", "tiles": [[0, 0]]}}):
        assert client.post(f"{url}/command", headers=dm, json=bad).status_code == 400


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
