"""Saga settings (plan 37: roll an action's dice on the live dice roller)

Revision ID: f6c0d4e8a392
Revises: c4f8a2e6d913
Create Date: 2026-11-26 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6c0d4e8a392'
down_revision: Union[str, None] = 'c4f8a2e6d913'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sagas', sa.Column('settings', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('sagas', 'settings')
