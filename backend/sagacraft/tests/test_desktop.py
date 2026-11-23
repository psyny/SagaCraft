"""Plan 22: the Desktop Set (characters, items, documents, pictures) and the Stage core's temporary files."""
from tests.test_stages import _live
from tests.test_uploads import picture, upload


def _setup(api, root):
    saga_id, dm = api.saga(root)
    ana_id, ana = api.member(saga_id, dm, "ana")
    groups = {g["key"]: g["id"] for g in api.ok("GET", f"/api/sagas/{saga_id}", dm)["groups"] if g["key"]}
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages", dm, json={"name": "Show and tell"})
    stage = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage['id']}/sets", dm, json={"type": "desktop"})
    return saga_id, dm, ana, groups, stage["id"], stage["sets"][0]["id"]


def _desk(api, saga_id, dm, stage_id):
    return api.ok("GET", f"/api/sagas/{saga_id}/stages/{stage_id}", dm)["sets"][0]["content"]


def test_pieces_of_each_kind(api, client, root):
    saga_id, dm, ana, g, stage_id, set_id = _setup(api, root)
    url = f"/api/sagas/{saga_id}/resources"
    spy = api.ok("POST", url, dm, json={"kind": "character", "type": "npc", "attributes": {"name": "The spy"},
                                        "presentation": {"alias": "Hooded figure"}})
    sword = api.ok("POST", url, dm, json={"kind": "item", "type": "weapon", "attributes": {"name": "Sword", "rarity": "Rare"}})
    letter = api.ok("POST", url, dm, json={"kind": "document", "type": "document", "attributes": {"name": "Letter", "pages": [
        {"kind": "text", "title": "One", "text": "Dear cousin"}, {"kind": "text", "title": "Two", "text": "Burn this"}]}})
    api.ok("POST", f"/api/sagas/{saga_id}/sets/{set_id}/actors", dm, json={"resource_ids": [spy["id"], sword["id"], letter["id"]]})
    command = f"/api/sagas/{saga_id}/sets/{set_id}/command"
    pic = upload(client, saga_id, dm, picture(300, 150), category="desk").json()
    api.ok("POST", command, dm, json={"name": "image.add", "args": {"file_id": pic["id"], "caption": "The seal"}})
    desk = _desk(api, saga_id, dm, stage_id)
    pieces = {p["kind"]: p for p in desk["pieces"]}
    assert [p["kind"] for p in desk["pieces"]] == ["character", "item", "document", "image"] and desk["layout"] == "auto"
    assert pieces["character"]["mode"] == "full" and pieces["character"]["card"]["name"] == "The spy"
    assert pieces["item"]["tier"] == {"key": "rarity", "label": "Rare", "name": "Rarity", "index": 2, "of": 5} and pieces["item"]["sheet"]["name"] == "Sword"
    assert (pieces["document"]["count"], pieces["document"]["current"]["title"]) == (2, "One")
    assert pieces["image"]["ratio"] == 2 and pieces["image"]["caption"] == "The seal"
    assert desk["templates"]["character"] and "item" in desk["templates"]
    # Display: a sheet, another template; turn the page
    template = desk["templates"]["character"][0]["id"]
    char_id, doc_id = pieces["character"]["id"], pieces["document"]["id"]
    api.ok("POST", command, dm, json={"name": "piece.set", "args": {"actor_id": char_id, "mode": "informative", "template_id": template}})
    api.ok("POST", command, dm, json={"name": "piece.set", "args": {"actor_id": doc_id, "page": 1}})
    pieces = {p["kind"]: p for p in _desk(api, saga_id, dm, stage_id)["pieces"]}
    assert pieces["character"]["sheet"]["template"]["id"] == template and pieces["document"]["current"]["title"] == "Two"
    # Players: the spy shows (the DM's reveal) under its alias; a hidden piece doesn't come
    api.ok("POST", command, dm, json={"name": "piece.set", "args": {"actor_id": pieces["image"]["id"], "shown": False}})
    api.ok("PUT", f"/api/sagas/{saga_id}/live", dm, json={"stage_id": stage_id})
    theirs = _live(api, saga_id, ana)["sets"][0]["content"]
    assert [p["kind"] for p in theirs["pieces"]] == ["character", "item", "document"]
    assert theirs["pieces"][0]["sheet"]["name"] == "Hooded figure" and "templates" not in theirs and "shown" not in theirs["pieces"][0]
    # Free placement: all at once when going Free, then one moved comes to the front
    api.ok("POST", command, dm, json={"name": "pieces.place", "args": {"layout": "free", "positions": {
        str(char_id): {"x": 0.1, "y": 0.1, "w": 0.3}, str(doc_id): {"x": 0.5, "y": 0.2, "w": 0.4}}}})
    api.ok("POST", command, dm, json={"name": "pieces.place", "args": {"positions": {str(char_id): {"rot": 15}}}})
    desk = _desk(api, saga_id, dm, stage_id)
    placed = {p["id"]: p["position"] for p in desk["pieces"]}
    assert desk["layout"] == "free" and placed[char_id]["rot"] == 15 and placed[char_id]["x"] == 0.1
    assert placed[char_id]["z"] > placed[doc_id]["z"]
    # Refused
    for bad in ({"name": "piece.set", "args": {"actor_id": doc_id, "mode": "full"}},
                {"name": "piece.set", "args": {"actor_id": char_id, "page": 2}},
                {"name": "piece.set", "args": {"actor_id": char_id, "template_id": 99999}},
                {"name": "piece.set", "args": {"actor_id": 99999, "shown": True}},
                {"name": "image.add", "args": {"file_id": upload(client, saga_id, dm, picture(100, 100), category="item").json()["id"]}},
                {"name": "pieces.place", "args": {"positions": {str(char_id): {"x": "left"}}}}):
        assert client.post(command, headers=dm, json=bad).status_code == 400, bad
    assert client.patch(f"/api/sagas/{saga_id}/sets/{set_id}", headers=dm, json={"config": {"layout": "pile"}}).status_code == 400
    # The desk's background opacity (%), kept within 0-100
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"background": 40}})
    api.ok("PATCH", f"/api/sagas/{saga_id}/sets/{set_id}", dm, json={"config": {"background": 140}})
    stage = api.ok("GET", f"/api/sagas/{saga_id}/stages/{stage_id}", dm)
    assert next(s for s in stage["sets"] if s["id"] == set_id)["content"]["background"] == 100


def test_pictures_are_temporary(api, client, root):
    saga_id, dm, ana, g, stage_id, set_id = _setup(api, root)
    command = f"/api/sagas/{saga_id}/sets/{set_id}/command"
    first = upload(client, saga_id, dm, picture(200, 200), category="desk").json()
    second = upload(client, saga_id, dm, picture(200, 200), category="desk").json()
    for pic in (first, second):
        api.ok("POST", command, dm, json={"name": "image.add", "args": {"file_id": pic["id"]}})
    pieces = _desk(api, saga_id, dm, stage_id)["pieces"]
    # Removing a piece deletes its picture
    assert client.delete(f"/api/sagas/{saga_id}/actors/{pieces[0]['id']}", headers=dm).status_code in (200, 204)
    assert client.get(first["url"]).status_code == 404 and client.get(second["url"]).status_code == 200
    # A duplicate owns a copy; deleting the original Stage keeps the copy's
    copy = api.ok("POST", f"/api/sagas/{saga_id}/stages/{stage_id}/duplicate", dm, json={})
    copied = _desk(api, saga_id, dm, copy["id"])["pieces"][0]
    assert copied["url"].split("?")[0] != _desk(api, saga_id, dm, stage_id)["pieces"][0]["url"].split("?")[0]
    assert client.delete(f"/api/sagas/{saga_id}/stages/{stage_id}", headers=dm).status_code in (200, 204)
    assert client.get(second["url"]).status_code == 404
    assert client.get(_desk(api, saga_id, dm, copy["id"])["pieces"][0]["url"]).status_code == 200
    # Deleting the Set deletes them too
    copy_set = api.ok("GET", f"/api/sagas/{saga_id}/stages/{copy['id']}", dm)["sets"][0]
    url = _desk(api, saga_id, dm, copy["id"])["pieces"][0]["url"]
    assert client.delete(f"/api/sagas/{saga_id}/sets/{copy_set['id']}", headers=dm).status_code in (200, 204)
    assert client.get(url).status_code == 404
