"""A Stage can be paused (plan 58): while it's live, players and viewers can't act on it

Revision ID: e2a9c4f7b318
Revises: c4e7a2b9d816
Create Date: 2026-12-01 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e2a9c4f7b318'
down_revision: Union[str, None] = 'c4e7a2b9d816'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("stages") as batch:
        batch.add_column(sa.Column("paused", sa.Boolean(), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("stages") as batch:
        batch.drop_column("paused")
