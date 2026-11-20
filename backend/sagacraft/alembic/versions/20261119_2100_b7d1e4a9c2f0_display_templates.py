"""display templates, display defaults and names for players

Revision ID: b7d1e4a9c2f0
Revises: 8ebfba29a2cd
Create Date: 2026-11-19 21:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7d1e4a9c2f0'
down_revision: Union[str, None] = '8ebfba29a2cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'display_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('saga_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=40), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['saga_id'], ['sagas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_display_templates_saga_id'), 'display_templates', ['saga_id'], unique=False)
    op.add_column('sagas', sa.Column('display_defaults', sa.JSON(), nullable=True))
    op.add_column('resources', sa.Column('presentation', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('resources', 'presentation')
    op.drop_column('sagas', 'display_defaults')
    op.drop_index(op.f('ix_display_templates_saga_id'), table_name='display_templates')
    op.drop_table('display_templates')
