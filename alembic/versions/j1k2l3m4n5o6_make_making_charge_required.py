"""make making_charge non-nullable

Revision ID: j1k2l3m4n5o6
Revises: aca948beb422
Create Date: 2026-05-31 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "j1k2l3m4n5o6"
down_revision: str | Sequence[str] | None = "aca948beb422"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("UPDATE items SET making_charge = 0 WHERE making_charge IS NULL")
    # migration-safety: allow - the preceding update backfills every null row.
    op.alter_column(
        "items",
        "making_charge",
        existing_type=sa.Numeric(precision=10, scale=2),
        nullable=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "items",
        "making_charge",
        existing_type=sa.Numeric(precision=10, scale=2),
        nullable=True,
    )
