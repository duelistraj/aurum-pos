"""Finalize polished-stone tax and item notes.

Revision ID: x3y4z5a6b7c8
Revises: w2x3y4z5a6b7
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "x3y4z5a6b7c8"
down_revision: str | None = "w2x3y4z5a6b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    has_long_notes = op.get_bind().scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM items WHERE char_length(notes) > 100)")
    )
    if has_long_notes:
        raise RuntimeError(
            "Cannot limit item notes to 100 characters: shorten existing notes first"
        )

    op.drop_constraint("items_notes_length", "items", type_="check", if_exists=True)
    op.create_check_constraint(
        "items_notes_length",
        "items",
        "notes IS NULL OR char_length(notes) <= 100",
    )
    # migration-safety: allow obsolete uncommitted tax profile snapshot
    op.drop_column("sale_items", "item_stone_tax_profile", if_exists=True)
    for table in ("items", "item_history"):
        # migration-safety: allow obsolete uncommitted tax profile field
        op.drop_column(table, "stone_tax_profile", if_exists=True)


def downgrade() -> None:
    for table in ("items", "item_history"):
        op.add_column(table, sa.Column("stone_tax_profile", sa.String(50)))
    op.add_column("sale_items", sa.Column("item_stone_tax_profile", sa.String(50)))
    op.drop_constraint("items_notes_length", "items", type_="check")
