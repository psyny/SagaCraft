"""Map weather (plan 48): an environment is a Stage's (as before) or a map weather

Revision ID: b9d4e1a7c352
Revises: a7c3e9d1f264
Create Date: 2026-11-29 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b9d4e1a7c352'
down_revision: Union[str, None] = 'a7c3e9d1f264'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("environments") as batch:
        batch.add_column(sa.Column("kind", sa.String(16), nullable=False, server_default="stage"))


def downgrade() -> None:
    with op.batch_alter_table("environments") as batch:
        batch.drop_column("kind")
