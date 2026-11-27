"""Plan 60: the Panels Set: rectangles and lines the DM draws in Build; players just see them."""
from tests.test_stages import _command


def _panels(api, root):
    saga_id, dm = api.saga(root)
    _, ana = api.member(saga_id, dm, "ana")
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Board"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "panels"})
    return saga_id, dm, ana, stage["id"], stage["sets"][0]["id"]


def test_shapes_are_drawn_styled_ordered_and_deleted(api, client, root):
    saga_id, dm, ana, stage_id, set_id = _panels(api, root)
    shapes = lambda stage: stage["sets"][0]["content"]["shapes"]  # noqa: E731
    stage = _command(api, saga_id, dm, set_id, "shape.save", shape={"kind": "rect", "x": 10, "y": 20, "w": 300, "h": 150})
    rect = shapes(stage)[0]
    assert (rect["id"], rect["kind"], rect["w"], rect["fill"]["style"], rect["border"]["width"]) == (1, "rect", 300, "flat", 1)
    stage = _command(api, saga_id, dm, set_id, "shape.save", shape={"id": 1, "radius": 24, "fill": {"style": "linear", "color": "#AA0000",
                     "opacity": 0.4, "effect": "blur", "effect_size": 12}, "border": {"width": 0}})
    rect = shapes(stage)[0]
    assert (rect["radius"], rect["fill"]["color"], rect["fill"]["effect"], rect["border"]["width"], rect["x"]) == (24, "#aa0000", "blur", 0, 10)
    stage = _command(api, saga_id, dm, set_id, "shape.save", shape={"kind": "line", "points": [[0, 0], [100, 0], [100, 80]], "style": "dashed", "radius": 10})
    assert [s["kind"] for s in shapes(stage)] == ["rect", "line"]
    stage = _command(api, saga_id, dm, set_id, "shape.order", id=2, by=-1)
    assert [s["id"] for s in shapes(stage)] == [2, 1]
    url = f"/api/sagas/{saga_id}/sets/{set_id}/command"
    for bad in ({"kind": "circle"}, {"kind": "rect", "fill": {"effect": "sparkle"}}, {"kind": "rect", "border": {"color": "gold"}},
                {"kind": "line", "points": [[0, 0]]}, {"kind": "line", "style": "wavy"}, {"id": 99, "x": 1}):
        assert client.post(url, headers=dm, json={"name": "shape.save", "args": {"shape": bad}}).status_code == 400, bad
    assert client.post(url, headers=ana, json={"name": "shape.save", "args": {"shape": {"kind": "rect"}}}).status_code in (403, 404)
    stage = _command(api, saga_id, dm, set_id, "shape.delete", id=1)
    assert [s["id"] for s in shapes(stage)] == [2]
    # Players see them on the live Stage
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    live = api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]
    assert live["sets"][0]["content"]["shapes"][0]["kind"] == "line"
