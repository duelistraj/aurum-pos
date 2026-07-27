"""Add configurable shop tax snapshots.

Revision ID: m3n4o5p6q7r8
Revises: l3m4n5o6p7q8
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "m3n4o5p6q7r8"
down_revision: str | Sequence[str] | None = "l3m4n5o6p7q8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "shops",
        sa.Column(
            "tax_rate_percent",
            sa.Numeric(precision=5, scale=2),
            server_default="3.00",
            nullable=False,
        ),
    )
    op.add_column(
        "sales",
        sa.Column("tax_rate_percent", sa.Numeric(precision=5, scale=2)),
    )
    op.execute(
        """
        UPDATE sales AS sale
        SET tax_rate_percent = shop.tax_rate_percent
        FROM shops AS shop
        WHERE shop.id = sale.shop_id
        """
    )
    op.create_check_constraint(
        "shops_tax_rate_percent_check",
        "shops",
        "tax_rate_percent >= 0 AND tax_rate_percent <= 100",
    )


def downgrade() -> None:
    op.drop_constraint("shops_tax_rate_percent_check", "shops", type_="check")
    op.drop_column("sales", "tax_rate_percent")
    op.drop_column("shops", "tax_rate_percent")
