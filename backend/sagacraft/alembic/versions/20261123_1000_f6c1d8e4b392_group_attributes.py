"""groups of characters keep values of the Saga template's group variables

Revision ID: f6c1d8e4b392
Revises: e5b9c3d7a281
Create Date: 2026-11-23 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6c1d8e4b392'
down_revision: Union[str, None] = 'e5b9c3d7a281'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("character_groups", sa.Column("attributes", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("character_groups", "attributes")
