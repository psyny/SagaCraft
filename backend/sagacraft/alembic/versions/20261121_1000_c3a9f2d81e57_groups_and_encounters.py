"""categories, character groups, instanceable characters; Creature panel becomes the Actors Scene

Revision ID: c3a9f2d81e57
Revises: b7d1e4a9c2f0
Create Date: 2026-11-21 10:00:00

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3a9f2d81e57'
down_revision: Union[str, None] = 'b7d1e4a9c2f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TAB_NAMES = ("Exploration", "Dialog", "Combat")
OLD_LAYOUTS = {"auto": ("grid", "manual"), "initiative": ("grid", "initiative"), "free": ("free", "manual")}


def _json(value):
    if value is None:
        return {}
    return json.loads(value) if isinstance(value, str) else value


def _tab(tab_id: int, name: str, **extra) -> dict:
    tab = {"id": tab_id, "name": name, "shape": "grid", "flow": "static", "scatter": False, "spacing": 14,
           "order_by": "custom", "order": [], "turn_controls": False, "turn": {"actor_id": None, "round": 0},
           "highlight_actor_id": None, "spotlight": False}
    tab.update(extra)
    return tab


def _convert_panels(bind) -> None:
    """Old Creature panels: three tabs, every card in all of them (shown as before), the old layout in the first."""
    sets = sa.table("stage_sets", sa.column("id", sa.Integer), sa.column("type", sa.String), sa.column("config", sa.JSON))
    actors = sa.table("stage_actors", sa.column("id", sa.Integer), sa.column("set_id", sa.Integer),
                      sa.column("sort_order", sa.Integer), sa.column("position", sa.JSON),
                      sa.column("visibility", sa.JSON), sa.column("config", sa.JSON))
    for set_id, raw in bind.execute(sa.select(sets.c.id, sets.c.config).where(sets.c.type == "creature_panel")).all():
        old = _json(raw)
        shape, order = old.get("shape"), old.get("order")
        if "layout" in old:
            shape, order = OLD_LAYOUTS.get(old["layout"], ("grid", "manual"))
        rows = bind.execute(sa.select(actors.c.id, actors.c.sort_order, actors.c.position, actors.c.visibility)
                            .where(actors.c.set_id == set_id).order_by(actors.c.sort_order, actors.c.id)).all()
        first = _tab(1, TAB_NAMES[0], shape=shape or "grid", spacing=int(old.get("spacing") or 14),
                     order_by="initiative" if order == "initiative" else "custom",
                     order=[r[0] for r in rows], highlight_actor_id=old.get("highlight_actor_id"),
                     spotlight=bool(old.get("spotlight")))
        config = {
            "card_style": old.get("card_style") or old.get("picture") or "face",
            "templates": old.get("templates") or {},
            "active_tab": 1,
            "next_tab": 4,
            "tabs": [first, _tab(2, TAB_NAMES[1], shape="boundary"),
                     _tab(3, TAB_NAMES[2], shape="bar", order_by="initiative", turn_controls=True)],
        }
        bind.execute(sets.update().where(sets.c.id == set_id).values(type="actors_scene", config=config))
        for actor_id, _order, position, visibility in rows:
            vis = _json(visibility)
            shown = bool(vis.get("groups") or vis.get("members"))
            tabs = {str(t): {"shown": shown} for t in (1, 2, 3)}
            if _json(position):
                tabs["1"]["position"] = _json(position)
            bind.execute(actors.update().where(actors.c.id == actor_id).values(config={"tabs": tabs}))


def upgrade() -> None:
    op.create_table(
        'character_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('saga_id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(length=80), nullable=True),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('plural', sa.String(length=120), nullable=False),
        sa.Column('type', sa.String(length=80), nullable=False),
        sa.Column('player', sa.Boolean(), nullable=False),
        sa.Column('instanceable', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['saga_id'], ['sagas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_character_categories_saga_id'), 'character_categories', ['saga_id'], unique=False)
    op.create_table(
        'character_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('saga_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('player_party', sa.Boolean(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('favorite', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['saga_id'], ['sagas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_character_groups_saga_id'), 'character_groups', ['saga_id'], unique=False)
    op.create_table(
        'character_group_members',
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('resource_id', sa.Integer(), nullable=False),
        sa.Column('count', sa.Integer(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['character_groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resource_id'], ['resources.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('group_id', 'resource_id'),
    )
    with op.batch_alter_table('resources') as batch:
        batch.add_column(sa.Column('category_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('instanceable', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.create_foreign_key('fk_resources_category', 'character_categories', ['category_id'], ['id'],
                                 ondelete='SET NULL')
        batch.create_index('ix_resources_category_id', ['category_id'])
    with op.batch_alter_table('sagas') as batch:
        batch.add_column(sa.Column('template_applied', sa.Boolean(), nullable=False, server_default=sa.false()))
    _convert_panels(op.get_bind())


def downgrade() -> None:
    op.execute("UPDATE stage_sets SET type = 'creature_panel' WHERE type = 'actors_scene'")
    with op.batch_alter_table('sagas') as batch:
        batch.drop_column('template_applied')
    with op.batch_alter_table('resources') as batch:
        batch.drop_index('ix_resources_category_id')
        batch.drop_constraint('fk_resources_category', type_='foreignkey')
        batch.drop_column('instanceable')
        batch.drop_column('category_id')
    op.drop_table('character_group_members')
    op.drop_index(op.f('ix_character_groups_saga_id'), table_name='character_groups')
    op.drop_table('character_groups')
    op.drop_index(op.f('ix_character_categories_saga_id'), table_name='character_categories')
    op.drop_table('character_categories')
