"""Plan 59: a map grid's style (solid, dots, crosshairs) and glow."""
from tests.test_locations import _command, _location


def test_grid_style_and_glow(api, client, root):
    saga_id, dm = api.saga(root)
    town = _location(api, saga_id, dm, "Town")
    grid = api.ok("GET", f"/api/sagas/{saga_id}/locations/{town['id']}/map", dm)["grid"]
    assert (grid["style"], grid["glow"], grid["glow_color"], grid["glow_opacity"]) == ("solid", 0, "#6cc9e0", 0.6)  # older maps too
    grid = _command(api, saga_id, dm, town["id"], "grid.set", changes={"style": "crosshair", "glow": 6, "glow_color": "#FF00AA", "glow_opacity": 0.8})["grid"]
    assert (grid["style"], grid["glow"], grid["glow_color"], grid["glow_opacity"]) == ("crosshair", 6, "#ff00aa", 0.8)
    url = f"/api/sagas/{saga_id}/locations/{town['id']}/map/command"
    for bad in ({"style": "wavy"}, {"glow": "far"}, {"glow_color": "pink"}):
        assert client.post(url, headers=dm, json={"name": "grid.set", "args": {"changes": bad}}).status_code == 400, bad
    # Numbers out of range are kept in it (as the opacity and the line width)
    grid = _command(api, saga_id, dm, town["id"], "grid.set", changes={"glow": 99, "glow_opacity": 2})["grid"]
    assert (grid["glow"], grid["glow_opacity"]) == (24, 1)
