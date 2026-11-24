"""Shared fixtures.

Tests run against TEST_DATABASE_URL (default: a throw-away SQLite file), so they work without Docker.
Point it at Postgres to test against the real thing:
    TEST_DATABASE_URL=postgresql://sagacraft:sagacraft@localhost:5432/sagacraft_test
"""
import os
import tempfile

import pytest

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "sqlite:///" + os.path.join(tempfile.gettempdir(), "sagacraft_test.sqlite3").replace("\\", "/"),
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL  # must happen before importing the app
os.environ["ROOT_ADMIN_LOGIN"] = "root"
os.environ["ROOT_ADMIN_PASSWORD"] = "root-pass"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-long-enough-for-hs256-signing"

from fastapi.testclient import TestClient  # noqa: E402

import models  # noqa: E402,F401
from db.base import Base  # noqa: E402
from db.session import engine  # noqa: E402
from main import app  # noqa: E402


# The tests' DnD Lite: the built-in template as it was until plan 41 (rulesets/archive), so they don't follow the
# shipped file's content (its types, Stages...). The shipped file has its own tests (test_template_extras.py).
CLASSIC_DND_LITE = os.path.join(os.path.dirname(__file__), "..", "rulesets", "archive", "dnd_lite_0.4.0.json")


def use_classic_dnd_lite() -> None:
    import json

    from domain import ruleset as rulesets

    rulesets.load_rulesets()
    with open(CLASSIC_DND_LITE, encoding="utf-8") as f:
        rulesets._RULESETS["dnd_lite"] = rulesets.Ruleset(json.load(f))


@pytest.fixture(autouse=True)
def classic_dnd_lite():
    from domain import ruleset as rulesets

    use_classic_dnd_lite()
    yield
    rulesets.load_rulesets()


@pytest.fixture()
def shipped_rulesets(classic_dnd_lite):
    """The built-in templates as shipped (rulesets/*.json)."""
    from domain import ruleset as rulesets

    rulesets.load_rulesets()
    yield


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as test_client:
        use_classic_dnd_lite()  # the app loads the shipped files when it starts
        yield test_client
    Base.metadata.drop_all(engine)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class Api:
    """Small helper to keep tests readable."""

    def __init__(self, client: TestClient):
        self.client = client

    def login(self, login: str, password: str) -> dict:
        response = self.client.post("/api/auth/login", json={"login": login, "password": password})
        assert response.status_code == 200, response.text
        return auth(response.json()["token"])

    def ok(self, method: str, url: str, headers: dict, **kwargs):
        response = self.client.request(method, url, headers=headers, **kwargs)
        assert response.status_code == 200, f"{method} {url}: {response.status_code} {response.text}"
        return response.json()

    def saga(self, root: dict, name: str = "Test Saga", admin_login: str = "dm") -> tuple[int, dict]:
        saga = self.ok("POST", "/api/system/sagas", root, json={
            "name": name, "ruleset_key": "dnd_lite", "admin_login": admin_login, "admin_password": "dm-pass",
            "admin_display_name": "The DM",
        })
        return saga["id"], self.login(admin_login, "dm-pass")

    def member(self, saga_id: int, admin: dict, login: str, role: str = "player") -> tuple[int, dict]:
        overview = self.ok("POST", f"/api/sagas/{saga_id}/members", admin, json={
            "login": login, "password": "pass-123", "display_name": login.title(), "role": role,
        })
        member_id = next(m["id"] for m in overview["members"] if m["display_name"] == login.title())
        return member_id, self.login(login, "pass-123")


@pytest.fixture()
def api(client) -> Api:
    return Api(client)


@pytest.fixture()
def root(api) -> dict:
    return api.login("root", "root-pass")
