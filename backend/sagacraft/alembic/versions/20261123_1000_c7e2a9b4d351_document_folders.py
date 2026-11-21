"""document folders: the DM files documents in folders (one level)

Revision ID: c7e2a9b4d351
Revises: a3d5e7f92b14
Create Date: 2026-11-23 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7e2a9b4d351'
down_revision: Union[str, None] = 'a3d5e7f92b14'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "resource_folders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("saga_id", sa.Integer(), sa.ForeignKey("sagas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_resource_folders_saga_id", "resource_folders", ["saga_id"])
    with op.batch_alter_table("resources") as batch:
        batch.add_column(sa.Column("folder_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_resources_folder_id", "resource_folders", ["folder_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_resources_folder_id", ["folder_id"])


def downgrade() -> None:
    with op.batch_alter_table("resources") as batch:
        batch.drop_index("ix_resources_folder_id")
        batch.drop_constraint("fk_resources_folder_id", type_="foreignkey")
        batch.drop_column("folder_id")
    op.drop_index("ix_resource_folders_saga_id", table_name="resource_folders")
    op.drop_table("resource_folders")
