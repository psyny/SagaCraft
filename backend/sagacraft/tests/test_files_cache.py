"""Plan 31: pictures served cacheable (stable URLs per window, public, immutable, ETag), smaller copies for small
places, JSON compressed."""
import io
import time

from PIL import Image

from services import security
from tests.test_uploads import picture, upload


def test_picture_urls_stay_the_same_for_a_window():
    start = (int(time.time()) // 21600 + 1) * 21600  # a window's start (6 h)
    first, later = security.url_expiry(start + 10), security.url_expiry(start + 21000)
    assert first == later  # the same URL all window long: browsers and a CDN keep the picture
    assert security.url_expiry(start + 21600 + 10) > first  # the next window: a new one
    assert first - (start + 21000) >= security.settings.file_url_minutes * 60  # still works a while after


def test_pictures_are_cacheable_and_come_smaller(api, client, root):
    saga_id, dm = api.saga(root)
    made = upload(client, saga_id, dm, picture(1000, 500, noise=True)).json()
    url = made["url"]
    full = client.get(url)
    assert full.status_code == 200 and full.headers["content-type"] == "image/png"
    cache = full.headers["cache-control"]
    assert cache.startswith("public, max-age=") and "immutable" in cache
    assert 0 < int(cache.split("max-age=")[1].split(",")[0]) <= (security.settings.file_url_window_hours * 60
                                                                     + security.settings.file_url_minutes) * 60
    # A smaller copy: WebP, the width asked for (rounded up to the server's widths), the same proportions
    small = client.get(f"{url}&w=150")
    assert small.status_code == 200 and small.headers["content-type"] == "image/webp"
    with Image.open(io.BytesIO(small.content)) as image:
        assert image.size == (192, 96)
    assert len(small.content) < len(full.content) / 4
    assert client.get(f"{url}&w=150").content == small.content  # kept, not made again
    # Wider than the picture: the file itself
    assert client.get(f"{url}&w=1500").headers["content-type"] == "image/png"
    # Revalidating: nothing sent again
    again = client.get(f"{url}&w=150", headers={"If-None-Match": small.headers["etag"]})
    assert again.status_code == 304 and not again.content
    # Still signed: a wrong signature or a stolen width trick gets nothing
    assert client.get(url.replace("s=", "s=0") + "&w=96").status_code == 404


def test_json_is_compressed(api, client, root):
    saga_id, dm = api.saga(root)
    response = client.get(f"/api/sagas/{saga_id}/ruleset", headers={**dm, "Accept-Encoding": "gzip"})
    assert response.headers.get("content-encoding") == "gzip"
    made = upload(client, saga_id, dm, picture(300, 300, noise=True)).json()
    assert client.get(made["url"], headers={"Accept-Encoding": "gzip"}).headers.get("content-encoding") is None
