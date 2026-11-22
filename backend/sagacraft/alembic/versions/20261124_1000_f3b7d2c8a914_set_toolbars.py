"""set toolbars: where each Set's controls sit

Revision ID: f3b7d2c8a914
Revises: e9a1c5d7b382
Create Date: 2026-11-24 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3b7d2c8a914'
down_revision: Union[str, None] = 'e9a1c5d7b382'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("stage_sets") as batch:
        batch.add_column(sa.Column("toolbars", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("stage_sets") as batch:
        batch.drop_column("toolbars")
