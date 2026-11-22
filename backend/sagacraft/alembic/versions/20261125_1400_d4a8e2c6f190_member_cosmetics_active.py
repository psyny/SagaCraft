"""members' colour and dice style; characters can be inactive

Revision ID: d4a8e2c6f190
Revises: c7e1f4a9b305
Create Date: 2026-11-25 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4a8e2c6f190'
down_revision: Union[str, None] = 'c7e1f4a9b305'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("saga_members", sa.Column("color", sa.String(length=7), nullable=True))
    op.add_column("saga_members", sa.Column("die_style", sa.String(length=20), nullable=False, server_default="minimal"))
    op.add_column("resources", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column("resources", "active")
    op.drop_column("saga_members", "die_style")
    op.drop_column("saga_members", "color")
