"""Character categories merged into types (plan 40)

Each Saga's character categories become character types of its Saga template: the first category of each type
takes the type's key (its name, plural, "player" and "instanceable" become the category's), the others become copies
of it (a key from their own, or their name). Characters take their category's type; display defaults and the
Actors Scenes' templates per category move to the types; the template's starting categories go. A Saga on the
built-in template keeps it when the result is the built-in one (DnD Lite's types are its categories of before).
Then the categories table and resources.category_id go.

Self-contained (no app code): the merge mirrors domain/saga_template.merge_categories.

Revision ID: b8e2f6a0d514
Revises: f6c0d4e8a392
Create Date: 2026-11-26 12:00:00

"""
import copy
import json
import re
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8e2f6a0d514'
down_revision: Union[str, None] = 'f6c0d4e8a392'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The built-in templates as they were when this ran (plan 41 replaced DnD Lite's file): kept in rulesets/archive
ARCHIVE = Path(__file__).resolve().parents[2] / "rulesets" / "archive"
BUILTIN = {"dnd_lite": "dnd_lite_0.4.0.json"}


def _json(value):
    if value is None or isinstance(value, (dict, list)):
        return value
    return json.loads(value)


def _slug(name: str, taken: set) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")[:40] or "type"
    key, n = base, 2
    while key in taken:
        key, n = f"{base}_{n}", n + 1
    return key


def _merge(doc: dict, categories: list[dict]) -> tuple[dict, dict]:
    doc = copy.deepcopy(doc)
    (doc.get("starting") or {}).pop("categories", None)
    kind = doc.setdefault("kinds", {}).setdefault("character", {})
    old = kind.get("types") or {}
    types: dict = {}
    mapping: dict = {}
    for category in categories:
        base = category["type"]
        if base not in old:
            continue
        if base not in types:
            key = base
        else:
            key = _slug(category.get("key") or category["name"], set(old) | set(types))
            for action in doc.get("actions") or []:
                if isinstance(action, dict) and base in (action.get("types") or []):
                    action["types"] = [*action["types"], key]
        types[key] = copy.deepcopy(old[base])
        player = bool(category["player"])
        types[key].update({"name": category["name"][:60], "plural": (category["plural"] or category["name"])[:60],
                           "player": player, "instanceable": bool(category["instanceable"]) and not player})
        mapping[category["id"]] = key
    for key, value in old.items():
        types.setdefault(key, value)
    kind["types"] = types
    return doc, mapping


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "character_categories" not in inspector.get_table_names():
        return
    sagas = bind.execute(sa.text("SELECT id, ruleset_key, template, display_defaults, template_version FROM sagas")).all()
    for saga_id, ruleset_key, raw_template, raw_defaults, version in sagas:
        rows = bind.execute(sa.text(
            "SELECT id, key, name, plural, type, player, instanceable FROM character_categories WHERE saga_id = :s "
            "ORDER BY sort_order, id"), {"s": saga_id}).all()
        categories = [{"id": r[0], "key": r[1], "name": r[2] or "Characters", "plural": r[3] or "", "type": r[4],
                       "player": bool(r[5]), "instanceable": bool(r[6])} for r in rows]
        template = _json(raw_template)
        builtin = None
        if template is None:
            builtin = json.loads((ARCHIVE / BUILTIN.get(ruleset_key, BUILTIN["dnd_lite"])).read_text())
            # The built-in template's types before plan 40: one per base type the categories were based on
            base_types = {k: v for k, v in builtin["kinds"]["character"]["types"].items()
                          if k in {c["type"] for c in categories}}
            source = copy.deepcopy(builtin)
            source["kinds"]["character"]["types"] = base_types or builtin["kinds"]["character"]["types"]
        else:
            source = template
        doc, mapping = _merge(source, categories) if categories else (source, {})
        if template is None:
            if doc["kinds"]["character"]["types"] != builtin["kinds"]["character"]["types"]:
                bind.execute(sa.text("UPDATE sagas SET template = CAST(:t AS JSON), template_version = :v WHERE id = :s"),
                             {"t": json.dumps(doc), "v": (version or 1) + 1, "s": saga_id})
        else:
            bind.execute(sa.text("UPDATE sagas SET template = CAST(:t AS JSON), template_version = :v WHERE id = :s"),
                         {"t": json.dumps(doc), "v": (version or 1) + 1, "s": saga_id})
        # Characters: their category's type
        for category in categories:
            if category["id"] in mapping:
                bind.execute(sa.text("UPDATE resources SET type = :t WHERE category_id = :c"),
                             {"t": mapping[category["id"]], "c": category["id"]})
        # Display defaults: a category's own (else its base type's) is its type's
        defaults = dict(_json(raw_defaults) or {})
        own = defaults.pop("categories", None) or {}
        by_type = dict(defaults.get("character") or {})
        for category in categories:
            key = mapping.get(category["id"])
            if key is None:
                continue
            chosen = own.get(str(category["id"])) or (defaults.get("character") or {}).get(category["type"])
            if chosen is not None:
                by_type[key] = chosen
        defaults["character"] = by_type
        bind.execute(sa.text("UPDATE sagas SET display_defaults = CAST(:d AS JSON) WHERE id = :s"),
                     {"d": json.dumps(defaults), "s": saga_id})
        # Actors Scenes: a template picked per category is picked for its type
        scenes = bind.execute(sa.text(
            "SELECT stage_sets.id, stage_sets.config FROM stage_sets JOIN stages ON stages.id = stage_sets.stage_id "
            "WHERE stages.saga_id = :s AND stage_sets.type = 'actors_scene'"), {"s": saga_id}).all()
        for set_id, raw_config in scenes:
            config = dict(_json(raw_config) or {})
            templates = config.get("templates") or {}
            moved = {}
            for key, value in templates.items():
                new_key = mapping.get(int(key)) if str(key).isdigit() else key
                if new_key is not None:
                    moved[new_key] = value
            if moved != templates:
                config["templates"] = moved
                bind.execute(sa.text("UPDATE stage_sets SET config = CAST(:c AS JSON) WHERE id = :i"),
                             {"c": json.dumps(config), "i": set_id})
    with op.batch_alter_table("resources") as batch:
        batch.drop_column("category_id")
    op.drop_table("character_categories")


def downgrade() -> None:
    # The categories can't come back as they were (their types are the template's now): empty, as before plan 05
    op.create_table(
        "character_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("saga_id", sa.Integer(), sa.ForeignKey("sagas.id", ondelete="CASCADE"), index=True),
        sa.Column("key", sa.String(80), nullable=True),
        sa.Column("name", sa.String(120)),
        sa.Column("plural", sa.String(120), server_default=""),
        sa.Column("type", sa.String(80)),
        sa.Column("player", sa.Boolean(), server_default=sa.false()),
        sa.Column("instanceable", sa.Boolean(), server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    with op.batch_alter_table("resources") as batch:
        batch.add_column(sa.Column("category_id", sa.Integer(), sa.ForeignKey("character_categories.id", ondelete="SET NULL"), nullable=True))
