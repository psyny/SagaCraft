"""Display templates version 3 (plan 57): bars renamed, new element settings at their defaults

Version 2's bar "rounded" (a pill) is now "round" and its "flat" (rounded corners) "rounded", so every template keeps
its look ("flat" is now square corners). Each element gets the new settings: what a bar or number writes, discrete
icons' number, spacing, logic and hide-when-full. Self-contained: the values as they were at this revision.

Revision ID: c4e7a2b9d816
Revises: b9d4e1a7c352
Create Date: 2026-11-30 10:00:00

"""
import copy
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4e7a2b9d816'
down_revision: Union[str, None] = 'b9d4e1a7c352'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RENAMED = {"rounded": "round", "flat": "rounded"}
BACK = {"round": "rounded", "rounded": "flat", "flat": "flat"}
NEW = {"value_shown": "current_max", "icons": 4, "icon_gap": 5, "logic": "full_variant", "hide_full": False}
NEW_ICONS = ("stars", "bars")

templates = sa.table("display_templates", sa.column("id", sa.Integer), sa.column("config", sa.JSON))


def _elements(config: dict):
    for views in (config.get("modes") or {}).values():
        for regions in (views or {}).values():
            for elements in (regions or {}).values():
                for e in elements or []:
                    if isinstance(e, dict):
                        yield e


def _rewrite(change, version_from: int, version_to: int) -> None:
    db = op.get_bind()
    for row in db.execute(sa.select(templates.c.id, templates.c.config)).fetchall():
        config = row.config
        if not isinstance(config, dict) or config.get("version") != version_from:
            continue
        config = copy.deepcopy(config)
        for e in _elements(config):
            change(e)
        config["version"] = version_to
        db.execute(templates.update().where(templates.c.id == row.id).values(config=config))


def _up(e: dict) -> None:
    e["bar"] = RENAMED.get(e.get("bar"), "round")
    for field, value in NEW.items():
        e.setdefault(field, value)


def _down(e: dict) -> None:
    e["bar"] = BACK.get(e.get("bar"), "rounded")
    for field in NEW:
        e.pop(field, None)
    if e.get("icon") in NEW_ICONS:
        e["icon"] = "balls"


def upgrade() -> None:
    _rewrite(_up, 2, 3)


def downgrade() -> None:
    _rewrite(_down, 3, 2)
