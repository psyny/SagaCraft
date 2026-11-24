"""Display names are each Saga's (plan 42); logins lowercase

A member's display name moves from the account (users.display_name, shown in every Saga) to each membership
(saga_members.display_name): each membership takes its account's name. Logins are made lowercase, as they're matched
(when two would clash, the second keeps its case).

Revision ID: e4b8d2f6a913
Revises: d3a7c1e9f520
Create Date: 2026-11-27 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e4b8d2f6a913'
down_revision: Union[str, None] = 'd3a7c1e9f520'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    with op.batch_alter_table("saga_members") as batch:
        batch.add_column(sa.Column("display_name", sa.String(120), nullable=False, server_default=""))
    names = dict(bind.execute(sa.text("SELECT id, display_name FROM users")).all())
    for member_id, user_id in bind.execute(sa.text("SELECT id, user_id FROM saga_members")).all():
        bind.execute(sa.text("UPDATE saga_members SET display_name = :n WHERE id = :i"),
                     {"n": (names.get(user_id) or "")[:120], "i": member_id})
    logins = dict(bind.execute(sa.text("SELECT id, login FROM users")).all())
    taken = set(logins.values())
    for user_id, login in sorted(logins.items()):
        lower = login.lower()
        if lower != login and lower not in taken:
            bind.execute(sa.text("UPDATE users SET login = :l WHERE id = :i"), {"l": lower, "i": user_id})
            taken.add(lower)
    with op.batch_alter_table("users") as batch:
        batch.drop_column("display_name")


def downgrade() -> None:
    bind = op.get_bind()
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("display_name", sa.String(120), nullable=False, server_default=""))
    # An account's name: its first membership's, else its login
    for user_id, login in bind.execute(sa.text("SELECT id, login FROM users")).all():
        first = bind.execute(sa.text("SELECT display_name FROM saga_members WHERE user_id = :u AND display_name <> '' "
                                     "ORDER BY id LIMIT 1"), {"u": user_id}).scalar()
        bind.execute(sa.text("UPDATE users SET display_name = :n WHERE id = :i"), {"n": first or login, "i": user_id})
    with op.batch_alter_table("saga_members") as batch:
        batch.drop_column("display_name")
