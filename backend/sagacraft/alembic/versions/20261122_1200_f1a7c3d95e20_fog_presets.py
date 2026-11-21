"""fog presets: how map Sets draw the fog, one default per Saga

Revision ID: f1a7c3d95e20
Revises: e6c2a9d41b73
Create Date: 2026-11-22 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a7c3d95e20'
down_revision: Union[str, None] = 'e6c2a9d41b73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The default preset (domain/fog.py DEFAULT_LOOK at the time of this migration)
DEFAULT_LOOK = {"display": "soft", "style": "mist", "colors": ["#7d8590", "#d3d8df", "#ffffff"], "size": 1.0,
                "intensity": 0.45, "motion": 0.6, "edge": 0.5, "known": 0.5}


def upgrade() -> None:
    presets = op.create_table(
        "fog_presets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("saga_id", sa.Integer(), sa.ForeignKey("sagas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("look", sa.JSON(), nullable=False),
    )
    op.create_index("ix_fog_presets_saga_id", "fog_presets", ["saga_id"])
    saga_ids = [row[0] for row in op.get_bind().execute(sa.text("SELECT id FROM sagas"))]
    if saga_ids:
        op.bulk_insert(presets, [{"saga_id": sid, "name": "White mist", "look": DEFAULT_LOOK} for sid in saga_ids])


def downgrade() -> None:
    op.drop_index("ix_fog_presets_saga_id", "fog_presets")
    op.drop_table("fog_presets")
