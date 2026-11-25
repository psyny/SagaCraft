"""A map's ambience (plan 48): its hour (the light on the painting and pictures) and its weather (one of the Saga's map
weathers: EFX environments of kind "weather", starting as presets), set from the editor or a Stage, seen by players."""
from domain import maps
from tests.test_locations import _command, _location, _setup


def test_the_hour_is_kept_set_and_seen_by_players(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    place = _location(api, saga_id, dm, "Barovia", shared=[groups["players"]])
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map"
    before = api.ok("GET", url, dm)
    assert before["ambience"] == {"hour": 12.0, "weather": None}
    data = _command(api, saga_id, dm, place["id"], "ambience.set", changes={"hour": 21.5})
    assert data["ambience"]["hour"] == 21.5 and data["version"] == before["version"]  # players' picture stays cached
    assert api.ok("GET", url, ana)["ambience"]["hour"] == 21.5
    assert _command(api, saga_id, dm, place["id"], "ambience.set", changes={"hour": 24})["ambience"]["hour"] == 0.0
    for bad in ({"hour": 25}, {"hour": "noon"}, {"wind": 3}, {"weather": "rain"}):
        assert client.post(f"{url}/command", headers=dm, json={"name": "ambience.set", "args": {"changes": bad}}).status_code == 400
    # players don't set it
    assert client.post(f"{url}/command", headers=ana, json={"name": "ambience.set", "args": {"changes": {"hour": 3}}}).status_code in (403, 404)
    assert maps.normalize({"ambience": {"hour": "x", "weather": True}})["ambience"] == {"hour": 12.0, "weather": None}
