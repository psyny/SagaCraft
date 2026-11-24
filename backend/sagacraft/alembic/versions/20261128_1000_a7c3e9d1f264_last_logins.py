"""Last logins (plan 43): when an account last signed in, when a member last opened their Saga

Revision ID: a7c3e9d1f264
Revises: e4b8d2f6a913
Create Date: 2026-11-28 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7c3e9d1f264'
down_revision: Union[str, None] = 'e4b8d2f6a913'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table("saga_members") as batch:
        batch.add_column(sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("saga_members") as batch:
        batch.drop_column("last_seen_at")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("last_login_at")
