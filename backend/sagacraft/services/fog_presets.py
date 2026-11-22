"""Fog presets: the DM builds them (Locations page), map Sets pick one. Rules in domain/fog.py.
Every Saga has at least one (the default, made with the Saga); the last one can't be deleted."""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from domain import fog
from models import FogPreset, SagaMember, Stage, StageSet
from services.access import require_admin
from services.errors import BadRequest, NotFound

MAP_SET_TYPES = ("world_map",)


def serialize(preset: FogPreset) -> dict:
    return {"id": preset.id, "name": preset.name, "look": fog.normalize(preset.look)}


def ensure_default(db: Session, saga_id: int) -> FogPreset:
    """The Saga's first preset, made (the default white mist) if it has none."""
    first = db.scalars(select(FogPreset).where(FogPreset.saga_id == saga_id).order_by(FogPreset.id)).first()
    if first is None:
        first = FogPreset(saga_id=saga_id, name=fog.DEFAULT_NAME, look=dict(fog.DEFAULT_LOOK))
        db.add(first)
        db.flush()
    return first


def _all(db: Session, saga_id: int) -> list[FogPreset]:
    ensure_default(db, saga_id)
    return list(db.scalars(select(FogPreset).where(FogPreset.saga_id == saga_id).order_by(FogPreset.id)).all())


def _get(db: Session, saga_id: int, preset_id: int) -> FogPreset:
    preset = db.get(FogPreset, preset_id)
    if preset is None or preset.saga_id != saga_id:
        raise NotFound("Fog preset not found")
    return preset


def _name(raw: Any, fallback: str) -> str:
    name = str(raw if raw is not None else fallback).strip()[:80]
    if not name:
        raise BadRequest("A fog preset needs a name")
    return name


def list_presets(db: Session, member: SagaMember) -> list[dict]:
    require_admin(member)
    result = [serialize(p) for p in _all(db, member.saga_id)]
    db.commit()
    return result


def create(db: Session, member: SagaMember, name: str | None, look: dict | None, copy_of: int | None) -> dict:
    require_admin(member)
    presets = _all(db, member.saga_id)
    if len(presets) >= fog.MAX_PRESETS:
        raise BadRequest(f"At most {fog.MAX_PRESETS} fog presets")
    base = _get(db, member.saga_id, copy_of) if copy_of else None
    try:
        new_look = fog.update(base.look if base else fog.DEFAULT_LOOK, look or {})
    except fog.FogError as exc:
        raise BadRequest(str(exc)) from None
    default_name = f"{base.name} (copy)" if base else f"Fog {len(presets) + 1}"
    preset = FogPreset(saga_id=member.saga_id, name=_name(name, default_name), look=new_look)
    db.add(preset)
    db.commit()
    return serialize(preset)


def update(db: Session, member: SagaMember, preset_id: int, name: str | None, changes: dict | None) -> dict:
    require_admin(member)
    preset = _get(db, member.saga_id, preset_id)
    if name is not None:
        preset.name = _name(name, preset.name)
    if changes:
        try:
            preset.look = fog.update(preset.look, changes)
        except fog.FogError as exc:
            raise BadRequest(str(exc)) from None
    db.commit()
    return serialize(preset)


def delete(db: Session, member: SagaMember, preset_id: int) -> None:
    """Map Sets using it fall back to the Saga's first preset."""
    require_admin(member)
    preset = _get(db, member.saga_id, preset_id)
    if len(_all(db, member.saga_id)) <= 1:
        raise BadRequest("Keep at least one fog preset")
    db.delete(preset)
    db.commit()


def stages_with_map_sets(db: Session, saga_id: int) -> set[int]:
    """Stages a preset change shows on (they have map Sets)."""
    rows = db.scalars(select(StageSet.stage_id).join(Stage, Stage.id == StageSet.stage_id)
                      .where(Stage.saga_id == saga_id, StageSet.type.in_(MAP_SET_TYPES))).all()
    return set(rows)


class FogBook:
    """The Saga's fog presets for Set types (RenderContext.maps.fog): one query per render."""

    def __init__(self, db: Session, saga_id: int):
        self.db = db
        self.saga_id = saga_id
        self._presets: list[FogPreset] | None = None

    def presets(self) -> list[FogPreset]:
        if self._presets is None:
            self._presets = _all(self.db, self.saga_id)
        return self._presets

    def resolve(self, preset_id: Any) -> FogPreset:
        """The preset a Set picked, else the first one (the default)."""
        presets = self.presets()
        return next((p for p in presets if p.id == preset_id), presets[0])

    def choices(self) -> list[dict]:
        return [{"id": p.id, "name": p.name} for p in self.presets()]
