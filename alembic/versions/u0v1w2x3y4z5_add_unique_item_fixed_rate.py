"""Add fixed-rate pricing for unique inventory items.

Revision ID: u0v1w2x3y4z5
Revises: t9u0v1w2x3y4
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "u0v1w2x3y4z5"
down_revision: str | None = "t9u0v1w2x3y4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column("fixed_rate", sa.Numeric(12, 2), server_default="0", nullable=False),
    )
    op.add_column(
        "item_history",
        sa.Column("fixed_rate", sa.Numeric(12, 2), server_default="0", nullable=False),
    )
    op.add_column("sale_items", sa.Column("item_fixed_rate", sa.Numeric(12, 2)))

    op.execute(
        "UPDATE items SET fixed_rate = making_charge, making_charge = 0, net_weight = 0 "
        "WHERE lower(category) = 'unique'"
    )
    op.execute(
        "UPDATE item_history SET fixed_rate = making_charge, making_charge = 0, net_weight = 0 "
        "WHERE lower(category) = 'unique'"
    )
    op.execute(
        "UPDATE sale_items SET item_fixed_rate = "
        "COALESCE((price_breakdown->>'fixed_rate')::numeric, 0)"
    )

    op.drop_constraint("items_nonnegative_money_weight", "items", type_="check")
    op.drop_constraint("items_unique_weight_contract", "items", type_="check")
    op.create_check_constraint(
        "items_nonnegative_money_weight",
        "items",
        "net_weight >= 0 AND making_charge >= 0 AND fixed_rate >= 0",
    )
    op.create_check_constraint(
        "items_unique_weight_contract",
        "items",
        "(category = 'unique' AND net_weight = 0 AND making_charge = 0) OR "
        "(category <> 'unique' AND net_weight > 0 AND fixed_rate = 0)",
    )
    op.drop_constraint("item_history_values_valid", "item_history", type_="check")
    op.create_check_constraint(
        "item_history_values_valid",
        "item_history",
        "quantity >= 0 AND purity >= 0 AND purity <= 100 AND net_weight >= 0 "
        "AND making_charge >= 0 AND fixed_rate >= 0",
    )


def downgrade() -> None:
    op.execute("UPDATE items SET making_charge = fixed_rate WHERE lower(category) = 'unique'")
    op.execute(
        "UPDATE item_history SET making_charge = fixed_rate WHERE lower(category) = 'unique'"
    )
    op.drop_constraint("items_nonnegative_money_weight", "items", type_="check")
    op.drop_constraint("items_unique_weight_contract", "items", type_="check")
    op.create_check_constraint(
        "items_nonnegative_money_weight", "items", "net_weight >= 0 AND making_charge >= 0"
    )
    op.create_check_constraint(
        "items_unique_weight_contract",
        "items",
        "(category = 'unique' AND net_weight = 0) OR (category <> 'unique' AND net_weight > 0)",
    )
    op.drop_constraint("item_history_values_valid", "item_history", type_="check")
    op.create_check_constraint(
        "item_history_values_valid",
        "item_history",
        "quantity >= 0 AND purity >= 0 AND purity <= 100 "
        "AND net_weight >= 0 AND making_charge >= 0",
    )
    op.drop_column("sale_items", "item_fixed_rate")
    op.drop_column("item_history", "fixed_rate")
    op.drop_column("items", "fixed_rate")
