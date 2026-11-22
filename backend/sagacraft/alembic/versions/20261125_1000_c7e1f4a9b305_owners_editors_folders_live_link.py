"""owners, who can edit, folders' visibility, the live link; viewers out of stored visibilities

Viewers now see what players see (services/access.viewer_for), so "all viewers" is no longer a choice: the viewers
group comes out of every stored visibility (resources, eras, Sets, Actors, map paths, regions and labels).

Revision ID: c7e1f4a9b305
Revises: b5d9e3a7c214
Create Date: 2026-11-25 10:00:00

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7e1f4a9b305'
down_revision: Union[str, None] = 'b5d9e3a7c214'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _load(value):
    if value is None or isinstance(value, (dict, list)):
        return value
    return json.loads(value)


def _strip(visibility, viewers: int | None):
    """The visibility without the viewers group (None if nothing changed)."""
    if not isinstance(visibility, dict) or viewers is None or viewers not in (visibility.get("groups") or []):
        return None
    return {**visibility, "groups": [g for g in visibility["groups"] if g != viewers]}


def upgrade() -> None:
    op.add_column("sagas", sa.Column("live_token", sa.String(length=40), nullable=True))
    op.create_unique_constraint("uq_sagas_live_token", "sagas", ["live_token"])
    op.add_column("resources", sa.Column("owners", sa.JSON(), nullable=True))
    op.add_column("resources", sa.Column("editors", sa.JSON(), nullable=True))
    op.add_column("resource_folders", sa.Column("visibility", sa.JSON(), nullable=True))

    bind = op.get_bind()
    viewers = {saga: gid for gid, saga in bind.execute(sa.text("SELECT id, saga_id FROM groups WHERE key = 'viewers'"))}

    def clean(table: str, saga_sql: str) -> None:
        rows = bind.execute(sa.text(f"SELECT t.id, t.visibility, {saga_sql} FROM {table} t")).all()
        for row_id, raw, saga_id in rows:
            stripped = _strip(_load(raw), viewers.get(saga_id))
            if stripped is not None:
                bind.execute(sa.text(f"UPDATE {table} SET visibility = CAST(:v AS JSON) WHERE id = :id"),
                             {"v": json.dumps(stripped), "id": row_id})

    clean("resources", "t.saga_id")
    clean("eras", "t.saga_id")
    clean("stage_sets", "(SELECT s.saga_id FROM stages s WHERE s.id = t.stage_id)")
    clean("stage_actors", "(SELECT s.saga_id FROM stage_sets ss JOIN stages s ON s.id = ss.stage_id WHERE ss.id = t.set_id)")

    maps = bind.execute(sa.text("SELECT m.resource_id, m.data, r.saga_id FROM location_maps m "
                                "JOIN resources r ON r.id = m.resource_id")).all()
    for resource_id, raw, saga_id in maps:
        data = _load(raw) or {}
        changed = False
        for key in ("paths", "regions", "labels"):
            for item in data.get(key) or []:
                stripped = _strip(item.get("visibility"), viewers.get(saga_id))
                if stripped is not None:
                    item["visibility"] = stripped
                    changed = True
        if changed:
            bind.execute(sa.text("UPDATE location_maps SET data = CAST(:d AS JSON) WHERE resource_id = :id"),
                         {"d": json.dumps(data), "id": resource_id})


def downgrade() -> None:
    op.drop_column("resource_folders", "visibility")
    op.drop_column("resources", "editors")
    op.drop_column("resources", "owners")
    op.drop_constraint("uq_sagas_live_token", "sagas", type_="unique")
    op.drop_column("sagas", "live_token")
