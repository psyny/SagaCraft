"""EFX: environments (the DM's), checked against the effects catalog; a Stage's environment, shown by its EFX Sets
(far, near, fore) and switched live by EFX Controls; pictures as signed URLs; new EFX Sets placed by depth."""


def _setup(api, root):
    saga_id, dm = api.saga(root)
    _, ana = api.member(saga_id, dm, "ana")
    return saga_id, dm, ana


def test_environments(api, client, root):
    saga_id, dm, ana = _setup(api, root)
    url = f"/api/sagas/{saga_id}/environments"
    catalog = api.ok("GET", f"/api/sagas/{saga_id}/efx/catalog", dm)
    assert catalog["layers"]["fore"] == ["weather", "fog", "abstract", "vignette"] and catalog["examples"]
    assert catalog["layers"]["near"] == ["landscape", "fog", "abstract", "image"]
    assert client.get(f"/api/sagas/{saga_id}/efx/catalog", headers=ana).status_code == 403
    env = api.ok("POST", url, dm, json={})
    assert env["name"] == "New environment" and env["fore"] == {"effects": []}
    rain = {"kind": "weather", "params": {"kind": "rain", "wind": 500}, "intensity": [70, 20], "vary": 30}
    env = api.ok("PATCH", f"{url}/{env['id']}", dm, json={"name": " Rainy  road ", "fore": {"effects": [rain]}})
    effect = env["fore"]["effects"][0]
    assert env["name"] == "Rainy road"
    assert effect["params"]["wind"] == 100 and effect["params"]["size"] == 100  # clamped; defaults filled in
    assert effect["intensity"] == [20, 70] and effect["vary"] == 30 and effect["id"]
    for bad in ({"fore": {"effects": [{"kind": "sky"}]}},  # not a foreground effect
                {"far": {"effects": [{"kind": "sky", "params": {"time": "noon"}}]}},
                {"far": {"effects": [{"kind": "gradient", "params": {"top": "red"}}]}},
                {"near": {"effects": [{"kind": "landscape", "params": {"trees": True}}]}},
                {"fore": {"effects": [rain] * 5}}, {"fore": {"effects": [{**rain, "vary": 9999}]}},
                {"fore": {"effects": [{"kind": "weather", "params": {"kind": "mist"}}]}},  # mist became the Fog effect
                {"far": {"effects": [{"kind": "fog"}]}},
                {"far": {"effects": [{"kind": "image", "params": {"file": 999999}}]}}):  # not this Saga's upload
        assert client.patch(f"{url}/{env['id']}", headers=dm, json=bad).status_code == 400, bad
    assert client.get(url, headers=ana).status_code == 403
    example = api.ok("POST", url, dm, json={"example": "stormy_coast"})
    assert example["name"] == "Stormy coast" and example["fore"]["effects"][0]["params"]["kind"] == "storm"
    copy = api.ok("POST", url, dm, json={"copy_of": env["id"]})
    assert copy["name"] == "Rainy road (copy)" and copy["fore"]["effects"][0]["params"]["kind"] == "rain"
    assert [e["name"] for e in api.ok("GET", url, dm)] == ["Rainy road", "Rainy road (copy)", "Stormy coast"]


def test_stage_environment_and_efx_sets(api, client, root):
    saga_id, dm, ana = _setup(api, root)
    env = api.ok("POST", f"/api/sagas/{saga_id}/environments", dm, json={"example": "ember_cave"})
    other = api.ok("POST", f"/api/sagas/{saga_id}/environments", dm, json={"example": "deep_space"})
    sid = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Cave"})["id"]
    add = lambda t: api.ok("POST", f"/api/sagas/{saga_id}/stages/{sid}/sets", dm, json={"type": t})  # noqa: E731
    add("actors_scene")
    add("efx_fore")
    add("efx_far")
    stage = add("efx_near")
    stage = add("efx_controls")
    # By depth: far, near at the back; the scene; fore, then the controls on top
    assert [s["type"] for s in stage["sets"]] == ["efx_far", "efx_near", "actors_scene", "efx_fore", "efx_controls"]
    far = stage["sets"][0]
    assert far["transparent"] and far["screen"]["width"] == 100 and far["width"] >= 900
    controls = stage["sets"][-1]
    assert controls["hidden"]  # the DM's
    assert far["content"] == {"layer": "far", "effects": [], "environment": None}
    stage = api.ok("PATCH", f"/api/sagas/{saga_id}/stages/{sid}", dm, json={"environment_id": env["id"]})
    assert stage["environment_id"] == env["id"]
    assert stage["sets"][0]["content"]["effects"][0]["kind"] == "gradient"
    assert stage["sets"][0]["content"]["environment"]["name"] == "Ember cave"
    # Players: the layers, not the environment's name nor the controls
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": sid})
    seen = api.ok("GET", f"/api/sagas/{saga_id}/live", ana)["stage"]
    assert [s["type"] for s in seen["sets"]] == ["efx_far", "efx_near", "actors_scene", "efx_fore"]
    assert "environment" not in seen["sets"][0]["content"] and seen["environment_id"] is None
    assert seen["sets"][3]["content"]["effects"][0]["params"]["kind"] == "embers"
    # Switching live from the controls
    command = f"/api/sagas/{saga_id}/sets/{controls['id']}/command"
    stage = api.ok("POST", command, dm, json={"name": "environment.show", "args": {"environment_id": other["id"]}})
    assert stage["sets"][0]["content"]["effects"][0]["kind"] == "space"
    assert stage["sets"][-1]["content"]["current"] == other["id"]
    assert [e["name"] for e in stage["sets"][-1]["content"]["environments"]] == ["Deep space", "Ember cave"]
    assert client.post(command, headers=dm, json={"name": "environment.show", "args": {"environment_id": 99999}}).status_code == 400
    assert client.patch(f"/api/sagas/{saga_id}/stages/{sid}", headers=dm, json={"environment_id": 99999}).status_code == 404
    # Editing it shows at once; deleting it leaves the Stage without one
    api.ok("PATCH", f"/api/sagas/{saga_id}/environments/{other['id']}", dm, json={"far": {"effects": []}})
    assert api.ok("GET", f"/api/sagas/{saga_id}/stages/{sid}", dm)["sets"][0]["content"]["effects"] == []
    copy = api.ok("POST", f"/api/sagas/{saga_id}/stages/{sid}/duplicate", dm)
    assert copy["environment_id"] == other["id"]
    assert client.delete(f"/api/sagas/{saga_id}/environments/{other['id']}", headers=dm).status_code == 204
    assert api.ok("GET", f"/api/sagas/{saga_id}/stages/{sid}", dm)["environment_id"] is None
    # Unset stays as it is when the body leaves it out
    stage = api.ok("PATCH", f"/api/sagas/{saga_id}/stages/{sid}", dm, json={"environment_id": env["id"]})
    assert api.ok("PATCH", f"/api/sagas/{saga_id}/stages/{sid}", dm, json={"name": "Cave 2"})["environment_id"] == env["id"]


def test_efx_pictures(api, client, root):
    import io
    from PIL import Image

    saga_id, dm, _ = _setup(api, root)
    buf = io.BytesIO()
    Image.new("RGBA", (200, 100), (10, 20, 30, 0)).save(buf, "PNG")
    up = client.post(f"/api/sagas/{saga_id}/files", headers=dm, data={"category": "efx"},
                     files={"file": ("hills.png", buf.getvalue(), "image/png")})
    assert up.status_code == 200, up.text
    file_id = up.json()["id"]
    env = api.ok("POST", f"/api/sagas/{saga_id}/environments", dm, json={"near": {"effects": [
        {"kind": "image", "params": {"file": file_id, "fit": "contain", "align": "bottom"}}]}})
    params = env["near"]["effects"][0]["params"]
    assert params["file"] == file_id and params["file_url"].startswith(f"/api/files/{file_id}")
