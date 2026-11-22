"""Upload limits per category (system settings) and server-side picture checks."""
import io

from PIL import Image


def picture(width: int, height: int, fmt: str = "PNG", noise: bool = False) -> bytes:
    image = Image.new("RGB", (width, height), (120, 60, 30))
    if noise:
        image = Image.effect_noise((width, height), 120).convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, fmt)
    return buffer.getvalue()


def upload(client, saga_id, headers, data, category="character", content_type="image/png"):
    return client.post(f"/api/sagas/{saga_id}/files", headers=headers,
                       files={"file": ("p", data, content_type)}, data={"category": category})


def test_limits_have_defaults_for_every_category(api, root):
    limits = api.ok("GET", "/api/upload-limits", root)
    assert set(limits["categories"]) == {"character", "icon", "item", "document", "map", "efx"}
    assert all(v["max_mb"] > 0 and v["max_px"] >= 64 and v["max_count"] >= 1 for v in limits["categories"].values())


def test_any_member_can_read_limits(api, root):
    saga_id, dm = api.saga(root)
    _, ana = api.member(saga_id, dm, "ana")
    assert "character" in api.ok("GET", "/api/upload-limits", ana)["categories"]


def test_system_admin_changes_limits(api, client, root):
    updated = api.ok("PUT", "/api/system/settings/upload-limits", root,
                     json={"categories": {"map": {"max_mb": 12, "max_px": 6000, "max_count": 40}}})
    assert updated["categories"]["map"] == {"label": "Location map pictures", "max_mb": 12.0, "max_px": 6000, "max_count": 40}
    # Other categories keep their values
    assert updated["categories"]["character"]["max_px"] == 1024


def test_limits_need_the_permission(api, client, root):
    saga_id, dm = api.saga(root)
    response = client.put("/api/system/settings/upload-limits", headers=dm,
                          json={"categories": {"map": {"max_mb": 2, "max_px": 1000}}})
    assert response.status_code == 403


def test_limits_cannot_exceed_the_ceiling(api, client, root):
    response = client.put("/api/system/settings/upload-limits", headers=root,
                          json={"categories": {"map": {"max_mb": 9999, "max_px": 4096}}})
    assert response.status_code == 400
    response = client.put("/api/system/settings/upload-limits", headers=root,
                          json={"categories": {"nope": {"max_mb": 1, "max_px": 512}}})
    assert response.status_code == 400


def test_upload_records_category_and_size(api, client, root):
    saga_id, dm = api.saga(root)
    response = upload(client, saga_id, dm, picture(300, 200), category="item")
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["category"], body["width"], body["height"], body["content_type"]) == ("item", 300, 200, "image/png")


def test_upload_over_the_category_size_is_rejected(api, client, root):
    saga_id, dm = api.saga(root)
    api.ok("PUT", "/api/system/settings/upload-limits", root,
           json={"categories": {"item": {"max_mb": 0.05, "max_px": 1024}}})
    big = picture(600, 600, noise=True)  # noisy PNG, well over 50 KB
    assert len(big) > 0.05 * 1024 * 1024
    response = upload(client, saga_id, dm, big, category="item")
    assert response.status_code == 400
    assert "MB" in response.json()["detail"]


def test_upload_over_the_pixel_limit_is_rejected(api, client, root):
    saga_id, dm = api.saga(root)
    response = upload(client, saga_id, dm, picture(1500, 400), category="character")  # max 1024 px
    assert response.status_code == 400
    assert "px" in response.json()["detail"]


def test_fake_pictures_are_rejected(api, client, root):
    saga_id, dm = api.saga(root)
    response = upload(client, saga_id, dm, b"<script>alert(1)</script>", content_type="image/png")
    assert response.status_code == 400


def test_content_type_comes_from_the_real_format(api, client, root):
    saga_id, dm = api.saga(root)
    response = upload(client, saga_id, dm, picture(100, 100, fmt="JPEG"), content_type="image/png")
    assert response.status_code == 200
    assert response.json()["content_type"] == "image/jpeg"


def test_viewers_cannot_upload(api, client, root):
    saga_id, dm = api.saga(root)
    _, viewer = api.member(saga_id, dm, "vic", role="viewer")
    assert upload(client, saga_id, viewer, picture(50, 50)).status_code == 403
