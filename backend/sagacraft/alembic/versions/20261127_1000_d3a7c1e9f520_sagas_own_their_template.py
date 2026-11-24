"""Every Saga owns its Saga template (plan 41)

Until now a Saga on a built-in template (sagas.template NULL) read the built-in file live, so changing the file
changed the Saga. A Saga's template is its own: those Sagas get a copy of the built-in template as it was until
plan 41 (rulesets/archive). New Sagas copy theirs when they're made.

Revision ID: d3a7c1e9f520
Revises: b8e2f6a0d514
Create Date: 2026-11-27 10:00:00

"""
import json
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd3a7c1e9f520'
down_revision: Union[str, None] = 'b8e2f6a0d514'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ARCHIVE = Path(__file__).resolve().parents[2] / "rulesets" / "archive"
BUILTIN = {"dnd_lite": "dnd_lite_0.4.0.json"}
EXTRAS = ("display_templates", "fog_presets", "environments", "stages")


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, ruleset_key FROM sagas WHERE template IS NULL")).all()
    for saga_id, ruleset_key in rows:
        doc = json.loads((ARCHIVE / BUILTIN.get(ruleset_key, BUILTIN["dnd_lite"])).read_text())
        doc = {k: v for k, v in doc.items() if k not in EXTRAS}
        bind.execute(sa.text("UPDATE sagas SET template = CAST(:t AS JSON) WHERE id = :s"),
                     {"t": json.dumps(doc), "s": saga_id})


def downgrade() -> None:
    # Which Sagas read the built-in file can't be told any more: they keep their copies
    pass
