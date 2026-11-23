"""improvements (plan 33): dice settings per member, Stage controls (EFX Controls Sets retired), characters' archetypes

Revision ID: c4f8a2e6d913
Revises: b3e7c9d2f418
Create Date: 2026-11-24 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4f8a2e6d913'
down_revision: Union[str, None] = 'b3e7c9d2f418'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dice on a member's screen (Saga → User): still (no animations), simple (plain dice)
    op.add_column('saga_members', sa.Column('dice_still', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('saga_members', sa.Column('dice_simple', sa.Boolean(), nullable=False, server_default='0'))
    # A Stage's own controls (EFX, Actions); the EFX Controls Sets become its EFX control (on by default)
    op.add_column('stages', sa.Column('controls', sa.JSON(), nullable=True))
    op.execute("DELETE FROM stage_actors WHERE set_id IN (SELECT id FROM stage_sets WHERE type = 'efx_controls')")
    op.execute("DELETE FROM stage_sets WHERE type = 'efx_controls'")
    # A character's archetypes: [{"key", "level"}] (domain/archetypes.py)
    op.add_column('resources', sa.Column('archetypes', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('resources', 'archetypes')
    op.drop_column('stages', 'controls')  # (the retired EFX Controls Sets aren't brought back)
    op.drop_column('saga_members', 'dice_simple')
    op.drop_column('saga_members', 'dice_still')
