"""set off: a Set put away (drawn for no one until the DM brings it back)

Revision ID: a8c4e2f6b917
Revises: f3b7d2c8a914
Create Date: 2026-11-24 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a8c4e2f6b917'
down_revision: Union[str, None] = 'f3b7d2c8a914'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("stage_sets") as batch:
        batch.add_column(sa.Column("off", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("stage_sets") as batch:
        batch.drop_column("off")
