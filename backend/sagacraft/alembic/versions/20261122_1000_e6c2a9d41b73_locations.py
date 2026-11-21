"""locations: resource tags and location maps

Revision ID: e6c2a9d41b73
Revises: d4b8e1f60a29
Create Date: 2026-11-22 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e6c2a9d41b73'
down_revision: Union[str, None] = 'd4b8e1f60a29'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("resources") as batch:
        batch.add_column(sa.Column("tags", sa.JSON(), nullable=True))
    op.create_table(
        "location_maps",
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resources.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("location_maps")
    with op.batch_alter_table("resources") as batch:
        batch.drop_column("tags")
