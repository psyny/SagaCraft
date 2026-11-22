"""stage layouts: canvas or interface Stages, Sets' screen places

Revision ID: e9a1c5d7b382
Revises: d4b8f1e6a273
Create Date: 2026-11-23 16:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e9a1c5d7b382'
down_revision: Union[str, None] = 'd4b8f1e6a273'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("stages") as batch:
        batch.add_column(sa.Column("layout", sa.String(length=20), nullable=False, server_default="canvas"))
    with op.batch_alter_table("stage_sets") as batch:
        batch.add_column(sa.Column("screen", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("stage_sets") as batch:
        batch.drop_column("screen")
    with op.batch_alter_table("stages") as batch:
        batch.drop_column("layout")
