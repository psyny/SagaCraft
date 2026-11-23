"""dice styles: Cobblestone and Sanded glass retired (their members get Granite and Glass)

Revision ID: b3e7c9d2f418
Revises: a8d3f5c1e927
Create Date: 2026-11-23 18:00:00

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b3e7c9d2f418'
down_revision: Union[str, None] = 'a8d3f5c1e927'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RETIRED = {"cobble": "granite", "sanded_glass": "glass"}


def upgrade() -> None:
    for old, new in RETIRED.items():
        op.execute(f"UPDATE saga_members SET die_style = '{new}' WHERE die_style = '{old}'")


def downgrade() -> None:
    pass  # who had picked the retired styles isn't kept
