"""A map's ambience (plan 48): its hour (the light on the painting and pictures) and its weather (one of the Saga's map
weathers: EFX environments of kind "weather", starting as presets), set from the editor or a Stage, seen by players."""
from domain import efx, maps
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


def test_map_weathers_start_as_presets_and_are_drawn_over_the_map(api, client, root):
    saga_id, dm, ana_id, ana, groups = _setup(api, root)
    base = f"/api/sagas/{saga_id}/environments"
    weathers = api.ok("GET", f"{base}?kind=weather", dm)
    assert {w["name"] for w in weathers} == {p["name"] for p in efx.weather_presets().values()}
    assert all(w["kind"] == "weather" and w["fore"]["effects"] for w in weathers)
    assert api.ok("GET", base, dm) == []  # the Stages' environments are another list
    # Once: deleting them all leaves none (the Saga's settings changing doesn't bring them back)
    for w in weathers:
        assert client.delete(f"{base}/{w['id']}", headers=dm).status_code == 204
    api.ok("PATCH", f"/api/sagas/{saga_id}/settings", dm, json={"action_dice": False})
    assert api.ok("GET", f"{base}?kind=weather", dm) == []
    rain = api.ok("POST", base, dm, json={"kind": "weather", "example": "light_rain"})
    assert rain["kind"] == "weather" and rain["name"] == "Light rain"
    stage_env = api.ok("POST", base, dm, json={"example": "starry_night"})
    # A map's weather: one of the Saga's map weathers, its effects for everyone
    place = _location(api, saga_id, dm, "Moor", shared=[groups["players"]])
    url = f"/api/sagas/{saga_id}/locations/{place['id']}/map"
    data = _command(api, saga_id, dm, place["id"], "ambience.set", changes={"weather": rain["id"]})
    assert data["ambience"]["weather"]["id"] == rain["id"]
    seen = api.ok("GET", url, ana)["ambience"]["weather"]
    assert seen["name"] == "Light rain" and seen["fore"]["effects"][0]["kind"] == "weather"
    assert client.post(f"{url}/command", headers=dm, json={"name": "ambience.set", "args": {"changes": {"weather": stage_env["id"]}}}).status_code == 400
    # A Stage can't show a map weather as its environment
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Night"})
    assert client.patch(f"/api/sagas/{saga_id}/stages/{stage['id']}", headers=dm, json={"environment_id": rain["id"]}).status_code == 400
    # Deleted: the map has none
    assert client.delete(f"{base}/{rain['id']}", headers=dm).status_code == 204
    assert api.ok("GET", url, ana)["ambience"]["weather"] is None
