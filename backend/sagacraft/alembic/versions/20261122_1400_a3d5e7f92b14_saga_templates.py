"""saga templates: each Saga's own copy of its Saga template (variables, types, starting content)

Revision ID: a3d5e7f92b14
Revises: f1a7c3d95e20
Create Date: 2026-11-22 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3d5e7f92b14'
down_revision: Union[str, None] = 'f1a7c3d95e20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Sagas keep reading their built-in template (ruleset_key) until their first edit
    with op.batch_alter_table("sagas") as batch:
        batch.add_column(sa.Column("template", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("template_version", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    with op.batch_alter_table("sagas") as batch:
        batch.drop_column("template_version")
        batch.drop_column("template")
