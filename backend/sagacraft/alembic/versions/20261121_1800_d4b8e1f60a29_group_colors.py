"""character groups get a color

Display templates move to lists (config version 2) without a migration: older configs are upgraded when
read (domain/display.py: upgrade).

Revision ID: d4b8e1f60a29
Revises: c3a9f2d81e57
Create Date: 2026-11-21 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4b8e1f60a29'
down_revision: Union[str, None] = 'c3a9f2d81e57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("character_groups") as batch:
        batch.add_column(sa.Column("color", sa.String(length=9), nullable=False, server_default="#6cc9e0"))


def downgrade() -> None:
    with op.batch_alter_table("character_groups") as batch:
        batch.drop_column("color")
