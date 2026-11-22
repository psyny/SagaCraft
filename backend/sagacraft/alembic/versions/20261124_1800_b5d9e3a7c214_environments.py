"""environments (EFX) and each Stage's environment

Revision ID: b5d9e3a7c214
Revises: a8c4e2f6b917
Create Date: 2026-11-24 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b5d9e3a7c214'
down_revision: Union[str, None] = 'a8c4e2f6b917'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "environments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("saga_id", sa.Integer(), sa.ForeignKey("sagas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("far", sa.JSON(), nullable=False),
        sa.Column("near", sa.JSON(), nullable=False),
        sa.Column("fore", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_environments_saga_id", "environments", ["saga_id"])
    with op.batch_alter_table("stages") as batch:
        batch.add_column(sa.Column("environment_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_stages_environment_id", "environments", ["environment_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    with op.batch_alter_table("stages") as batch:
        batch.drop_constraint("fk_stages_environment_id", type_="foreignkey")
        batch.drop_column("environment_id")
    op.drop_index("ix_environments_saga_id", table_name="environments")
    op.drop_table("environments")
