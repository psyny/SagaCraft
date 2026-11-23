"""performance: indexes on hot lookups, pictures' smaller variants

Revision ID: a8d3f5c1e927
Revises: f6c1d8e4b392
Create Date: 2026-11-23 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a8d3f5c1e927'
down_revision: Union[str, None] = 'f6c1d8e4b392'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A member's groups (every request), a character's groups, the Stages showing a resource, a Saga's lists
    op.create_index('ix_group_members_member_id', 'group_members', ['member_id'])
    op.create_index('ix_character_group_members_resource_id', 'character_group_members', ['resource_id'])
    op.create_index('ix_stage_actors_resource_id', 'stage_actors', ['resource_id'])
    op.create_index('ix_resources_saga_kind', 'resources', ['saga_id', 'kind'])
    op.create_table(
        'file_variants',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('file_id', sa.Integer(), sa.ForeignKey('files.id', ondelete='CASCADE'), nullable=False),
        sa.Column('width', sa.Integer(), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False),
        sa.Column('size', sa.Integer(), nullable=False),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('file_id', 'width', name='uq_file_variants_file_width'),
    )
    op.create_index('ix_file_variants_file_id', 'file_variants', ['file_id'])
    # The models say these are never empty: make the tables agree (older rows get the defaults)
    op.execute("UPDATE character_groups SET attributes = CAST('{}' AS JSON) WHERE attributes IS NULL")
    op.alter_column('character_groups', 'attributes', existing_type=sa.JSON(), nullable=False)
    op.execute("UPDATE location_maps SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL")
    op.alter_column('location_maps', 'updated_at', existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade() -> None:
    op.alter_column('location_maps', 'updated_at', existing_type=sa.DateTime(timezone=True), nullable=True)
    op.alter_column('character_groups', 'attributes', existing_type=sa.JSON(), nullable=True)
    op.drop_index('ix_file_variants_file_id', table_name='file_variants')
    op.drop_table('file_variants')
    op.drop_index('ix_resources_saga_kind', table_name='resources')
    op.drop_index('ix_stage_actors_resource_id', table_name='stage_actors')
    op.drop_index('ix_character_group_members_resource_id', table_name='character_group_members')
    op.drop_index('ix_group_members_member_id', table_name='group_members')
