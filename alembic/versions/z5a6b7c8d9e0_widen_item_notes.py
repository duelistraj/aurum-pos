"""Widen item notes to 100 characters.

Revision ID: z5a6b7c8d9e0
Revises: y4z5a6b7c8d9
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "z5a6b7c8d9e0"
down_revision: str | None = "y4z5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "items",
        "notes",
        existing_type=sa.String(length=50),
        type_=sa.String(length=100),
        existing_nullable=True,
    )


def downgrade() -> None:
    has_long_notes = op.get_bind().scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM items WHERE char_length(notes) > 50)")
    )
    if has_long_notes:
        raise RuntimeError("Cannot limit item notes to 50 characters: shorten existing notes first")
    op.alter_column(
        "items",
        "notes",
        existing_type=sa.String(length=100),
        type_=sa.String(length=50),
        existing_nullable=True,
    )
