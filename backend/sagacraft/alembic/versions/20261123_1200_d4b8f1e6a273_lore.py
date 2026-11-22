"""lore: relationships and their types, sub-events, eras, the Saga's calendar and story date

Revision ID: d4b8f1e6a273
Revises: c7e2a9b4d351
Create Date: 2026-11-23 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4b8f1e6a273'
down_revision: Union[str, None] = 'c7e2a9b4d351'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("sagas") as batch:
        batch.add_column(sa.Column("calendar", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("story_date", sa.Integer(), nullable=True))
    op.create_table(
        "relationship_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("saga_id", sa.Integer(), sa.ForeignKey("sagas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("label", sa.String(length=60), nullable=False),
        sa.Column("inverse", sa.String(length=60), nullable=False),
        sa.Column("directed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "relationships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("saga_id", sa.Integer(), sa.ForeignKey("sagas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("from_id", sa.Integer(), sa.ForeignKey("resources.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("to_id", sa.Integer(), sa.ForeignKey("resources.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("type_key", sa.String(length=40), nullable=True),
        sa.Column("type_id", sa.Integer(), sa.ForeignKey("relationship_types.id"), nullable=True),
        sa.Column("note", sa.String(length=300), nullable=False),
        sa.Column("start_date", sa.Integer(), nullable=True),
        sa.Column("end_date", sa.Integer(), nullable=True),
        sa.Column("event_id", sa.Integer(), sa.ForeignKey("resources.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("owns_event", sa.Boolean(), nullable=False),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("relationships.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_member_id", sa.Integer(), sa.ForeignKey("saga_members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_role", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "sub_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("saga_id", sa.Integer(), sa.ForeignKey("sagas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("event_id", sa.Integer(), sa.ForeignKey("resources.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resources.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("what", sa.String(length=40), nullable=False),
        sa.Column("note", sa.String(length=300), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "eras",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("saga_id", sa.Integer(), sa.ForeignKey("sagas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("start_date", sa.Integer(), nullable=False),
        sa.Column("end_date", sa.Integer(), nullable=True),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("note", sa.String(length=300), nullable=False),
        sa.Column("visibility", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("eras")
    op.drop_table("sub_events")
    op.drop_table("relationships")
    op.drop_table("relationship_types")
    with op.batch_alter_table("sagas") as batch:
        batch.drop_column("story_date")
        batch.drop_column("calendar")
