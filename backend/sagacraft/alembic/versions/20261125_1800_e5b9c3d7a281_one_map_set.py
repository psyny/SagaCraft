"""one Map Set: Local maps become Maps (world_map), players' clicks off as before

Revision ID: e5b9c3d7a281
Revises: d4a8e2c6f190
Create Date: 2026-11-25 18:00:00

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5b9c3d7a281'
down_revision: Union[str, None] = 'd4a8e2c6f190'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    for set_id, raw in bind.execute(sa.text("SELECT id, config FROM stage_sets WHERE type = 'local_map'")).all():
        config = raw if isinstance(raw, dict) else json.loads(raw or "{}")
        config = {**(config or {}), "interactive": {"players": False, "viewers": False}}
        bind.execute(sa.text("UPDATE stage_sets SET type = 'world_map', config = CAST(:c AS JSON) WHERE id = :id"),
                     {"c": json.dumps(config), "id": set_id})


def downgrade() -> None:
    pass  # Local maps don't come back (they're Maps now)
