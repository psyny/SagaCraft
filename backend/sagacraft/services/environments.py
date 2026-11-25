"""EFX environments (the DM's): build them on the EFX page, pick one per Stage; the Stage's EFX Sets show its layers.

- Only Saga admins see and edit environments; players get what a Stage's EFX Sets draw (render_layer), with
  pictures as signed URLs.
- Editing an environment updates every Stage using it, live (the routes push them).
See domain/efx.py and docs/concepts/efx.md.
"""
import copy
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from domain import efx
from models import Environment, SagaMember, Stage, StoredFile, Saga
from services.access import require_admin
from services.errors import BadRequest, NotFound
from services.security import signed_file_url

MAX_ENVIRONMENTS = 100


def _with_urls(layer: dict) -> dict:
    """A layer as drawn: each uploaded picture gets a signed URL beside its id (`<key>_url`)."""
    out = copy.deepcopy(layer or {"effects": []})
    for effect in out.get("effects", []):
        for spec in efx.EFFECTS.get(effect.get("kind"), {}).get("params", []):
            value = effect.get("params", {}).get(spec["key"])
            if spec["type"] == "image":
                effect["params"][f"{spec['key']}_url"] = signed_file_url(value) if isinstance(value, int) else None
    return out


def serialize(env: Environment) -> dict:
    return {"id": env.id, "name": env.name, "kind": env.kind or "stage", **{layer: _with_urls(getattr(env, layer)) for layer in efx.LAYERS}}


def weather_view(env: Environment) -> dict:
    """A map weather as a map's viewers get it: what to draw over the map."""
    return {"id": env.id, "name": env.name, "fore": _with_urls(env.fore)}


def _kind(raw: Any) -> str:
    if raw is None:
        return "stage"
    if raw not in efx.KINDS:
        raise BadRequest(f"An environment is one of {list(efx.KINDS)}")
    return raw


def _seed_weathers(db: Session, saga_id: int) -> None:
    """A Saga's map weathers start as the presets (once: deleting them all leaves none)."""
    saga = db.get(Saga, saga_id)
    own = dict(saga.settings) if isinstance(saga.settings, dict) else {}
    if own.get("map_weather_seeded"):
        return
    for preset in efx.weather_presets().values():
        db.add(Environment(saga_id=saga_id, name=preset["name"], kind="weather", far={"effects": []}, near={"effects": []},
                           fore=efx.clean_layer("fore", {"effects": preset["fore"]})))
    own["map_weather_seeded"] = True
    saga.settings = own
    db.commit()


def _get(db: Session, saga_id: int, env_id: Any) -> Environment:
    env = db.get(Environment, env_id) if isinstance(env_id, int) and not isinstance(env_id, bool) else None
    if env is None or env.saga_id != saga_id:
        raise NotFound("Environment not found")
    return env


def _name(raw: Any, fallback: str) -> str:
    name = " ".join(str(raw or "").split())[:80]
    return name or fallback


def _check_files(db: Session, saga_id: int, layers: dict) -> None:
    ids = efx.files_in(layers)
    if not ids:
        return
    found = set(db.scalars(select(StoredFile.id).where(StoredFile.id.in_(ids), StoredFile.saga_id == saga_id)).all())
    if ids - found:
        raise BadRequest("A picture isn't one of this Saga's uploads")


def _clean_layers(db: Session, saga_id: int, raw: dict, current: Environment | None) -> dict:
    layers = {layer: getattr(current, layer) if current else {"effects": []} for layer in efx.LAYERS}
    for layer in efx.LAYERS:
        if layer in raw:
            try:
                layers[layer] = efx.clean_layer(layer, raw[layer])
            except efx.EfxError as exc:
                raise BadRequest(str(exc)) from None
    _check_files(db, saga_id, layers)
    return layers


def list_environments(db: Session, member: SagaMember, kind: str | None = "stage") -> list[dict]:
    """A kind's environments (stage: the Stages'; weather: the maps')."""
    require_admin(member)
    kind = _kind(kind)
    if kind == "weather":
        _seed_weathers(db, member.saga_id)
    rows = db.scalars(select(Environment).where(Environment.saga_id == member.saga_id, Environment.kind == kind)
                      .order_by(Environment.name, Environment.id)).all()
    return [serialize(e) for e in rows]


def create(db: Session, member: SagaMember, data: dict) -> dict:
    """A new environment: empty, a copy of one, or one of the examples."""
    require_admin(member)
    count = len(db.scalars(select(Environment.id).where(Environment.saga_id == member.saga_id)).all())
    if count >= MAX_ENVIRONMENTS:
        raise BadRequest(f"At most {MAX_ENVIRONMENTS} environments")
    kind = _kind(data.get("kind"))
    source: dict = {}
    name = "New weather" if kind == "weather" else "New environment"
    if data.get("copy_of") is not None:
        original = _get(db, member.saga_id, data["copy_of"])
        source = {layer: getattr(original, layer) for layer in efx.LAYERS}
        name = f"{original.name} (copy)"
        kind = original.kind or "stage"
    elif data.get("example") is not None:
        examples = efx.weather_presets() if kind == "weather" else efx.examples()
        example = examples.get(data["example"])
        if example is None:
            raise BadRequest(f"Examples are {list(examples)}")
        source = {layer: {"effects": example.get(layer, [])} for layer in efx.LAYERS}
        name = example["name"]
    layers = _clean_layers(db, member.saga_id, {**efx.empty_layers(), **source, **{k: v for k, v in data.items() if k in efx.LAYERS}}, None)
    env = Environment(saga_id=member.saga_id, name=_name(data.get("name"), name), kind=kind, **layers)
    db.add(env)
    db.commit()
    return serialize(env)


def update(db: Session, member: SagaMember, env_id: int, data: dict) -> dict:
    require_admin(member)
    env = _get(db, member.saga_id, env_id)
    if "name" in data:
        env.name = _name(data["name"], env.name)
    layers = _clean_layers(db, member.saga_id, data, env)
    for layer in efx.LAYERS:
        setattr(env, layer, layers[layer])
    db.commit()
    return serialize(env)


def delete(db: Session, member: SagaMember, env_id: int) -> set[int]:
    """Stages that showed it show none now: their ids, to update them."""
    require_admin(member)
    env = _get(db, member.saga_id, env_id)
    stage_ids = stages_using(db, member.saga_id, env.id)
    for stage in db.scalars(select(Stage).where(Stage.environment_id == env.id)).all():
        stage.environment_id = None
    db.delete(env)
    db.commit()
    return stage_ids


def stages_using(db: Session, saga_id: int, env_id: int) -> set[int]:
    return set(db.scalars(select(Stage.id).where(Stage.saga_id == saga_id, Stage.environment_id == env_id)).all())


def check_environment(db: Session, saga_id: int, env_id: Any) -> int | None:
    """A Stage's environment: one of the Saga's (not a map weather), or None."""
    if env_id is None:
        return None
    env = _get(db, saga_id, env_id)
    if env.kind == "weather":
        raise BadRequest("That's a map weather, not a Stage's environment")
    return env.id


def map_weather(db: Session, saga_id: int, env_id: Any) -> Environment | None:
    """One of the Saga's map weathers (None: there's no such one, or it's gone)."""
    if isinstance(env_id, bool) or not isinstance(env_id, int):
        return None
    env = db.get(Environment, env_id)
    return env if env is not None and env.saga_id == saga_id and env.kind == "weather" else None


class EfxBook:
    """What EFX Sets draw (RenderContext.efx): the layers of their Stage's environment, and the DM's choices."""

    def __init__(self, db: Session, saga_id: int):
        self.db, self.saga_id = db, saga_id
        self._cache: dict[int, Environment | None] = {}

    def environment(self, env_id: int | None) -> Environment | None:
        if env_id is None:
            return None
        if env_id not in self._cache:
            env = self.db.get(Environment, env_id)
            self._cache[env_id] = env if env is not None and env.saga_id == self.saga_id else None
        return self._cache[env_id]

    def layer(self, env_id: int | None, layer: str) -> dict:
        env = self.environment(env_id)
        return _with_urls(getattr(env, layer)) if env else {"effects": []}

    def choices(self) -> list[dict]:
        rows = self.db.scalars(select(Environment).where(Environment.saga_id == self.saga_id)
                               .order_by(Environment.name, Environment.id)).all()
        return [{"id": e.id, "name": e.name} for e in rows]
